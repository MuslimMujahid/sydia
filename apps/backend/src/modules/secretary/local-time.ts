import { zonedInstant, zonedParts } from '../../shared/date-time';

const pad = (value: number): string => String(value).padStart(2, '0');

/** Owner-local `YYYY-MM-DD` for an instant. */
export function localDate(instant: Date, timezone: string): string {
  const parts = zonedParts(instant, timezone);

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Owner-local `YYYY-MM-DD HH:mm` for an instant. */
export function localDateTime(instant: Date, timezone: string): string {
  const parts = zonedParts(instant, timezone);

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function localTime(instant: Date, timezone: string): string {
  return localDateTime(instant, timezone).slice(11);
}

/** Start of an owner-local calendar date. */
export function localDayStart(date: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number);

  return zonedInstant(
    { year: year!, month: month!, day: day!, hour: 0, minute: 0, second: 0 },
    timezone,
  );
}

/** Adds whole days to a `YYYY-MM-DD` date without timezone drift. */
export function addLocalDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}
