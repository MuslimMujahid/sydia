import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  type INotificationRepository,
} from '../../database/interfaces';
import { QueueService } from '../../infra/queue';
import type { NotificationDelivery } from '../../database/entities';

export type NotificationIntent = {
  userId: string;
  kind: string;
  content: string;
  idempotencyKey: string;
  proactive: boolean;
  sourceId?: string;
  reminderOccurrenceId?: string;
};

export type NotificationEnqueueResult = {
  delivery: NotificationDelivery;
  replayed: boolean;
  policyOutcome: 'queued';
};

@Injectable()
export class NotificationService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: INotificationRepository,
    private readonly queue: QueueService,
  ) {}

  async enqueue(input: NotificationIntent): Promise<NotificationEnqueueResult> {
    const existing = await this.notifications.findDeliveryByIdempotencyKey(
      input.userId,
      input.idempotencyKey,
    );

    if (existing) {
      if (existing.status !== 'delivered') {
        await this.queueIntent(input);
      }

      return {
        delivery: existing,
        replayed: true,
        policyOutcome: 'queued',
      };
    }

    const delivery = await this.notifications.createDelivery(input);

    await this.queueIntent(input);

    return { delivery, replayed: false, policyOutcome: 'queued' };
  }

  private queueIntent(input: NotificationIntent): Promise<unknown> {
    return this.queue.notifications.add('deliver', input, {
      jobId: input.idempotencyKey.replaceAll(':', '-'),
    });
  }

  async findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<NotificationDelivery | null> {
    return this.notifications.findDeliveryByIdempotencyKey(
      userId,
      idempotencyKey,
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
