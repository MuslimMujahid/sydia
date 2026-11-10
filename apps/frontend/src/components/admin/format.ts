import { formatDateTime } from "@/lib/utils/date-time";

const COUNT_FORMAT = new Intl.NumberFormat("id-ID");

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });

const USD_FORMAT = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "USD",
});

// Per-call and per-message model costs are fractions of a cent.
const SMALL_USD_FORMAT = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const BYTE_UNITS = [
  "byte",
  "kilobyte",
  "megabyte",
  "gigabyte",
  "terabyte",
] as const;

export function formatCount(value: number): string {
  return COUNT_FORMAT.format(value);
}

export function formatDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
}

export function formatUsd(value: number): string {
  return value !== 0 && Math.abs(value) < 1
    ? SMALL_USD_FORMAT.format(value)
    : USD_FORMAT.format(value);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const exponent = Math.min(
    Math.floor(Math.log10(bytes) / 3),
    BYTE_UNITS.length - 1
  );

  const value = bytes / 1000 ** exponent;

  return new Intl.NumberFormat("id-ID", {
    style: "unit",
    unit: BYTE_UNITS[exponent],
    unitDisplay: "short",
    maximumFractionDigits: value >= 100 || exponent === 0 ? 0 : 1,
  }).format(value);
}

export function formatLastActivity(value: string | null): string {
  return value ? formatDateTime(value) : "Belum pernah aktif";
}
