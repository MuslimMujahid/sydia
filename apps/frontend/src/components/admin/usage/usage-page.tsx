import { Activity, AlertTriangle } from "lucide-react";
import {
  AnalyticsSkeleton,
  EmptyState,
  ErrorBanner,
  PageHeader,
  PeriodBar,
  SectionHeader,
} from "../analytics/widgets";
import { periodLabel } from "../analytics/meta";
import type {
  ActivityFeature,
  AdminUsageReport,
  AnalyticsPageProps,
} from "../types";
import { FeatureDrawer } from "./feature-drawer";
import { FeatureTable } from "./feature-table";
import { UsageHeatmap } from "./usage-heatmap";
import { UserGroupsCard } from "./user-groups-card";

export type UsagePageProps = AnalyticsPageProps<AdminUsageReport> & {
  /** Feature whose detail drawer is open. */
  feature: ActivityFeature | null;
  onFeatureChange: (feature: ActivityFeature | null) => void;
};

/** How often each user uses each feature, and what each feature costs. */
export function UsagePage({
  period,
  onPeriodChange,
  data,
  error,
  isFetching,
  onRetry,
  feature,
  onFeatureChange,
}: UsagePageProps) {
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Penggunaan"
        description="Seberapa sering setiap pengguna memakai setiap fitur."
      />
      <PeriodBar
        period={period}
        onPeriodChange={onPeriodChange}
        onRefresh={onRetry}
        isFetching={isFetching}
        window={data}
        status={error && !data ? "Data gagal dimuat" : undefined}
      />

      {error && (
        <ErrorBanner
          title={
            data ? "Data terbaru gagal dimuat" : "Data penggunaan gagal dimuat"
          }
          message={
            data
              ? `Menampilkan data sebelumnya. ${error.message}`
              : error.message
          }
          onRetry={onRetry}
          isRetrying={isFetching}
        />
      )}

      {data ? (
        data.users.length === 0 ? (
          <EmptyState
            icon={Activity}
            title={`Belum ada aktivitas ${period === "today" ? "hari ini" : "di periode ini"}`}
            description="Coba periode yang lebih panjang."
          />
        ) : (
          <UsageContent
            report={data}
            period={period}
            feature={feature}
            onFeatureChange={onFeatureChange}
          />
        )
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          tone="error"
          title="Penggunaan tidak dapat ditampilkan"
          description="Periksa koneksi ke server, lalu coba lagi."
        />
      ) : (
        <AnalyticsSkeleton />
      )}
    </div>
  );
}

function UsageContent({
  report,
  period,
  feature,
  onFeatureChange,
}: {
  report: AdminUsageReport;
  period: UsagePageProps["period"];
  feature: ActivityFeature | null;
  onFeatureChange: UsagePageProps["onFeatureChange"];
}) {
  return (
    <>
      <UserGroupsCard
        groups={report.groups}
        totalAccounts={report.totalAccounts}
      />

      <section aria-labelledby="usage-heatmap" className="pt-4">
        <SectionHeader
          id="usage-heatmap"
          title="Pengguna × fitur"
          meta={
            period === "today"
              ? "aksi hari ini"
              : `aksi dalam ${periodLabel(period)}`
          }
        />
        <UsageHeatmap report={report} period={period} />
      </section>

      <section aria-labelledby="usage-features" className="pt-4">
        <SectionHeader
          id="usage-features"
          title="Fitur"
          meta="klik baris untuk rincian"
        />
        <FeatureTable
          report={report}
          active={feature}
          onSelect={onFeatureChange}
        />
      </section>

      <FeatureDrawer
        feature={feature}
        period={period}
        report={report}
        onClose={() => onFeatureChange(null)}
      />
    </>
  );
}
