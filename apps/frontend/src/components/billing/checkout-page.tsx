import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft } from "lucide-react";
import { PaymentLoadingScreen } from "@/components/billing/payment-loading-screen";
import { ErrorState, LoadingState } from "@/components/app-states";
import { BillingPaymentActions } from "@/components/settings/billing-checkout";
import { useBillingCheckoutFlow } from "@/components/settings/billing-checkout";
import {
  BILLING_COPY,
  billingLanguage,
  formatBillingCurrency,
  type BillingLanguage,
} from "@/components/settings/billing-copy";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { showTestEnvironment } from "@/components/settings/billing-plan";
import { billingStatusQueryOptions } from "@/lib/services/api/billing/billing.api";

const LOADING_MINIMUM_MS = 1_800;

const COPY: Record<
  BillingLanguage,
  {
    title: string;
    back: string;
    contact: string;
    contactDescription: string;
    payWith: string;
    payWithDescription: string;
    plan: string;
    features: readonly string[];
    term: string;
    due: string;
    subscribe: string;
    terms: string;
    waitingTitle: string;
    waitingDescription: string;
    successTitle: string;
    successDescription: string;
    start: string;
    unavailable: string;
    activeTitle: string;
    activeDescription: string;
  }
> = {
  id: {
    title: "Ringkasan pesanan",
    back: "Kembali ke langganan",
    contact: "Kontak tagihan",
    contactDescription:
      "Nomor telepon dipakai untuk tagihan dan bukti pembayaran.",
    payWith: "Bayar dengan",
    payWithDescription:
      "Setelah Anda menekan Berlangganan, Sydia menyiapkan tagihan lalu mengarahkan Anda ke Mayar untuk memilih metode pembayaran yang tersedia dengan aman.",
    plan: "Sydia",
    features: [
      "Semua fitur Sydia",
      "Penyimpanan 10 GB",
      "Maksimal 100 MB per file",
    ],
    term: "Langganan 30 hari",
    due: "Jatuh tempo hari ini",
    subscribe: "Berlangganan",
    terms:
      "Pembayaran di muka untuk 30 hari, tanpa penagihan otomatis. Perpanjangan dilakukan manual, dan harga promo berlaku sampai promo diubah.",
    waitingTitle: "Selesaikan pembayaran di Mayar",
    waitingDescription:
      "Buka halaman pembayaran di tab baru, lalu kembali ke sini. Sydia memeriksa pembayaran Anda secara otomatis.",
    successTitle: "Pembayaran diterima",
    successDescription:
      "Terima kasih. Langganan Anda sudah aktif dan semua fitur Sydia dapat Anda gunakan.",
    start: "Mulai gunakan Sydia",
    unavailable: "Pembayaran belum tersedia. Hubungi dukungan Sydia.",
    activeTitle: "Langganan Anda sudah aktif",
    activeDescription:
      "Semua fitur Sydia siap Anda pakai. Perpanjangan tersedia setelah masa aktif berakhir.",
  },
  en: {
    title: "Order summary",
    back: "Back to subscription",
    contact: "Billing contact",
    contactDescription:
      "Your phone number is used for the invoice and receipt.",
    payWith: "Pay with",
    payWithDescription:
      "After you press Subscribe, Sydia prepares your invoice and sends you to Mayar to choose from the available payment methods securely.",
    plan: "Sydia",
    features: ["Every Sydia feature", "10 GB storage", "Up to 100 MB per file"],
    term: "30-day subscription",
    due: "Due today",
    subscribe: "Subscribe",
    terms:
      "Prepaid for 30 days with no automatic billing. Renewal is manual, and the promotional price applies until the promotion changes.",
    waitingTitle: "Finish paying on Mayar",
    waitingDescription:
      "Open the payment page in a new tab, then come back here. Sydia checks your payment automatically.",
    successTitle: "Payment received",
    successDescription:
      "Thank you. Your subscription is active and every Sydia feature is available.",
    start: "Start using Sydia",
    unavailable: "Payments are not available yet. Contact Sydia support.",
    activeTitle: "Your subscription is active",
    activeDescription:
      "Every Sydia feature is ready for you. Renewal opens once your current period ends.",
  },
};

interface CheckoutPageProps {
  locale: string;
}

export function CheckoutPage({ locale }: CheckoutPageProps) {
  const language = billingLanguage(locale);
  const text = COPY[language];
  const shared = BILLING_COPY[language];
  const status = useQuery(billingStatusQueryOptions());
  const { orders, pending, mobile, setMobile, checkout, submit } =
    useBillingCheckoutFlow({ minimumMs: LOADING_MINIMUM_MS });

  // The invoice this visit is waiting on; once it is paid we celebrate it.
  const [awaitedId, setAwaitedId] = useState<string>();

  if (pending?.status === "pending" && awaitedId !== pending.id)
    setAwaitedId(pending.id);

  const succeeded = Boolean(
    awaitedId &&
    orders.data?.some(
      (order) => order.id === awaitedId && order.status === "paid"
    )
  );

  if (checkout.isPending) return <PaymentLoadingScreen language={language} />;
  if (status.isPending) return <LoadingState />;
  if (status.isError)
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <ErrorState
          message={status.error.message}
          onRetry={() => void status.refetch()}
        />
      </main>
    );

  const billing = status.data;
  const currency = (value: number) => formatBillingCurrency(value, language);
  const available = billing.enforced && billing.checkoutEnabled;

  return (
    <main className="min-h-screen bg-background px-5 py-8 sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3 sm:mb-12">
          <Link
            to="/settings/billing"
            aria-label={text.back}
            className="inline-flex size-10 items-center justify-center rounded-pill text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <h1 className="font-display text-[28px] leading-[1.15] font-bold tracking-[-0.03em] text-ink sm:text-[36px]">
            {text.title}
          </h1>
        </div>
        {succeeded ? (
          <Card className="mx-auto max-w-xl space-y-4 p-6 sm:p-8" role="status">
            <span className="flex size-10 items-center justify-center rounded-pill bg-brand/12 text-brand-deep">
              <Check className="size-5" />
            </span>
            <h2 className="font-display text-xl font-semibold">
              {text.successTitle}
            </h2>
            <p className="text-ink-muted">{text.successDescription}</p>
            <Link
              to="/"
              search={{ conversation: undefined, attachment: undefined }}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              {text.start}
            </Link>
          </Card>
        ) : !available ? (
          <p className="text-ink-muted">{text.unavailable}</p>
        ) : pending ? (
          <Card className="mx-auto max-w-xl space-y-4 p-6 sm:p-8">
            <h2 className="font-display text-xl font-semibold">
              {pending.status === "review"
                ? shared.order.review
                : text.waitingTitle}
            </h2>
            <p className="text-ink-muted">
              {pending.status === "review"
                ? shared.review
                : text.waitingDescription}
            </p>
            <BillingPaymentActions order={pending} language={language} />
          </Card>
        ) : billing.state === "paid" ? (
          <Card className="mx-auto max-w-xl space-y-4 p-6 sm:p-8" role="status">
            <h2 className="font-display text-xl font-semibold">
              {text.activeTitle}
            </h2>
            <p className="text-ink-muted">{text.activeDescription}</p>
            <Link
              to="/"
              search={{ conversation: undefined, attachment: undefined }}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              {text.start}
            </Link>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
            <div className="space-y-6">
              <Card className="p-6 sm:p-8">
                <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
                  {text.contact}
                </h2>
                <p
                  id="checkout-contact-description"
                  className="mt-2 max-w-xl text-ink-muted"
                >
                  {text.contactDescription}
                </p>
                <form
                  id="checkout-form"
                  onSubmit={submit}
                  className="mt-6 max-w-sm space-y-2"
                >
                  <label
                    htmlFor="checkout-phone"
                    className="block text-sm font-semibold"
                  >
                    {shared.phone}
                  </label>
                  <Input
                    id="checkout-phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    pattern="[+0-9 ()-]{8,24}"
                    maxLength={24}
                    value={mobile}
                    onChange={(event) => setMobile(event.target.value)}
                    aria-describedby="checkout-contact-description"
                    disabled={orders.isPending}
                  />
                  <p className="text-xs text-ink-muted">{shared.phoneHelp}</p>
                </form>
              </Card>
              <Card className="p-6 sm:p-8">
                <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
                  {text.payWith}
                </h2>
                <p className="mt-2 max-w-xl text-ink-muted">
                  {text.payWithDescription}
                </p>
              </Card>
            </div>
            <div className="space-y-4">
              <Card className="space-y-6 p-6 sm:p-8">
                {showTestEnvironment(billing) ? (
                  <p
                    role="status"
                    className="text-sm font-semibold text-ink-muted"
                  >
                    {shared.sandbox}
                  </p>
                ) : null}
                <div className="space-y-4">
                  <h2 className="font-display text-2xl font-semibold">
                    {text.plan}
                  </h2>
                  <ul className="space-y-2">
                    {text.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="mt-1 size-4 shrink-0 text-brand-deep" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <dl className="space-y-3 border-t border-hairline pt-6 tabular-nums">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-muted">{text.term}</dt>
                    <dd className="flex items-baseline gap-2">
                      {billing.price < billing.normalPrice ? (
                        <del
                          className="text-sm text-ink-muted"
                          aria-label={shared.normal}
                        >
                          {currency(billing.normalPrice)}
                        </del>
                      ) : null}
                      {currency(billing.price)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 font-semibold">
                    <dt>{text.due}</dt>
                    <dd className="font-display text-xl">
                      {currency(billing.price)}
                    </dd>
                  </div>
                </dl>
                <Button
                  type="submit"
                  form="checkout-form"
                  variant="secondary"
                  className="w-full"
                  disabled={orders.isPending}
                >
                  {text.subscribe}
                </Button>
                {checkout.data?.status === "failed" ? (
                  <p role="alert" className="text-sm text-destructive">
                    {shared.order.failed}
                  </p>
                ) : null}
                {checkout.error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {checkout.error.message}
                  </p>
                ) : null}
              </Card>
              <p className="px-1 text-xs text-ink-muted">{text.terms}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
