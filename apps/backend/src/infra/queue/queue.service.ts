import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export type ReminderJob = { reminderId: string; idempotencyKey: string };
export type DocumentJob = { documentId: string; userId: string };
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
export type NotificationJob = {
  userId: string;
  kind: string;
  content: string;
  idempotencyKey: string;
  proactive: boolean;
  sourceId?: string;
  reminderOccurrenceId?: string;
};
export type BriefingJob = {
  userId: string;
  date: string;
  idempotencyKey: string;
};
export type FollowUpJob = {
  userId: string;
  date: string;
  sourceType: 'task' | 'reminder';
  sourceId: string;
  idempotencyKey: string;
};
@Injectable()
export class QueueService implements OnModuleDestroy {
  readonly reminders: Queue<ReminderJob>;
  readonly documents: Queue<DocumentJob>;
  readonly memoryDreams: Queue<MemoryDreamJob>;
  readonly conversationSummaries: Queue<ConversationSummaryJob>;
  readonly notifications: Queue<NotificationJob>;
  readonly briefings: Queue<BriefingJob>;
  readonly followUps: Queue<FollowUpJob>;
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
    this.conversationSummaries = new Queue<ConversationSummaryJob>(
      'conversation-summaries',
      {
        connection,
        defaultJobOptions,
      },
    );
    this.notifications = new Queue<NotificationJob>('notifications', {
      connection,
      defaultJobOptions,
    });
    this.briefings = new Queue<BriefingJob>('briefings', {
      connection,
      defaultJobOptions,
    });
    this.followUps = new Queue<FollowUpJob>('follow-ups', {
      connection,
      defaultJobOptions,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.reminders.close(),
      this.documents.close(),
      this.memoryDreams.close(),
      this.conversationSummaries.close(),
      this.notifications.close(),
      this.briefings.close(),
      this.followUps.close(),
    ]);
  }
}
