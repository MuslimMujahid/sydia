import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CHANNEL_CONVERSATION_IDLE_MS,
  CONVERSATION_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  type IConversationRepository,
  type INotificationRepository,
} from '../../database/interfaces';
import type { NotificationJob } from '../../infra/queue';

/** Notification kinds that carry a reminder occurrence into chat history. */
const REMINDER_HISTORY_KINDS = new Set([
  'reminder',
  'reminder_repeat',
  'reminder_final',
]);

/**
 * Writes a delivered reminder into the channel's active conversation so the
 * assistant can resolve "oke" or "ingatkan 15 menit lagi" against it. The
 * reminder is not user activity: a reply is kept beside it only within the
 * channel idle window.
 * Delivery already succeeded, so a failure here is logged, never rethrown.
 */
@Injectable()
export class ReminderHistoryService {
  private readonly logger = new Logger(ReminderHistoryService.name);
  private readonly idleMs: number;

  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: INotificationRepository,
    @Optional() config: ConfigService = new ConfigService(),
  ) {
    this.idleMs = config.get<number>(
      'BACKEND_CHANNEL_CONVERSATION_IDLE_MS',
      CHANNEL_CONVERSATION_IDLE_MS,
    );
  }

  async recordDelivered(job: NotificationJob, at = new Date()): Promise<void> {
    if (!REMINDER_HISTORY_KINDS.has(job.kind) || !job.reminderOccurrenceId)
      return;

    try {
      const [delivery, reminder] = await Promise.all([
        this.notifications.findDeliveryByIdempotencyKey(
          job.userId,
          job.idempotencyKey,
          job.channel,
        ),
        this.notifications.findReminderReference(
          job.userId,
          job.reminderOccurrenceId,
        ),
      ]);

      if (!delivery || !reminder) return;
      await this.conversations.appendChannelReminderMessage({
        userId: job.userId,
        provider: job.channel,
        deliveryId: delivery.id,
        title: reminder.title,
        content: delivery.content,
        metadata: {
          reminderId: reminder.reminderId,
          occurrenceId: reminder.occurrenceId,
          deliveryId: delivery.id,
          kind: job.kind,
          important: reminder.important,
        },
        at,
        activeAfter: new Date(at.getTime() - this.idleMs),
      });
    } catch (error) {
      this.logger.error(
        `Reminder history write failed: channel=${job.channel} key=${job.idempotencyKey}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
