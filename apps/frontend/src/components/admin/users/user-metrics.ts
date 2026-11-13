import { median, periodLabel } from "../analytics/meta";
import type {
  AdminPeriod,
  AdminPlan,
  AdminUser,
  AdminUserGroup,
} from "../types";

/*
 * Pricing used for per-user margin. The users endpoint carries no pricing, so
 * these mirror the backend `AdminAnalyticsService.pricing()` defaults
 * (BACKEND_BILLING_PRICE_IDR, BILLING_TERM_DAYS, BACKEND_ADMIN_USD_IDR_RATE).
 * Keep them in sync if those defaults change.
 */
export const PLUS_PRICE_IDR = 29_000;
export const TERM_DAYS = 30;
export const USD_IDR_RATE = 16_250;

/** A user counts toward the page's typical rate only with this many actions. */
const TYPICAL_MIN_ACTIONS = 3;
/** Spend below this is noise, never a leak (mirrors the backend). */
const LEAK_MIN_USD = 0.1;
/** Spend this many times the typical cost per action is a leak. */
export const LEAK_MULTIPLE = 3;

const PERIOD_DAYS: Record<AdminPeriod, number> = {
  today: 1,
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Days a period covers; hourly periods count as one, like the backend. */
export function periodDays(period: AdminPeriod): number {
  return PERIOD_DAYS[period];
}

/** Lower-case period for column headers: "7 hari", "hari ini". */
export function periodPhrase(period: AdminPeriod): string {
  return period === "today" ? "hari ini" : periodLabel(period);
}

/** What a Plus subscription is worth over `days`; trials and lapsed plans earn nothing. */
export function planValueIdr(plan: AdminPlan, days: number): number {
  return plan === "plus" ? (PLUS_PRICE_IDR * days) / TERM_DAYS : 0;
}

/** Plan value minus model spend, in rupiah. */
export function marginIdr(
  plan: AdminPlan,
  costUsd: number,
  days: number
): number {
  return planValueIdr(plan, days) - costUsd * USD_IDR_RATE;
}

export function formatSignedIdr(value: number): string {
  const rounded = Math.round(value);
  const amount = new Intl.NumberFormat("id-ID").format(Math.abs(rounded));
  if (rounded === 0) return "Rp 0";

  return `${rounded > 0 ? "+" : "-"}Rp ${amount}`;
}

/**
 * The list endpoint has no typical rate, so the page derives one: the median
 * cost per action of the rows on this page with at least three actions and
 * some spend. Null when no row qualifies.
 */
export function pageTypicalCostPerAction(
  users: ReadonlyArray<Pick<AdminUser, "periodActions" | "periodCostUsd">>
): number | null {
  return median(
    users
      .filter(
        (user) =>
          user.periodActions >= TYPICAL_MIN_ACTIONS && user.periodCostUsd > 0
      )
      .map((user) => user.periodCostUsd / user.periodActions)
  );
}

export type CostFlag = "leak" | "idle" | null;

/**
 * "leak": at least US$0.10 and three times the page's typical cost per action
 * (a user without actions counts as one). "idle": spend without any actions
 * that is not yet a leak.
 */
export function costFlag(
  user: Pick<AdminUser, "periodActions" | "periodCostUsd">,
  typical: number | null
): CostFlag {
  const perAction = user.periodCostUsd / Math.max(user.periodActions, 1);
  if (
    typical !== null &&
    typical > 0 &&
    user.periodCostUsd >= LEAK_MIN_USD &&
    perAction >= LEAK_MULTIPLE * typical
  )
    return "leak";

  return user.periodActions === 0 && user.periodCostUsd > 0 ? "idle" : null;
}

export type EngagementGroup = AdminUserGroup | "dormant" | "never";

/**
 * Mirrors backend `userGroup`: power acts on ≥70% of days in ≥3 features,
 * regular on ≥40% of days, casual otherwise. Users without actions are
 * dormant, or never active when they have no activity at all.
 */
export function engagementGroup(input: {
  actions: number;
  activeDays: number;
  features: number;
  days: number;
  lastActivityAt: string | null | undefined;
}): EngagementGroup {
  if (input.actions === 0)
    return input.lastActivityAt === null ? "never" : "dormant";
  const share = input.activeDays / Math.max(input.days, 1);
  if (share >= 0.7 && input.features >= 3) return "power";
  if (share >= 0.4) return "regular";

  return "casual";
}

export const GROUP_LABELS: Record<EngagementGroup, string> = {
  power: "Power",
  regular: "Reguler",
  casual: "Kasual",
  dormant: "Dorman",
  never: "Belum aktif",
};

export function remainingDays(value: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(value).getTime() - now) / 86_400_000));
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toLocaleUpperCase("id-ID");
}

/** Sums neighbouring buckets so long periods fit a small sparkline. */
const SAME_DAY_TIME = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
});

const WEEKDAY = new Intl.DateTimeFormat("id-ID", { weekday: "short" });
const DAY_MONTH = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
});

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);

  return date.getTime();
}

/** "Hari ini, 18.40", "Kam, 21.10" within a week, "2 Nov" before that. */
export function formatRecent(value: string | null, now: number): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const days = Math.round(
    (startOfDay(now) - startOfDay(date.getTime())) / 86_400_000
  );

  if (days <= 0) return `Hari ini, ${SAME_DAY_TIME.format(date)}`;
  if (days < 7) return `${WEEKDAY.format(date)}, ${SAME_DAY_TIME.format(date)}`;

  return DAY_MONTH.format(date);
}

export function formatDayMonth(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : DAY_MONTH.format(date);
}

const CHANNEL_LABELS: Record<string, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}
