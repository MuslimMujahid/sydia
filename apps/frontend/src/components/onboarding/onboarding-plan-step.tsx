import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormError } from "@/components/forms/form-fields";
import { BillingCheckout } from "@/components/settings/billing-checkout";
import {
  BILLING_COPY,
  BILLING_PITCH,
  formatBillingCurrency,
} from "@/components/settings/billing-copy";
import { showTestEnvironment } from "@/components/settings/billing-plan";
import { Button } from "@/components/ui/button";
import { billingStatusQueryOptions } from "@/lib/services/api/billing/billing.api";

interface OnboardingPlanStepProps {
  saving: boolean;
  error?: string;
  onBack: () => void;
  onFinish: () => void;
}

const LANGUAGE = "id";
const text = BILLING_COPY[LANGUAGE];
const pitch = BILLING_PITCH[LANGUAGE];

export function OnboardingPlanStep({
  saving,
  error,
  onBack,
  onFinish,
}: OnboardingPlanStepProps) {
  const status = useQuery(billingStatusQueryOptions());
  const [paying, setPaying] = useState(false);

  if (status.isPending)
    return (
      <div aria-busy="true" className="space-y-4">
        <p role="status" className="sr-only">
          {text.loading}
        </p>
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
  const hero = pitch.hero[billing.state];
  const currency = (value: number) => formatBillingCurrency(value, LANGUAGE);
  const showPayment = !paid && (paying || !billing.active);

  const finishLabel = saving
    ? "Menyimpan pengaturan…"
    : paid
      ? "Simpan dan lanjutkan"
      : billing.active
        ? pitch.startTrial(billing.trialDays)
        : "Bayar untuk melanjutkan";

  return (
    <div className="space-y-7">
      <section className="space-y-3">
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">
          {paid ? text.paidNotice : hero.title(billing.trialDays)}
        </h2>
        <p className="max-w-prose text-ink-muted">
          {paid
            ? hero.body
            : billing.active
              ? hero.body
              : pitch.hero.expired.body}
        </p>
        {!paid ? (
          <p className="text-ink-muted">
            {billing.active ? `${pitch.afterTrial} ` : null}
            {billing.price < billing.normalPrice ? (
              <del aria-label={text.normal}>
                {currency(billing.normalPrice)}
              </del>
            ) : null}{" "}
            <span className="font-semibold text-ink">
              {currency(billing.price)}
            </span>{" "}
            {text.term}
          </p>
        ) : null}
        {showTestEnvironment(billing) ? (
          <p className="text-xs text-ink-weak">{text.sandbox}</p>
        ) : null}
      </section>
      {showPayment ? (
        <BillingCheckout billing={billing} language={LANGUAGE} />
      ) : !paid && billing.checkoutEnabled ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setPaying(true)}
        >
          {pitch.payNow}
        </Button>
      ) : null}
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
