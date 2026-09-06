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
