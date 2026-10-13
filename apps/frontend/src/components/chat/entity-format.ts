import type { ReminderRecurrence } from "@/lib/services/api/reminders/reminders.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import { formatRecurrence } from "@/lib/utils/recurrence";
import { addDays } from "@/components/calendar/calendar-date";

/** Calendar end dates are exclusive; confirmations display the last included day. */
export function formatAllDayEventRange(
  start: string,
  end: string,
  locale: SupportedLocale
): string {
  const firstDay = start.slice(0, 10);
  const lastDay = addDays(end.slice(0, 10), -1);
  const formatter = new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : "id-ID",
    { dateStyle: "medium", timeZone: "UTC" }
  );

  const date = (day: string) =>
    formatter.format(new Date(`${day}T12:00:00.000Z`));

  const range =
    firstDay === lastDay
      ? date(firstDay)
      : `${date(firstDay)} – ${date(lastDay)}`;

  return `${range} · ${locale === "en" ? "All day" : "Sepanjang hari"}`;
}

const PERIODS = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function formatEntityRecurrence(
  rule: ReminderRecurrence | null,
  locale: SupportedLocale
): string | null {
  if (!rule) return null;
  if (locale === "id") return formatRecurrence(rule);
  const period = PERIODS[rule.frequency];
  const base =
    rule.interval === 1
      ? `Every ${period}`
      : `Every ${rule.interval} ${period}s`;

  const days = rule.daysOfWeek?.map((day) => WEEKDAYS[day]);

  return days?.length ? `${base} on ${days.join(", ")}` : base;
}
