import { Inject, Injectable, Logger } from '@nestjs/common';
import {
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
 * assistant can resolve "oke" or "ingatkan 15 menit lagi" against it.
 * Delivery already succeeded, so a failure here is logged, never rethrown.
 */
@Injectable()
export class ReminderHistoryService {
  private readonly logger = new Logger(ReminderHistoryService.name);

  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: INotificationRepository,
  ) {}

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
      });
    } catch (error) {
      this.logger.error(
        `Reminder history write failed: channel=${job.channel} key=${job.idempotencyKey}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
