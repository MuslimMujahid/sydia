import { MAX_CHART_BARS, binSize } from "./charts";
import type {
  ActivityFeature,
  AdminPeriod,
  AdminWindow,
  FeatureCosts,
  UsageFeature,
} from "../types";

/** Features in the order every table and heatmap lists them. */
export const ACTIVITY_FEATURES: readonly ActivityFeature[] = [
  "chat",
  "notes",
  "memory",
  "tasks",
  "reminders",
  "documents",
  "calendar",
  "contacts",
];

export const FEATURE_LABELS: Record<UsageFeature, string> = {
  chat: "Chat",
  notes: "Catatan",
  memory: "Memori",
  tasks: "Tugas",
  reminders: "Pengingat",
  documents: "Dokumen",
  calendar: "Kalender",
  contacts: "Kontak",
  proactive: "Proaktif & ringkasan harian",
  overhead: "Overhead routing",
  other: "Lainnya",
};

/**
 * The seven categories cost charts stack. Colours were validated as a
 * categorical set (adjacent CVD ΔE ≥ 9); aqua and amber sit below 3:1 contrast,
 * so every chart using them carries visible labels or a table.
 */
export type CostCategory =
  "chat" | "notes" | "memory" | "tasks" | "documents" | "overhead" | "other";

export const COST_CATEGORIES: ReadonlyArray<{
  key: CostCategory;
  label: string;
  color: string;
}> = [
  { key: "chat", label: "Chat", color: "#e0457b" },
  { key: "notes", label: "Catatan", color: "#6250d6" },
  { key: "memory", label: "Memori", color: "#1baf7a" },
  { key: "tasks", label: "Tugas & Pengingat", color: "#eda100" },
  { key: "documents", label: "Dokumen", color: "#2a78d6" },
  { key: "overhead", label: "Overhead routing", color: "#c25d35" },
  { key: "other", label: "Lainnya", color: "#b8b1bc" },
];

const CATEGORY_OF: Record<UsageFeature, CostCategory> = {
  chat: "chat",
  notes: "notes",
  memory: "memory",
  tasks: "tasks",
  reminders: "tasks",
  documents: "documents",
  overhead: "overhead",
  calendar: "other",
  contacts: "other",
  proactive: "other",
  other: "other",
};

export function costCategory(feature: UsageFeature): CostCategory {
  return CATEGORY_OF[feature];
}

export function categoryMeta(key: CostCategory) {
  return COST_CATEGORIES.find((entry) => entry.key === key)!;
}

/** Folds per-feature costs into the seven chart categories. */
export function groupCosts(costs: FeatureCosts): Record<CostCategory, number> {
  const grouped = Object.fromEntries(
    COST_CATEGORIES.map(({ key }) => [key, 0])
  ) as Record<CostCategory, number>;

  for (const [feature, value] of Object.entries(costs) as Array<
    [UsageFeature, number | undefined]
  >)
    grouped[CATEGORY_OF[feature]] += value ?? 0;

  return grouped;
}

/** Category colour of a feature, for swatches beside feature names. */
export function featureColor(feature: UsageFeature): string {
  return categoryMeta(CATEGORY_OF[feature]).color;
}

const STAGES: Record<string, string> = {
  "assistant.reply": "Balasan asisten",
  "assistant.background": "Evaluasi sekretaris",
  "conversation-summary": "Ringkasan percakapan",
  "memory-dream.extract": "Ekstraksi memori",
  "memory-dream.reconcile": "Rekonsiliasi memori",
  "memory-policy.evidence": "Kebijakan memori",
  "note-agent.background": "Agen catatan",
  "note-clarification": "Klarifikasi catatan",
  "briefing.compose": "Ringkasan harian",
  "document.title": "Nama dokumen",
  "media.transcription": "Transkripsi suara",
  "media.vision": "Membaca gambar",
  embedding: "Embedding",
  hindsight: "Hindsight",
  generation: "Panggilan tanpa label",
};

/** A readable name for a ledger stage such as `decision.turn`. */
export function stageLabel(stage: string): string {
  if (STAGES[stage]) return STAGES[stage];
  if (stage.startsWith("decision.")) return `Routing · ${stage.slice(9)}`;
  if (stage.startsWith("note-organization."))
    return `Pengaturan catatan · ${stage.slice(18)}`;

  return stage;
}

export const PERIODS: ReadonlyArray<{ value: AdminPeriod; label: string }> = [
  { value: "today", label: "Hari ini" },
  { value: "24h", label: "24 jam" },
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
  { value: "90d", label: "90 hari" },
];

export function isAdminPeriod(value: unknown): value is AdminPeriod {
  return PERIODS.some((entry) => entry.value === value);
}

export function periodLabel(period: AdminPeriod): string {
  return PERIODS.find((entry) => entry.value === period)?.label ?? period;
}

/** What every "vs" figure on a page is measured against. */
export function comparisonLabel(period: AdminPeriod): string {
  if (period === "today") return "Hari ini vs kemarin pada jam yang sama";
  if (period === "24h") return "24 jam terakhir vs 24 jam sebelumnya";

  return `${periodLabel(period)} terakhir vs ${periodLabel(period)} sebelumnya`;
}

/** Axis label of each bucket: weekday and date, or the hour. */
export function bucketLabels(window: AdminWindow): string[] {
  const format = new Intl.DateTimeFormat(
    "id-ID",
    window.bucket === "day"
      ? window.buckets.length > 14
        ? { day: "numeric", month: "short", timeZone: window.timezone }
        : { weekday: "short", day: "numeric", timeZone: window.timezone }
      : { hour: "2-digit", minute: "2-digit", timeZone: window.timezone }
  );

  return window.buckets.map((start) => format.format(new Date(start)));
}

/** What one bar of a full-width chart covers: "jam", "hari" or "minggu". */
export function chartUnit(window: Pick<AdminWindow, "bucket" | "buckets">) {
  if (window.bucket === "hour") return "jam";
  const size = binSize(window.buckets.length, MAX_CHART_BARS);

  return size === 1 ? "hari" : size === 7 ? "minggu" : `${size} hari`;
}

/** "Diperbarui 20.14 WIB · 7–13 Nov 2026" */
export function updatedLabel(window: AdminWindow): string {
  const time = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: window.timezone,
  }).format(new Date(window.generatedAt));

  const date = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: window.timezone,
  });

  const from = date.format(new Date(window.from));
  const until = date.format(new Date(window.until));

  return `Diperbarui ${time} WIB · ${from === until ? until : `${from} – ${until}`}`;
}

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatIdr(value: number): string {
  return IDR.format(value);
}

export function percent(value: number, digits = 1): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(value)}%`;
}

/** Relative change in percent; null without a previous value. */
export function change(value: number, previous: number): number | null {
  return previous > 0 ? ((value - previous) / previous) * 100 : null;
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** `validateSearch` for analytics routes: a known period or none. */
export function periodSearch(search: Record<string, unknown>): {
  period?: AdminPeriod;
} {
  return isAdminPeriod(search.period) ? { period: search.period } : {};
}

export const DEFAULT_PERIOD: AdminPeriod = "7d";
