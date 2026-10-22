import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CALENDAR_REPOSITORY,
  type ICalendarRepository,
} from '../../database/interfaces';
import { QueueService, type CalendarReminderDispatch } from '../../infra/queue';
import { zonedInstant } from '../../shared/date-time/timezone-day';
import {
  CalendarReadService,
  type CalendarEventOccurrence,
} from './calendar-read.service';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const LOOKAHEAD_MS = 2 * MINUTE_MS;
const USER_BATCH_SIZE = 100;
const MAX_SWEEP_FAILURES = 20;

export function calendarReminderKey(job: CalendarReminderDispatch): string {
  // One notification per event occurrence, even if its lead time is edited.
  return `calendar-reminder:${job.eventId}:${job.startAt}`;
}

function eventStart(
  event: CalendarEventOccurrence,
  timezone: string,
): Date | null {
  if (event.startAt) return event.startAt;
  if (!event.allDayStartDate) return null;
  const date = event.allDayStartDate;

  return zonedInstant(
    {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    event.timezone ?? timezone,
  );
}

@Injectable()
export class CalendarReminderService {
  private readonly logger = new Logger(CalendarReminderService.name);

  constructor(
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendars: ICalendarRepository,
    private readonly read: CalendarReadService,
    private readonly queues: QueueService,
  ) {}

  async sweep(now = new Date()): Promise<void> {
    let afterId: string | null = null;
    const failures: unknown[] = [];

    do {
      const users = await this.calendars.listReminderUsers(
        afterId,
        USER_BATCH_SIZE,
      );

      for (const user of users) {
        try {
          // Date-only events can fall on either UTC day in the owner's timezone.
          const events = await this.read.list(
            user.id,
            new Date(now.getTime() - DAY_MS),
            new Date(now.getTime() + 2 * DAY_MS),
          );

          for (const event of events) {
            if (event.reminderMinutes == null || event.status === 'cancelled')
              continue;
            const start = eventStart(event, user.timezone);
            if (!start || start <= now) continue;
            const scheduledAt = new Date(
              start.getTime() - event.reminderMinutes * MINUTE_MS,
            );

            if (scheduledAt.getTime() > now.getTime() + LOOKAHEAD_MS) continue;
            const data: CalendarReminderDispatch = {
              kind: 'dispatch',
              userId: user.id,
              eventId: event.id,
              startAt: start.toISOString(),
              scheduledAt: scheduledAt.toISOString(),
              timezone: user.timezone,
            };

            const jobId = createHash('sha256')
              .update(JSON.stringify(data))
              .digest('hex');

            const existing = await this.queues.calendarReminders.getJob(jobId);
            if (existing && (await existing.getState()) === 'failed')
              await existing.remove();
            await this.queues.calendarReminders.add('dispatch', data, {
              jobId,
              delay: Math.max(0, scheduledAt.getTime() - now.getTime()),
            });
          }
        } catch (error: unknown) {
          this.logger.error(
            `Event reminders could not be scheduled for user ${user.id}; the sweep will retry.`,
            error instanceof Error ? error.stack : String(error),
          );
          failures.push(error);
          if (failures.length >= MAX_SWEEP_FAILURES)
            throw new AggregateError(
              failures,
              'Event reminder sweep exceeded its failure budget.',
            );
        }
      }

      afterId =
        users.length === USER_BATCH_SIZE ? users[users.length - 1]!.id : null;
    } while (afterId);

    if (failures.length)
      throw new AggregateError(failures, 'Event reminder scheduling failed.');
  }

  async resolve(
    job: CalendarReminderDispatch,
    now = new Date(),
  ): Promise<CalendarEventOccurrence | null> {
    const start = new Date(job.startAt);
    if (start <= now || new Date(job.scheduledAt) > now) return null;

    return this.resolveMissed(job, now);
  }

  /** Historical source validation for outage summaries, never ordinary sends. */
  async resolveMissed(
    job: CalendarReminderDispatch,
    now = new Date(),
  ): Promise<CalendarEventOccurrence | null> {
    const start = new Date(job.startAt);
    const due = new Date(job.scheduledAt);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(due.getTime()) ||
      due > now
    )
      return null;
    const events = await this.read.list(
      job.userId,
      new Date(start.getTime() - DAY_MS),
      new Date(start.getTime() + DAY_MS),
    );

    const event = events.find((candidate) => candidate.id === job.eventId);
    if (!event || event.status === 'cancelled' || event.reminderMinutes == null)
      return null;
    const currentStart = eventStart(event, job.timezone);
    if (!currentStart || currentStart.toISOString() !== job.startAt)
      return null;
    const scheduledAt = new Date(
      currentStart.getTime() - event.reminderMinutes * MINUTE_MS,
    );

    return scheduledAt.toISOString() === job.scheduledAt ? event : null;
  }
}
