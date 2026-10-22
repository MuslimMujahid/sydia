import type { BillingStatus } from "@/lib/services/api/billing/billing.api";

const DAY_MS = 86_400_000;
const RENEWAL_NUDGE_DAYS = 3;

export type BillingPlanSummary = {
  state: "trial" | "paid" | "expired";
  badge: string;
  tone: "brand" | "warn" | "destructive";
  detail: string;
  /** One line for the account button under the user's name. */
  footer: string;
  /** Call to action, absent when no payment is useful or available. */
  cta: string | null;
  storage: string;
};

type BillingPlanOptions = { now: number; timezone: string };

function formatGigabytes(bytes: number): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(bytes / 1_000_000_000)} GB`;
}

function remaining(until: string | null, now: number): string {
  if (!until) return "aktif";
  const left = Date.parse(until) - now;

  return left < DAY_MS
    ? "kurang dari 1 hari lagi"
    : `${Math.ceil(left / DAY_MS)} hari lagi`;
}

/** Compact, Indonesian plan status for the account menu; null when no plan applies. */
export function summarizeBillingPlan(
  billing: BillingStatus,
  { now, timezone }: BillingPlanOptions
): BillingPlanSummary | null {
  // Nothing is restricted until enforcement starts, so no plan is shown.
  if (!billing.enforced || billing.state === "disabled") return null;
  const storage = `${formatGigabytes(billing.storage.usedBytes)} / ${formatGigabytes(billing.storage.limitBytes)}`;

  if (billing.state === "trial") {
    const left = remaining(billing.trialEndsAt, now);

    return {
      state: "trial",
      badge: "Trial",
      tone: "brand",
      detail: `Trial gratis · ${left}`,
      footer: `Trial · ${left}`,
      cta: billing.checkoutEnabled ? "Berlangganan sekarang" : null,
      storage,
    };
  }

  if (billing.state === "paid") {
    const until = billing.paidUntil;
    const ending =
      until !== null && Date.parse(until) - now <= RENEWAL_NUDGE_DAYS * DAY_MS;

    const date = until
      ? new Intl.DateTimeFormat("id-ID", {
          dateStyle: "medium",
          timeZone: timezone,
        }).format(new Date(until))
      : null;

    return {
      state: "paid",
      badge: "Aktif",
      tone: ending ? "warn" : "brand",
      detail: date ? `Aktif hingga ${date}` : "Langganan aktif",
      footer: ending
        ? `Langganan · ${remaining(until, now)}`
        : "Langganan aktif",
      cta: ending && billing.checkoutEnabled ? "Perpanjang langganan" : null,
      storage,
    };
  }

  return {
    state: "expired",
    badge: "Habis",
    tone: "destructive",
    detail: "Akses baca saja",
    footer: "Masa aktif habis",
    cta: billing.checkoutEnabled ? "Perpanjang langganan" : null,
    storage,
  };
}
