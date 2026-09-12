import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma';
import type { INotificationRepository } from '../interfaces';

const deliverySelect = {
  id: true,
  userId: true,
  kind: true,
  content: true,
  idempotencyKey: true,
  channel: true,
  proactive: true,
  sourceId: true,
  providerMessageId: true,
  status: true,
  policyOutcome: true,
  attemptedAt: true,
  deliveredAt: true,
  failedAt: true,
  lastError: true,
  reminderOccurrenceId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const attemptSelect = {
  id: true,
  deliveryId: true,
  attemptNumber: true,
  providerMessageId: true,
  status: true,
  errorMessage: true,
  attemptedAt: true,
  deliveredAt: true,
  createdAt: true,
} as const;

const preferenceSelect = {
  userId: true,
  briefingEnabled: true,
  briefingTime: true,
  webNotificationsEnabled: true,
  telegramNotificationsEnabled: true,
  whatsappNotificationsEnabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaNotificationRepository implements INotificationRepository {
  constructor(private readonly prisma: PrismaService) {}
  findDeliveryByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
    channel: string,
  ) {
    return this.prisma.notificationDelivery.findFirst({
      where: { userId, idempotencyKey, channel },
      select: deliverySelect,
    });
  }

  createDelivery(input: {
    userId: string;
    kind: string;
    content: string;
    idempotencyKey: string;
    proactive: boolean;
    channel: string;
    sourceId?: string | null;
    reminderOccurrenceId?: string | null;
  }) {
    return this.prisma.notificationDelivery.create({
      data: input,
      select: deliverySelect,
    });
  }

  async claimDelivery(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.notificationDelivery.updateMany({
      where: { id, userId, status: { in: ['pending', 'failed'] } },
      data: { status: 'attempting', attemptedAt: new Date() },
    });

    return result.count === 1;
  }

  async createAttempt(input: {
    deliveryId: string;
    attemptNumber?: number;
    status: string;
    providerMessageId?: string | null;
    errorMessage?: string | null;
    attemptedAt?: Date;
    deliveredAt?: Date | null;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.deliveryId}))`;
      const latest =
        input.attemptNumber ??
        ((
          await transaction.notificationDeliveryAttempt.findFirst({
            where: { deliveryId: input.deliveryId },
            orderBy: { attemptNumber: 'desc' },
            select: { attemptNumber: true },
          })
        )?.attemptNumber ?? 0) + 1;

      return transaction.notificationDeliveryAttempt.create({
        data: { ...input, attemptNumber: latest },
        select: attemptSelect,
      });
    });
  }

  updateDelivery(
    userId: string,
    id: string,
    input: Parameters<INotificationRepository['updateDelivery']>[2],
  ) {
    return this.prisma.notificationDelivery
      .updateMany({
        where: { id, userId },
        data: input,
      })
      .then(async (result) =>
        result.count === 1
          ? this.prisma.notificationDelivery.findUnique({
              where: { id },
              select: deliverySelect,
            })
          : null,
      );
  }

  getPreferences(userId: string) {
    return this.prisma.userPreference.findUnique({
      where: { userId },
      select: preferenceSelect,
    });
  }

  savePreferences(
    userId: string,
    input: Parameters<INotificationRepository['savePreferences']>[1],
  ) {
    return this.prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
      select: preferenceSelect,
    });
  }
}
