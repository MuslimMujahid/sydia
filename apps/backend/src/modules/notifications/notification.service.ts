import { BillingAccessService } from '../billing';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  NOTIFICATION_REPOSITORY,
  type INotificationRepository,
} from '../../database/interfaces';
import {
  QueueService,
  type NotificationChannel,
  type CalendarReminderDispatch,
} from '../../infra/queue';
import { CalendarReminderService } from '../calendar/calendar-reminder.service';
import type { NotificationDelivery } from '../../database/entities';

export type NotificationIntent = {
  userId: string;
  kind: string;
  content: string;
  /** Optional channel layouts, rendered once before enqueue. */
  contentByChannel?: { telegram: string; whatsapp: string };
  idempotencyKey: string;
  proactive: boolean;
  sourceId?: string;
  reminderOccurrenceId?: string;
  reminderOccurrenceKey?: string;
  eventReminder?: CalendarReminderDispatch;
};

export type NotificationEnqueueResult = {
  deliveries: NotificationDelivery[];
  replayed: boolean;
  policyOutcome: 'queued' | 'skipped_disabled' | 'skipped_inactive';
};

@Injectable()
export class NotificationService {
  constructor(
    private readonly billing: BillingAccessService,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: INotificationRepository,
    private readonly queue: QueueService,
    private readonly calendarReminders: CalendarReminderService,
  ) {}

  async enqueue(input: NotificationIntent): Promise<NotificationEnqueueResult> {
    if (!(await this.billing.isActive(input.userId)))
      return {
        deliveries: [],
        replayed: false,
        policyOutcome: 'skipped_inactive',
      };
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
    let existing = await this.notifications.findDeliveryByIdempotencyKey(
      input.userId,
      input.idempotencyKey,
      channel,
    );

    const { contentByChannel, ...intent } = input;
    const content = contentByChannel
      ? contentByChannel[channel]
      : input.content;

    const job = { ...intent, content, channel };

    if (existing?.status === 'skipped_obsolete' && input.eventReminder) {
      const rearmed = await this.notifications.rearmEventReminder(
        input.userId,
        existing.id,
        content,
      );

      if (rearmed) existing = rearmed;
    }

    if (existing) {
      if (existing.status !== 'delivered') {
        await this.queueIntent({ ...job, content: existing.content });
      }

      return { delivery: existing, replayed: true };
    }

    const delivery = await this.notifications.createDelivery({
      userId: input.userId,
      kind: input.kind,
      content,
      idempotencyKey: input.idempotencyKey,
      channel,
      proactive: input.proactive,
      sourceId: input.sourceId,
      reminderOccurrenceId: input.reminderOccurrenceId,
    });

    await this.queueIntent(job);

    return { delivery, replayed: false };
  }

  private async queueIntent(
    input: NotificationIntent & {
      channel: NotificationChannel;
    },
  ): Promise<unknown> {
    const queue =
      input.channel === 'telegram'
        ? this.queue.telegramNotifications
        : this.queue.whatsappNotifications;

    const jobId = createHash('sha256')
      .update(JSON.stringify([input.userId, input.idempotencyKey]))
      .digest('hex');

    if (input.eventReminder) {
      const existing = await queue.getJob(jobId);

      if (existing) {
        const state = await existing.getState();

        if (state === 'active') {
          Logger.warn(
            'Event reminder channel job is active; dispatch will retry.',
            NotificationService.name,
          );
          throw new Error(
            'Event reminder channel job is active. Retry after its current attempt.',
          );
        }

        if (state === 'completed' || state === 'failed')
          await existing.remove();
        else if (state === 'waiting' || state === 'delayed')
          await existing.updateData(input);
      }
    }

    return queue.add('deliver', input, {
      // Queue IDs are global to a channel; delivery keys are scoped to a user.
      // Hash the tuple to preserve that scope without BullMQ's forbidden ':'.
      jobId,
    });
  }

  async eventReminderIsCurrent(input: {
    kind?: string;
    eventReminder?: CalendarReminderDispatch;
  }): Promise<boolean> {
    if (input.kind !== 'event_reminder') return true;

    if (!input.eventReminder) {
      Logger.error(
        'Event reminder notification is missing its occurrence.',
        NotificationService.name,
      );
      throw new Error('Event reminder notification is missing its occurrence.');
    }

    return (await this.calendarReminders.resolve(input.eventReminder)) !== null;
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

  async claimDelivery(
    userId: string,
    deliveryId: string,
    timing?: { createdAt: Date; occurrenceAt?: string },
  ): Promise<boolean> {
    const access = await this.billing.snapshot(userId);
    const dueAt = timing?.occurrenceAt
      ? new Date(timing.occurrenceAt)
      : timing?.createdAt;

    if (
      !access.active ||
      (access.enforced &&
        dueAt &&
        access.lastActivatedAt &&
        dueAt < access.lastActivatedAt)
    ) {
      await this.recordOutcome({
        userId,
        deliveryId,
        status: 'skipped_inactive',
        policyOutcome: 'subscription_inactive',
      });

      return false;
    }

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
