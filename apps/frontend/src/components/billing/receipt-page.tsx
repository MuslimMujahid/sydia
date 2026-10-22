import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Printer } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/app-states";
import {
  billingLanguage,
  formatBillingCurrency,
  formatPaymentMethod,
} from "@/components/settings/billing-copy";
import { Button } from "@/components/ui/button";
import { SydiaLogo } from "@/components/ui/sydia-logo";
import { billingOrdersQueryOptions } from "@/lib/services/api/billing/billing.api";

const COPY = {
  id: {
    title: "Struk pembayaran",
    back: "Kembali ke langganan",
    print: "Unduh resi",
    invoiceNumber: "Nomor invoice",
    receiptNumber: "Nomor struk",
    datePaid: "Tanggal bayar",
    seller: "Dari",
    billTo: "Ditagihkan kepada",
    via: (method: string) => `Dibayar melalui ${method}`,
    paidOn: (amount: string, date: string) => `${amount} dibayar pada ${date}`,
    description: "Deskripsi",
    qty: "Jml",
    unitPrice: "Harga satuan",
    amount: "Jumlah",
    plan: (days: number) => `Langganan Sydia · ${days} hari`,
    subtotal: "Subtotal",
    total: "Total",
    amountPaid: "Jumlah dibayar",
    history: "Riwayat pembayaran",
    method: "Metode pembayaran",
    date: "Tanggal",
    notFound:
      "Struk tidak ditemukan. Struk hanya tersedia untuk pembayaran yang sudah lunas.",
  },
  en: {
    title: "Receipt",
    back: "Back to subscription",
    print: "Download receipt",
    invoiceNumber: "Invoice number",
    receiptNumber: "Receipt number",
    datePaid: "Date paid",
    seller: "From",
    billTo: "Bill to",
    via: (method: string) => `Paid through ${method}`,
    paidOn: (amount: string, date: string) => `${amount} paid on ${date}`,
    description: "Description",
    qty: "Qty",
    unitPrice: "Unit price",
    amount: "Amount",
    plan: (days: number) => `Sydia subscription · ${days} days`,
    subtotal: "Subtotal",
    total: "Total",
    amountPaid: "Amount paid",
    history: "Payment history",
    method: "Payment method",
    date: "Date",
    notFound:
      "Receipt not found. Receipts are only available for completed payments.",
  },
} as const;

interface ReceiptPageProps {
  orderId: string;
  locale: string;
  timezone: string;
  name: string;
  email: string;
}

export function ReceiptPage({
  orderId,
  locale,
  timezone,
  name,
  email,
}: ReceiptPageProps) {
  const language = billingLanguage(locale);
  const text = COPY[language];
  const orders = useQuery(billingOrdersQueryOptions());

  if (orders.isPending) return <LoadingState />;
  if (orders.isError)
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <ErrorState
          message={orders.error.message}
          onRetry={() => void orders.refetch()}
        />
      </main>
    );

  const order = orders.data.find((item) => item.id === orderId);
  const paidAt = order?.status === "paid" ? order.appliedAt : null;
  const suffix = order ? order.id.slice(-8).toUpperCase() : "";
  const invoiceNumber = `INV-${suffix}`;
  const receiptNumber = `SYD-${suffix}`;
  const method = formatPaymentMethod(order?.paymentMethod ?? null, language);
  const total = order ? formatBillingCurrency(order.amount, language) : "";

  const paidDate = paidAt
    ? new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-US", {
        dateStyle: "long",
        timeZone: timezone,
      }).format(new Date(paidAt))
    : "";

  return (
    <main className="min-h-screen bg-background px-5 py-8 sm:px-8 lg:py-12 print:bg-white print:p-0">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center justify-between gap-4 print:hidden">
          <Link
            to="/settings/billing"
            className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"
          >
            <ChevronLeft className="size-4" />
            {text.back}
          </Link>
          {order && paidAt ? (
            <Button
              type="button"
              variant="dark-outline"
              size="icon-sm"
              aria-label={text.print}
              title={text.print}
              onClick={() => window.print()}
            >
              <Printer />
            </Button>
          ) : null}
        </div>
        {order && paidAt ? (
          <>
            <article className="space-y-10 rounded-lg border border-ink/6 bg-white p-6 text-black shadow-card sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
              <header className="flex items-start justify-between gap-4">
                <div className="space-y-4">
                  <h1 className="font-display text-3xl font-bold">
                    {text.title}
                  </h1>
                  <dl className="space-y-1 text-sm">
                    <MetaRow label={text.invoiceNumber}>
                      {invoiceNumber}
                    </MetaRow>
                    <MetaRow label={text.receiptNumber}>
                      {receiptNumber}
                    </MetaRow>
                    <MetaRow label={text.datePaid}>{paidDate}</MetaRow>
                  </dl>
                </div>
                <SydiaLogo className="h-10" />
              </header>
              <div className="grid gap-6 text-sm sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="font-semibold">{text.seller}</p>
                  <p>Sydia</p>
                  <p>{text.via(method)}</p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold">{text.billTo}</p>
                  <p>{name}</p>
                  <p>{email}</p>
                </div>
              </div>
              <h2 className="font-display text-xl font-bold">
                {text.paidOn(total, paidDate)}
              </h2>
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-black text-xs">
                    <th className="pb-2 text-left font-normal">
                      {text.description}
                    </th>
                    <th className="pb-2 text-right font-normal">{text.qty}</th>
                    <th className="pb-2 text-right font-normal">
                      {text.unitPrice}
                    </th>
                    <th className="pb-2 text-right font-normal">
                      {text.amount}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-3">{text.plan(order.durationDays)}</td>
                    <td className="py-3 text-right">1</td>
                    <td className="py-3 text-right">{total}</td>
                    <td className="py-3 text-right">{total}</td>
                  </tr>
                </tbody>
              </table>
              <dl className="ml-auto w-full max-w-xs space-y-1 text-sm tabular-nums">
                <TotalRow label={text.subtotal} value={total} />
                <TotalRow label={text.total} value={total} />
                <TotalRow label={text.amountPaid} value={total} strong />
              </dl>
              <section className="space-y-3">
                <h2 className="font-display text-xl font-bold">
                  {text.history}
                </h2>
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-black text-xs">
                      <th className="pb-2 text-left font-normal">
                        {text.method}
                      </th>
                      <th className="pb-2 text-left font-normal">
                        {text.date}
                      </th>
                      <th className="pb-2 text-right font-normal">
                        {text.amountPaid}
                      </th>
                      <th className="pb-2 text-right font-normal">
                        {text.receiptNumber}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-3">{method}</td>
                      <td className="py-3">{paidDate}</td>
                      <td className="py-3 text-right">{total}</td>
                      <td className="py-3 text-right">{receiptNumber}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
            </article>
          </>
        ) : (
          <p role="alert" className="text-ink-muted">
            {text.notFound}
          </p>
        )}
      </div>
    </main>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <dt className="w-32 font-semibold">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={
        strong
          ? "flex justify-between gap-4 font-bold"
          : "flex justify-between gap-4 border-b border-black/10 pb-1"
      }
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
