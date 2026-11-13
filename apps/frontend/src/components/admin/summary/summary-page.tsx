import { Activity, AlertTriangle } from "lucide-react";
import {
  AnalyticsSkeleton,
  EmptyState,
  ErrorBanner,
  PageHeader,
  PeriodBar,
  SectionHeader,
} from "../analytics/widgets";
import { formatCount } from "../format";
import type { AdminSummary, AnalyticsPageProps } from "../types";
import { AttentionList } from "./attention-list";
import { ChannelsAccounts } from "./channels-accounts";
import { MoversList } from "./movers-list";
import { versusLabel } from "./summary-format";
import { SummaryKpis } from "./summary-kpis";
import { SummaryTrends } from "./summary-trends";

/** No messages, users or spend: charts would only draw empty axes. */
export function isQuietWindow(data: AdminSummary): boolean {
  const { current } = data;

  return (
    current.messages === 0 && current.activeUsers === 0 && current.costUsd === 0
  );
}

function SummaryContent({
  data,
  period,
}: {
  data: AdminSummary;
  period: AdminSummary["period"];
}) {
  const quiet = isQuietWindow(data);

  return (
    <>
      <SummaryKpis data={data} />
      <div className="grid gap-x-4 gap-y-8 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="summary-attention" className="min-w-0">
          <SectionHeader
            id="summary-attention"
            title="Perlu perhatian"
            meta={
              data.attention.length
                ? `${formatCount(data.attention.length)} hal`
                : undefined
            }
          />
          <AttentionList data={data} period={period} />
        </section>
        <section aria-labelledby="summary-movers" className="min-w-0">
          <SectionHeader
            id="summary-movers"
            title="Perubahan terbesar"
            meta={versusLabel(data.period)}
          />
          <MoversList movers={data.movers} period={period} />
        </section>
      </div>
      {quiet ? (
        <EmptyState
          icon={Activity}
          title="Belum ada aktivitas pada periode ini"
          description="Grafik akan muncul setelah pengguna mengirim pesan atau ada proses yang berjalan."
        />
      ) : (
        <>
          <SummaryTrends data={data} />
          <ChannelsAccounts data={data} />
        </>
      )}
    </>
  );
}

/** The admin landing page: headline figures, what needs attention, and trends. */
export function SummaryPage({
  period,
  onPeriodChange,
  data,
  error,
  isFetching,
  onRetry,
}: AnalyticsPageProps<AdminSummary>) {
  const failed = error !== null;

  return (
    <div className="min-w-0 space-y-8">
      <div className="space-y-5">
        <PageHeader
          title="Ringkasan"
          description="Pemakaian, biaya, dan pendapatan pada periode yang dipilih."
        />
        <PeriodBar
          period={period}
          onPeriodChange={onPeriodChange}
          onRefresh={onRetry}
          isFetching={isFetching}
          window={data}
          status={
            data ? undefined : failed ? "Data belum termuat" : "Memuat data…"
          }
        />
      </div>

      {failed && (
        <ErrorBanner
          title="Ringkasan gagal dimuat"
          message={error.message}
          onRetry={onRetry}
          isRetrying={isFetching}
        />
      )}

      {data ? (
        <SummaryContent data={data} period={period} />
      ) : failed ? (
        <EmptyState
          icon={AlertTriangle}
          tone="error"
          title="Ringkasan belum bisa ditampilkan"
          description="Coba muat ulang. Jika masih gagal, periksa koneksi ke server admin."
        />
      ) : (
        <AnalyticsSkeleton />
      )}
    </div>
  );
}
