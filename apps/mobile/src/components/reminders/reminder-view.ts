import type {
  CreateReminderInput,
  RecurrenceFrequency,
  Reminder,
  ReminderOccurrenceStatus,
  ReminderScheduleFilter,
  UpdateReminderInput,
} from "@/lib/services/api/reminders/reminders.api";
import {
  addDays,
  dayKeyInZone,
  dayKeyToEpochDay,
  formatDayInZone,
  formatTimeInZone,
  parseDayKey,
  roundUpToMinutes,
  zonedTimeToInstant,
} from "@/lib/utils/date-time";

/**
 * Reminder rules ported from apps/frontend/src/components/reminders. Pure:
 * no React Native imports, so `bun test` can cover it.
 */

export const SCHEDULE_FILTERS: (ReminderScheduleFilter | "all")[] = [
  "all",
  "today",
  "upcoming",
  "past",
];

export const SCHEDULE_LABELS: Record<ReminderScheduleFilter | "all", string> = {
  all: "Semua",
  today: "Hari ini",
  upcoming: "Mendatang",
  past: "Sudah lewat",
};

export type FrequencyChoice = RecurrenceFrequency | "none";

export const FREQUENCY_CHOICES: FrequencyChoice[] = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

export const FREQUENCY_CHOICE_LABELS: Record<FrequencyChoice, string> = {
  none: "Tidak berulang",
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
  yearly: "Tahunan",
};

/** Unit after "Setiap n …" in the interval stepper. */
export const FREQUENCY_UNITS: Record<RecurrenceFrequency, string> = {
  daily: "hari",
  weekly: "minggu",
  monthly: "bulan",
  yearly: "tahun",
};

/** Short weekday labels, indexed by JavaScript weekday (0 = Minggu). */
export const WEEKDAY_SHORT = [
  "Min",
  "Sen",
  "Sel",
  "Rab",
  "Kam",
  "Jum",
  "Sab",
] as const;

/** Backend recurrence interval bounds. */
export const RECURRENCE_INTERVAL = { min: 1, max: 100 } as const;

/** Dashboard choices; chat may set any 5–60 minute value, shown as custom. */
export const REPEAT_INTERVAL_CHOICES = [5, 10, 15] as const;

export function repeatIntervalOptions(
  current: number
): { value: number; label: string }[] {
  const options = REPEAT_INTERVAL_CHOICES.map((value) => ({
    value: value as number,
    label: `${value} menit`,
  }));

  return (REPEAT_INTERVAL_CHOICES as readonly number[]).includes(current)
    ? options
    : [...options, { value: current, label: `${current} menit (custom)` }];
}

export const TITLE_MAX = 240;
export const NOTES_MAX = 4000;

/** Editor state; the instants are absolute, edited in the profile zone. */
export type ReminderFormValues = {
  title: string;
  notes: string;
  scheduledAt: Date | null;
  frequency: FrequencyChoice;
  interval: number;
  daysOfWeek: number[];
  endsAt: Date | null;
  important: boolean;
  repeatIntervalMinutes: number;
};

/** A new reminder starts at the next half hour, at least five minutes away. */
export function defaultScheduledAt(now: Date = new Date()): Date {
  return roundUpToMinutes(new Date(now.getTime() + 5 * 60_000), 30);
}

export function reminderFormValues(
  reminder?: Reminder,
  now: Date = new Date()
): ReminderFormValues {
  return {
    title: reminder?.title ?? "",
    notes: reminder?.notes ?? "",
    scheduledAt: reminder
      ? new Date(reminder.scheduledAt)
      : defaultScheduledAt(now),
    frequency: reminder?.recurrence?.frequency ?? "none",
    interval: reminder?.recurrence?.interval ?? 1,
    daysOfWeek: reminder?.recurrence?.daysOfWeek ?? [],
    endsAt: reminder?.recurrence?.endsAt
      ? new Date(reminder.recurrence.endsAt)
      : null,
    important: reminder?.important ?? false,
    repeatIntervalMinutes: reminder?.repeatIntervalMinutes ?? 5,
  };
}

export type ReminderFormErrors = Partial<
  Record<"title" | "scheduledAt" | "endsAt" | "daysOfWeek", string>
>;

export function validateReminderForm(
  values: ReminderFormValues
): ReminderFormErrors {
  const errors: ReminderFormErrors = {};
  if (!values.title.trim()) errors.title = "Masukkan judul pengingat.";
  if (!values.scheduledAt) errors.scheduledAt = "Pilih waktu pengingat.";
  if (
    values.frequency !== "none" &&
    values.endsAt &&
    values.scheduledAt &&
    values.endsAt.getTime() <= values.scheduledAt.getTime()
  )
    errors.endsAt = "Waktu berakhir harus setelah waktu pengingat.";

  return errors;
}

/** The request body, built the same way as the web editor's submit. */
export function buildReminderInput(
  values: ReminderFormValues
): CreateReminderInput {
  if (!values.scheduledAt) throw new Error("A reminder needs a time.");
  const frequency = values.frequency;
  const daysOfWeek =
    frequency === "weekly"
      ? [...new Set(values.daysOfWeek)].sort((left, right) => left - right)
      : [];
  const interval = Math.min(
    RECURRENCE_INTERVAL.max,
    Math.max(RECURRENCE_INTERVAL.min, Math.round(values.interval) || 1)
  );

  return {
    title: values.title.trim(),
    notes: values.notes.trim() || null,
    scheduledAt: values.scheduledAt.toISOString(),
    recurrence:
      frequency === "none"
        ? null
        : {
            frequency,
            interval,
            ...(daysOfWeek.length ? { daysOfWeek } : {}),
            ...(values.endsAt ? { endsAt: values.endsAt.toISOString() } : {}),
          },
    important: values.important,
    repeatIntervalMinutes: values.repeatIntervalMinutes || 5,
  };
}

/** Preserve the server's schedule if the user only changed another field. */
export function buildReminderUpdate(
  initial: ReminderFormValues,
  current: ReminderFormValues
): UpdateReminderInput {
  const before = buildReminderInput(initial);
  const after = buildReminderInput(current);

  return {
    ...(after.title !== before.title ? { title: after.title } : {}),
    ...(after.notes !== before.notes ? { notes: after.notes } : {}),
    ...(after.scheduledAt !== before.scheduledAt
      ? { scheduledAt: after.scheduledAt }
      : {}),
    ...(JSON.stringify(after.recurrence) !== JSON.stringify(before.recurrence)
      ? { recurrence: after.recurrence }
      : {}),
    ...(after.important !== before.important
      ? { important: after.important }
      : {}),
    ...(after.repeatIntervalMinutes !== before.repeatIntervalMinutes
      ? { repeatIntervalMinutes: after.repeatIntervalMinutes }
      : {}),
  };
}

/** Whether the saved form differs from what it started with. */
export function isReminderFormDirty(
  initial: ReminderFormValues,
  current: ReminderFormValues
): boolean {
  const comparable = (values: ReminderFormValues) =>
    JSON.stringify({
      ...values,
      title: values.title.trim(),
      notes: values.notes.trim(),
      scheduledAt: values.scheduledAt?.getTime() ?? null,
      endsAt: values.endsAt?.getTime() ?? null,
      daysOfWeek: [...values.daysOfWeek].sort(),
    });

  return comparable(initial) !== comparable(current);
}

export function isAwaitingAcknowledgement(reminder: Reminder): boolean {
  return reminder.latestOccurrence?.status === "awaiting_ack";
}

/** Only a fired occurrence can be snoozed; before that the time is changed. */
export function timeActionFor(reminder: Reminder): "snooze" | "reschedule" {
  return reminder.latestOccurrence ? "snooze" : "reschedule";
}

/** Status words for a one-time reminder's latest occurrence. */
export const OCCURRENCE_STATUS_LABELS: Partial<
  Record<ReminderOccurrenceStatus, string>
> = {
  delivered: "Terkirim",
  awaiting_ack: "Menunggu konfirmasi",
  acknowledged: "Dikonfirmasi",
  snoozed: "Ditunda",
  expired: "Tidak dikonfirmasi",
};

/** "Hari ini", "Besok", "Kemarin", or the full day for a section header. */
export function reminderDayLabel(
  dayKey: string,
  timeZone: string,
  now: Date = new Date()
): string {
  const today = dayKeyInZone(now, timeZone);
  const diff = dayKeyToEpochDay(dayKey) - dayKeyToEpochDay(today);

  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Besok";
  if (diff === -1) return "Kemarin";

  return formatDayInZone(dayKey, timeZone, "id", now);
}

export type ReminderDaySection = {
  key: string;
  title: string;
  data: Reminder[];
};

/** Groups reminders by their day in the profile zone, keeping the API order. */
export function groupRemindersByDay(
  reminders: Reminder[],
  timeZone: string,
  now: Date = new Date()
): ReminderDaySection[] {
  const sections = new Map<string, ReminderDaySection>();

  for (const reminder of reminders) {
    const key = dayKeyInZone(reminder.scheduledAt, timeZone) || "unknown";
    const section = sections.get(key) ?? {
      key,
      title:
        key === "unknown"
          ? "Tanpa tanggal"
          : reminderDayLabel(key, timeZone, now),
      data: [],
    };

    section.data.push(reminder);
    sections.set(key, section);
  }

  return [...sections.values()];
}

/** "Ditunda dari 14.00" for a snooze copy. */
export function snoozedFromLabel(
  reminder: Reminder,
  timeZone: string
): string | null {
  if (!reminder.snoozedFrom) return null;

  return `Ditunda dari ${formatTimeInZone(reminder.snoozedFrom.occurrenceAt, timeZone)}`;
}

export type QuickTimePreset = { key: string; label: string; at: Date };

/**
 * Snooze choices, counted from now like the web's default (+15 minutes), plus
 * tomorrow morning in the profile zone.
 */
export function snoozePresets(now: Date, timeZone: string): QuickTimePreset[] {
  const minutes = (value: number) => new Date(now.getTime() + value * 60_000);
  const tomorrow = parseDayKey(addDays(dayKeyInZone(now, timeZone), 1));

  return [
    { key: "15m", label: "15 menit lagi", at: minutes(15) },
    { key: "30m", label: "30 menit lagi", at: minutes(30) },
    { key: "1h", label: "1 jam lagi", at: minutes(60) },
    { key: "3h", label: "3 jam lagi", at: minutes(180) },
    {
      key: "tomorrow",
      label: "Besok pagi, 08.00",
      at: zonedTimeToInstant({ ...tomorrow, hour: 8, minute: 0 }, timeZone),
    },
  ];
}

/** Reads the backend's reminder action reason (see reminders.controller.ts). */
export function reminderActionReason(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== "object") return null;
  const reason = (details as { reason?: unknown }).reason;

  return typeof reason === "string" ? reason : null;
}
