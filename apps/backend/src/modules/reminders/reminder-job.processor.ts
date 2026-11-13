import type { IReminderRepository } from '../../database/interfaces';
import { REMINDER_MESSAGE_CAP } from '../../database/entities';
import type {
  QueueService,
  ReminderDispatchJob,
  ReminderFinalJob,
  ReminderJob,
  ReminderRepeatJob,
} from '../../infra/queue';
import type {
  NotificationComposerService,
  NotificationService,
} from '../notifications';
import { nextOccurrence } from '../../shared/date-time';
import { reminderJobId, scheduleFollowUp } from './reminder-follow-ups';

/** Notification kinds a reminder occurrence can produce. */
export const REMINDER_NOTIFICATION_KINDS = {
  first: 'reminder',
  repeat: 'reminder_repeat',
  final: 'reminder_final',
} as const;

type ReminderJobDependencies = {
  reminders: IReminderRepository;
  queues: Pick<QueueService, 'reminders'>;
  notifications: Pick<NotificationService, 'enqueue'>;
  composer: Pick<
    NotificationComposerService,
    'reminderBody' | 'reminderFinalBody'
  >;
  now?: () => Date;
};

export async function processReminderJob(
  dependencies: ReminderJobDependencies,
  job: ReminderJob,
): Promise<void> {
  if (job.kind === 'repeat') return processRepeat(dependencies, job);
  if (job.kind === 'final') return processFinal(dependencies, job);

  return processDispatch(dependencies, job);
}

async function processDispatch(
  {
    reminders,
    queues,
    notifications,
    composer,
    now = () => new Date(),
  }: ReminderJobDependencies,
  job: ReminderDispatchJob,
): Promise<void> {
  const reminder = await reminders.findByIdForDelivery(job.reminderId);
  // Deleted reminders and obsolete jobs left by rescheduling must never send.
  if (
    !reminder ||
    job.idempotencyKey !==
      `${reminder.id}:${reminder.scheduledAt.toISOString()}`
  )
    return;

  const dispatchedAt = now();
  // A retried job whose occurrence already dispatched still enqueues: the
  // notification layer is idempotent and finishes any partial channel send.
  await reminders.markDispatched(job.occurrenceId, {
    important: reminder.important,
    at: dispatchedAt,
  });

  await notifications.enqueue({
    userId: reminder.userId,
    kind: REMINDER_NOTIFICATION_KINDS.first,
    content: await composer.reminderBody(reminder),
    idempotencyKey: job.idempotencyKey,
    proactive: false,
    sourceId: reminder.id,
    reminderOccurrenceId: job.occurrenceId,
    reminderOccurrenceKey: job.idempotencyKey,
  });

  if (reminder.important) {
    // Each occurrence nags on its own; a newer one replaces an older one.
    // Job ids dedupe a retry, and a stale repeat drops itself on its count.
    await reminders.supersedeAwaiting(reminder.id, job.occurrenceId);
    await scheduleFollowUp(
      queues.reminders,
      job.idempotencyKey,
      {
        kind: 'repeat',
        reminderId: reminder.id,
        occurrenceId: job.occurrenceId,
        sequence: 2,
      },
      reminder.repeatIntervalMinutes,
      dispatchedAt,
      dispatchedAt.getTime(),
    );
  }

  // One-time reminders remain available until the user deletes or reschedules them.
  if (!reminder.recurrence) return;
  const next = nextOccurrence(
    reminder.recurrence,
    reminder.scheduledAt,
    reminder.timezone,
  );

  if (!next) return;
  const updated = await reminders.updateDeliverySchedule(reminder.id, next);
  if (!updated) return;
  const occurrence = await reminders.createOccurrence(reminder.id, next);
  await queues.reminders.add(
    'dispatch',
    {
      reminderId: reminder.id,
      idempotencyKey: occurrence.idempotencyKey,
      occurrenceId: occurrence.id,
    },
    {
      jobId: reminderJobId(occurrence.idempotencyKey),
      delay: Math.max(0, next.getTime() - Date.now()),
    },
  );
}

async function processRepeat(
  {
    reminders,
    queues,
    notifications,
    composer,
    now = () => new Date(),
  }: ReminderJobDependencies,
  job: ReminderRepeatJob,
): Promise<void> {
  const occurrence = await reminders.findOccurrenceForDelivery(
    job.occurrenceId,
  );

  if (
    !occurrence ||
    occurrence.status !== 'awaiting_ack' ||
    job.sequence > REMINDER_MESSAGE_CAP ||
    // A retry after the count was recorded finishes the same message.
    (occurrence.messagesSent !== job.sequence - 1 &&
      occurrence.messagesSent !== job.sequence)
  )
    return;
  const reminder = await reminders.findByIdForDelivery(job.reminderId);
  if (!reminder?.important) return;

  const retry = occurrence.messagesSent === job.sequence;
  const sentAt = retry ? (occurrence.lastSentAt ?? now()) : now();
  if (
    !retry &&
    !(await reminders.recordRepeat(occurrence.id, job.sequence - 1, sentAt))
  )
    return;

  await notifications.enqueue({
    userId: reminder.userId,
    kind: REMINDER_NOTIFICATION_KINDS.repeat,
    content: await composer.reminderBody(reminder, {
      occurrenceAt: occurrence.occurrenceAt,
      sequence: job.sequence,
    }),
    idempotencyKey: `${occurrence.idempotencyKey}:repeat:${job.sequence}`,
    proactive: false,
    sourceId: reminder.id,
    reminderOccurrenceId: occurrence.id,
    reminderOccurrenceKey: occurrence.idempotencyKey,
  });

  await scheduleFollowUp(
    queues.reminders,
    occurrence.idempotencyKey,
    job.sequence < REMINDER_MESSAGE_CAP
      ? { ...job, sequence: job.sequence + 1 }
      : {
          kind: 'final',
          reminderId: job.reminderId,
          occurrenceId: job.occurrenceId,
        },
    reminder.repeatIntervalMinutes,
    sentAt,
    now().getTime(),
  );
}

async function processFinal(
  { reminders, notifications, composer }: ReminderJobDependencies,
  job: ReminderFinalJob,
): Promise<void> {
  const occurrence = await reminders.findOccurrenceForDelivery(
    job.occurrenceId,
  );

  if (!occurrence) return;
  const reminder = await reminders.findByIdForDelivery(job.reminderId);
  if (!reminder) return;

  // An already expired occurrence is this job's own retry; the idempotent
  // notification finishes it.
  if (
    occurrence.status !== 'expired' &&
    !(await reminders.transitionOccurrence(
      occurrence.id,
      ['awaiting_ack'],
      'expired',
    ))
  )
    return;

  await notifications.enqueue({
    userId: reminder.userId,
    kind: REMINDER_NOTIFICATION_KINDS.final,
    content: await composer.reminderFinalBody(reminder),
    idempotencyKey: `${occurrence.idempotencyKey}:final`,
    proactive: false,
    sourceId: reminder.id,
    reminderOccurrenceId: occurrence.id,
    reminderOccurrenceKey: occurrence.idempotencyKey,
  });
}
