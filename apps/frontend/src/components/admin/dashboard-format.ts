import type { AdminCostKind, AdminDashboard, AdminPeriod } from "./types";

export const PINK = "#ef5a8a";
export const PURPLE = "#8b5cf6";
export const ORANGE = "#c25d35";
export const percent = (value: number) =>
  `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)}%`;
export const formatIdr = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export const PERIODS: ReadonlyArray<{ value: AdminPeriod; label: string }> = [
  { value: "today", label: "Hari ini" },
  { value: "24h", label: "24 jam" },
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
  { value: "90d", label: "90 hari" },
];

export function periodLabel(period: AdminPeriod): string {
  return PERIODS.find((entry) => entry.value === period)?.label ?? period;
}

/** What the comparison chip in each metric is measured against. */
export function comparisonLabel(period: AdminPeriod): string {
  if (period === "today") return "Hari ini vs kemarin pada jam yang sama";
  if (period === "24h") return "24 jam terakhir vs 24 jam sebelumnya";

  return `${periodLabel(period)} terakhir vs periode sebelumnya`;
}

/** Axis labels: dates for day buckets, hours (with the date when a period spans two days) for hour buckets. */
export function timelineLabels(d: AdminDashboard): string[] {
  const format = new Intl.DateTimeFormat(
    "id-ID",
    d.bucket === "day"
      ? { day: "numeric", month: "short", timeZone: d.timezone }
      : d.period === "today"
        ? { hour: "2-digit", minute: "2-digit", timeZone: d.timezone }
        : {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: d.timezone,
          }
  );

  return d.timeline.map((entry) => format.format(new Date(entry.start)));
}

export const COST_KINDS: Record<AdminCostKind, string> = {
  message: "Pesan pengguna",
  background: "Proses latar",
  hindsight: "Hindsight (memori)",
  other: "Lainnya",
};
