/**
 * Month-anchor helpers shared with the daily notes calendar. The merged
 * calendar page uses the day-key helpers in `calendar-date.ts`.
 */
import { dayKeyInZone } from "./calendar-date";

export { dayKeyInZone };

const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat("id-ID", {
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

type CalendarDate = { year: number; month: number; day: number };

export type MonthAnchor = { year: number; month: number };

export type MonthGridDay = CalendarDate & { key: string; inMonth: boolean };

function dayKeyOf(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(
    date.day
  ).padStart(2, "0")}`;
}

function utcNoon(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function addCalendarDays(date: CalendarDate, delta: number): CalendarDate {
  const shifted = utcNoon(date.year, date.month, date.day + delta);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function daysInMonth(anchor: MonthAnchor): number {
  return utcNoon(anchor.year, anchor.month + 1, 0).getUTCDate();
}

export function shiftMonthAnchor(
  anchor: MonthAnchor,
  delta: number
): MonthAnchor {
  const shifted = utcNoon(anchor.year, anchor.month + delta, 1);

  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

/** Monday-first, week-aligned days covering the visible month (4–6 weeks). */
export function getMonthGridDays(anchor: MonthAnchor): MonthGridDay[] {
  const first: CalendarDate = {
    year: anchor.year,
    month: anchor.month,
    day: 1,
  };

  const weekday = utcNoon(first.year, first.month, first.day).getUTCDay();
  const leadDays = (weekday + 6) % 7;
  const weekCount = Math.ceil((leadDays + daysInMonth(anchor)) / 7);
  const start = addCalendarDays(first, -leadDays);

  return Array.from({ length: weekCount * 7 }, (_, index) => {
    const date = addCalendarDays(start, index);

    return {
      ...date,
      key: dayKeyOf(date),
      inMonth: date.year === anchor.year && date.month === anchor.month,
    };
  });
}

export function formatMonthAnchor(anchor: MonthAnchor): string {
  return MONTH_LABEL_FORMAT.format(utcNoon(anchor.year, anchor.month, 1));
}

export function formatDayKeyLabel(dayKey: string): string {
  return DAY_LABEL_FORMAT.format(
    utcNoon(
      Number(dayKey.slice(0, 4)),
      Number(dayKey.slice(5, 7)),
      Number(dayKey.slice(8, 10))
    )
  );
}
