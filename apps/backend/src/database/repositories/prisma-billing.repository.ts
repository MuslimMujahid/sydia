import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type { IBillingRepository } from '../interfaces';

@Injectable()
export class PrismaBillingRepository implements IBillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ensureAccount(userId: string, rolloutAt: Date, trialDays: number) {
    return this.prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<
        Array<{ createdAt: Date }>
      >`SELECT "createdAt" FROM "user" WHERE id = ${userId} FOR UPDATE`;

      const user = users[0];
      if (!user) return null;
      const start = new Date(
        Math.max(user.createdAt.getTime(), rolloutAt.getTime()),
      );

      return tx.billingAccount.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          trialStartsAt: start,
          lastActivatedAt: start,
          trialEndsAt: new Date(start.getTime() + trialDays * 86_400_000),
        },
      });
    });
  }

  async initializeTrials(rolloutAt: Date, trialDays: number): Promise<number> {
    return this.prisma
      .$executeRaw`INSERT INTO billing_account ("userId", "trialStartsAt", "trialEndsAt", "lastActivatedAt")
      SELECT id, GREATEST("createdAt", ${rolloutAt}::timestamp), GREATEST("createdAt", ${rolloutAt}::timestamp) + ${trialDays} * INTERVAL '1 day', GREATEST("createdAt", ${rolloutAt}::timestamp)
      FROM "user" WHERE role = 'user' AND id NOT LIKE 'chat-preview-%' ON CONFLICT ("userId") DO NOTHING`;
  }

  paidOrdersWithoutMethod() {
    return this.prisma.billingOrder.findMany({
      where: {
        status: 'paid',
        paymentMethod: null,
        providerInvoiceId: { not: null },
        providerTransactionId: { not: null },
      },
      take: 200,
    });
  }

  async setPaymentMethod(id: string, paymentMethod: string) {
    await this.prisma.billingOrder.updateMany({
      where: { id, status: 'paid', paymentMethod: null },
      data: { paymentMethod },
    });
  }

  listOrders(userId: string) {
    return this.prisma.billingOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  reviewOrders() {
    return this.prisma.billingOrder.findMany({
      where: { status: 'review' },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  reviewOrder(id: string) {
    return this.prisma.billingOrder.findFirst({
      where: { id, status: 'review' },
    });
  }

  async linkReviewedInvoice(
    id: string,
    invoiceId: string,
    transactionId: string,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.billingOrder.updateMany({
        where: { id, status: 'review', appliedAt: null },
        data: {
          providerInvoiceId: invoiceId,
          providerTransactionId: transactionId,
          status: 'pending',
          errorCode: null,
          nextCheckAt: new Date(),
        },
      });

      if (!updated.count) return false;
      await tx.auditEvent.create({
        data: {
          userId: actorId,
          eventType: 'billing.invoice_linked_by_operator',
          metadata: { orderId: id, invoiceId, transactionId },
        },
      });

      return true;
    });
  }

  async closeReviewedOrder(id: string, actorId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.billingOrder.updateMany({
        where: { id, status: 'review', appliedAt: null },
        data: { status: 'failed', errorCode: 'operator_confirmed_unpaid' },
      });

      if (!updated.count) return false;
      await tx.auditEvent.create({
        data: {
          userId: actorId,
          eventType: 'billing.order_closed_by_operator',
          metadata: { orderId: id, reason },
        },
      });

      return true;
    });
  }

  findOrder(userId: string, id: string) {
    return this.prisma.billingOrder.findFirst({ where: { id, userId } });
  }

  findByProvider(
    environment: string,
    transactionId?: string,
    invoiceId?: string,
  ) {
    if (!transactionId && !invoiceId) return Promise.resolve(null);

    return this.prisma.billingOrder.findFirst({
      where: {
        environment,
        OR: [
          ...(transactionId ? [{ providerTransactionId: transactionId }] : []),
          ...(invoiceId ? [{ providerInvoiceId: invoiceId }] : []),
        ],
      },
    });
  }

  async createOrder(input: Parameters<IBillingRepository['createOrder']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${input.userId} FOR UPDATE`;
      const previous = await tx.billingOrder.findFirst({
        where: {
          userId: input.userId,
          OR: [
            { idempotencyKey: input.idempotencyKey },
            { status: { in: ['creating', 'pending', 'review'] } },
          ],
        },
        orderBy: { createdAt: 'asc' },
      });

      if (previous) return { order: previous, created: false };
      const order = await tx.billingOrder.create({
        data: {
          userId: input.userId,
          environment: input.environment,
          idempotencyKey: input.idempotencyKey,
          amount: input.amount,
          expiresAt: input.expiresAt,
          nextCheckAt: new Date(input.now.getTime() + 120_000),
        },
      });

      return { order, created: true };
    });
  }

  async attachInvoice(
    id: string,
    invoice: Parameters<IBillingRepository['attachInvoice']>[1],
  ) {
    await this.prisma.billingOrder.updateMany({
      where: { id, status: 'creating' },
      data: {
        status: 'pending',
        providerInvoiceId: invoice.id,
        providerTransactionId: invoice.transactionId,
        paymentUrl: invoice.link,
        expiresAt: invoice.expiresAt,
        nextCheckAt: new Date(),
      },
    });
  }

  async markOrder(
    id: string,
    status: string,
    errorCode: string | null,
    nextCheckAt: Date,
  ) {
    await this.prisma.billingOrder.updateMany({
      where: { id, appliedAt: null },
      data: { status, errorCode, nextCheckAt, attempts: { increment: 1 } },
    });
  }

  async applyPayment(
    id: string,
    transactionId: string,
    now: Date,
    paymentMethod?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.billingOrder.findUnique({
        where: { id },
        select: { userId: true },
      });

      if (!candidate?.userId) return false;
      const users = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "user" WHERE id = ${candidate.userId} FOR UPDATE`;

      if (!users.length) return false;
      const order = await tx.billingOrder.findUniqueOrThrow({ where: { id } });
      if (order.appliedAt) return false;
      if (order.providerTransactionId !== transactionId)
        throw new Error('Verified payment does not match order transaction');
      const account = await tx.billingAccount.findUniqueOrThrow({
        where: { userId: candidate.userId },
      });

      const paidUntil = new Date(
        Math.max(account.paidUntil?.getTime() ?? 0, now.getTime()) +
          order.durationDays * 86_400_000,
      );

      await tx.billingPayment.create({
        data: {
          orderId: id,
          environment: order.environment,
          providerTransactionId: transactionId,
          amount: order.amount,
          verifiedAt: now,
        },
      });
      await tx.billingAccount.update({
        where: { userId: candidate.userId },
        data: {
          paidUntil,
          lastActivatedAt:
            (account.paidUntil && account.paidUntil > now) ||
            (account.trialStartsAt <= now && account.trialEndsAt > now)
              ? account.lastActivatedAt
              : now,
        },
      });
      await tx.billingOrder.update({
        where: { id },
        data: {
          status: 'paid',
          appliedAt: now,
          errorCode: null,
          ...(paymentMethod ? { paymentMethod } : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          userId: candidate.userId,
          eventType: 'billing.payment_applied',
          metadata: {
            orderId: id,
            amount: order.amount,
            paidUntil: paidUntil.toISOString(),
          },
        },
      });

      return true;
    });
  }

  async dueOrders(now: Date) {
    await this.prisma.billingOrder.updateMany({
      where: { status: 'creating', nextCheckAt: { lte: now } },
      data: { status: 'review', errorCode: 'creation_interrupted' },
    });

    return this.prisma.billingOrder.findMany({
      where: { status: 'pending', nextCheckAt: { lte: now } },
      orderBy: { nextCheckAt: 'asc' },
      take: 20,
    });
  }

  async receiveWebhook(
    input: Parameters<IBillingRepository['receiveWebhook']>[0],
  ) {
    await this.prisma.billingWebhook.upsert({
      where: { id: input.id },
      update: {},
      create: input,
    });
  }

  pendingWebhooks() {
    return this.prisma.billingWebhook.findMany({
      where: {
        status: 'pending',
        OR: [
          { processedAt: null },
          { processedAt: { lte: new Date(Date.now() - 300_000) } },
        ],
      },
      orderBy: { processedAt: { sort: 'asc', nulls: 'first' } },
      take: 20,
    });
  }

  async completeWebhook(id: string, status: string, errorCode?: string) {
    await this.prisma.billingWebhook.update({
      where: { id },
      data: {
        status,
        processedAt: new Date(),
        attempts: { increment: 1 },
        errorCode,
      },
    });
  }

  private async used(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<number> {
    const result = await tx.$queryRaw<Array<{ bytes: bigint }>>`
      SELECT COALESCE((SELECT SUM(size)::bigint FROM file_asset WHERE "userId" = ${userId}), 0)
      + COALESCE((SELECT SUM(r.bytes) FROM storage_reservation r LEFT JOIN file_asset f ON f."storageKey" = r."storageKey" WHERE r."userId" = ${userId} AND f.id IS NULL), 0) AS bytes`;

    const bytes = Number(result[0]?.bytes);
    if (!Number.isSafeInteger(bytes) || bytes < 0)
      throw new Error('Invalid storage aggregate');

    return bytes;
  }

  storageUsed(userId: string) {
    return this.prisma.$transaction((tx) => this.used(tx, userId));
  }

  async reserveStorage(
    userId: string,
    storageKey: string,
    bytes: number,
    limit: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
      const previous = await tx.storageReservation.findUnique({
        where: { storageKey },
      });

      if (previous)
        return previous.userId === userId && previous.bytes === BigInt(bytes);
      if ((await this.used(tx, userId)) + bytes > limit) return false;
      await tx.storageReservation.create({
        data: { storageKey, userId, bytes: BigInt(bytes) },
      });

      return true;
    });
  }

  async releaseStorage(storageKey: string) {
    await this.prisma.storageReservation.deleteMany({ where: { storageKey } });
  }

  async recoverStorageReservations() {
    // Successful files already count toward storage. Abandoned upload reservations
    // can be released only after the existing durable artifact cleanup has finished.
    await this.prisma.$executeRaw`DELETE FROM storage_reservation r WHERE
      EXISTS (SELECT 1 FROM file_asset f WHERE f."storageKey" = r."storageKey") OR
      (r."createdAt" < NOW() - INTERVAL '24 hours' AND NOT EXISTS
        (SELECT 1 FROM document_artifact_cleanup c WHERE c."storageKey" = r."storageKey"))`;
  }
}
