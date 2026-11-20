import {
  addDays,
  formatShortDateYear,
  isDayKey,
  weekdayOf,
  zonedMidnightMs,
} from "./calendar-date";
import { eventTimeInZone } from "./event-time";

/** RRULE presets and custom repeat rules, ported from the web editor. */
export const REPEAT_LABELS = {
  none: "Tidak berulang",
  daily: "Setiap hari",
  weekly: "Setiap minggu",
  monthly: "Setiap bulan",
  yearly: "Setiap tahun",
  weekdays: "Setiap hari kerja (Senin–Jumat)",
  custom: "Kustom…",
} as const;
export type RepeatPreset = keyof typeof REPEAT_LABELS;
export type RepeatFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export const REPEAT_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type RepeatDay = (typeof REPEAT_DAYS)[number];
/** Monday-first short labels matching `REPEAT_DAYS`. */
export const REPEAT_DAY_LABELS = [
  "Sen",
  "Sel",
  "Rab",
  "Kam",
  "Jum",
  "Sab",
  "Min",
] as const;
export const REPEAT_DAY_NAMES = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
] as const;
export const REPEAT_FREQUENCY_UNITS: Record<RepeatFrequency, string> = {
  DAILY: "hari",
  WEEKLY: "minggu",
  MONTHLY: "bulan",
  YEARLY: "tahun",
};
export type CustomRepeat = {
  frequency: RepeatFrequency;
  interval: number;
  days: RepeatDay[];
  end: "never" | "count" | "date";
  count: number;
  until: string;
};

export function presetRecurrence(
  preset: Exclude<RepeatPreset, "custom">
): string[] {
  switch (preset) {
    case "none":
      return [];
    case "daily":
      return ["RRULE:FREQ=DAILY"];
    case "weekly":
      return ["RRULE:FREQ=WEEKLY"];
    case "monthly":
      return ["RRULE:FREQ=MONTHLY"];
    case "yearly":
      return ["RRULE:FREQ=YEARLY"];
    case "weekdays":
      return ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"];
  }
}

export function recurrencePreset(recurrence: string[]): RepeatPreset {
  for (const preset of [
    "none",
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "weekdays",
  ] as const)
    if (JSON.stringify(recurrence) === JSON.stringify(presetRecurrence(preset)))
      return preset;

  return "custom";
}

export function customRecurrence(
  value: CustomRepeat,
  allDay: boolean,
  timezone: string = "UTC"
): string[] {
  const parts = [`FREQ=${value.frequency}`, `INTERVAL=${value.interval}`];
  if (value.frequency === "WEEKLY" && value.days.length)
    parts.push(`BYDAY=${value.days.join(",")}`);
  if (value.end === "count") parts.push(`COUNT=${value.count}`);

  if (value.end === "date" && value.until) {
    const date = value.until.replaceAll("-", "");
    // A timed series ends at the end of the chosen day in its calendar time zone.
    const cutoff = allDay
      ? date
      : new Date(zonedMidnightMs(addDays(value.until, 1), timezone) - 1000)
          .toISOString()
          .replaceAll("-", "")
          .replaceAll(":", "")
          .replace(".000", "");

    parts.push(`UNTIL=${cutoff}`);
  }

  return [`RRULE:${parts.join(";")}`];
}

function ruleEntries(recurrence: string[]): Record<string, string> {
  return recurrence.length === 1 && recurrence[0]?.startsWith("RRULE:")
    ? Object.fromEntries(
        recurrence[0]
          .slice(6)
          .split(";")
          .map((part) => {
            const [key = "", value = ""] = part.split("=");

            return [key, value];
          })
      )
    : {};
}

function untilDayKey(cutoff: string, timezone: string): string {
  return /^\d{8}T\d{6}Z$/.test(cutoff)
    ? eventTimeInZone(
        `${cutoff.slice(0, 4)}-${cutoff.slice(4, 6)}-${cutoff.slice(6, 8)}T${cutoff.slice(9, 11)}:${cutoff.slice(11, 13)}:${cutoff.slice(13, 15)}Z`,
        timezone
      ).slice(0, 10)
    : `${cutoff.slice(0, 4)}-${cutoff.slice(4, 6)}-${cutoff.slice(6, 8)}`;
}

export function initialCustomRepeat(
  recurrence: string[],
  startDate: string,
  timezone: string = "UTC"
): CustomRepeat {
  const entries = ruleEntries(recurrence);
  const frequency = entries.FREQ;
  const cutoff = entries.UNTIL;
  const until = cutoff ? untilDayKey(cutoff, timezone) : startDate;

  return {
    frequency:
      frequency === "DAILY" || frequency === "MONTHLY" || frequency === "YEARLY"
        ? frequency
        : "WEEKLY",
    interval: entries.INTERVAL ? Number(entries.INTERVAL) : 1,
    days: entries.BYDAY
      ? REPEAT_DAYS.filter((day) => entries.BYDAY?.split(",").includes(day))
      : isDayKey(startDate)
        ? [REPEAT_DAYS[weekdayOf(startDate)]!]
        : [],
    end: entries.COUNT ? "count" : cutoff ? "date" : "never",
    count: entries.COUNT ? Number(entries.COUNT) : 10,
    until,
  };
}

const SUPPORTED_RULE_KEYS = new Set([
  "FREQ",
  "INTERVAL",
  "BYDAY",
  "COUNT",
  "UNTIL",
]);

/**
 * A short, human summary of a stored repeat rule for the event detail view:
 * "Setiap 2 minggu pada Sen, Jum · 5 kali". Rules this editor cannot express
 * (imported from Google) still read as repeating instead of being guessed.
 */
export function describeRecurrence(
  recurrence: string[],
  timezone: string = "UTC"
): string {
  if (!recurrence.length) return REPEAT_LABELS.none;
  const preset = recurrencePreset(recurrence);
  if (preset !== "custom") return REPEAT_LABELS[preset];

  const entries = ruleEntries(recurrence);
  const frequency = entries.FREQ as RepeatFrequency | undefined;
  const supported =
    frequency !== undefined &&
    frequency in REPEAT_FREQUENCY_UNITS &&
    Object.keys(entries).every((key) => SUPPORTED_RULE_KEYS.has(key)) &&
    (entries.BYDAY ?? "")
      .split(",")
      .filter(Boolean)
      .every((day) => (REPEAT_DAYS as readonly string[]).includes(day));

  if (!supported) return "Berulang (aturan khusus)";

  const interval = entries.INTERVAL ? Number(entries.INTERVAL) : 1;
  const unit = REPEAT_FREQUENCY_UNITS[frequency];
  let text = interval > 1 ? `Setiap ${interval} ${unit}` : `Setiap ${unit}`;

  if (frequency === "WEEKLY" && entries.BYDAY) {
    const days = REPEAT_DAYS.flatMap((day, index) =>
      entries.BYDAY?.split(",").includes(day) ? [REPEAT_DAY_LABELS[index]] : []
    );
    if (days.length) text += ` pada ${days.join(", ")}`;
  }

  if (entries.COUNT) text += ` · ${Number(entries.COUNT)} kali`;
  else if (entries.UNTIL)
    text += ` · sampai ${formatShortDateYear(untilDayKey(entries.UNTIL, timezone))}`;

  return text;
}
