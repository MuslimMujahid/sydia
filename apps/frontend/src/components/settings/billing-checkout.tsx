import { useRef, useState, type FormEvent } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
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
            className={buttonVariants({ variant: "dark" })}
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

interface BillingCheckoutProps {
  billing: BillingStatus;
  language: BillingLanguage;
}

/** The single payment flow: open invoice status, or the invoice request form. */
export function BillingCheckout({ billing, language }: BillingCheckoutProps) {
  const text = BILLING_COPY[language];
  const client = useQueryClient();
  const orders = useQuery(billingOrdersQueryOptions());
  const [mobile, setMobile] = useState("");
  const key = useRef<string | undefined>(undefined);

  const checkout = useMutation({
    mutationFn: createBillingCheckout,
    onSuccess: async (order) => {
      if (order.status === "failed" || order.status === "expired")
        key.current = undefined;
      await invalidateBilling(client);
    },
  });

  const pending = findOpenBillingOrder(orders.data);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    key.current ??= crypto.randomUUID();
    checkout.mutate({ mobile, idempotencyKey: key.current });
  };

  return (
    <>
      {pending ? (
        <div className="space-y-3" role="status">
          <p>
            {pending.status === "review"
              ? text.review
              : text.order[pending.status]}
          </p>
          <BillingPaymentActions order={pending} language={language} />
        </div>
      ) : billing.checkoutEnabled && !orders.isError ? (
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
          <p id="billing-phone-help" className="text-sm text-ink-muted">
            {text.phoneHelp}
          </p>
          <Button
            type="submit"
            className="relative isolate overflow-hidden before:absolute before:inset-0 before:-z-10 before:bg-ink/50"
            disabled={checkout.isPending || orders.isPending}
          >
            {checkout.isPending
              ? text.creating
              : `${text.create} · ${formatBillingCurrency(billing.price, language)}`}
          </Button>
        </form>
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
