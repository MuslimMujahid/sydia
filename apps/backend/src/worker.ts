import { NoteAgentCoordinatorService } from './modules/conversations/services/note-agent-coordinator.service';
import {
  processNoteOrganizationJob,
  registerNoteOrganizationRecovery,
} from './modules/notes/note-organization.job';
import './worker-runtime';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job, type WorkerOptions } from 'bullmq';
import {
  HindsightUsageService,
  withModelUsageScope,
} from './infra/model-usage';
import { AppModule } from './app.module';
import { BillingService } from './modules/billing';
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
  type MemoryDeliveryJob,
  type MemoryIngestionJob,
  type NoteOrganizationJob,
} from './infra/queue';
import { DocumentService, processDocumentJob } from './modules/documents';
import { MessagingHandlerService } from './modules/messaging';
import { DocumentArtifactCleanupService } from './modules/document-artifacts/document-artifact-cleanup.service';
import { HindsightDeliveryService } from './modules/memories/hindsight-delivery.service';
import { HindsightIngestionService } from './modules/memories/hindsight-ingestion.service';
import { CalendarSyncService } from './modules/calendar/calendar-sync.service';
import { DailyNoteService } from './modules/daily-notes/daily-note.service';
import { NotesService } from './modules/notes/notes.service';
import { ConversationSummarizerService } from './modules/conversations/services/conversation-summarizer.service';
import {
  DailyBriefingService,
  FollowUpService,
  NotificationComposerService,
  NotificationService,
  ProactiveSchedulerService,
  SecretaryBackgroundService,
} from './modules/notifications';

const HINDSIGHT_USAGE_POLL_MS = 5 * 60_000;

/**
 * The legacy memory dreamer is gone; Hindsight ingestion recovery now finds
 * idle conversations itself. Drop the old queue's daily scheduler and stranded
 * jobs so Redis does not keep collecting work nothing will process.
 */
async function removeLegacyMemoryQueue(connection: { url: string }) {
  const queue = new Queue('memory-dreams', { connection });

  try {
    await queue.removeJobScheduler('memory-dream-recovery');
    await queue.obliterate({ force: true });
  } finally {
    await queue.close();
  }
}

function jobUserId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || !('userId' in data))
    return undefined;

  return typeof data.userId === 'string' ? data.userId : undefined;
}

/** A queue worker whose model spend is attributed to its queue and job user. */
function backgroundWorker<T>(
  name: string,
  process: (job: Job<T>) => Promise<unknown>,
  options: WorkerOptions,
): Worker<T> {
  return new Worker<T>(
    name,
    (job) =>
      withModelUsageScope(
        { kind: 'background', job: name, userId: jobUserId(job.data) },
        () => process(job),
      ),
    options,
  );
}

async function bootstrap(): Promise<void> {
  const context = await NestFactory.createApplicationContext(AppModule);
  const billing = context.get(BillingService);
  const config = context.get(ConfigService);
  const memoryDeliveries = context.get(HindsightDeliveryService);
  const memoryIngestion = context.get(HindsightIngestionService);
  const reminders = context.get<IReminderRepository>(REMINDER_REPOSITORY);
  const queues = context.get(QueueService);
  const documents = context.get(DocumentService);
  context.get(DocumentArtifactCleanupService).start();
  const dailyNotes = context.get(DailyNoteService);
  const notes = context.get(NotesService);
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

  const billingWorker = backgroundWorker('billing', () => billing.recover(), {
    connection,
    concurrency: 1,
  });

  billingWorker.on('failed', (_job, error) =>
    Logger.error(
      'Billing recovery failed; inspect billing orders and provider configuration',
      error.stack,
      'BillingWorker',
    ),
  );
  await queues.billing.upsertJobScheduler(
    'billing-recovery',
    { every: 30_000 },
    { name: 'recover', data: { kind: 'recover' } },
  );

  const reminderWorker = backgroundWorker<ReminderJob>(
    'reminders',
    (job) =>
      processReminderJob(
        { reminders, queues, notifications, composer },
        job.data,
      ),
    { connection },
  );

  const calendarReminderWorker = backgroundWorker<CalendarReminderJob>(
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

  const documentWorker = backgroundWorker<DocumentJob>(
    'documents',
    (job) => processDocumentJob(documents, job),
    {
      connection,
      concurrency: config.get<number>('BACKEND_DOCUMENT_CONCURRENCY', 1),
    },
  );

  const noteOrganization = context.get(NoteAgentCoordinatorService);
  const noteOrganizationWorker = backgroundWorker<NoteOrganizationJob>(
    'note-organizations',
    (job) => processNoteOrganizationJob(noteOrganization, job.data),
    { connection, concurrency: 1 },
  );

  noteOrganizationWorker.on('failed', (job, error) =>
    Logger.error(
      `Note organization job ${job?.id} failed; durable work remains pending.`,
      error.stack,
      'NoteOrganizationWorker',
    ),
  );
  await registerNoteOrganizationRecovery(queues.noteOrganizations);

  await removeLegacyMemoryQueue(connection);

  const memoryDeliveryWorker = backgroundWorker<MemoryDeliveryJob>(
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

  const memoryIngestionWorker = backgroundWorker<MemoryIngestionJob>(
    'memory-ingestions',
    () => memoryIngestion.recover(),
    { connection },
  );

  await queues.memoryIngestions.upsertJobScheduler(
    'memory-ingestion-recovery',
    { every: 60_000 },
    { name: 'recover', data: { kind: 'recover' } },
  );

  const dailyNoteIndexWorker = backgroundWorker<DailyNoteIndexJob>(
    'daily-note-indexes',
    async (job) => {
      if (job.data.kind === 'recover')
        return Promise.all([
          dailyNotes.recoverPending(),
          notes.recoverPending(),
        ]);
      if (job.data.kind === 'custom-index')
        return notes.index(job.data.userId, job.data.itemId);

      return dailyNotes.index(job.data.userId, job.data.date);
    },
    { connection },
  );

  // A note saved while the embedding provider was down keeps its pending flag,
  // so a periodic sweep is what brings it back into the retrieval index.
  await queues.dailyNoteIndexes.upsertJobScheduler(
    'daily-note-index-recovery',
    { every: 6 * 60 * 60 * 1000 },
    { name: 'recover', data: { kind: 'recover' } },
  );

  const calendarSyncWorker = backgroundWorker<CalendarSyncJob>(
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

  const conversationSummaryWorker = backgroundWorker<ConversationSummaryJob>(
    'conversation-summaries',
    async (job) => {
      await conversationSummarizer.summarizeIfNeeded(
        job.data.userId,
        job.data.conversationId,
      );
    },
    { connection },
  );

  const briefingWorker = backgroundWorker<BriefingJob>(
    'briefings',
    async (job) =>
      job.data.kind === 'sweep'
        ? scheduler.sweepBriefings()
        : briefings.run(job.data.userId, new Date(job.data.at)),
    { connection },
  );

  const followUpWorker = backgroundWorker<FollowUpJob>(
    'follow-ups',
    async (job) =>
      job.data.kind === 'sweep'
        ? scheduler.sweepFollowUps()
        : followUps.run(job.data.userId, new Date(job.data.at)),
    { connection },
  );

  await scheduler.register();

  // Built-in background secretary: same agent and skills, every five minutes.
  const secretaryBackground = context.get(SecretaryBackgroundService);
  const secretarySweepMs = 5 * 60_000;
  let secretarySweepRunning = false;
  const secretaryTimer = setInterval(() => {
    if (secretarySweepRunning) return;
    secretarySweepRunning = true;
    void withModelUsageScope({ kind: 'background', job: 'secretary' }, () =>
      secretaryBackground.sweep(),
    )
      .catch((error: unknown) =>
        Logger.error(
          'Secretary background sweep failed; next sweep retries.',
          error instanceof Error ? error.stack : undefined,
          'SecretaryWorker',
        ),
      )
      .finally(() => {
        secretarySweepRunning = false;
      });
  }, secretarySweepMs);

  // Hindsight bills its own OpenRouter key; its spend is read from that key.
  const hindsightUsage = context.get(HindsightUsageService);
  const pollHindsightUsage = () =>
    void hindsightUsage
      .poll()
      .catch((error: unknown) =>
        Logger.error(
          'Hindsight usage poll failed; its spend is counted on the next successful poll.',
          error instanceof Error ? error.stack : String(error),
          'HindsightUsage',
        ),
      );

  const hindsightUsageTimer = hindsightUsage.configured
    ? setInterval(pollHindsightUsage, HINDSIGHT_USAGE_POLL_MS)
    : undefined;

  if (hindsightUsage.configured) pollHindsightUsage();

  const close = async () => {
    clearInterval(secretaryTimer);
    clearInterval(hindsightUsageTimer);
    // A channel turn can still enqueue and await a document. Keep its worker
    // alive until preparation and the response finish.
    await context.get(MessagingHandlerService).stopAndDrain();
    await Promise.all([
      noteOrganizationWorker.close(),
      billingWorker.close(),
      reminderWorker.close(),
      calendarReminderWorker.close(),
      documentWorker.close(),
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
