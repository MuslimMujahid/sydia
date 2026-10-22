import type { BillingStatus } from "@/lib/services/api/billing/billing.api";

const DAY_MS = 86_400_000;
const RENEWAL_NUDGE_DAYS = 3;

export type BillingPlanSummary = {
  state: "trial" | "paid" | "expired";
  /** One short line for the account button under the user's name. */
  footer: string;
  /** Call to action, absent when no payment is useful or available. */
  cta: string | null;
  storage: string;
};

type BillingPlanOptions = { now: number };

function formatGigabytes(bytes: number): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(bytes / 1_000_000_000)} GB`;
}

/** Compact Indonesian plan status for the account menu; null when no plan applies. */
export function summarizeBillingPlan(
  billing: BillingStatus,
  { now }: BillingPlanOptions
): BillingPlanSummary | null {
  // Nothing is restricted until enforcement starts, so no plan is shown.
  if (!billing.enforced || billing.state === "disabled") return null;
  const storage = `${formatGigabytes(billing.storage.usedBytes)} / ${formatGigabytes(billing.storage.limitBytes)}`;

  if (billing.state === "trial")
    return {
      state: "trial",
      footer: "Trial gratis",
      cta: billing.checkoutEnabled ? "Berlangganan sekarang" : null,
      storage,
    };

  if (billing.state === "paid") {
    const ending =
      billing.paidUntil !== null &&
      Date.parse(billing.paidUntil) - now <= RENEWAL_NUDGE_DAYS * DAY_MS;

    return {
      state: "paid",
      footer: "Langganan aktif",
      cta: ending && billing.checkoutEnabled ? "Perpanjang langganan" : null,
      storage,
    };
  }

  return {
    state: "expired",
    footer: "Perlu perpanjangan",
    cta: billing.checkoutEnabled ? "Perpanjang langganan" : null,
    storage,
  };
}

/** Test-payment wording is for developers; users never see it in production. */
export function showTestEnvironment(billing: BillingStatus): boolean {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- Vite build-time constant, not a process environment variable.
  return import.meta.env.DEV && billing.environment === "sandbox";
}
