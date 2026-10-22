import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import { DomainPageHeader } from "@/components/domain/domain-page";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  billingKeys,
  billingOrdersQueryOptions,
  billingStatusQueryOptions,
  createBillingCheckout,
  refreshBillingOrder,
  type BillingOrder,
} from "@/lib/services/api/billing/billing.api";

interface BillingPageProps {
  locale: string;
  timezone: string;
}

const labels = {
  id: {
    title: "Langganan",
    state: {
      disabled: "Pembayaran belum dibuka",
      trial: "Trial aktif",
      paid: "Langganan aktif",
      expired: "Masa aktif habis",
    },
    normal: "Harga normal",
    term: "per 30 hari",
    until: "Aktif hingga",
    expiredOn: "Berakhir pada",
    features: "Semua fitur · penyimpanan 10 GB · maksimal 100 MB per file",
    renewal:
      "Perpanjangan manual. Harga promo berlaku untuk pembelian dan perpanjangan sampai promo diubah.",
    phone: "Nomor telepon untuk tagihan",
    phoneHelp: "Gunakan nomor dengan kode negara, misalnya +6281234567890.",
    create: "Buat tagihan",
    creating: "Menyiapkan tagihan…",
    pay: "Bayar melalui Mayar",
    check: "Periksa pembayaran",
    history: "Riwayat pembayaran",
    empty: "Belum ada pembayaran.",
    storage: "Penyimpanan",
    used: "terpakai dari 10 GB",
    readOnly:
      "Akses baca saja. Data tetap bisa dibaca, diunduh, dan dihapus. Perpanjang untuk kembali menggunakan asisten dan mengubah data.",
    review:
      "Tagihan ini sedang diperiksa. Hubungi dukungan Sydia dan jangan membuat pembayaran ulang.",
    unavailable: "Pembayaran belum tersedia. Hubungi dukungan Sydia.",
    retry: "Coba lagi",
    loading: "Memuat langganan…",
    sandbox: "Mode uji — pembayaran sandbox",
    order: {
      creating: "Menyiapkan tagihan",
      pending: "Menunggu pembayaran",
      paid: "Lunas",
      review: "Sedang diperiksa",
      failed: "Tagihan gagal dibuat",
      expired: "Tagihan kedaluwarsa",
    },
  },
  en: {
    title: "Subscription",
    state: {
      disabled: "Payments are not open yet",
      trial: "Trial active",
      paid: "Subscription active",
      expired: "Access expired",
    },
    normal: "Regular price",
    term: "per 30 days",
    until: "Active until",
    expiredOn: "Expired on",
    features: "All features · 10 GB storage · up to 100 MB per file",
    renewal:
      "Manual renewal. Promotional pricing applies to purchases and renewals until the promotion changes.",
    phone: "Billing phone number",
    phoneHelp: "Include your country code, for example +6281234567890.",
    create: "Create invoice",
    creating: "Preparing invoice…",
    pay: "Pay with Mayar",
    check: "Check payment",
    history: "Payment history",
    empty: "No payments yet.",
    storage: "Storage",
    used: "used of 10 GB",
    readOnly:
      "Read-only access. You can still read, download, and delete your data. Renew to use the assistant and make changes again.",
    review:
      "This invoice needs review. Contact Sydia support and do not make another payment.",
    unavailable: "Payments are not available yet. Contact Sydia support.",
    retry: "Try again",
    loading: "Loading subscription…",
    sandbox: "Test mode — sandbox payments",
    order: {
      creating: "Preparing invoice",
      pending: "Awaiting payment",
      paid: "Paid",
      review: "Under review",
      failed: "Invoice creation failed",
      expired: "Invoice expired",
    },
  },
};

export function BillingPage({ locale, timezone }: BillingPageProps) {
  const language = locale === "en" ? "en" : "id";
  const text = labels[language];
  const status = useQuery(billingStatusQueryOptions());
  const orders = useQuery(billingOrdersQueryOptions());
  const client = useQueryClient();
  const [mobile, setMobile] = useState("");
  const key = useRef<string | undefined>(undefined);

  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: billingKeys.status }),
      client.invalidateQueries({ queryKey: billingKeys.orders }),
    ]);
  };

  const checkout = useMutation({
    mutationFn: createBillingCheckout,
    onSuccess: async (order) => {
      if (order.status === "failed" || order.status === "expired")
        key.current = undefined;
      await invalidate();
    },
  });

  const refresh = useMutation({
    mutationFn: refreshBillingOrder,
    onSuccess: invalidate,
  });

  const currency = (value: number) =>
    new Intl.NumberFormat(language === "id" ? "id-ID" : "en-US", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value);

  const date = (value: string) =>
    new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    key.current ??= crypto.randomUUID();
    checkout.mutate({ mobile, idempotencyKey: key.current });
  };

  const pending = orders.data?.find((order) =>
    ["creating", "pending", "review"].includes(order.status)
  );

  const paymentAction = (order: BillingOrder) => (
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
          variant="dark-outline"
          disabled={refresh.isPending}
          onClick={() => refresh.mutate(order.id)}
        >
          <RefreshCw className="size-4" />
          {text.check}
        </Button>
      ) : null}
    </div>
  );

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
        {pending ? (
          <div className="space-y-3" role="status">
            <p>
              {pending.status === "review"
                ? text.review
                : text.order[pending.status]}
            </p>
            {paymentAction(pending)}
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
                : `${text.create} · ${currency(billing.price)}`}
            </Button>
          </form>
        ) : !billing.checkoutEnabled ? (
          <p className="text-sm text-ink-muted">{text.unavailable}</p>
        ) : null}
        {checkout.data?.status === "failed" ? (
          <p role="alert">{text.order.failed}</p>
        ) : null}
        {checkout.error || refresh.error ? (
          <p role="alert" className="text-sm text-destructive">
            {(checkout.error ?? refresh.error)?.message}
          </p>
        ) : null}
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
                {order.id !== pending?.id && order.status === "pending"
                  ? paymentAction(order)
                  : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
