import { addDays, isDayKey, weekdayOf, zonedMidnightMs } from "./calendar-date";
import { eventTimeInZone } from "./event-time";

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

export function initialCustomRepeat(
  recurrence: string[],
  startDate: string,
  timezone: string = "UTC"
): CustomRepeat {
  const entries =
    recurrence.length === 1 && recurrence[0]?.startsWith("RRULE:")
      ? Object.fromEntries(
          recurrence[0]
            .slice(6)
            .split(";")
            .map((part) => part.split("="))
        )
      : {};

  const frequency = entries.FREQ;
  const cutoff = entries.UNTIL;
  const until = cutoff
    ? /^\d{8}T\d{6}Z$/.test(cutoff)
      ? eventTimeInZone(
          `${cutoff.slice(0, 4)}-${cutoff.slice(4, 6)}-${cutoff.slice(6, 8)}T${cutoff.slice(9, 11)}:${cutoff.slice(11, 13)}:${cutoff.slice(13, 15)}Z`,
          timezone
        ).slice(0, 10)
      : `${cutoff.slice(0, 4)}-${cutoff.slice(4, 6)}-${cutoff.slice(6, 8)}`
    : startDate;

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
