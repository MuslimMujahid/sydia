import {
  dayKeyFromParts,
  formatDayInZone,
  formatRelativeDateTime,
  formatTimeInZone,
  parseDayKey,
  zonedParts,
  zonedTimeToInstant,
} from "@/lib/utils/date-time";

/**
 * Wall time a task is saved with when it has a due date but no time, matching
 * the web's END_OF_DAY_TIME. Tasks due at this minute read as "no time".
 */
export const END_OF_DAY_TIME = "23:59";

/** A due date as the editor holds it: the day and an optional "HH:mm". */
export type DueParts = { dayKey: string; time: string | null };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Splits a stored instant into its day and wall time in the profile zone. */
export function splitDueAt(
  dueAt: string | null,
  timeZone: string
): DueParts | null {
  if (!dueAt) return null;
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return null;
  const parts = zonedParts(date, timeZone);
  const time = `${pad(parts.hour)}:${pad(parts.minute)}`;

  return {
    dayKey: dayKeyFromParts(parts.year, parts.month, parts.day),
    time: time === END_OF_DAY_TIME ? null : time,
  };
}

/** The ISO instant to save; a day without a time becomes the end of that day. */
export function buildDueAt(
  parts: DueParts | null,
  timeZone: string
): string | null {
  if (!parts) return null;
  const [hour = 0, minute = 0] = (parts.time ?? END_OF_DAY_TIME)
    .split(":")
    .map(Number);

  return zonedTimeToInstant(
    { ...parseDayKey(parts.dayKey), hour, minute },
    timeZone
  ).toISOString();
}

/** Noon on a day key, a safe base value for a date-only picker. */
export function dayKeyToPickerDate(dayKey: string, timeZone: string): Date {
  return zonedTimeToInstant({ ...parseDayKey(dayKey), hour: 12 }, timeZone);
}

/** The picker instant for a day key and "HH:mm" time. */
export function partsToPickerDate(parts: DueParts, timeZone: string): Date {
  const [hour = 9, minute = 0] = (parts.time ?? "09:00").split(":").map(Number);

  return zonedTimeToInstant(
    { ...parseDayKey(parts.dayKey), hour, minute },
    timeZone
  );
}

/** "HH:mm" of an instant in the profile zone. */
export function timeOfInstant(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);

  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * Row label: "Hari ini 14.30", "Besok", "Kamis 09.00", "2 Des". A task
 * without a time shows only its day.
 */
export function formatTaskDue(
  dueAt: string,
  timeZone: string,
  now: Date = new Date()
): string {
  const parts = splitDueAt(dueAt, timeZone);

  return formatRelativeDateTime(dueAt, timeZone, "id", now, {
    withTime: parts?.time !== null,
  });
}

/** Full label for the editor and screen readers: "Kamis, 2 Oktober, 14.30". */
export function formatTaskDueLong(dueAt: string, timeZone: string): string {
  const parts = splitDueAt(dueAt, timeZone);
  if (!parts) return dueAt;
  const day = formatDayInZone(parts.dayKey, timeZone);

  return parts.time
    ? `${day}, ${formatTimeInZone(dueAt, timeZone)}`
    : `${day} (tanpa jam)`;
}
