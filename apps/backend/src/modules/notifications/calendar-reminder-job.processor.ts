import type { CalendarReminderJob } from '../../infra/queue';
import {
  calendarReminderKey,
  CalendarReminderService,
} from '../calendar/calendar-reminder.service';
import type { NotificationService } from './notification.service';
import type { NotificationComposerService } from './notification-composer.service';

type CalendarReminderJobDependencies = {
  calendarReminders: CalendarReminderService;
  notifications: Pick<NotificationService, 'enqueue'>;
  composer: Pick<NotificationComposerService, 'eventReminderBody'>;
};

export async function processCalendarReminderJob(
  {
    calendarReminders,
    notifications,
    composer,
  }: CalendarReminderJobDependencies,
  job: CalendarReminderJob,
): Promise<void> {
  if (job.kind === 'sweep') return calendarReminders.sweep();
  const event = await calendarReminders.resolve(job);
  if (!event) return; // Cancelled, rescheduled, or already started.
  await notifications.enqueue({
    userId: job.userId,
    kind: 'event_reminder',
    content: await composer.eventReminderBody(
      job.userId,
      event,
      new Date(job.startAt),
    ),
    idempotencyKey: calendarReminderKey(job),
    proactive: false,
    sourceId: event.sourceEventId,
    eventReminder: job,
  });
}
