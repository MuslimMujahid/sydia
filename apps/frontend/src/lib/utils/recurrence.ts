import type { ReminderRecurrence } from "@/lib/services/api/reminders/reminders.api";

/**
 * Recurrence copy shared by the reminder surfaces.
 *
 * Stored weekdays follow the JavaScript convention: 0 is Sunday through 6 is
 * Saturday. The index is the weekday number itself, so the table is read by
 * number rather than shifted.
 */
const WEEKDAY_LABELS = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;

const FREQUENCY_LABELS: Record<ReminderRecurrence["frequency"], string> = {
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
  yearly: "Tahunan",
};

/** "Selasa, Kamis, Jumat" for the stored weekday numbers, or null when empty. */
export function formatWeekdays(daysOfWeek?: number[]): string | null {
  if (!daysOfWeek?.length) return null;
  const labels = [...new Set(daysOfWeek)]
    .sort((left, right) => left - right)
    .map((day) => WEEKDAY_LABELS[day]);

  return labels.every(Boolean) ? labels.join(", ") : null;
}

/** Recurrence summary, including the weekday set when the rule repeats weekly. */
export function formatRecurrence(
  recurrence: ReminderRecurrence | null | undefined
): string | null {
  if (!recurrence) return null;
  const frequency = FREQUENCY_LABELS[recurrence.frequency]?.toLowerCase();
  if (!frequency) return null;

  const base =
    recurrence.interval === 1
      ? `Berulang ${frequency}`
      : `Setiap ${recurrence.interval} periode ${frequency}`;

  const weekdays = formatWeekdays(recurrence.daysOfWeek);

  return weekdays ? `${base} pada ${weekdays}` : base;
}
