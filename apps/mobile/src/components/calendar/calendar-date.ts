import type { CalendarRange } from "@/lib/services/api/calendar/calendar.api";

/**
 * Pure calendar-date helpers, ported from the web calendar. Days are handled
 * as "yyyy-MM-dd" keys so grid math never depends on the device time zone;
 * instants are converted into keys and minutes in the profile time zone.
 */

export type DayKey = string;

export const MINUTES_PER_DAY = 24 * 60;

type CalendarDate = { year: number; month: number; day: number };

export type MonthGridDay = { key: DayKey; day: number; inMonth: boolean };

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function utcNoon(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function fromUtcNoon(date: Date): CalendarDate {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function dayKeyOf(date: CalendarDate): DayKey {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(
    2,
    "0"
  )}-${String(date.day).padStart(2, "0")}`;
}

export function parseDayKey(key: DayKey): CalendarDate {
  const match = DAY_KEY_PATTERN.exec(key);
  if (!match) throw new Error(`Invalid day key: ${key}`);

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** Whether a value is a real calendar day in "yyyy-MM-dd" form. */
export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== "string" || !DAY_KEY_PATTERN.test(value)) return false;
  const date = parseDayKey(value);

  return (
    dayKeyOf(fromUtcNoon(utcNoon(date.year, date.month, date.day))) === value
  );
}

export function addDays(key: DayKey, delta: number): DayKey {
  const date = parseDayKey(key);

  return dayKeyOf(
    fromUtcNoon(utcNoon(date.year, date.month, date.day + delta))
  );
}

function daysInMonth(year: number, month: number): number {
  return utcNoon(year, month + 1, 0).getUTCDate();
}

/** Shift by whole months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(key: DayKey, delta: number): DayKey {
  const date = parseDayKey(key);
  const target = fromUtcNoon(utcNoon(date.year, date.month + delta, 1));

  return dayKeyOf({
    ...target,
    day: Math.min(date.day, daysInMonth(target.year, target.month)),
  });
}

/** Monday-first weekday index: 0 = Monday … 6 = Sunday. */
export function weekdayOf(key: DayKey): number {
  const date = parseDayKey(key);

  return (utcNoon(date.year, date.month, date.day).getUTCDay() + 6) % 7;
}

export function startOfWeek(key: DayKey): DayKey {
  return addDays(key, -weekdayOf(key));
}

/** The first day of the month containing `key`. */
export function startOfMonth(key: DayKey): DayKey {
  const date = parseDayKey(key);

  return dayKeyOf({ year: date.year, month: date.month, day: 1 });
}

export function dayKeysFrom(start: DayKey, count: number): DayKey[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

/** Monday-first, week-aligned days covering a month (4–6 weeks). */
export function getMonthGridDays(year: number, month: number): MonthGridDay[] {
  const first = dayKeyOf({ year, month, day: 1 });
  const leadDays = weekdayOf(first);
  const weekCount = Math.ceil((leadDays + daysInMonth(year, month)) / 7);

  return dayKeysFrom(addDays(first, -leadDays), weekCount * 7).map((key) => {
    const date = parseDayKey(key);

    return {
      key,
      day: date.day,
      inMonth: date.year === year && date.month === month,
    };
  });
}

const ZONED_PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function zonedParts(timeZone: string, instant: Date): Record<string, number> {
  let formatter = ZONED_PARTS_FORMATTERS.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    ZONED_PARTS_FORMATTERS.set(timeZone, formatter);
  }

  const values: Record<string, number> = {};

  for (const part of formatter.formatToParts(instant)) {
    if (part.type === "literal") continue;
    values[part.type] = Number(part.value);
  }

  return values;
}

/**
 * Day key of an instant as seen in the given time zone. Built from parts
 * (not an ISO-looking locale) so every ICU build yields the same key.
 */
export function dayKeyInZone(date: Date, timeZone: string): DayKey {
  const values = zonedParts(timeZone, date);

  return dayKeyOf({
    year: values.year ?? 1970,
    month: values.month ?? 1,
    day: values.day ?? 1,
  });
}

function timeZoneOffsetMs(timeZone: string, instant: Date): number {
  const values = zonedParts(timeZone, instant);
  const wallAsUtc = Date.UTC(
    values.year ?? 0,
    (values.month ?? 1) - 1,
    values.day ?? 1,
    values.hour === 24 ? 0 : (values.hour ?? 0),
    values.minute ?? 0,
    values.second ?? 0
  );

  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Epoch milliseconds of a day's wall-clock midnight in the given time zone. */
export function zonedMidnightMs(key: DayKey, timeZone: string): number {
  const date = parseDayKey(key);
  const guess = Date.UTC(date.year, date.month - 1, date.day);
  const offset = timeZoneOffsetMs(timeZone, new Date(guess));
  const utc = guess - offset;
  const refined = timeZoneOffsetMs(timeZone, new Date(utc));

  return refined === offset ? utc : guess - refined;
}

/** Minutes since local midnight of an instant in the given time zone. */
export function minutesOfDayInZone(date: Date, timeZone: string): number {
  const values = zonedParts(timeZone, date);

  return (
    (values.hour === 24 ? 0 : (values.hour ?? 0)) * 60 + (values.minute ?? 0)
  );
}

/** Wall time "yyyy-MM-ddTHH:mm" for a day and a minute of that day. */
export function toWallDateTime(key: DayKey, minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return `${key}T${String(hours).padStart(2, "0")}:${String(rest).padStart(
    2,
    "0"
  )}`;
}

/** Whole days from `start` (inclusive) to `end` (exclusive). */
export function daysBetween(start: DayKey, end: DayKey): number {
  return Math.round(
    (dateOfKey(end).getTime() - dateOfKey(start).getTime()) / 86_400_000
  );
}

/** Query range for whole days `[first, endExclusive)` in the profile zone. */
export function getDayRange(
  first: DayKey,
  endExclusive: DayKey,
  timeZone: string
): CalendarRange {
  return {
    from: new Date(zonedMidnightMs(first, timeZone)).toISOString(),
    to: new Date(zonedMidnightMs(endExclusive, timeZone)).toISOString(),
  };
}

/** Query range covering a month grid (including the lead and trail days). */
export function getMonthGridRange(
  year: number,
  month: number,
  timeZone: string
): CalendarRange {
  const days = getMonthGridDays(year, month);
  const first = days[0]?.key ?? dayKeyOf({ year, month, day: 1 });
  const last = days[days.length - 1]?.key ?? first;

  return getDayRange(first, addDays(last, 1), timeZone);
}

const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const SHORT_DATE_YEAR_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const FULL_DAY_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const DAY_LABEL_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const WEEKDAY_SHORT_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  timeZone: "UTC",
});

function dateOfKey(key: DayKey): Date {
  const date = parseDayKey(key);

  return utcNoon(date.year, date.month, date.day);
}

/** Monday-first short weekday names ("Sen" … "Min"). */
export const WEEKDAY_SHORT_LABELS = Array.from({ length: 7 }, (_, index) =>
  // 2024-01-01 is a Monday, so index 0 labels the Monday-first column.
  WEEKDAY_SHORT_FORMAT.format(utcNoon(2024, 1, 1 + index)).replace(/\.$/, "")
);

/** "September 2026". */
export function formatMonthYear(year: number, month: number): string {
  return MONTH_YEAR_FORMAT.format(utcNoon(year, month, 1));
}

/** "September 2026" for the month containing a day. */
export function formatMonthOfDay(key: DayKey): string {
  const date = parseDayKey(key);

  return formatMonthYear(date.year, date.month);
}

/** "Rabu, 30 September". */
export function formatDayKeyLabel(key: DayKey): string {
  return DAY_LABEL_FORMAT.format(dateOfKey(key));
}

/** "Rabu, 30 September 2026". */
export function formatDayKeyFull(key: DayKey): string {
  return FULL_DAY_FORMAT.format(dateOfKey(key));
}

/** "30 Sep". */
export function formatShortDate(key: DayKey): string {
  return SHORT_DATE_FORMAT.format(dateOfKey(key));
}

/** "30 Sep 2026". */
export function formatShortDateYear(key: DayKey): string {
  return SHORT_DATE_YEAR_FORMAT.format(dateOfKey(key));
}

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = TIME_FORMATTERS.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    });
    TIME_FORMATTERS.set(timeZone, formatter);
  }

  return formatter;
}

/** "09.30" in the given time zone. */
export function formatTimeInZone(value: string, timeZone: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : timeFormatter(timeZone).format(date);
}

/** "Asia/Jakarta" → "Asia/Jakarta" with spaces, as the web editor shows it. */
export function formatZoneName(timeZone: string): string {
  return timeZone.replaceAll("_", " ");
}
