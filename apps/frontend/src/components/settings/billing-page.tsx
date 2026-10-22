import { useQuery } from "@tanstack/react-query";
import { DomainPageHeader } from "@/components/domain/domain-page";
import { Button } from "@/components/ui/button";
import {
  billingOrdersQueryOptions,
  billingStatusQueryOptions,
} from "@/lib/services/api/billing/billing.api";
import {
  BillingCheckout,
  BillingPaymentActions,
  findOpenBillingOrder,
} from "./billing-checkout";
import {
  BILLING_COPY,
  billingLanguage,
  formatBillingCurrency,
  formatBillingDate,
} from "./billing-copy";

interface BillingPageProps {
  locale: string;
  timezone: string;
}

export function BillingPage({ locale, timezone }: BillingPageProps) {
  const language = billingLanguage(locale);
  const text = BILLING_COPY[language];
  const status = useQuery(billingStatusQueryOptions());
  const orders = useQuery(billingOrdersQueryOptions());
  const currency = (value: number) => formatBillingCurrency(value, language);
  const date = (value: string) => formatBillingDate(value, language, timezone);
  const pending = findOpenBillingOrder(orders.data);

  if (status.isPending)
    return (
      <div className="max-w-3xl space-y-6" aria-busy="true">
        <DomainPageHeader title={text.title} divided={false} />
        <p role="status">{text.loading}</p>
        <div className="h-40 animate-pulse rounded-md bg-surface-1 motion-reduce:animate-none" />
      </div>
    );
  if (status.isError)
    return (
      <div role="alert" className="space-y-4">
        <p>{status.error.message}</p>
        <Button onClick={() => void status.refetch()}>{text.retry}</Button>
      </div>
    );
  const billing = status.data;
  const until =
    billing.state === "trial"
      ? billing.trialEndsAt
      : (billing.paidUntil ?? billing.trialEndsAt);

  return (
    <div className="max-w-3xl space-y-8 lg:space-y-10">
      <DomainPageHeader title={text.title} divided={false} />
      {billing.environment === "sandbox" && billing.checkoutEnabled ? (
        <p role="status" className="text-sm font-semibold text-ink-muted">
          {text.sandbox}
        </p>
      ) : null}
      <section aria-labelledby="billing-status" className="space-y-4">
        <h2 id="billing-status" className="font-display text-xl font-semibold">
          {text.state[billing.state]}
        </h2>
        {until ? (
          <p className="text-ink-muted">
            {billing.state === "expired" ? text.expiredOn : text.until}{" "}
            <time dateTime={until}>{date(until)}</time>
          </p>
        ) : null}
        {!billing.active ? (
          <p className="max-w-prose text-ink-muted" role="status">
            {text.readOnly}
          </p>
        ) : null}
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
        <BillingCheckout billing={billing} language={language} />
      </section>
      <section
        aria-labelledby="billing-storage"
        className="space-y-3 border-t border-hairline pt-6"
      >
        <h2 id="billing-storage" className="font-display text-lg font-semibold">
          {text.storage}
        </h2>
        <p className="tabular-nums">
          {new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(
            billing.storage.usedBytes / 1_000_000_000
          )}{" "}
          GB {text.used}
        </p>
        <progress
          aria-label={text.storage}
          value={billing.storage.usedBytes}
          max={billing.storage.limitBytes}
          className="h-2 w-full overflow-hidden rounded-pill bg-hairline [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-hairline [&::-webkit-progress-value]:bg-brand"
        />
      </section>
      <section
        aria-labelledby="billing-history"
        className="space-y-4 border-t border-hairline pt-6"
      >
        <h2 id="billing-history" className="font-display text-lg font-semibold">
          {text.history}
        </h2>
        {orders.isPending ? (
          <p role="status">{text.loading}</p>
        ) : orders.isError ? (
          <div role="alert" className="space-y-3">
            <p>{orders.error.message}</p>
            <Button
              variant="dark-outline"
              onClick={() => void orders.refetch()}
            >
              {text.retry}
            </Button>
          </div>
        ) : orders.data.length === 0 ? (
          <p className="text-ink-muted">{text.empty}</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {orders.data.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="space-y-1">
                  <p className="font-semibold tabular-nums">
                    {currency(order.amount)} · {text.order[order.status]}
                  </p>
                  <time
                    dateTime={order.createdAt}
                    className="text-sm text-ink-muted"
                  >
                    {date(order.createdAt)}
                  </time>
                </div>
                {order.id !== pending?.id && order.status === "pending" ? (
                  <BillingPaymentActions order={order} language={language} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
