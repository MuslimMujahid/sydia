import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma';
import type { Prisma } from '../../generated/prisma/client';
import type {
  INotificationRepository,
  NotificationSchedulingTarget,
} from '../interfaces';

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
  weeklyBriefingEnabled: true,
  weeklyBriefingDay: true,
  briefingTime: true,
  followUpIntervalMinutes: true,
  webNotificationsEnabled: true,
  telegramNotificationsEnabled: true,
  whatsappNotificationsEnabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaNotificationRepository implements INotificationRepository {
  constructor(private readonly prisma: PrismaService) {}
  findDeliveryByProviderMessageId(
    userId: string,
    channel: string,
    providerMessageId: string,
    connection?: { id: string; generation: number },
  ) {
    return this.prisma.notificationDelivery.findFirst({
      where: {
        userId,
        channel,
        providerMessageId,
        status: 'delivered',
        ...(connection
          ? {
              whatsappBinding: {
                connectionId: connection.id,
                generation: connection.generation,
              },
            }
          : {}),
      },
      select: deliverySelect,
    });
  }

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

  async createDelivery(input: {
    userId: string;
    kind: string;
    content: string;
    idempotencyKey: string;
    proactive: boolean;
    channel: string;
    sourceId?: string | null;
    reminderOccurrenceId?: string | null;
    whatsappSchedule?: { scheduledAt: Date; payload: Record<string, unknown> };
  }) {
    const { whatsappSchedule, ...deliveryInput } = input;

    return this.prisma.$transaction(async (tx) => {
      const delivery = await tx.notificationDelivery.create({
        data: deliveryInput,
        select: deliverySelect,
      });

      if (input.channel === 'whatsapp') {
        let scheduledAt = whatsappSchedule?.scheduledAt;

        if (input.kind === 'reminder' && input.reminderOccurrenceId) {
          const occurrence = await tx.reminderOccurrence.findUnique({
            where: { id: input.reminderOccurrenceId },
            select: {
              occurrenceAt: true,
              reminder: { select: { userId: true } },
            },
          });

          if (!occurrence || occurrence.reminder.userId !== input.userId)
            throw new Error(
              'WhatsApp reminder occurrence is missing or belongs to another user.',
            );
          scheduledAt = occurrence.occurrenceAt;
        }

        const connection = await tx.whatsAppConnection.findFirst({
          where: {
            userId: input.userId,
            active: true,
            // A delayed scheduler must not give an old occurrence to a new
            // owner or newly paired assistant. Future occurrences stay eligible.
            ownerVerifiedAt: scheduledAt ? { lte: scheduledAt } : { not: null },
          },
          select: { id: true, generation: true },
        });

        await tx.whatsAppDeliveryBinding.create({
          data: {
            deliveryId: delivery.id,
            connectionId: connection?.id,
            generation: connection?.generation,
            scheduledAt,
            payload: whatsappSchedule
              ? (JSON.parse(
                  JSON.stringify(whatsappSchedule.payload),
                ) as Prisma.InputJsonObject)
              : undefined,
          },
        });
      }

      return delivery;
    });
  }

  async rearmEventReminder(
    userId: string,
    id: string,
    content: string,
    whatsappSchedule?: { scheduledAt: Date; payload: Record<string, unknown> },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.notificationDelivery.updateMany({
        where: {
          id,
          userId,
          kind: 'event_reminder',
          status: 'skipped_obsolete',
        },
        data: { status: 'pending', content, policyOutcome: null },
      });

      if (result.count !== 1) return null;
      const delivery = await tx.notificationDelivery.findUnique({
        where: { id },
        select: deliverySelect,
      });

      if (delivery?.channel === 'whatsapp' && whatsappSchedule) {
        const binding = await tx.whatsAppDeliveryBinding.findUnique({
          where: { deliveryId: id },
          select: { connectionId: true, generation: true },
        });

        const authorized =
          binding?.connectionId && binding.generation !== null
            ? await tx.whatsAppConnection.count({
                where: {
                  id: binding.connectionId,
                  generation: binding.generation,
                  userId,
                  active: true,
                  ownerVerifiedAt: { lte: whatsappSchedule.scheduledAt },
                },
              })
            : 0;

        if (!authorized) {
          await tx.notificationDelivery.update({
            where: { id },
            data: {
              status: 'skipped_unlinked',
              policyOutcome: 'outside_authorized_generation',
            },
          });

          return {
            ...delivery,
            status: 'skipped_unlinked',
            policyOutcome: 'outside_authorized_generation',
          };
        }

        await tx.whatsAppDeliveryBinding.update({
          where: { deliveryId: id },
          data: {
            scheduledAt: whatsappSchedule.scheduledAt,
            payload: JSON.parse(
              JSON.stringify(whatsappSchedule.payload),
            ) as Prisma.InputJsonObject,
            outageId: null,
            missedAt: null,
            summarizedAt: null,
          },
        });
      }

      return delivery;
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

  async listSchedulingTargets(): Promise<NotificationSchedulingTarget[]> {
    const rows = await this.prisma.user.findMany({
      where: { banned: false },
      select: {
        id: true,
        timezone: true,
        userPreference: { select: preferenceSelect },
      },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => ({
      userId: row.id,
      timezone: row.timezone,
      briefingEnabled: row.userPreference?.briefingEnabled ?? true,
      weeklyBriefingEnabled: row.userPreference?.weeklyBriefingEnabled ?? true,
      weeklyBriefingDay: row.userPreference?.weeklyBriefingDay ?? 1,
      briefingTime: row.userPreference?.briefingTime ?? null,
      followUpIntervalMinutes:
        row.userPreference?.followUpIntervalMinutes ?? 60,
      notifiable:
        (row.userPreference?.telegramNotificationsEnabled ?? true) ||
        (row.userPreference?.whatsappNotificationsEnabled ?? true),
    }));
  }

  savePreferences(
    userId: string,
    input: Parameters<INotificationRepository['savePreferences']>[1],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.userPreference.upsert({
        where: { userId },
        create: { userId, ...input },
        update: input,
        select: preferenceSelect,
      });

      const grants = [
        ...(input.briefingEnabled === true ? ['daily_briefing'] : []),
        ...(input.weeklyBriefingEnabled === true ? ['weekly_briefing'] : []),
        ...(input.followUpIntervalMinutes !== undefined ? ['follow_up'] : []),
      ];

      for (const kind of grants)
        await tx.whatsAppConsent.upsert({
          where: { userId_kind: { userId, kind } },
          create: { userId, kind, grantedAt: new Date() },
          update: { grantedAt: new Date() },
        });
      if (input.briefingEnabled === false)
        await tx.whatsAppConsent.deleteMany({
          where: { userId, kind: 'daily_briefing' },
        });
      if (input.weeklyBriefingEnabled === false)
        await tx.whatsAppConsent.deleteMany({
          where: { userId, kind: 'weekly_briefing' },
        });

      return result;
    });
  }
}
