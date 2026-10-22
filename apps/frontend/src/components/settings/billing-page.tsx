import { useQuery } from "@tanstack/react-query";
import {
  BellRing,
  Brain,
  CalendarDays,
  FileText,
  HardDrive,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
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
  BILLING_PITCH,
  billingLanguage,
  formatBillingCurrency,
  formatBillingDate,
  formatBillingRemaining,
  type BillingBenefit,
} from "./billing-copy";

interface BillingPageProps {
  locale: string;
  timezone: string;
  now?: () => number;
}

const DAY_MS = 86_400_000;
const SECTION_HEADING = "font-display text-[17px] leading-[1.6] font-semibold";

const STATE_DOT: Record<BillingStatus["state"], BadgeDot> = {
  disabled: "ink-weak",
  trial: "brand",
  paid: "brand",
  expired: "destructive",
};

const BENEFIT_ICON: Record<BillingBenefit["icon"], LucideIcon> = {
  chat: MessageCircle,
  reminder: BellRing,
  memory: Brain,
  document: FileText,
  calendar: CalendarDays,
  storage: HardDrive,
};

export function BillingPage({
  locale,
  timezone,
  now = Date.now,
}: BillingPageProps) {
  const language = billingLanguage(locale);
  const text = BILLING_COPY[language];
  const pitch = BILLING_PITCH[language];
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
  const hero = pitch.hero[billing.state];

  const until =
    billing.state === "trial"
      ? billing.trialEndsAt
      : (billing.paidUntil ?? billing.trialEndsAt);

  const counting = billing.state === "trial" || billing.state === "paid";
  const periodMs =
    (billing.state === "trial" ? billing.trialDays : billing.durationDays) *
    DAY_MS;

  const leftMs = until ? Math.max(Date.parse(until) - now(), 0) : 0;
  const left = until ? formatBillingRemaining(until, now(), language) : "";

  const saving =
    billing.price < billing.normalPrice
      ? Math.round((1 - billing.price / billing.normalPrice) * 100)
      : 0;

  return (
    <div className="max-w-3xl space-y-6 lg:space-y-10">
      <DomainPageHeader title={text.title} divided={false} />
      <Card className="space-y-8 p-6 sm:p-8">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge dot={STATE_DOT[billing.state]}>{hero.eyebrow}</Badge>
            {billing.environment === "sandbox" && billing.checkoutEnabled ? (
              <Badge dot="warn">{text.sandbox}</Badge>
            ) : null}
          </div>
          <h2 className="font-display text-[28px] leading-[1.15] font-bold tracking-[-0.03em] text-ink sm:text-[36px]">
            {hero.title}
          </h2>
          <p className="max-w-xl text-ink-muted">
            {hero.body(billing.state === "paid" && until ? date(until) : left)}
          </p>
        </div>
        {counting && until ? (
          <div className="space-y-3">
            <p className="font-display text-3xl font-semibold tabular-nums">
              {left}
            </p>
            <progress
              aria-label={text.state[billing.state]}
              value={Math.min(leftMs, periodMs)}
              max={periodMs}
              className="h-2 w-full overflow-hidden rounded-pill bg-hairline [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-hairline [&::-webkit-progress-value]:bg-brand"
            />
            {billing.state === "trial" ? (
              <p className="text-sm text-ink-muted">
                {pitch.endsOn} <time dateTime={until}>{date(until)}</time>
              </p>
            ) : null}
          </div>
        ) : billing.state === "expired" && until ? (
          <p className="text-sm text-ink-muted">
            {pitch.expiredOn} <time dateTime={until}>{date(until)}</time>
          </p>
        ) : null}
        <div className="flex flex-col gap-5 border-t border-hairline pt-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display text-4xl font-bold tracking-[-0.03em] tabular-nums">
                {currency(billing.price)}
              </span>
              <span className="text-ink-muted">{text.term}</span>
              {saving > 0 ? (
                <Badge dot="brand" className="px-2 py-0.5 text-xs">
                  {pitch.save(saving)}
                </Badge>
              ) : null}
            </div>
            {saving > 0 ? (
              <p className="text-sm text-ink-muted">
                {pitch.promo(currency(billing.normalPrice))}
              </p>
            ) : null}
            <p className="max-w-sm text-sm text-ink-muted">{pitch.prepaid}</p>
          </div>
          <div className="space-y-3">
            <BillingCheckout
              billing={billing}
              language={language}
              inline={false}
              quiet
            />
          </div>
        </div>
      </Card>
      <Card className="p-6 sm:p-8">
        <div className="max-w-xl">
          <h2 className={SECTION_HEADING}>{pitch.includedTitle}</h2>
          <p className="mt-2 text-ink-muted">{pitch.includedDescription}</p>
        </div>
        <ul className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {pitch.benefits.map((benefit) => {
            const Icon = BENEFIT_ICON[benefit.icon];

            return (
              <li key={benefit.title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-brand/12 text-brand-deep">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{benefit.title}</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {benefit.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
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
