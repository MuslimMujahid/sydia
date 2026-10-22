import { useQuery } from "@tanstack/react-query";
import { DomainPageHeader } from "@/components/domain/domain-page";
import { Badge, type BadgeDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  billingOrdersQueryOptions,
  billingStatusQueryOptions,
  type BillingStatus,
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
  formatBillingRemaining,
} from "./billing-copy";

interface BillingPageProps {
  locale: string;
  timezone: string;
  now?: () => number;
}

const STATE_DOT: Record<BillingStatus["state"], BadgeDot> = {
  disabled: "ink-weak",
  trial: "brand",
  paid: "brand",
  expired: "destructive",
};

const SECTION_HEADING = "font-display text-[17px] leading-[1.6] font-semibold";

export function BillingPage({
  locale,
  timezone,
  now = Date.now,
}: BillingPageProps) {
  const language = billingLanguage(locale);
  const text = BILLING_COPY[language];
  const status = useQuery(billingStatusQueryOptions());
  const orders = useQuery(billingOrdersQueryOptions());
  const currency = (value: number) => formatBillingCurrency(value, language);
  const date = (value: string) => formatBillingDate(value, language, timezone);
  const pending = findOpenBillingOrder(orders.data);

  if (status.isPending)
    return (
      <div className="max-w-3xl space-y-6 lg:space-y-10" aria-busy="true">
        <DomainPageHeader title={text.title} divided={false} />
        <p role="status" className="sr-only">
          {text.loading}
        </p>
        {[0, 1].map((item) => (
          <Card key={item} className="p-6 sm:p-8">
            <span className="block h-6 w-40 animate-pulse rounded-sm bg-hairline motion-reduce:animate-none" />
            <span className="mt-6 block h-20 max-w-sm animate-pulse rounded-sm bg-hairline motion-reduce:animate-none" />
          </Card>
        ))}
      </div>
    );
  if (status.isError)
    return (
      <div className="max-w-3xl space-y-6 lg:space-y-10">
        <DomainPageHeader title={text.title} divided={false} />
        <div className="border-y border-destructive/30 py-6" role="alert">
          <p className="text-sm text-destructive">{status.error.message}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => void status.refetch()}
          >
            {text.retry}
          </Button>
        </div>
      </div>
    );
  const billing = status.data;
  const counting = billing.state === "trial" || billing.state === "paid";

  const until =
    billing.state === "trial"
      ? billing.trialEndsAt
      : (billing.paidUntil ?? billing.trialEndsAt);

  return (
    <div className="max-w-3xl space-y-6 lg:space-y-10">
      <DomainPageHeader title={text.title} divided={false} />
      <Card className="p-6 sm:p-8">
        <div className="max-w-xl">
          <h2 className={SECTION_HEADING}>{text.statusTitle}</h2>
          <p className="mt-2 text-ink-muted">
            {text.statusDescription[billing.state]}
          </p>
        </div>
        <div className="mt-6 space-y-2">
          <Badge dot={STATE_DOT[billing.state]}>
            {text.state[billing.state]}
          </Badge>
          {until && counting ? (
            <p className="font-display text-3xl font-semibold tabular-nums">
              {formatBillingRemaining(until, now(), language)}
            </p>
          ) : null}
          {until ? (
            <p className="text-ink-muted">
              {billing.state === "expired" ? text.expiredOn : text.until}{" "}
              <time dateTime={until}>{date(until)}</time>
            </p>
          ) : null}
        </div>
      </Card>
      <Card className="p-6 sm:p-8">
        <div className="max-w-xl">
          <h2 className={SECTION_HEADING}>{text.planTitle}</h2>
          <p className="mt-2 text-ink-muted">{text.planDescription}</p>
        </div>
        <div className="mt-6 space-y-4">
          {billing.environment === "sandbox" && billing.checkoutEnabled ? (
            <p role="status" className="text-sm font-semibold text-ink-muted">
              {text.sandbox}
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
          <BillingCheckout
            billing={billing}
            language={language}
            inline={false}
          />
        </div>
      </Card>
      <Card className="p-6 sm:p-8">
        <div className="max-w-xl">
          <h2 className={SECTION_HEADING}>{text.storage}</h2>
          <p className="mt-2 text-ink-muted">{text.storageDescription}</p>
        </div>
        <div className="mt-6 space-y-3">
          <p className="tabular-nums">
            {new Intl.NumberFormat(language, {
              maximumFractionDigits: 2,
            }).format(billing.storage.usedBytes / 1_000_000_000)}{" "}
            GB {text.used}
          </p>
          <progress
            aria-label={text.storage}
            value={billing.storage.usedBytes}
            max={billing.storage.limitBytes}
            className="h-2 w-full overflow-hidden rounded-pill bg-hairline [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-hairline [&::-webkit-progress-value]:bg-brand"
          />
        </div>
      </Card>
      <Card className="p-6 sm:p-8">
        <div className="max-w-xl">
          <h2 className={SECTION_HEADING}>{text.history}</h2>
          <p className="mt-2 text-ink-muted">{text.historyDescription}</p>
        </div>
        <div className="mt-6">
          {orders.isPending ? (
            <p role="status">{text.loading}</p>
          ) : orders.isError ? (
            <div role="alert" className="space-y-3">
              <p className="text-sm text-destructive">{orders.error.message}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void orders.refetch()}
              >
                {text.retry}
              </Button>
            </div>
          ) : orders.data.length === 0 ? (
            <p className="text-ink-muted">{text.empty}</p>
          ) : (
            <ul className="divide-y divide-surface-1">
              {orders.data.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
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
        </div>
      </Card>
    </div>
  );
}
