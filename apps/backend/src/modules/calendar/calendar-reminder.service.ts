import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CALENDAR_REPOSITORY,
  type EventReminderWork,
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
/**
 * The due index queues a little earlier than the legacy sweep, and runs first
 * in each tick, so every reminder the sweep finds should already be queued.
 */
const DUE_INDEX_LOOKAHEAD_MS = 3 * MINUTE_MS;
/**
 * Reads cover starts up to two days ahead and reminders lead by at most an
 * hour, so a user with nothing due in the window is checked again within a
 * day: before any later reminder could enter its lookahead.
 */
const DUE_INDEX_RECHECK_MS = DAY_MS;
const USER_BATCH_SIZE = 100;
const MAX_SWEEP_FAILURES = 20;

type ReminderCandidate = { data: CalendarReminderDispatch; scheduledAt: Date };

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

  /**
   * One reminder tick. The due index (docs/REMINDER_DUE_INDEX_PLAN.md) runs
   * first; the legacy per-user sweep still runs as the shadow safety net and
   * logs `reminder_due_index_miss` for any future reminder the index missed.
   * A due-index failure never stops the sweep.
   */
  async sweep(now = new Date()): Promise<void> {
    const failures: unknown[] = [];

    try {
      failures.push(...(await this.scheduleDue(now)));
    } catch (error: unknown) {
      failures.push(error);
    }

    try {
      failures.push(...(await this.legacySweep(now)));
    } catch (error: unknown) {
      failures.push(error);
    }

    if (failures.length)
      throw new AggregateError(failures, 'Event reminder scheduling failed.');
  }

  /**
   * Schedules users whose calendar changed or whose stored due time passed,
   * then stores when they next need scheduling. Cost follows the number of
   * users with work, not the number of users.
   */
  private async scheduleDue(now: Date): Promise<unknown[]> {
    const failures: unknown[] = [];
    const discarded = await this.calendars.discardOrphanEventReminderChanges();
    if (discarded)
      this.logger.log(
        JSON.stringify({ event: 'reminder_due_index_orphans', discarded }),
      );
    let afterUserId: string | null = null;

    do {
      const work = await this.calendars.listEventReminderWork(
        now,
        afterUserId,
        USER_BATCH_SIZE,
      );

      for (const item of work) {
        try {
          await this.scheduleUser(item, now);
        } catch (error: unknown) {
          this.logger.error(
            `Event reminders could not be scheduled for user ${item.userId} from the due index; the next tick retries.`,
            error instanceof Error ? error.stack : String(error),
          );
          failures.push(error);
          if (failures.length >= MAX_SWEEP_FAILURES)
            throw new AggregateError(
              failures,
              'Event reminder due index exceeded its failure budget.',
            );
        }
      }

      afterUserId =
        work.length === USER_BATCH_SIZE ? work[work.length - 1]!.userId : null;
    } while (afterUserId);

    return failures;
  }

  private async scheduleUser(work: EventReminderWork, now: Date) {
    if (!(await this.calendars.hasEventReminders(work.userId))) {
      await this.calendars.completeEventReminderWork(
        work.userId,
        work.changeIds,
        null,
      );

      return;
    }

    let dueAt = now.getTime() + DUE_INDEX_RECHECK_MS;

    for (const candidate of await this.candidates(
      work.userId,
      work.timezone,
      now,
    )) {
      const at = candidate.scheduledAt.getTime();
      if (at <= now.getTime() + DUE_INDEX_LOOKAHEAD_MS)
        await this.enqueue(candidate, now);
      // Keep the user due until each reminder fires, so a lost job is queued again.
      if (at > now.getTime())
        dueAt = Math.min(dueAt, at - DUE_INDEX_LOOKAHEAD_MS);
    }

    await this.calendars.completeEventReminderWork(
      work.userId,
      work.changeIds,
      new Date(dueAt),
    );
  }

  /** The legacy sweep over every user with reminder events (shadow period). */
  private async legacySweep(now: Date): Promise<unknown[]> {
    let afterId: string | null = null;
    const failures: unknown[] = [];

    do {
      const users = await this.calendars.listReminderUsers(
        afterId,
        USER_BATCH_SIZE,
      );

      for (const user of users) {
        try {
          for (const candidate of await this.candidates(
            user.id,
            user.timezone,
            now,
          )) {
            if (candidate.scheduledAt.getTime() > now.getTime() + LOOKAHEAD_MS)
              continue;
            const queued = await this.enqueue(candidate, now);

            if (
              !queued &&
              candidate.scheduledAt > now &&
              !(await this.calendars.hasPendingEventReminderChange(user.id))
            )
              this.logger.warn(
                JSON.stringify({
                  event: 'reminder_due_index_miss',
                  kind: 'event_reminder',
                  userId: user.id,
                  eventId: candidate.data.eventId,
                  startAt: candidate.data.startAt,
                  scheduledAt: candidate.data.scheduledAt,
                  remediation:
                    'The due index did not queue this reminder; the legacy sweep did. Find the write path or backfill gap before removing the sweep.',
                }),
              );
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

    return failures;
  }

  /** Future reminders for a user's events starting within the next two days. */
  private async candidates(
    userId: string,
    timezone: string,
    now: Date,
  ): Promise<ReminderCandidate[]> {
    // Date-only events can fall on either UTC day in the owner's timezone.
    const events = await this.read.list(
      userId,
      new Date(now.getTime() - DAY_MS),
      new Date(now.getTime() + 2 * DAY_MS),
    );

    const candidates: ReminderCandidate[] = [];

    for (const event of events) {
      if (event.reminderMinutes == null || event.status === 'cancelled')
        continue;
      const start = eventStart(event, timezone);
      if (!start || start <= now) continue;
      const scheduledAt = new Date(
        start.getTime() - event.reminderMinutes * MINUTE_MS,
      );

      candidates.push({
        scheduledAt,
        data: {
          kind: 'dispatch',
          userId,
          eventId: event.id,
          startAt: start.toISOString(),
          scheduledAt: scheduledAt.toISOString(),
          timezone,
        },
      });
    }

    return candidates;
  }

  /**
   * Queues one reminder under a job id derived from its content, so the due
   * index and the legacy sweep can never queue it twice. Returns whether a
   * job already existed.
   */
  private async enqueue(
    { data, scheduledAt }: ReminderCandidate,
    now: Date,
  ): Promise<boolean> {
    const jobId = createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');

    const existing = await this.queues.calendarReminders.getJob(jobId);
    const failed = existing ? (await existing.getState()) === 'failed' : false;
    if (existing && failed) await existing.remove();
    await this.queues.calendarReminders.add('dispatch', data, {
      jobId,
      delay: Math.max(0, scheduledAt.getTime() - now.getTime()),
    });

    return Boolean(existing) && !failed;
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
