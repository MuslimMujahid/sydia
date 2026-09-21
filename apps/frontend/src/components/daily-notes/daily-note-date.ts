import type { MonthAnchor } from "@/components/calendar/month-grid";

export const ALL_DAILY_NOTES_RANGE = {
  from: "1900-01-01",
  to: "9999-12-31",
} as const;

function dateParts(dayKey: string) {
  return {
    year: Number(dayKey.slice(0, 4)),
    month: Number(dayKey.slice(5, 7)),
    day: Number(dayKey.slice(8, 10)),
  };
}

function dayKeyFromUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
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
