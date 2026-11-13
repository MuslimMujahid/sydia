import type {
  ActivityFeature,
  AdminUsageReport,
  AdminUserGroup,
  AdminWindow,
} from "../types";
import { ACTIVITY_FEATURES, median, sum } from "../analytics/meta";

export type UsageUser = AdminUsageReport["users"][number];
export type UsageFeatureRow = AdminUsageReport["features"][number];
export type UsageGroup = AdminUserGroup | "dormant" | "inactive";
export type UsageSort = "actions" | "cost" | "days";

/** Groups from most to least engaged, on an ordinal pink→gray ramp. */
export const USER_GROUPS: ReadonlyArray<{
  key: UsageGroup;
  label: string;
  definition: string;
  color: string;
}> = [
  {
    key: "power",
    label: "Power",
    definition: "aktif ≥70% hari · ≥3 fitur",
    color: "#8e1f49",
  },
  {
    key: "regular",
    label: "Reguler",
    definition: "aktif ≥40% hari",
    color: "#c93d6e",
  },
  {
    key: "casual",
    label: "Kasual",
    definition: "aktif sesekali",
    color: "#ea6f9a",
  },
  {
    key: "dormant",
    label: "Dorman",
    definition: "aktif sebelumnya, tidak di periode ini",
    color: "#d9d2dc",
  },
  {
    key: "inactive",
    label: "Belum aktif",
    definition: "belum pernah kirim pesan",
    color: "#ece7ee",
  },
];

/** Sequential action-count ramp; the two darkest steps carry white text. */
export const HEAT_STEPS: ReadonlyArray<{
  label: string;
  min: number;
  color: string;
  dark: boolean;
}> = [
  { label: "0", min: 0, color: "#f4efec", dark: false },
  { label: "1–2", min: 1, color: "#fbd3e1", dark: false },
  { label: "3–5", min: 3, color: "#f5a3c0", dark: false },
  { label: "6–10", min: 6, color: "#ea6f9a", dark: true },
  { label: "11+", min: 11, color: "#c93d6e", dark: true },
];

/** The same ramp for spend per feature, in US$. */
export const COST_HEAT_STEPS: typeof HEAT_STEPS = [
  { label: "0", min: 0, color: "#f4efec", dark: false },
  { label: "<0,05", min: 0.000001, color: "#fbd3e1", dark: false },
  { label: "0,05–0,2", min: 0.05, color: "#f5a3c0", dark: false },
  { label: "0,2–0,5", min: 0.2, color: "#ea6f9a", dark: true },
  { label: "0,5+", min: 0.5, color: "#c93d6e", dark: true },
];

export function heatStep(value: number, steps = HEAT_STEPS) {
  return [...steps].reverse().find((step) => value >= step.min) ?? steps[0]!;
}

export type HeatMode = "actions" | "cost";

/** Spend at this multiple of the typical cost of the same actions is a warning. */
const WARN_MULTIPLE = 2;
const WARN_MIN_USD = 0.1;

/** How a user's spend compares with the typical cost of their actions. */
export function userCostTone(user: UsageUser): CostTone {
  if (user.leak) return "bad";

  return user.costUsd >= WARN_MIN_USD &&
    user.multiple !== null &&
    user.multiple >= WARN_MULTIPLE
    ? "warn"
    : "normal";
}

export const SORT_OPTIONS: ReadonlyArray<{ value: UsageSort; label: string }> =
  [
    { value: "actions", label: "Total aksi" },
    { value: "cost", label: "Biaya" },
    { value: "days", label: "Hari aktif" },
  ];

export function totalActions(user: UsageUser): number {
  return sum(ACTIVITY_FEATURES.map((feature) => user.actions[feature] ?? 0));
}

export function sortUsers(
  users: readonly UsageUser[],
  sort: UsageSort
): UsageUser[] {
  const key = (user: UsageUser) =>
    sort === "cost"
      ? user.costUsd
      : sort === "days"
        ? user.activeDays
        : totalActions(user);

  return [...users].sort(
    (a, b) =>
      key(b) - key(a) ||
      totalActions(b) - totalActions(a) ||
      b.costUsd - a.costUsd
  );
}

export type CostTone = "normal" | "warn" | "bad";

/** Cost per action of each feature with actions, and its tone against the median. */
export function costPerAction(
  report: AdminUsageReport
): Partial<Record<ActivityFeature, { value: number; tone: CostTone }>> {
  const values = report.features
    .filter((row) => row.actions > 0)
    .map((row) => ({
      feature: row.feature,
      value: (report.featureCosts[row.feature] ?? 0) / row.actions,
    }));

  const typical = median(values.map((entry) => entry.value));

  return Object.fromEntries(
    values.map(({ feature, value }) => {
      const ratio = typical && typical > 0 ? value / typical : 0;
      const tone: CostTone =
        ratio >= 3 ? "bad" : ratio >= 2 ? "warn" : "normal";

      return [feature, { value, tone }];
    })
  );
}

export const COST_TONE_TEXT: Record<CostTone, string> = {
  normal: "",
  warn: "text-amber-700",
  bad: "text-red-600",
};

export const COST_TONE_NOTE: Record<CostTone, string> = {
  normal: "",
  warn: "lebih dari 2× median fitur",
  bad: "lebih dari 3× median fitur",
};

export const KIND_LABELS: Record<string, string> = {
  message: "interaktif",
  background: "latar",
  hindsight: "gabungan, tanpa rincian pengguna",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/** "7–13 Nov" or "14 Nov 2026" for the window a report covers. */
export function rangeLabel(window: AdminWindow): string {
  const format = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: window.timezone,
  });

  const from = format.format(new Date(window.from));
  // `until` is exclusive at the end of a day window; show the last covered instant.
  const until = format.format(new Date(new Date(window.until).getTime() - 1));

  return from === until ? from : `${from} – ${until}`;
}
