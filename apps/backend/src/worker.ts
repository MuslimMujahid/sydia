import './worker-runtime';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { RRule } from 'rrule';
import { AppModule } from './app.module';
import {
  REMINDER_REPOSITORY,
  type IReminderRepository,
} from './database/interfaces';
import {
  QueueService,
  type BriefingJob,
  type DocumentJob,
  type ConversationSummaryJob,
  type FollowUpJob,
  type MemoryDreamJob,
  type ReminderJob,
  type RetentionJob,
} from './infra/queue';
import { DocumentService } from './modules/documents/document.service';
import { MemoryDreamService } from './modules/memories/memory-dream.service';
import { MemoryDreamSchedulerService } from './modules/memories/memory-dream-scheduler.service';
import { ConversationSummarizerService } from './modules/conversations/services/conversation-summarizer.service';
import {
  DailyBriefingService,
  FollowUpService,
  NotificationService,
  RetentionService,
} from './modules/notifications';

async function bootstrap(): Promise<void> {
  const context = await NestFactory.createApplicationContext(AppModule);
  const config = context.get(ConfigService);
  const reminders = context.get<IReminderRepository>(REMINDER_REPOSITORY);
  const queues = context.get(QueueService);
  const documents = context.get(DocumentService);
  const memoryDream = context.get(MemoryDreamService);
  const memoryDreamScheduler = context.get(MemoryDreamSchedulerService);
  const conversationSummarizer = context.get(ConversationSummarizerService);
  const notifications = context.get(NotificationService);
  const briefings = context.get(DailyBriefingService);
  const followUps = context.get(FollowUpService);
  const retention = context.get(RetentionService);
  const connection = {
    host: config.get<string>('BACKEND_REDIS_HOST', 'localhost'),
    port: config.get<number>('BACKEND_REDIS_PORT', 6379),
  };

  const reminderWorker = new Worker<ReminderJob>(
    'reminders',
    async (job) => {
      const reminder = await reminders.findByIdForDelivery(job.data.reminderId);
      if (!reminder || reminder.status !== 'scheduled') return;

      await notifications.enqueue({
        userId: reminder.userId,
        kind: 'reminder',
        content: reminder.notes
          ? `Reminder: ${reminder.title}\n${reminder.notes}`
          : `Reminder: ${reminder.title}`,
        idempotencyKey: job.data.idempotencyKey,
        proactive: false,
        sourceId: reminder.id,
        reminderOccurrenceId: job.data.idempotencyKey,
      });

      if (!reminder.recurrence) return;
      const rule = new RRule({
        freq: {
          daily: RRule.DAILY,
          weekly: RRule.WEEKLY,
          monthly: RRule.MONTHLY,
          yearly: RRule.YEARLY,
        }[reminder.recurrence.frequency],
        interval: reminder.recurrence.interval,
        byweekday: reminder.recurrence.daysOfWeek,
        dtstart: reminder.scheduledAt,
        until: reminder.recurrence.endsAt
          ? new Date(reminder.recurrence.endsAt)
          : undefined,
      });

      const next = rule.after(reminder.scheduledAt, false);
      if (!next) return;
      const updated = await reminders.updateDeliverySchedule(reminder.id, next);

      if (updated) {
        const idempotencyKey = await reminders.createOccurrence(
          reminder.id,
          next,
        );

        await queues.reminders.add(
          'dispatch',
          { reminderId: reminder.id, idempotencyKey },
          {
            jobId: idempotencyKey.replaceAll(':', '-'),
            delay: Math.max(0, next.getTime() - Date.now()),
          },
        );
      }
    },
    { connection },
  );

  const documentWorker = new Worker<DocumentJob>(
    'documents',
    async (job) => {
      await documents.processDocument(job.data.documentId, job.data.userId);
    },
    { connection },
  );

  const memoryDreamWorker = new Worker<MemoryDreamJob>(
    'memory-dreams',
    async (job) => {
      if (job.data.kind === 'recover') {
        await memoryDreamScheduler.recover();

        return;
      }

      if (
        !job.data.userId ||
        !job.data.conversationId ||
        !job.data.throughMessageId
      ) {
        throw new Error('Memory dream job is missing its segment boundary.');
      }

      await memoryDream.run(
        job.data.userId,
        job.data.conversationId,
        job.data.throughMessageId,
        job.data.allowShortSegment,
      );
    },
    { connection },
  );

  await queues.memoryDreams.upsertJobScheduler(
    'memory-dream-recovery',
    { every: 24 * 60 * 60 * 1000 },
    { name: 'recover', data: { kind: 'recover' } },
  );

  const conversationSummaryWorker = new Worker<ConversationSummaryJob>(
    'conversation-summaries',
    async (job) => {
      await conversationSummarizer.summarizeIfNeeded(
        job.data.userId,
        job.data.conversationId,
      );
    },
    { connection },
  );

  const briefingWorker = new Worker<BriefingJob>(
    'briefings',
    async (job) => briefings.run(job.data.userId, new Date(job.data.date)),
    { connection },
  );

  const followUpWorker = new Worker<FollowUpJob>(
    'follow-ups',
    async (job) => followUps.run(job.data.userId, new Date(job.data.date)),
    { connection },
  );

  const retentionWorker = new Worker<RetentionJob>(
    'retention',
    async (job) => retention.run(job.data.userId, new Date(job.data.cutoff)),
    { connection },
  );

  const close = async () => {
    await Promise.all([
      reminderWorker.close(),
      documentWorker.close(),
      memoryDreamWorker.close(),
      briefingWorker.close(),
      conversationSummaryWorker.close(),
      followUpWorker.close(),
      retentionWorker.close(),
    ]);
    await context.close();
  };

  process.on('SIGTERM', () => void close());
  process.on('SIGINT', () => void close());
}

void bootstrap();
