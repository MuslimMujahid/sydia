const DATE_TIME_FORMAT = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat("id-ID", {
  numeric: "auto",
});

export function formatDateTime(value: string | null): string {
  if (!value) return "Tanpa tenggat";
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : DATE_TIME_FORMAT.format(date);
}

export function formatDay(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
}

export function formatDateTimeInZone(value: string, timeZone: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

export function formatDayInZone(value: string, timeZone: string): string {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDateOnly ? `${value}T00:00:00Z` : value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: isDateOnly ? "UTC" : timeZone,
  }).format(date);
}

function zonedParts(date: Date, timeZone: string): Record<string, number> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function zonedMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string
): Date {
  const estimate = Date.UTC(year, month - 1, day);
  const parts = zonedParts(new Date(estimate), timeZone);
  const represented = Date.UTC(
    parts.year ?? year,
    (parts.month ?? month) - 1,
    parts.day ?? day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0
  );

  return new Date(estimate - (represented - estimate));
}

/** UTC range covering calendar days starting today in the supplied time zone. */
export function getDayRangeInZone(timeZone: string, dayCount: number) {
  const now = zonedParts(new Date(), timeZone);
  const year = now.year ?? new Date().getUTCFullYear();
  const month = now.month ?? new Date().getUTCMonth() + 1;
  const day = now.day ?? new Date().getUTCDate();
  const startDate = new Date(Date.UTC(year, month - 1, day));
  const endDate = new Date(Date.UTC(year, month - 1, day + dayCount));

  return {
    from: zonedMidnight(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth() + 1,
      startDate.getUTCDate(),
      timeZone
    ).toISOString(),
    to: zonedMidnight(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth() + 1,
      endDate.getUTCDate(),
      timeZone
    ).toISOString(),
  };
}

export function formatRelativeDay(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((target.getTime() - start.getTime()) / 86_400_000);

  return Math.abs(days) <= 7
    ? RELATIVE_FORMAT.format(days, "day")
    : formatDateTime(value);
}

export function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
