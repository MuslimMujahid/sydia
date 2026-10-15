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
