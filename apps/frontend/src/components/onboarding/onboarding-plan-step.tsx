import { useQuery } from "@tanstack/react-query";
import { FormError } from "@/components/forms/form-fields";
import { BillingCheckout } from "@/components/settings/billing-checkout";
import {
  BILLING_COPY,
  formatBillingCurrency,
  formatBillingDate,
} from "@/components/settings/billing-copy";
import { Button } from "@/components/ui/button";
import { billingStatusQueryOptions } from "@/lib/services/api/billing/billing.api";

interface OnboardingPlanStepProps {
  timezone: string;
  saving: boolean;
  error?: string;
  onBack: () => void;
  onFinish: () => void;
}

const LANGUAGE = "id";
const text = BILLING_COPY[LANGUAGE];

export function OnboardingPlanStep({
  timezone,
  saving,
  error,
  onBack,
  onFinish,
}: OnboardingPlanStepProps) {
  const status = useQuery(billingStatusQueryOptions());

  if (status.isPending)
    return (
      <div aria-busy="true" className="space-y-4">
        <p role="status">{text.loading}</p>
        <div className="h-40 animate-pulse rounded-md bg-surface-1 motion-reduce:animate-none" />
      </div>
    );

  if (status.isError)
    return (
      <div role="alert" className="space-y-4">
        <p>{status.error.message}</p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="dark-outline" onClick={onBack}>
            Kembali
          </Button>
          <Button type="button" onClick={() => void status.refetch()}>
            {text.retry}
          </Button>
        </div>
      </div>
    );

  const billing = status.data;
  const paid = billing.state === "paid";
  const date = (value: string) => formatBillingDate(value, LANGUAGE, timezone);
  const currency = (value: number) => formatBillingCurrency(value, LANGUAGE);

  const finishLabel = saving
    ? "Menyimpan pengaturan…"
    : paid
      ? "Simpan dan lanjutkan"
      : billing.active
        ? "Lanjut dengan trial gratis"
        : "Bayar untuk melanjutkan";

  return (
    <div className="space-y-7">
      {billing.environment === "sandbox" && billing.checkoutEnabled ? (
        <p role="status" className="text-sm font-semibold text-ink-muted">
          {text.sandbox}
        </p>
      ) : null}
      <section aria-labelledby="onboarding-plan" className="space-y-3">
        <h2 id="onboarding-plan" className="font-display text-xl font-semibold">
          Langganan Sydia
        </h2>
        <div className="flex flex-wrap items-baseline gap-3">
          {billing.price < billing.normalPrice ? (
            <del className="text-ink-muted" aria-label={text.normal}>
              {currency(billing.normalPrice)}
            </del>
          ) : null}
          <span className="font-display text-3xl font-semibold tabular-nums">
            {currency(billing.price)}
          </span>
          <span className="text-ink-muted">{text.term}</span>
        </div>
        <p>{text.features}</p>
        <p className="max-w-prose text-sm text-ink-muted">{text.renewal}</p>
      </section>
      {paid && billing.paidUntil ? (
        <p role="status" className="font-semibold">
          Pembayaran diterima. Langganan aktif hingga{" "}
          <time dateTime={billing.paidUntil}>{date(billing.paidUntil)}</time>.
        </p>
      ) : (
        <>
          <section
            aria-labelledby="onboarding-pay"
            className="space-y-4 border-t border-hairline pt-6"
          >
            <h2
              id="onboarding-pay"
              className="font-display text-lg font-semibold"
            >
              Bayar sekarang
            </h2>
            <BillingCheckout billing={billing} language={LANGUAGE} />
          </section>
          <section
            aria-labelledby="onboarding-trial"
            className="space-y-2 border-t border-hairline pt-6"
          >
            <h2
              id="onboarding-trial"
              className="font-display text-lg font-semibold"
            >
              {billing.active ? "Atau coba gratis dulu" : text.state.expired}
            </h2>
            {billing.active && billing.trialEndsAt ? (
              <p className="max-w-prose text-ink-muted">
                Trial gratis {billing.trialDays} hari aktif hingga{" "}
                <time dateTime={billing.trialEndsAt}>
                  {date(billing.trialEndsAt)}
                </time>
                . Setelah itu data tetap bisa dibaca, diunduh, dan dihapus;
                asisten dan perubahan data memerlukan langganan.
              </p>
            ) : (
              <p className="max-w-prose text-ink-muted">
                Masa trial Anda sudah berakhir. Bayar untuk menyelesaikan
                pengaturan awal dan memakai Sydia.
              </p>
            )}
          </section>
        </>
      )}
      <FormError message={error} />
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="dark-outline"
          disabled={saving}
          onClick={onBack}
        >
          Kembali
        </Button>
        <Button
          type="button"
          disabled={!billing.active || saving}
          onClick={onFinish}
        >
          {finishLabel}
        </Button>
      </div>
    </div>
  );
}
