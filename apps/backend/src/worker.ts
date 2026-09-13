import './worker-runtime';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError, Worker } from 'bullmq';
import { RRule } from 'rrule';
import { AppModule } from './app.module';
import {
  REMINDER_REPOSITORY,
  type IReminderRepository,
} from './database/interfaces';
import {
  QueueService,
  type BriefingJob,
  type ReminderJob,
  type DocumentJob,
  type ConversationSummaryJob,
  type FollowUpJob,
  type MemoryDreamJob,
} from './infra/queue';
import {
  DocumentService,
  NonRetryableDocumentError,
} from './modules/documents/document.service';
import { MemoryDreamService } from './modules/memories/memory-dream.service';
import { MemoryDreamSchedulerService } from './modules/memories/memory-dream-scheduler.service';
import { ConversationSummarizerService } from './modules/conversations/services/conversation-summarizer.service';
import {
  DailyBriefingService,
  FollowUpService,
  NotificationComposerService,
  NotificationService,
  ProactiveSchedulerService,
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
  const composer = context.get(NotificationComposerService);
  const scheduler = context.get(ProactiveSchedulerService);
  const connection = {
    url: config.getOrThrow<string>('BACKEND_REDIS_URL'),
  };

  const reminderWorker = new Worker<ReminderJob>(
    'reminders',
    async (job) => {
      const reminder = await reminders.findByIdForDelivery(job.data.reminderId);
      if (!reminder || reminder.status !== 'scheduled') return;

      await notifications.enqueue({
        userId: reminder.userId,
        kind: 'reminder',
        content: await composer.reminderBody(reminder),
        idempotencyKey: job.data.idempotencyKey,
        proactive: false,
        sourceId: reminder.id,
        reminderOccurrenceId: job.data.occurrenceId,
        reminderOccurrenceKey: job.data.idempotencyKey,
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
        const occurrence = await reminders.createOccurrence(reminder.id, next);

        await queues.reminders.add(
          'dispatch',
          {
            reminderId: reminder.id,
            idempotencyKey: occurrence.idempotencyKey,
            occurrenceId: occurrence.id,
          },
          {
            jobId: occurrence.idempotencyKey.replaceAll(':', '-'),
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
      try {
        await documents.processDocument(job.data.documentId, job.data.userId);
      } catch (error) {
        // Deterministic failures (unsupported format, no extractable text,
        // missing configuration) never succeed on retry, so fail the document
        // now and stop BullMQ from spending the remaining attempts on it.
        if (error instanceof NonRetryableDocumentError) {
          await documents.markProcessingFailed(job.data.documentId, error);
          throw new UnrecoverableError(error.message);
        }

        if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1))
          await documents.markProcessingFailed(job.data.documentId, error);
        throw error;
      }
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
    async (job) =>
      job.data.kind === 'sweep'
        ? scheduler.sweepBriefings()
        : briefings.run(job.data.userId, new Date(job.data.at)),
    { connection },
  );

  const followUpWorker = new Worker<FollowUpJob>(
    'follow-ups',
    async (job) =>
      job.data.kind === 'sweep'
        ? scheduler.sweepFollowUps()
        : followUps.run(job.data.userId, new Date(job.data.at)),
    { connection },
  );

  await scheduler.register();

  const close = async () => {
    await Promise.all([
      reminderWorker.close(),
      documentWorker.close(),
      memoryDreamWorker.close(),
      briefingWorker.close(),
      conversationSummaryWorker.close(),
      followUpWorker.close(),
    ]);
    await context.close();
  };

  process.on('SIGTERM', () => void close());
  process.on('SIGINT', () => void close());
}

void bootstrap();
