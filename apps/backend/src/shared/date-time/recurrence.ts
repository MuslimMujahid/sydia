import { RRule } from 'rrule';
import type { ReminderRecurrence } from '../../database/entities';
import { zonedInstant, zonedParts } from './timezone-day';

/**
 * Recurrence rules for reminders.
 *
 * Two conversions happen here, and both matter for correctness.
 *
 * Weekdays: stored values follow the JavaScript convention the chat tool and the
 * REST DTO document (0 is Sunday through 6 is Saturday), while `rrule` numbers
 * weekdays from Monday (0 == MO ... 6 == SU). Passing a stored value through
 * unchanged schedules every occurrence one day late.
 *
 * Time zone: `rrule` works on UTC fields, and `byweekday` matches the UTC
 * weekday. A weekly rule therefore has to be evaluated in the user's local wall
 * clock — "every Tuesday 17:00" stays 17:00 across a daylight-saving shift —
 * and the resulting wall clock converted back to an absolute instant. Building
 * the rule directly on UTC fields would drop the first occurrence whenever a
 * local weekday falls on a different UTC day, and would pin the time of day to
 * whatever offset was current when the reminder was created.
 */

/** Recurrence rule instance evaluated in a single zone's wall-clock space. */
export type ReminderRule = RRule;

const RRULE_FREQUENCY: Record<ReminderRecurrence['frequency'], number> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
};

/** Maps a stored Sunday-based weekday onto the `rrule` Monday-based scale. */
export function rruleWeekday(day: number): number {
  return (day + 6) % 7;
}

/**
 * Wall-clock fields of an instant encoded as a UTC `Date`.
 *
 * `rrule` only speaks UTC, so local scheduling is expressed by feeding it the
 * local fields as if they were UTC and converting the results back.
 */
function wallClock(instant: Date, timezone: string): Date {
  const parts = zonedParts(instant, timezone);

  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ),
  );
}

function instantOf(wallClockValue: Date, timezone: string): Date {
  return zonedInstant(
    {
      year: wallClockValue.getUTCFullYear(),
      month: wallClockValue.getUTCMonth() + 1,
      day: wallClockValue.getUTCDate(),
      hour: wallClockValue.getUTCHours(),
      minute: wallClockValue.getUTCMinutes(),
      second: wallClockValue.getUTCSeconds(),
    },
    timezone,
  );
}

export function buildReminderRule(
  recurrence: ReminderRecurrence,
  anchor: Date,
  timezone: string,
): ReminderRule {
  return new RRule({
    freq: RRULE_FREQUENCY[recurrence.frequency],
    interval: recurrence.interval,
    byweekday: recurrence.daysOfWeek?.map(rruleWeekday),
    dtstart: wallClock(anchor, timezone),
    until: recurrence.endsAt
      ? wallClock(new Date(recurrence.endsAt), timezone)
      : undefined,
  });
}

/**
 * The first occurrence of a rule at or after `scheduledAt`.
 *
 * A rule only yields its `dtstart` when that instant already matches it, so a
 * weekly rule whose weekdays omit the stored wall clock would silently skip a
 * whole cycle before firing. Snapping at the write boundaries keeps the stored
 * `scheduledAt` equal to the first delivery the worker will compute.
 *
 * A rule that ended before `scheduledAt` has no occurrence; the stored value is
 * returned unchanged so the reminder keeps a well-defined schedule.
 */
export function firstOccurrence(
  recurrence: ReminderRecurrence,
  scheduledAt: Date,
  timezone: string,
): Date {
  const match = buildReminderRule(recurrence, scheduledAt, timezone).after(
    wallClock(scheduledAt, timezone),
    true,
  );

  return match ? instantOf(match, timezone) : scheduledAt;
}

/** The next occurrence strictly after `after`, or null when the rule is done. */
export function nextOccurrence(
  recurrence: ReminderRecurrence,
  after: Date,
  timezone: string,
): Date | null {
  const match = buildReminderRule(recurrence, after, timezone).after(
    wallClock(after, timezone),
    false,
  );

  return match ? instantOf(match, timezone) : null;
}
