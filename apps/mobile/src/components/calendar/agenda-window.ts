import {
  addDays,
  addMonths,
  dayKeyOf,
  dayKeysFrom,
  daysBetween,
  getDayRange,
  getMonthGridDays,
  parseDayKey,
  startOfMonth,
  startOfWeek,
  type DayKey,
} from "./calendar-date";

export const AGENDA_VIEWS = [
  { value: "day", label: "Hari" },
  { value: "week", label: "Minggu" },
  { value: "month", label: "Bulan" },
  { value: "year", label: "Tahun" },
  { value: "schedule", label: "Agenda" },
] as const;

export type AgendaView = (typeof AGENDA_VIEWS)[number]["value"];

const SCHEDULE_DAYS = 30;

export function agendaWindow(view: AgendaView, day: DayKey, timezone: string) {
  const month = parseDayKey(day);
  const firstOfYear = dayKeyOf({ year: month.year, month: 1, day: 1 });
  const firstOfWeek = startOfWeek(day);
  let first = firstOfWeek;
  let end = addDays(firstOfWeek, 7);
  let agendaDays = [day];

  switch (view) {
    case "day":
      break;
    case "week":
      agendaDays = dayKeysFrom(firstOfWeek, 7);
      break;
    case "month": {
      const days = getMonthGridDays(month.year, month.month);
      first = days[0]!.key;
      end = addDays(days[days.length - 1]!.key, 1);
      break;
    }
    case "year":
      first = firstOfYear;
      end = addMonths(firstOfYear, 12);
      agendaDays = [];
      break;
    case "schedule":
      first = day;
      end = addDays(day, SCHEDULE_DAYS);
      agendaDays = dayKeysFrom(day, SCHEDULE_DAYS);
      break;
  }

  return {
    days: dayKeysFrom(first, daysBetween(first, end)),
    agendaDays,
    range: getDayRange(first, end, timezone),
  };
}

export function stepAgenda(
  view: AgendaView,
  day: DayKey,
  direction: -1 | 1
): DayKey {
  switch (view) {
    case "day":
      return addDays(day, direction);
    case "week":
      return addDays(day, 7 * direction);
    case "month":
      return addMonths(day, direction);
    case "year":
      return addMonths(day, 12 * direction);
    case "schedule":
      return addDays(day, SCHEDULE_DAYS * direction);
  }
}

export function yearMonthDays(day: DayKey): DayKey[] {
  const firstMonth = startOfMonth(day);
  const yearStart = dayKeyOf({
    year: parseDayKey(firstMonth).year,
    month: 1,
    day: 1,
  });
  return Array.from({ length: 12 }, (_, index) => addMonths(yearStart, index));
}
