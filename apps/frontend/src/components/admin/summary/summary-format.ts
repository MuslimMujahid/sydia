import { formatUsd } from "../format";
import { change, percent } from "../analytics/meta";
import type { DeltaTone } from "../analytics/widgets";
import type { AdminPeriod, AdminWindow } from "../types";

/** What a figure's movement means: more usage or revenue is good, more cost is not. */
export type DeltaKind = "usage" | "cost" | "revenue";

export type Delta = {
  direction?: "up" | "down";
  tone: DeltaTone;
  text: string;
};

const MINUS = "−";

/** "+3", "−14" with Indonesian digit grouping. */
export function signed(
  value: number,
  format: (value: number) => string
): string {
  if (value === 0) return `±${format(0)}`;

  return `${value > 0 ? "+" : MINUS}${format(Math.abs(value))}`;
}

export function signedUsd(value: number): string {
  return signed(value, formatUsd);
}

function toneFor(
  kind: DeltaKind,
  direction: "up" | "down",
  pct: number | null
): DeltaTone {
  if (kind === "cost") {
    if (direction === "down") return "good";

    return pct !== null && pct > 100 ? "bad" : "warn";
  }

  return direction === "up" ? "good" : "warn";
}

/**
 * Compares a figure with its previous value. Without a previous value the chip
 * says "baru" (or "—" when both are empty) rather than an infinite percent.
 * `absolute` renders the raw difference instead of a percent.
 */
export function compare(
  kind: DeltaKind,
  value: number | null,
  previous: number | null,
  absolute?: (value: number) => string
): Delta {
  if (value === null || previous === null || previous <= 0) {
    return {
      tone: "neutral",
      text: value !== null && value > 0 ? "baru" : "—",
    };
  }

  const pct = change(value, previous);
  const diff = value - previous;

  if (diff === 0) return { tone: "neutral", text: absolute ? "±0" : "0%" };

  const direction = diff > 0 ? "up" : "down";
  const text = absolute
    ? signed(diff, absolute)
    : signed(pct ?? 0, (n) => percent(n, 0));

  return { direction, tone: toneFor(kind, direction, pct), text };
}

/** value / count, or null when there is nothing to divide by. */
export function ratio(value: number, count: number): number | null {
  return count > 0 ? value / count : null;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? [parts[0]!, parts[parts.length - 1]!] : parts;

  return letters.map((part) => part[0]!.toUpperCase()).join("") || "?";
}

/** "19.42" in the window's timezone. */
export function clockTime(
  value: string,
  window: Pick<AdminWindow, "timezone">
): string {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: window.timezone,
  }).format(new Date(value));
}

/** "12 Nov, 19.42" in the window's timezone. */
export function dateTime(
  value: string,
  window: Pick<AdminWindow, "timezone">
): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: window.timezone,
  }).format(new Date(value));
}

/** "vs 7 hari sebelumnya", "vs kemarin". */
export function versusLabel(period: AdminPeriod): string {
  if (period === "today") return "vs kemarin";
  if (period === "24h") return "vs 24 jam sebelumnya";

  return `vs ${period.replace("d", "")} hari sebelumnya`;
}
