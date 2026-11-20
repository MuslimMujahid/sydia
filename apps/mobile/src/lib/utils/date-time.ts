import type { SupportedLocale } from "@/lib/services/api/users/users.api";

/**
 * Date helpers ported from apps/frontend/src/lib/utils/date-time.ts. Every
 * instant is shown in the user's profile time zone, not the device's.
 */

function intlLocale(locale: SupportedLocale = "id") {
  return locale === "en" ? "en-US" : "id-ID";
}

function valid(value: string | Date): Date | null {
  const date = typeof value === "string" ? new Date(value) : value;

  return Number.isNaN(date.getTime()) ? null : date;
}

/** "2 Okt 2026 14.30" */
export function formatDateTimeInZone(
  value: string | Date,
  timeZone: string,
  locale: SupportedLocale = "id"
): string {
  const date = valid(value);
  if (!date) return String(value);

  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

/** "14.30" */
export function formatTimeInZone(
  value: string | Date,
  timeZone: string,
  locale: SupportedLocale = "id"
): string {
  const date = valid(value);
  if (!date) return String(value);

  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
}

/** "Kamis, 2 Oktober" (adds the year when it is not this year). */
export function formatDayInZone(
  value: string | Date,
  timeZone: string,
  locale: SupportedLocale = "id",
  now: Date = new Date()
): string {
  const isDateOnly =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = valid(isDateOnly ? `${value}T12:00:00Z` : value);
  if (!date) return String(value);
  const zone = isDateOnly ? "UTC" : timeZone;
  const sameYear =
    dayKeyInZone(date, zone).slice(0, 4) ===
    dayKeyInZone(now, timeZone).slice(0, 4);

  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
    timeZone: zone,
  }).format(date);
}

/** "2 Okt" or "2 Okt 2025" for a day key. */
export function formatShortDayKey(
  dayKey: string,
  locale: SupportedLocale = "id",
  now: Date = new Date()
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return "";
  const sameYear = dayKey.slice(0, 4) === String(now.getFullYear());

  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dayKey}T12:00:00Z`));
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Map(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.get("year")),
    month: Number(parts.get("month")),
    day: Number(parts.get("day")),
    hour: Number(parts.get("hour")) % 24,
    minute: Number(parts.get("minute")),
    second: Number(parts.get("second")),
    weekday: WEEKDAY_INDEX[parts.get("weekday") ?? "Sun"] ?? 0,
  };
}

/** The instant at a wall-clock time in a time zone (DST-safe for real times). */
export function zonedTimeToInstant(
  wall: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
  },
  timeZone: string
): Date {
  const target = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour ?? 0,
    wall.minute ?? 0
  );
  let guess = target;

  // Two passes settle the offset, including around DST transitions.
  for (let pass = 0; pass < 2; pass++) {
    const parts = zonedParts(new Date(guess), timeZone);
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    guess += target - represented;
  }

  return new Date(guess);
}

/** "yyyy-MM-dd" calendar day of an instant in the supplied time zone. */
export function dayKeyInZone(value: string | Date, timeZone: string): string {
  const date = valid(value);
  if (!date) return "";
  const parts = zonedParts(date, timeZone);

  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function todayKey(timeZone: string, now: Date = new Date()): string {
  return dayKeyInZone(now, timeZone);
}

export function parseDayKey(dayKey: string) {
  const [year = 1970, month = 1, day = 1] = dayKey.split("-").map(Number);

  return { year, month, day };
}

export function dayKeyFromParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.toISOString().slice(0, 10);
}

/** Adds whole days to a "yyyy-MM-dd" key. */
export function addDays(dayKey: string, days: number): string {
  const { year, month, day } = parseDayKey(dayKey);

  return dayKeyFromParts(year, month, day + days);
}

/** Weekday (0 = Sunday) of a day key. */
export function weekdayOfDayKey(dayKey: string): number {
  const { year, month, day } = parseDayKey(dayKey);

  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function dayKeyToEpochDay(dayKey: string): number {
  const { year, month, day } = parseDayKey(dayKey);

  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** UTC instant of local midnight that starts a day key in a time zone. */
export function startOfDayInZone(dayKey: string, timeZone: string): Date {
  return zonedTimeToInstant(parseDayKey(dayKey), timeZone);
}

/** UTC range covering `dayCount` calendar days starting at `dayKey`. */
export function dayRangeInZone(
  dayKey: string,
  dayCount: number,
  timeZone: string
): { from: string; to: string } {
  return {
    from: startOfDayInZone(dayKey, timeZone).toISOString(),
    to: startOfDayInZone(addDays(dayKey, dayCount), timeZone).toISOString(),
  };
}

/** UTC range covering calendar days starting today in the supplied time zone. */
export function getDayRangeInZone(timeZone: string, dayCount: number) {
  return dayRangeInZone(todayKey(timeZone), dayCount, timeZone);
}

/**
 * Section label for the calendar day of `value`: "Hari ini", "Kemarin",
 * "2 hari yang lalu" up to six days back, then the date itself.
 */
export function formatConversationDay(
  value: string | Date,
  timeZone: string,
  locale: SupportedLocale,
  now: Date = new Date()
): string {
  const dayKey = dayKeyInZone(value, timeZone);
  const today = dayKeyInZone(now, timeZone);
  if (!dayKey || !today) return "";
  const daysAgo = dayKeyToEpochDay(today) - dayKeyToEpochDay(dayKey);

  if (daysAgo <= 0) return locale === "en" ? "Today" : "Hari ini";
  if (daysAgo === 1) return locale === "en" ? "Yesterday" : "Kemarin";
  if (daysAgo < 7)
    return locale === "en"
      ? `${daysAgo} days ago`
      : `${daysAgo} hari yang lalu`;

  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: dayKey.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dayKey}T12:00:00Z`));
}

/**
 * Compact relative label for a due date or schedule: "Hari ini 14.30",
 * "Besok 09.00", "Kemarin", or a short date with time.
 */
export function formatRelativeDateTime(
  value: string,
  timeZone: string,
  locale: SupportedLocale = "id",
  now: Date = new Date(),
  options: { withTime?: boolean } = {}
): string {
  const date = valid(value);
  if (!date) return value;
  const withTime = options.withTime ?? true;
  const dayKey = dayKeyInZone(date, timeZone);
  const today = dayKeyInZone(now, timeZone);
  const diff = dayKeyToEpochDay(dayKey) - dayKeyToEpochDay(today);
  const time = withTime ? ` ${formatTimeInZone(date, timeZone, locale)}` : "";
  const words =
    locale === "en"
      ? { today: "Today", tomorrow: "Tomorrow", yesterday: "Yesterday" }
      : { today: "Hari ini", tomorrow: "Besok", yesterday: "Kemarin" };

  if (diff === 0) return `${words.today}${time}`;
  if (diff === 1) return `${words.tomorrow}${time}`;
  if (diff === -1) return `${words.yesterday}${time}`;
  if (diff > 1 && diff < 7)
    return `${new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", timeZone }).format(date)}${time}`;

  return `${formatShortDayKey(dayKey, locale, now)}${time}`;
}

/** Rounds an instant up to the next `minutes` boundary. */
export function roundUpToMinutes(date: Date, minutes: number): Date {
  const step = minutes * 60_000;

  return new Date(Math.ceil(date.getTime() / step) * step);
}

/** The user's device time zone, used only as a default for new profiles. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** "1j 30m"-style durations for event lengths and snoozes. */
export function formatDurationMinutes(
  minutes: number,
  locale: SupportedLocale = "id"
): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = locale === "en" ? "h" : "j";

  if (hours && rest) return `${hours}${h} ${rest}m`;
  if (hours) return `${hours}${h}`;

  return `${rest}m`;
}
