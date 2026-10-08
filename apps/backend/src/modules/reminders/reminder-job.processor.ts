import type { IReminderRepository } from '../../database/interfaces';
import type { QueueService, ReminderJob } from '../../infra/queue';
import type {
  NotificationComposerService,
  NotificationService,
} from '../notifications';
import { nextOccurrence } from '../../shared/date-time';

type ReminderJobDependencies = {
  reminders: IReminderRepository;
  queues: Pick<QueueService, 'reminders'>;
  notifications: Pick<NotificationService, 'enqueue'>;
  composer: Pick<NotificationComposerService, 'reminderBody'>;
};

export async function processReminderJob(
  { reminders, queues, notifications, composer }: ReminderJobDependencies,
  job: ReminderJob,
): Promise<void> {
  const reminder = await reminders.findByIdForDelivery(job.reminderId);
  // Deleted reminders and obsolete jobs left by rescheduling must never send.
  if (
    !reminder ||
    job.idempotencyKey !==
      `${reminder.id}:${reminder.scheduledAt.toISOString()}`
  )
    return;

  await notifications.enqueue({
    userId: reminder.userId,
    kind: 'reminder',
    content: await composer.reminderBody(reminder),
    idempotencyKey: job.idempotencyKey,
    proactive: false,
    sourceId: reminder.id,
    reminderOccurrenceId: job.occurrenceId,
    reminderOccurrenceKey: job.idempotencyKey,
  });

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
      jobId: occurrence.idempotencyKey.replaceAll(':', '-'),
      delay: Math.max(0, next.getTime() - Date.now()),
    },
  );
}
