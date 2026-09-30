import type { CalendarRange } from "@/lib/services/api/calendar/calendar.api";

/**
 * Pure calendar-date helpers. Days are handled as "yyyy-MM-dd" keys so grid
 * math never depends on the browser's time zone; instants are converted into
 * keys and minutes in the page time zone explicitly.
 */

export type DayKey = string;

export const CALENDAR_VIEWS = [
  "day",
  "week",
  "month",
  "year",
  "schedule",
] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  day: "Hari",
  week: "Minggu",
  month: "Bulan",
  year: "Tahun",
  schedule: "Jadwal",
};

export function isCalendarView(value: unknown): value is CalendarView {
  return (
    typeof value === "string" &&
    (CALENDAR_VIEWS as readonly string[]).includes(value)
  );
}

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

const DAY_KEY_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const ZONED_PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/** Day key of an instant as seen in the given time zone. */
export function dayKeyInZone(date: Date, timeZone: string): DayKey {
  let formatter = DAY_KEY_FORMATTERS.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    DAY_KEY_FORMATTERS.set(timeZone, formatter);
  }

  return formatter.format(date);
}

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

/** Wall time "yyyy-MM-ddTHH:mm" for prefilling datetime-local inputs. */
export function toWallDateTime(key: DayKey, minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return `${key}T${String(hours).padStart(2, "0")}:${String(rest).padStart(
    2,
    "0"
  )}`;
}

/** Days a view covers, in order. */
export function getViewDayKeys(view: CalendarView, anchor: DayKey): DayKey[] {
  const date = parseDayKey(anchor);

  switch (view) {
    case "day":
      return [anchor];
    case "week":
      return dayKeysFrom(startOfWeek(anchor), 7);
    case "month":
      return getMonthGridDays(date.year, date.month).map((day) => day.key);

    case "year": {
      const first = dayKeyOf({ year: date.year, month: 1, day: 1 });

      return dayKeysFrom(first, daysBetween(first, addMonths(first, 12)));
    }

    case "schedule":
      // One month of days starting at the anchor, like a rolling agenda.
      return dayKeysFrom(anchor, daysBetween(anchor, addMonths(anchor, 1)));
  }
}

/** Whole days from `start` (inclusive) to `end` (exclusive). */
export function daysBetween(start: DayKey, end: DayKey): number {
  return Math.round(
    (dateOfKey(end).getTime() - dateOfKey(start).getTime()) / 86_400_000
  );
}

/** Query range covering every day of a view, in the page time zone. */
export function getViewRange(
  view: CalendarView,
  anchor: DayKey,
  timeZone: string
): CalendarRange {
  const days = getViewDayKeys(view, anchor);
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last)
    throw new Error("A calendar view needs at least one day");

  return {
    from: new Date(zonedMidnightMs(first, timeZone)).toISOString(),
    to: new Date(zonedMidnightMs(addDays(last, 1), timeZone)).toISOString(),
  };
}

/** Move the anchor by one view-sized step. */
export function shiftAnchor(
  view: CalendarView,
  anchor: DayKey,
  delta: number
): DayKey {
  switch (view) {
    case "day":
      return addDays(anchor, delta);
    case "week":
      return addDays(anchor, delta * 7);
    case "month":
    case "schedule":
      return addMonths(anchor, delta);
    case "year":
      return addMonths(anchor, delta * 12);
  }
}

const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_FORMAT = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  timeZone: "UTC",
});

const MONTH_SHORT_FORMAT = new Intl.DateTimeFormat("id-ID", {
  month: "short",
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

const WEEKDAY_LONG_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  timeZone: "UTC",
});

function dateOfKey(key: DayKey): Date {
  const date = parseDayKey(key);

  return utcNoon(date.year, date.month, date.day);
}

// 2024-01-01 is a Monday, so index 0 labels the Monday-first column.
export const WEEKDAY_SHORT_LABELS = Array.from({ length: 7 }, (_, index) =>
  WEEKDAY_SHORT_FORMAT.format(utcNoon(2024, 1, 1 + index))
);

export const WEEKDAY_LONG_LABELS = Array.from({ length: 7 }, (_, index) =>
  WEEKDAY_LONG_FORMAT.format(utcNoon(2024, 1, 1 + index))
);

/** "September 2026". */
export function formatMonthYear(year: number, month: number): string {
  return MONTH_YEAR_FORMAT.format(utcNoon(year, month, 1));
}

/** "September". */
export function formatMonthName(month: number): string {
  return MONTH_FORMAT.format(utcNoon(2024, month, 1));
}

/** "Rabu, 30 September". */
export function formatDayKeyLabel(key: DayKey): string {
  return DAY_LABEL_FORMAT.format(dateOfKey(key));
}

/** "Rabu, 30 September 2026". */
export function formatDayKeyFull(key: DayKey): string {
  return FULL_DAY_FORMAT.format(dateOfKey(key));
}

export function formatWeekdayShort(key: DayKey): string {
  return WEEKDAY_SHORT_FORMAT.format(dateOfKey(key));
}

/** "Sep". */
export function formatMonthShort(key: DayKey): string {
  return MONTH_SHORT_FORMAT.format(dateOfKey(key));
}

export function formatShortDate(key: DayKey): string {
  return SHORT_DATE_FORMAT.format(dateOfKey(key));
}

function formatDayRange(first: DayKey, last: DayKey): string {
  const start = parseDayKey(first);
  const end = parseDayKey(last);

  if (start.year !== end.year)
    return `${SHORT_DATE_YEAR_FORMAT.format(dateOfKey(first))} – ${SHORT_DATE_YEAR_FORMAT.format(dateOfKey(last))}`;

  return `${SHORT_DATE_FORMAT.format(dateOfKey(first))} – ${SHORT_DATE_YEAR_FORMAT.format(dateOfKey(last))}`;
}

/** The toolbar title for a view anchored on a day. */
export function formatViewTitle(view: CalendarView, anchor: DayKey): string {
  const date = parseDayKey(anchor);
  const days = getViewDayKeys(view, anchor);

  switch (view) {
    case "day":
      return formatDayKeyFull(anchor);
    case "month":
      return formatMonthYear(date.year, date.month);
    case "year":
      return String(date.year);
    case "week":
    case "schedule":
      return formatDayRange(days[0] ?? anchor, days[days.length - 1] ?? anchor);
  }
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

/** "GMT+8" for the time zone at the given instant. */
export function formatZoneOffset(timeZone: string, at: Date): string {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(at)
    .find((entry) => entry.type === "timeZoneName");

  return part?.value ?? timeZone;
}

/** "09.00" for an hour-of-day gutter label. */
export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}.00`;
}
