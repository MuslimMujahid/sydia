import './worker-runtime';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { AppModule } from './app.module';
import { processCalendarReminderJob } from './modules/notifications/calendar-reminder-job.processor';
import { CalendarReminderService } from './modules/calendar/calendar-reminder.service';
import { processReminderJob } from './modules/reminders/reminder-job.processor';
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
  type DailyNoteIndexJob,
  type FollowUpJob,
  type CalendarSyncJob,
  type CalendarReminderJob,
  type MemoryDreamJob,
  type MemoryDeliveryJob,
  type MemoryIngestionJob,
} from './infra/queue';
import { DocumentService, processDocumentJob } from './modules/documents';
import { DocumentArtifactCleanupService } from './modules/document-artifacts/document-artifact-cleanup.service';
import { MemoryDreamService } from './modules/memories/memory-dream.service';
import { MemoryDreamSchedulerService } from './modules/memories/memory-dream-scheduler.service';
import { HindsightDeliveryService } from './modules/memories/hindsight-delivery.service';
import { HindsightIngestionService } from './modules/memories/hindsight-ingestion.service';
import { MemoryEngineService } from './modules/memories/memory-engine.service';
import { CalendarSyncService } from './modules/calendar/calendar-sync.service';
import { DailyNoteService } from './modules/daily-notes/daily-note.service';
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
  const memoryDeliveries = context.get(HindsightDeliveryService);
  const memoryIngestion = context.get(HindsightIngestionService);
  const memoryEngine = context.get(MemoryEngineService);
  const reminders = context.get<IReminderRepository>(REMINDER_REPOSITORY);
  const queues = context.get(QueueService);
  const documents = context.get(DocumentService);
  context.get(DocumentArtifactCleanupService).start();
  const memoryDream = context.get(MemoryDreamService);
  const memoryDreamScheduler = context.get(MemoryDreamSchedulerService);
  const dailyNotes = context.get(DailyNoteService);
  const conversationSummarizer = context.get(ConversationSummarizerService);
  const notifications = context.get(NotificationService);
  const briefings = context.get(DailyBriefingService);
  const followUps = context.get(FollowUpService);
  const composer = context.get(NotificationComposerService);
  const scheduler = context.get(ProactiveSchedulerService);
  const calendarSync = context.get(CalendarSyncService);
  const calendarReminders = context.get(CalendarReminderService);
  const connection = {
    url: config.getOrThrow<string>('BACKEND_REDIS_URL'),
  };

  const reminderWorker = new Worker<ReminderJob>(
    'reminders',
    (job) =>
      processReminderJob(
        { reminders, queues, notifications, composer },
        job.data,
      ),
    { connection },
  );

  const calendarReminderWorker = new Worker<CalendarReminderJob>(
    'calendar-reminders',
    (job) =>
      processCalendarReminderJob(
        { calendarReminders, notifications, composer },
        job.data,
      ),
    { connection },
  );

  calendarReminderWorker.on('failed', (job, error) => {
    Logger.error(
      `Event reminder job ${job?.id} failed: ${error.message}`,
      error.stack,
      'CalendarReminderWorker',
    );
  });
  await queues.calendarReminders.upsertJobScheduler(
    'calendar-reminder-sweep',
    { every: 30_000 },
    { name: 'sweep', data: { kind: 'sweep' } },
  );

  const documentWorker = new Worker<DocumentJob>(
    'documents',
    (job) => processDocumentJob(documents, job),
    {
      connection,
      concurrency: config.get<number>('BACKEND_DOCUMENT_CONCURRENCY', 1),
    },
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

      const mode = memoryEngine.modeFor(job.data.userId);

      if (mode === 'shadow') {
        try {
          await memoryIngestion.run(
            job.data.userId,
            job.data.conversationId,
            job.data.throughMessageId,
            job.data.allowShortSegment,
          );
        } catch {
          Logger.warn(
            'Shadow memory ingestion deferred; the legacy writer continues.',
            'MemoryWorker',
          );
        }
      }

      if (mode === 'hindsight') {
        await memoryIngestion.run(
          job.data.userId,
          job.data.conversationId,
          job.data.throughMessageId,
          job.data.allowShortSegment,
        );

        return;
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

  const memoryDeliveryWorker = new Worker<MemoryDeliveryJob>(
    'memory-deliveries',
    async (job) => {
      if (job.data.kind === 'bank')
        return memoryDeliveries.flushBank(job.data.bankId);

      return memoryDeliveries.recover();
    },
    {
      connection,
      concurrency: config.get<number>('BACKEND_HINDSIGHT_CONCURRENCY', 4),
    },
  );

  await queues.memoryDeliveries.upsertJobScheduler(
    'memory-delivery-recovery',
    { every: 30_000 },
    { name: 'recover', data: { kind: 'recover' } },
  );

  const memoryIngestionWorker = new Worker<MemoryIngestionJob>(
    'memory-ingestions',
    () => memoryIngestion.recover(),
    { connection },
  );

  await queues.memoryIngestions.upsertJobScheduler(
    'memory-ingestion-recovery',
    { every: 60_000 },
    { name: 'recover', data: { kind: 'recover' } },
  );

  const dailyNoteIndexWorker = new Worker<DailyNoteIndexJob>(
    'daily-note-indexes',
    async (job) =>
      job.data.kind === 'recover'
        ? dailyNotes.recoverPending()
        : dailyNotes.index(job.data.userId, job.data.date),
    { connection },
  );

  // A note saved while the embedding provider was down keeps its pending flag,
  // so a periodic sweep is what brings it back into the retrieval index.
  await queues.dailyNoteIndexes.upsertJobScheduler(
    'daily-note-index-recovery',
    { every: 6 * 60 * 60 * 1000 },
    { name: 'recover', data: { kind: 'recover' } },
  );

  const calendarSyncWorker = new Worker<CalendarSyncJob>(
    'calendar-sync',
    (job) => calendarSync.process(job.data),
    {
      connection,
      concurrency: config.get<number>('BACKEND_CALENDAR_SYNC_CONCURRENCY', 4),
    },
  );

  await queues.calendarSync.upsertJobScheduler(
    'calendar-sync-recovery',
    { every: 30_000 },
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
      calendarReminderWorker.close(),
      documentWorker.close(),
      memoryDreamWorker.close(),
      memoryDeliveryWorker.close(),
      memoryIngestionWorker.close(),
      dailyNoteIndexWorker.close(),
      briefingWorker.close(),
      conversationSummaryWorker.close(),
      followUpWorker.close(),
      calendarSyncWorker.close(),
    ]);
    await context.close();
  };

  process.on('SIGTERM', () => void close());
  process.on('SIGINT', () => void close());
}

void bootstrap();
