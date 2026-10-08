import type { ReminderRecurrence } from "@/lib/services/api/reminders/reminders.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import { formatRecurrence } from "@/lib/utils/recurrence";

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
