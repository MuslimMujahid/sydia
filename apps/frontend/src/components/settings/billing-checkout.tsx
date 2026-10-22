import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  billingKeys,
  billingOrdersQueryOptions,
  createBillingCheckout,
  refreshBillingOrder,
  type BillingOrder,
  type BillingStatus,
} from "@/lib/services/api/billing/billing.api";
import {
  BILLING_COPY,
  formatBillingCurrency,
  type BillingLanguage,
} from "./billing-copy";

const invalidateBilling = (client: QueryClient) =>
  Promise.all([
    client.invalidateQueries({ queryKey: billingKeys.status }),
    client.invalidateQueries({ queryKey: billingKeys.orders }),
  ]);

export function findOpenBillingOrder(orders: BillingOrder[] | undefined) {
  return orders?.find((order) =>
    ["creating", "pending", "review"].includes(order.status)
  );
}

interface BillingPaymentActionsProps {
  order: BillingOrder;
  language: BillingLanguage;
}

export function BillingPaymentActions({
  order,
  language,
}: BillingPaymentActionsProps) {
  const text = BILLING_COPY[language];
  const client = useQueryClient();
  const refresh = useMutation({
    mutationFn: refreshBillingOrder,
    onSuccess: () => invalidateBilling(client),
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {order.paymentUrl && order.status === "pending" ? (
          <a
            href={order.paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {text.pay}
            <ExternalLink className="size-4" />
          </a>
        ) : null}
        {order.status === "pending" ||
        (order.status === "review" && order.paymentUrl) ? (
          <Button
            type="button"
            variant="dark-outline"
            size="sm"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate(order.id)}
          >
            <RefreshCw className="size-4" />
            {text.check}
          </Button>
        ) : null}
      </div>
      {refresh.error ? (
        <p role="alert" className="text-sm text-destructive">
          {refresh.error.message}
        </p>
      ) : null}
    </div>
  );
}

const AUTO_VERIFY_INTERVAL_MS = 10_000;

/**
 * Verifies an unpaid invoice with the provider while the tab is visible, and
 * as soon as the user comes back from paying, so access appears without a
 * manual refresh. Provider outages are retried silently on the next tick.
 */
export function useAutoVerifyOrder(order: BillingOrder | undefined) {
  const client = useQueryClient();
  const id = order?.status === "pending" ? order.id : undefined;

  useEffect(() => {
    if (!id) return;

    const verify = () => {
      if (document.visibilityState !== "visible") return;
      refreshBillingOrder(id)
        .then((result) =>
          result.status === "pending" ? undefined : invalidateBilling(client)
        )
        .catch(() => undefined);
    };

    const timer = window.setInterval(verify, AUTO_VERIFY_INTERVAL_MS);
    document.addEventListener("visibilitychange", verify);
    window.addEventListener("focus", verify);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", verify);
      window.removeEventListener("focus", verify);
    };
  }, [client, id]);
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

type BillingCheckoutFlowOptions = {
  /** Keep a "preparing" state visible at least this long so it never flashes. */
  minimumMs?: number;
};

/** Invoice request state shared by the inline form and the checkout page. */
export function useBillingCheckoutFlow({
  minimumMs = 0,
}: BillingCheckoutFlowOptions = {}) {
  const client = useQueryClient();
  const orders = useQuery(billingOrdersQueryOptions());
  const [mobile, setMobile] = useState("");
  const key = useRef<string | undefined>(undefined);

  const checkout = useMutation({
    mutationFn: async (input: { mobile: string; idempotencyKey: string }) => {
      const [order] = await Promise.all([
        createBillingCheckout(input),
        wait(minimumMs),
      ]);

      return order;
    },
    onSuccess: async (order) => {
      if (order.status === "failed" || order.status === "expired")
        key.current = undefined;
      await invalidateBilling(client);
    },
  });

  const pending = findOpenBillingOrder(orders.data);
  useAutoVerifyOrder(pending);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    key.current ??= crypto.randomUUID();
    checkout.mutate({ mobile, idempotencyKey: key.current });
  };

  return { orders, pending, mobile, setMobile, checkout, submit };
}

interface BillingCheckoutProps {
  billing: BillingStatus;
  language: BillingLanguage;
  /**
   * Show the invoice form here (onboarding). Otherwise the action is a link to
   * the checkout page, where the order summary and payment hand-off live.
   */
  inline?: boolean;
  /** For a paid account, show nothing (the page already says it is paid). */
  quiet?: boolean;
  /** Stretch the action across its container (plan card). */
  fullWidth?: boolean;
}

/** The single payment flow: open invoice status, or the way to request one. */
export function BillingCheckout({
  billing,
  language,
  inline = true,
  quiet = false,
  fullWidth = false,
}: BillingCheckoutProps) {
  const text = BILLING_COPY[language];
  const { orders, pending, mobile, setMobile, checkout, submit } =
    useBillingCheckoutFlow();

  const paid = billing.state === "paid" && !pending;
  const action = text.subscribe;

  return (
    <>
      {paid ? (
        quiet ? null : (
          <div className="space-y-3">
            <p role="status" className="font-semibold">
              {text.paidNotice}
            </p>
            <p className="max-w-prose text-sm text-ink-muted">
              {text.renewHint}
            </p>
          </div>
        )
      ) : pending ? (
        <div className="space-y-3" role="status">
          <p>
            {pending.status === "review"
              ? text.review
              : text.order[pending.status]}
          </p>
          <BillingPaymentActions order={pending} language={language} />
        </div>
      ) : billing.checkoutEnabled && !orders.isError ? (
        inline ? (
          <form onSubmit={submit} className="max-w-sm space-y-3">
            <label
              htmlFor="billing-phone"
              className="block text-sm font-semibold"
            >
              {text.phone}
            </label>
            <Input
              id="billing-phone"
              type="tel"
              autoComplete="tel"
              required
              pattern="[+0-9 ()-]{8,24}"
              maxLength={24}
              value={mobile}
              onChange={(event) => setMobile(event.target.value)}
              aria-describedby="billing-phone-help"
              disabled={checkout.isPending || orders.isPending}
            />
            <p id="billing-phone-help" className="text-xs text-ink-muted">
              {text.phoneHelp}
            </p>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={checkout.isPending || orders.isPending}
            >
              {checkout.isPending
                ? text.creating
                : `${text.create} · ${formatBillingCurrency(billing.price, language)}`}
            </Button>
          </form>
        ) : (
          <Link
            to="/checkout"
            className={cn(
              buttonVariants({
                variant: "secondary",
                size: fullWidth ? "default" : "sm",
              }),
              fullWidth && "w-full"
            )}
          >
            {`${action} · ${formatBillingCurrency(billing.price, language)}`}
          </Link>
        )
      ) : !billing.checkoutEnabled ? (
        <p className="text-sm text-ink-muted">{text.unavailable}</p>
      ) : null}
      {checkout.data?.status === "failed" ? (
        <p role="alert">{text.order.failed}</p>
      ) : null}
      {checkout.error ? (
        <p role="alert" className="text-sm text-destructive">
          {checkout.error.message}
        </p>
      ) : null}
    </>
  );
}
