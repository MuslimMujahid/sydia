import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export type CalendarReminderDispatch = {
  kind: 'dispatch';
  userId: string;
  eventId: string;
  startAt: string;
  scheduledAt: string;
  timezone: string;
};
export type CalendarReminderJob = { kind: 'sweep' } | CalendarReminderDispatch;
/**
 * Re-reads a Google event whose Meet conference is still being created, so the
 * promised "I will send it when it is ready" message actually arrives.
 */
export type GoogleMeetFollowUpJob = {
  kind: 'poll';
  userId: string;
  eventId: string;
  /** Zero-based index into the bounded polling schedule. */
  attempt: number;
};
export type ReminderJob = {
  reminderId: string;
  idempotencyKey: string;
  occurrenceId: string;
};
export type DocumentJob = { documentId: string; userId: string; hint?: string };
export type MemoryDreamJob = {
  kind: 'dream' | 'recover';
  userId?: string;
  conversationId?: string;
  throughMessageId?: string;
  allowShortSegment?: boolean;
};
export type ConversationSummaryJob = {
  userId: string;
  conversationId: string;
};
export type MemoryDeliveryJob =
  { kind: 'recover' } | { kind: 'bank'; bankId: string };
export type MemoryIngestionJob = { kind: 'recover' };
export type NotificationChannel = 'telegram' | 'whatsapp';
export type NotificationJob = {
  userId: string;
  kind: string;
  content: string;
  idempotencyKey: string;
  channel: NotificationChannel;
  reminderOccurrenceKey?: string;
  eventReminder?: CalendarReminderDispatch;
  proactive: boolean;
  sourceId?: string;
  reminderOccurrenceId?: string;
};
export type BriefingJob =
  { kind: 'sweep' } | { kind: 'user'; userId: string; at: string };
export type FollowUpJob =
  { kind: 'sweep' } | { kind: 'user'; userId: string; at: string };
export type DailyNoteIndexJob =
  | { kind: 'index'; userId: string; date: string }
  | { kind: 'custom-index'; userId: string; itemId: string }
  | { kind: 'recover' };
export type CalendarSyncJob =
  | { kind: 'operation'; operationId: string }
  | { kind: 'pull'; bindingId: string; connectionGeneration: number }
  | { kind: 'renew-watch'; bindingId: string; connectionGeneration: number }
  | { kind: 'recover' };
@Injectable()
export class QueueService implements OnModuleDestroy {
  readonly billing: Queue<{ kind: 'recover' }>;
  readonly reminders: Queue<ReminderJob>;
  readonly documents: Queue<DocumentJob>;
  readonly memoryDreams: Queue<MemoryDreamJob>;
  readonly memoryDeliveries: Queue<MemoryDeliveryJob>;
  readonly memoryIngestions: Queue<MemoryIngestionJob>;
  readonly conversationSummaries: Queue<ConversationSummaryJob>;
  readonly whatsappNotifications: Queue<NotificationJob>;
  readonly telegramNotifications: Queue<NotificationJob>;
  readonly briefings: Queue<BriefingJob>;
  readonly followUps: Queue<FollowUpJob>;
  readonly dailyNoteIndexes: Queue<DailyNoteIndexJob>;
  readonly calendarSync: Queue<CalendarSyncJob>;
  readonly calendarReminders: Queue<CalendarReminderJob>;
  readonly googleMeetFollowUps: Queue<GoogleMeetFollowUpJob>;
  constructor(config: ConfigService) {
    const connection = {
      url: config.getOrThrow<string>('BACKEND_REDIS_URL'),
    };

    const defaultJobOptions = {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    };

    this.billing = new Queue('billing', { connection, defaultJobOptions });

    this.reminders = new Queue<ReminderJob>('reminders', {
      connection,
      defaultJobOptions,
    });
    this.documents = new Queue<DocumentJob>('documents', {
      connection,
      defaultJobOptions,
    });
    this.memoryDreams = new Queue<MemoryDreamJob>('memory-dreams', {
      connection,
      defaultJobOptions,
    });
    this.memoryDeliveries = new Queue<MemoryDeliveryJob>('memory-deliveries', {
      connection,
      defaultJobOptions,
    });
    this.memoryIngestions = new Queue<MemoryIngestionJob>('memory-ingestions', {
      connection,
      defaultJobOptions,
    });
    this.conversationSummaries = new Queue<ConversationSummaryJob>(
      'conversation-summaries',
      {
        connection,
        defaultJobOptions,
      },
    );
    this.whatsappNotifications = new Queue<NotificationJob>(
      'notifications-whatsapp',
      { connection, defaultJobOptions },
    );
    this.telegramNotifications = new Queue<NotificationJob>(
      'notifications-telegram',
      { connection, defaultJobOptions },
    );
    this.briefings = new Queue<BriefingJob>('briefings', {
      connection,
      defaultJobOptions,
    });
    this.followUps = new Queue<FollowUpJob>('follow-ups', {
      connection,
      defaultJobOptions,
    });
    this.dailyNoteIndexes = new Queue<DailyNoteIndexJob>('daily-note-indexes', {
      connection,
      defaultJobOptions,
    });
    this.calendarReminders = new Queue<CalendarReminderJob>(
      'calendar-reminders',
      { connection, defaultJobOptions },
    );
    // Each poll re-enqueues the next attempt itself, so a transient Google
    // error must not silently drop the chain: keep the retry default.
    this.googleMeetFollowUps = new Queue<GoogleMeetFollowUpJob>(
      'google-meet-follow-ups',
      { connection, defaultJobOptions },
    );
    this.calendarSync = new Queue<CalendarSyncJob>('calendar-sync', {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.billing.close();
    await Promise.all([
      this.reminders.close(),
      this.documents.close(),
      this.memoryDreams.close(),
      this.memoryDeliveries.close(),
      this.memoryIngestions.close(),
      this.conversationSummaries.close(),
      this.whatsappNotifications.close(),
      this.telegramNotifications.close(),
      this.briefings.close(),
      this.followUps.close(),
      this.dailyNoteIndexes.close(),
      this.calendarSync.close(),
      this.calendarReminders.close(),
      this.googleMeetFollowUps.close(),
    ]);
  }
}
