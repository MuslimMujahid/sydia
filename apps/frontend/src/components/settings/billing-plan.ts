import type { BillingStatus } from "@/lib/services/api/billing/billing.api";
import { formatBillingRemaining } from "./billing-copy";

const DAY_MS = 86_400_000;
const RENEWAL_NUDGE_DAYS = 3;

export type BillingPlanSummary = {
  state: "trial" | "paid" | "expired";
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
  return until ? formatBillingRemaining(until, now, "id") : "aktif";
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
    detail: "Habis · akses baca saja",
    footer: "Masa aktif habis",
    cta: billing.checkoutEnabled ? "Perpanjang langganan" : null,
    storage,
  };
}
