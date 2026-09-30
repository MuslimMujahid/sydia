import {
  formatDayKeyLabel,
  type MonthAnchor,
} from "@/components/calendar/month-anchor";

export const ALL_DAILY_NOTES_RANGE = {
  from: "1900-01-01",
  to: "9999-12-31",
} as const;

const DAY_MS = 86_400_000;

const TITLE_WITH_YEAR_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const SHORT_DATE_WITH_YEAR_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const RELATIVE_DAY_FORMAT = new Intl.RelativeTimeFormat("id-ID", {
  numeric: "auto",
});

function dateParts(dayKey: string) {
  return {
    year: Number(dayKey.slice(0, 4)),
    month: Number(dayKey.slice(5, 7)),
    day: Number(dayKey.slice(8, 10)),
  };
}

function utcNoonOf(dayKey: string): Date {
  const parts = dateParts(dayKey);

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
}

function dayKeyFromUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function sameYear(dayKey: string, todayKey: string): boolean {
  return dayKey.slice(0, 4) === todayKey.slice(0, 4);
}

export function monthAnchorFromDayKey(dayKey: string): MonthAnchor {
  const parts = dateParts(dayKey);

  return { year: parts.year, month: parts.month };
}

export function shiftDayKey(dayKey: string, delta: number): string {
  const parts = dateParts(dayKey);

  return dayKeyFromUtc(
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day + delta, 12))
  );
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function dayKeyDifference(from: string, to: string): number {
  return Math.round(
    (utcNoonOf(to).getTime() - utcNoonOf(from).getTime()) / DAY_MS
  );
}

/** "Senin, 28 September", with the year only outside the current year. */
export function formatDailyNoteTitle(dayKey: string, todayKey: string): string {
  return sameYear(dayKey, todayKey)
    ? formatDayKeyLabel(dayKey)
    : TITLE_WITH_YEAR_FORMAT.format(utcNoonOf(dayKey));
}

/** "Sen, 28 Sep" for compact lists, with the year only outside this year. */
export function formatDailyNoteShortDate(
  dayKey: string,
  todayKey: string
): string {
  const format = sameYear(dayKey, todayKey)
    ? SHORT_DATE_FORMAT
    : SHORT_DATE_WITH_YEAR_FORMAT;

  return format.format(utcNoonOf(dayKey));
}

/**
 * Human distance from today: "Hari ini", "Kemarin", "3 hari yang lalu",
 * "Minggu lalu", "Bulan depan", and so on.
 */
export function formatRelativeDayKey(dayKey: string, todayKey: string): string {
  const days = dayKeyDifference(todayKey, dayKey);
  const distance = Math.abs(days);
  const label =
    distance < 7
      ? RELATIVE_DAY_FORMAT.format(days, "day")
      : distance < 30
        ? RELATIVE_DAY_FORMAT.format(Math.trunc(days / 7), "week")
        : distance < 365
          ? RELATIVE_DAY_FORMAT.format(Math.trunc(days / 30), "month")
          : RELATIVE_DAY_FORMAT.format(Math.trunc(days / 365), "year");

  return label.charAt(0).toLocaleUpperCase("id-ID") + label.slice(1);
}
