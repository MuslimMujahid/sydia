import { dayWindow } from '../../shared/date-time';

/** One stable identity per interval, anchored at midnight in the user's zone. */
export function followUpIntervalKey(
  now: Date,
  timezone: string,
  intervalMinutes: number,
): string {
  const window = dayWindow(now, timezone);
  const slot = Math.floor(
    (now.getTime() - window.start.getTime()) / (intervalMinutes * 60_000),
  );

  return `${window.date}-${intervalMinutes}-${slot}`;
}

/**
 * The first follow-up slot start at or after `at`. Slots are anchored at each
 * local midnight, as in followUpIntervalKey, so the last slot of a day ends at
 * the next midnight.
 */
export function followUpSlotAtOrAfter(
  at: Date,
  timezone: string,
  intervalMinutes: number,
): Date {
  const window = dayWindow(at, timezone);
  const intervalMs = intervalMinutes * 60_000;
  const start =
    window.start.getTime() +
    Math.ceil((at.getTime() - window.start.getTime()) / intervalMs) *
      intervalMs;

  return new Date(Math.min(start, window.end.getTime()));
}
