/**
 * Local-time scheduling primitive for proactive delivery.
 *
 * Proactive work is triggered by a periodic sweep rather than a job pinned to
 * one instant, so "is it due?" must answer over a window. An exact-minute
 * comparison silently drops the whole day whenever the worker is busy, down, or
 * restarted across that single minute.
 */

const DEFAULT_TIME_OF_DAY = '08:00';

function localParts(
  instant: Date,
  timeZone: string,
): { hour: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant);

    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);

    return Number.isInteger(hour) && Number.isInteger(minute)
      ? { hour, minute }
      : null;
  } catch {
    return null;
  }
}

/** Parses `HH:mm` into minutes since midnight; `null` when malformed. */
export function parseTimeOfDay(
  value: string | null | undefined,
): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/u.exec(value.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  return hour * 60 + minute;
}

/**
 * True when the local time falls in `[dueAt, dueAt + windowMinutes)` on the
 * same local day.
 *
 * A schedule whose time has not arrived yet is not due, and one whose window
 * has closed is treated as missed rather than delivered hours late. The window
 * deliberately does not wrap past local midnight: wrapping would make a 23:50
 * schedule fire just after midnight and label that send as the new day's
 * briefing.
 *
 * An unusable time zone or a malformed `dueAt` degrades to UTC and the default
 * time instead of throwing, because one bad profile value must not abort a
 * sweep covering every other user.
 */
export function isDueInWindow(
  instant: Date,
  timeZone: string,
  dueAt: string | null | undefined,
  windowMinutes: number,
): boolean {
  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) return false;

  const dueMinutes =
    parseTimeOfDay(dueAt) ?? parseTimeOfDay(DEFAULT_TIME_OF_DAY) ?? 0;

  const local = localParts(instant, timeZone);
  const nowMinutes = local
    ? local.hour * 60 + local.minute
    : instant.getUTCHours() * 60 + instant.getUTCMinutes();

  const elapsed = nowMinutes - dueMinutes;

  return elapsed >= 0 && elapsed < windowMinutes;
}
