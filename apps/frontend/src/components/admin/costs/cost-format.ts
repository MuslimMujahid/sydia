import type { AdminPlan } from "../types";
import { formatIdr } from "../analytics/meta";

/** What a ledger `kind` means to an operator. */
export const KIND_LABELS: Record<string, string> = {
  message: "Interaktif",
  background: "Latar",
  hindsight: "Gabungan",
  other: "Lainnya",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? KIND_LABELS.other!;
}

export const PLAN_LABELS: Record<AdminPlan, string> = {
  trial: "Trial",
  plus: "Plus",
  expired: "Kedaluwarsa",
  disabled: "Nonaktif",
};

const NUMBER = (digits: number) =>
  new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });

/** Compact dollars for axes and dense lists: "$0,98", "$1,5", "0". */
export function formatUsdShort(value: number): string {
  if (value === 0) return "0";
  const digits = Math.abs(value) < 0.1 ? 3 : Math.abs(value) < 10 ? 2 : 0;

  return `$${NUMBER(digits).format(value)}`;
}

/** Per-call cost with four decimals: "0,0077". */
export function formatPerCall(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

/** Token counts in Indonesian short units: "980rb", "1,2jt". */
export function formatTokens(value: number): string {
  if (value < 1000) return NUMBER(0).format(value);
  if (value < 1_000_000)
    return `${NUMBER(0).format(Math.round(value / 1000))}rb`;

  return `${NUMBER(1).format(value / 1_000_000)}jt`;
}

/** A multiple of the typical cost: "12×", "4,2×". */
export function formatMultiple(value: number): string {
  return `${NUMBER(value >= 10 ? 0 : 1).format(value)}×`;
}

/** Rupiah with an explicit sign, so margins never rely on colour. */
export function formatSignedIdr(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return formatIdr(0);

  return rounded > 0 ? `+${formatIdr(rounded)}` : `−${formatIdr(-rounded)}`;
}

/** A rounded scale maximum: 1, 2, 2,5 or 5 times a power of ten. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((n) => n * magnitude >= value) ?? 10;

  return step * magnitude;
}
