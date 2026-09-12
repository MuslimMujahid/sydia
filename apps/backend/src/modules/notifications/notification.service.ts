import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  type INotificationRepository,
} from '../../database/interfaces';
import { QueueService, type NotificationChannel } from '../../infra/queue';
import type { NotificationDelivery } from '../../database/entities';

export type NotificationIntent = {
  userId: string;
  kind: string;
  content: string;
  idempotencyKey: string;
  proactive: boolean;
  sourceId?: string;
  reminderOccurrenceId?: string;
  reminderOccurrenceKey?: string;
};

export type NotificationEnqueueResult = {
  deliveries: NotificationDelivery[];
  replayed: boolean;
  policyOutcome: 'queued' | 'skipped_disabled';
};

@Injectable()
export class NotificationService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: INotificationRepository,
    private readonly queue: QueueService,
  ) {}

  async enqueue(input: NotificationIntent): Promise<NotificationEnqueueResult> {
    const preferences = await this.notifications.getPreferences(input.userId);
    const channels: NotificationChannel[] = [];
    if (preferences?.whatsappNotificationsEnabled !== false)
      channels.push('whatsapp');
    if (preferences?.telegramNotificationsEnabled !== false)
      channels.push('telegram');

    if (channels.length === 0) {
      return {
        deliveries: [],
        replayed: false,
        policyOutcome: 'skipped_disabled',
      };
    }

    const results = await Promise.all(
      channels.map((channel) => this.enqueueChannel(input, channel)),
    );

    return {
      deliveries: results.map(({ delivery }) => delivery),
      replayed: results.every(({ replayed }) => replayed),
      policyOutcome: 'queued',
    };
  }

  private async enqueueChannel(
    input: NotificationIntent,
    channel: NotificationChannel,
  ): Promise<{ delivery: NotificationDelivery; replayed: boolean }> {
    const existing = await this.notifications.findDeliveryByIdempotencyKey(
      input.userId,
      input.idempotencyKey,
      channel,
    );

    const job = { ...input, channel };

    if (existing) {
      if (existing.status !== 'delivered') {
        await this.queueIntent(job);
      }

      return { delivery: existing, replayed: true };
    }

    const delivery = await this.notifications.createDelivery({
      userId: input.userId,
      kind: input.kind,
      content: input.content,
      idempotencyKey: input.idempotencyKey,
      channel,
      proactive: input.proactive,
      sourceId: input.sourceId,
      reminderOccurrenceId: input.reminderOccurrenceId,
    });

    await this.queueIntent(job);

    return { delivery, replayed: false };
  }

  private queueIntent(
    input: NotificationIntent & {
      channel: NotificationChannel;
    },
  ): Promise<unknown> {
    const queue =
      input.channel === 'telegram'
        ? this.queue.telegramNotifications
        : this.queue.whatsappNotifications;

    return queue.add('deliver', input, {
      jobId: input.idempotencyKey.replaceAll(':', '-'),
    });
  }

  async findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
    channel: NotificationChannel,
  ): Promise<NotificationDelivery | null> {
    return this.notifications.findDeliveryByIdempotencyKey(
      userId,
      idempotencyKey,
      channel,
    );
  }

  async claimDelivery(userId: string, deliveryId: string): Promise<boolean> {
    return this.notifications.claimDelivery(userId, deliveryId);
  }

  getPreferences(userId: string) {
    return this.notifications.getPreferences(userId);
  }

  async recordOutcome(input: {
    userId: string;
    deliveryId: string;
    status: string;
    policyOutcome?: string | null;
    providerMessageId?: string | null;
    error?: string | null;
    attemptedAt?: Date;
    deliveredAt?: Date | null;
  }): Promise<NotificationDelivery | null> {
    const attemptedAt = input.attemptedAt ?? new Date();
    const deliveredAt =
      input.deliveredAt ?? (input.status === 'delivered' ? attemptedAt : null);

    const delivery = await this.notifications.updateDelivery(
      input.userId,
      input.deliveryId,
      {
        status: input.status,
        policyOutcome: input.policyOutcome,
        providerMessageId: input.providerMessageId,
        attemptedAt,
        deliveredAt,
        failedAt: input.status === 'failed' ? attemptedAt : null,
        lastError: input.error,
      },
    );

    if (delivery) {
      await this.notifications.createAttempt({
        deliveryId: delivery.id,
        status: input.status,
        providerMessageId: input.providerMessageId,
        errorMessage: input.error,
        attemptedAt,
        deliveredAt,
      });
    }

    return delivery;
  }
}
