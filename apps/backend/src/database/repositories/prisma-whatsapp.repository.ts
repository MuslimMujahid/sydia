import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type { IWhatsAppRepository } from '../interfaces';
import type { ExternalIdentity } from '../entities';

const gatewaySelect = {
  id: true,
  status: true,
  registrationReady: true,
  profileReady: true,
  sendingPaused: true,
  enforcementCode: true,
  enforcementReason: true,
  recoveryReason: true,
  lastConnectedAt: true,
  lastEventAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const linkSelect = {
  id: true,
  userId: true,
  codeHash: true,
  expiresAt: true,
  consumedAt: true,
  consumedByExternalId: true,
  createdAt: true,
} as const;

const identitySelect = {
  id: true,
  userId: true,
  provider: true,
  externalId: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const stateSelect = {
  id: true,
  externalIdentityId: true,
  firstInboundAt: true,
  firstResponseAt: true,
  optedOutAt: true,
  lastInboundAt: true,
  lastProactiveSentAt: true,
  lastProactiveReplyAt: true,
  unansweredProactiveCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

const inboundSelect = {
  id: true,
  provider: true,
  providerMessageId: true,
  senderExternalId: true,
  externalIdentityId: true,
  receivedAt: true,
  processedAt: true,
  createdAt: true,
} as const;

const trafficSelect = {
  id: true,
  day: true,
  inboundCount: true,
  outboundCount: true,
  proactiveCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaWhatsAppRepository implements IWhatsAppRepository {
  constructor(private readonly prisma: PrismaService) {}

  getGatewayState() {
    return this.prisma.whatsAppGatewayState.findUnique({
      where: { id: 'default' },
      select: gatewaySelect,
    });
  }

  async updateGatewayState(
    input: Parameters<IWhatsAppRepository['updateGatewayState']>[0],
  ) {
    return this.prisma.whatsAppGatewayState.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...input },
      update: input,
      select: gatewaySelect,
    });
  }

  findLinkCodeByHash(codeHash: string, now = new Date()) {
    return this.prisma.whatsAppLinkCode.findFirst({
      where: { codeHash, consumedAt: null, expiresAt: { gt: now } },
      select: linkSelect,
    });
  }

  createLinkCode(input: { userId: string; codeHash: string; expiresAt: Date }) {
    return this.prisma.whatsAppLinkCode.create({
      data: input,
      select: linkSelect,
    });
  }

  async consumeLinkCode(id: string, externalId: string, now: Date) {
    const result = await this.prisma.whatsAppLinkCode.updateMany({
      where: { id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now, consumedByExternalId: externalId },
    });

    return result.count === 1;
  }

  findIdentity(userId: string) {
    return this.prisma.externalIdentity.findFirst({
      where: { userId, provider: 'whatsapp' },
      select: identitySelect,
    });
  }

  findIdentityByExternalId(externalId: string) {
    return this.prisma.externalIdentity.findUnique({
      where: { provider_externalId: { provider: 'whatsapp', externalId } },
      select: identitySelect,
    });
  }

  createIdentity(input: {
    userId: string;
    externalId: string;
    verifiedAt?: Date | null;
  }): Promise<ExternalIdentity> {
    return this.prisma.externalIdentity.create({
      data: { ...input, provider: 'whatsapp' },
      select: identitySelect,
    });
  }

  async revokeIdentity(userId: string) {
    const result = await this.prisma.externalIdentity.deleteMany({
      where: { userId, provider: 'whatsapp' },
    });

    return result.count === 1;
  }

  getContactState(externalIdentityId: string) {
    return this.prisma.whatsAppContactState.findUnique({
      where: { externalIdentityId },
      select: stateSelect,
    });
  }

  ensureContactState(externalIdentityId: string) {
    return this.prisma.whatsAppContactState.upsert({
      where: { externalIdentityId },
      create: { externalIdentityId },
      update: {},
      select: stateSelect,
    });
  }

  updateContactState(
    externalIdentityId: string,
    input: Parameters<IWhatsAppRepository['updateContactState']>[1],
  ) {
    return this.prisma.whatsAppContactState.update({
      where: { externalIdentityId },
      data: input,
      select: stateSelect,
    });
  }

  async recordInbound(input: {
    provider: string;
    providerMessageId: string;
    senderExternalId: string;
    externalIdentityId?: string | null;
    receivedAt: Date;
  }) {
    try {
      return await this.prisma.whatsAppInboundMessage.create({
        data: input,
        select: inboundSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return null;
      throw error;
    }
  }

  async associateInbound(
    id: string,
    externalIdentityId: string,
  ): Promise<void> {
    await this.prisma.whatsAppInboundMessage.updateMany({
      where: { id, externalIdentityId: null },
      data: { externalIdentityId },
    });
  }

  async recordProactiveSent(externalIdentityId: string, sentAt: Date) {
    return this.prisma.whatsAppContactState.update({
      where: { externalIdentityId },
      data: {
        lastProactiveSentAt: sentAt,
        unansweredProactiveCount: { increment: 1 },
      },
      select: stateSelect,
    });
  }

  async recordInboundReply(externalIdentityId: string, receivedAt: Date) {
    return this.prisma.whatsAppContactState.update({
      where: { externalIdentityId },
      data: {
        lastInboundAt: receivedAt,
        lastProactiveReplyAt: receivedAt,
        unansweredProactiveCount: 0,
      },
      select: stateSelect,
    });
  }

  async reserveOutbound(input: {
    now: Date;
    proactive: boolean;
    day: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('sydia.whatsapp.outbound'))`,
      );
      const cutoff = new Date(input.now.getTime() - 60 * 60_000);
      await transaction.$executeRaw(
        Prisma.sql`DELETE FROM "whatsapp_outbound_reservation" WHERE "reservedAt" < ${cutoff}`,
      );
      const recent = await transaction.$queryRaw<
        Array<{ count: bigint; latest: Date | null }>
      >(Prisma.sql`
        SELECT COUNT(*)::bigint AS count, MAX("reservedAt") AS latest
        FROM "whatsapp_outbound_reservation"
        WHERE "reservedAt" >= ${cutoff}
      `);

      const row = recent[0];
      if (
        !row ||
        Number(row.count) >= 30 ||
        (row.latest && input.now.getTime() - row.latest.getTime() < 60_000)
      )
        return false;

      if (input.proactive) {
        const traffic = await transaction.$queryRaw<
          Array<{ inboundCount: number; proactiveCount: number }>
        >(Prisma.sql`
          SELECT "inboundCount", "proactiveCount"
          FROM "whatsapp_traffic_daily"
          WHERE "day" = ${input.day}
          FOR UPDATE
        `);

        const day = traffic[0];
        const reserved = await transaction.$queryRaw<
          Array<{ count: bigint }>
        >(Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM "whatsapp_outbound_reservation"
          WHERE "day" = ${input.day} AND "proactive" = true
        `);

        const inbound = day?.inboundCount ?? 0;
        const proactive =
          (day?.proactiveCount ?? 0) + Number(reserved[0]?.count ?? 0);

        if (inbound <= 0 || (proactive + 1) / inbound > 0.1) return false;
      }

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "whatsapp_outbound_reservation" ("id", "day", "proactive", "reservedAt")
        VALUES (${randomUUID()}, ${input.day}, ${input.proactive}, ${input.now})
      `);

      return true;
    });
  }

  async markInboundProcessed(id: string, processedAt = new Date()) {
    await this.prisma.whatsAppInboundMessage.update({
      where: { id },
      data: { processedAt },
      select: { id: true },
    });
  }

  getTraffic(day: Date) {
    return this.prisma.whatsAppTrafficDaily.findUnique({
      where: { day },
      select: trafficSelect,
    });
  }

  incrementTraffic(
    day: Date,
    counts: { inbound?: number; outbound?: number; proactive?: number },
  ) {
    return this.prisma.whatsAppTrafficDaily.upsert({
      where: { day },
      create: {
        day,
        inboundCount: counts.inbound ?? 0,
        outboundCount: counts.outbound ?? 0,
        proactiveCount: counts.proactive ?? 0,
      },
      update: {
        inboundCount: { increment: counts.inbound ?? 0 },
        outboundCount: { increment: counts.outbound ?? 0 },
        proactiveCount: { increment: counts.proactive ?? 0 },
      },
      select: trafficSelect,
    });
  }
}
