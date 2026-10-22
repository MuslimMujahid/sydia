import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BellRing,
  Brain,
  CalendarDays,
  ChevronRight,
  FileText,
  HardDrive,
  Infinity as InfinityIcon,
  MessageCircle,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { DomainPageHeader } from "@/components/domain/domain-page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  BILLING_PITCH,
  billingLanguage,
  formatBillingCurrency,
  formatBillingDay,
  type BillingBenefit,
} from "./billing-copy";
import { showTestEnvironment } from "./billing-plan";

interface BillingPageProps {
  locale: string;
  timezone: string;
}

const BENEFIT_ICON: Record<BillingBenefit["icon"], LucideIcon> = {
  chat: MessageCircle,
  reminder: BellRing,
  memory: Brain,
  document: FileText,
  calendar: CalendarDays,
  storage: HardDrive,
  unlimited: InfinityIcon,
  manual: WalletCards,
};

const SECTION_HEADING = "font-display text-[17px] leading-[1.6] font-semibold";

export function BillingPage({ locale, timezone }: BillingPageProps) {
  const language = billingLanguage(locale);
  const text = BILLING_COPY[language];
  const pitch = BILLING_PITCH[language];
  const status = useQuery(billingStatusQueryOptions());
  const orders = useQuery(billingOrdersQueryOptions());
  const currency = (value: number) => formatBillingCurrency(value, language);
  const date = (value: string) => formatBillingDay(value, language, timezone);
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
  const trialing = billing.state === "trial";

  return (
    <div className="max-w-3xl space-y-6 lg:space-y-10">
      <DomainPageHeader title={text.title} divided={false} />
      <Card className="border-brand/40 p-6 sm:p-8">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-10">
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="font-display text-[17px] font-semibold">
                {pitch.planName}
              </p>
              <h2 className="font-display text-[28px] leading-[1.15] font-bold tracking-[-0.03em] text-ink">
                {hero.title(billing.trialDays)}
              </h2>
              <p className="text-ink-muted">{hero.body}</p>
            </div>
            <BillingCheckout
              billing={billing}
              language={language}
              inline={false}
              quiet
              fullWidth
            />
            <div>
              <p className="flex items-baseline gap-2">
                <span className="font-display text-4xl font-bold tracking-[-0.03em] tabular-nums">
                  {currency(billing.price)}
                </span>
                {billing.price < billing.normalPrice ? (
                  <del
                    className="text-ink-muted tabular-nums"
                    aria-label={text.normal}
                  >
                    {currency(billing.normalPrice)}
                  </del>
                ) : null}
              </p>
              <p className="mt-1 text-ink-muted">
                {trialing ? `${pitch.afterTrial}, ` : null}
                {text.term}
              </p>
              {showTestEnvironment(billing) ? (
                <p className="mt-3 text-xs text-ink-weak">{text.sandbox}</p>
              ) : null}
            </div>
          </div>
          <div className="space-y-4">
            <p className="font-semibold text-ink">{pitch.tagline}</p>
            <ul className="space-y-4">
              {pitch.benefits.map((benefit) => {
                const Icon = BENEFIT_ICON[benefit.icon];

                return (
                  <li key={benefit.text} className="flex items-start gap-3">
                    <Icon
                      className="mt-0.5 size-5 shrink-0 text-ink-muted"
                      aria-hidden="true"
                    />
                    {benefit.text}
                  </li>
                );
              })}
            </ul>
          </div>
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
            <ul className="divide-y divide-hairline rounded-md border border-hairline">
              {orders.data.map((order) => {
                const row = (
                  <>
                    <span className="font-semibold">{text.plan}</span>
                    <time
                      dateTime={order.createdAt}
                      className="text-ink-muted sm:w-28"
                    >
                      {date(order.createdAt)}
                    </time>
                    <span className="text-ink-muted sm:w-28">
                      {text.order[order.status]}
                    </span>
                    <span className="tabular-nums sm:w-24 sm:text-right">
                      {currency(order.amount)}
                    </span>
                  </>
                );

                return (
                  <li key={order.id}>
                    {order.status === "paid" ? (
                      <Link
                        to="/receipt/$orderId"
                        params={{ orderId: order.id }}
                        className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3.5 hover:bg-surface-1 sm:flex-nowrap [&>:first-child]:flex-1"
                      >
                        {row}
                        <ChevronRight
                          className="hidden size-4 shrink-0 text-ink-muted sm:block"
                          aria-hidden="true"
                        />
                      </Link>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5 sm:flex-nowrap [&>:first-child]:flex-1">
                        {row}
                        {order.id !== pending?.id &&
                        order.status === "pending" ? (
                          <BillingPaymentActions
                            order={order}
                            language={language}
                          />
                        ) : null}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
