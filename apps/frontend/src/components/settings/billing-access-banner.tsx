import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { billingStatusQueryOptions } from "@/lib/services/api/billing/billing.api";

interface BillingAccessBannerProps {
  locale: string;
}

export function BillingAccessBanner({ locale }: BillingAccessBannerProps) {
  const status = useQuery(billingStatusQueryOptions());
  const english = locale === "en";
  if (status.isError)
    return (
      <p role="alert" className="mb-5 text-sm text-destructive">
        {english
          ? "Subscription status could not be loaded."
          : "Status langganan belum dapat dimuat."}{" "}
        <button
          type="button"
          className="underline underline-offset-4"
          onClick={() => void status.refetch()}
        >
          {english ? "Try again" : "Coba lagi"}
        </button>
      </p>
    );
  if (!status.data || status.data.active) return null;

  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-1 p-4 text-sm"
    >
      <p>
        {english
          ? "Access expired. Your data is available in read-only mode."
          : "Masa aktif habis. Data Anda tersedia dalam mode baca saja."}
      </p>
      <Link
        to="/settings/billing"
        className="font-semibold text-ink underline underline-offset-4"
      >
        {english ? "Renew subscription" : "Perpanjang langganan"}
      </Link>
    </div>
  );
}
