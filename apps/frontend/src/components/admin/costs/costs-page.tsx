import { Wallet } from "lucide-react";
import type { AdminCostReport, AnalyticsPageProps } from "../types";
import {
  AnalyticsSkeleton,
  Card,
  EmptyState,
  ErrorBanner,
  KpiStrip,
  PageHeader,
  PeriodBar,
  SectionHeader,
} from "../analytics/widgets";
import { updatedLabel } from "../analytics/meta";
import { formatCount } from "../format";
import { costKpis } from "./cost-model";
import { CostConcentration } from "./cost-concentration";
import { DailyCostChart, FeatureRanking } from "./feature-costs";
import { ProcessCards, ProcessTable } from "./process-table";
import { DisproportionateUsers, UsageScatter } from "./usage-scatter";
import { ModelCosts, UserMargin } from "./user-margin";

const ERROR_TITLE = "Data biaya gagal dimuat";

function errorMessage(error: Error): string {
  return `${error.message} Coba lagi, atau pilih periode yang lebih pendek.`;
}

/** Where model spend goes, and where it leaks. */
export function CostsPage({
  period,
  onPeriodChange,
  data,
  error,
  isFetching,
  onRetry,
}: AnalyticsPageProps<AdminCostReport>) {
  const status = error
    ? data
      ? `Gagal memuat · ${updatedLabel(data)}`
      : "Gagal memuat"
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Biaya"
        description="Ke mana biaya model mengalir, dan di mana bocornya."
      />
      <PeriodBar
        period={period}
        onPeriodChange={onPeriodChange}
        onRefresh={onRetry}
        isFetching={isFetching}
        window={data}
        status={status}
      />
      {error && (
        <ErrorBanner
          title={ERROR_TITLE}
          message={errorMessage(error)}
          onRetry={onRetry}
          isRetrying={isFetching}
        />
      )}
      {data ? (
        data.current.costUsd > 0 ? (
          <CostsContent data={data} />
        ) : (
          <EmptyState
            icon={Wallet}
            title="Belum ada biaya pada periode ini"
            description="Biaya model akan muncul di sini setelah ada panggilan yang tercatat."
          />
        )
      ) : error ? (
        <EmptyState
          icon={Wallet}
          tone="error"
          title="Biaya untuk periode ini belum bisa ditampilkan"
        />
      ) : (
        <AnalyticsSkeleton />
      )}
    </div>
  );
}

function CostsContent({ data }: { data: AdminCostReport }) {
  return (
    <div className="space-y-10">
      <KpiStrip tiles={costKpis(data)} />

      <section aria-labelledby="costs-features">
        <SectionHeader id="costs-features" title="Biaya menurut fitur" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="hidden min-w-0 sm:block lg:col-span-2">
            <DailyCostChart data={data} />
          </div>
          <FeatureRanking data={data} />
        </div>
      </section>

      <section aria-labelledby="costs-processes">
        <SectionHeader
          id="costs-processes"
          title="Proses"
          meta={`${formatCount(data.processes.length)} proses · urut biaya`}
        />
        {data.processes.length ? (
          <>
            <Card className="hidden sm:block" bodyClassName="p-0 pb-2">
              <ProcessTable processes={data.processes} period={data.period} />
            </Card>
            <Card className="sm:hidden">
              <ProcessCards processes={data.processes} period={data.period} />
            </Card>
          </>
        ) : (
          <Card>
            <p className="text-sm text-ink-muted">Belum ada proses tercatat.</p>
          </Card>
        )}
      </section>

      <section aria-labelledby="costs-users">
        <SectionHeader id="costs-users" title="Biaya per pengguna" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="hidden min-w-0 sm:block">
            <UsageScatter data={data} />
          </div>
          <section
            aria-labelledby="costs-disproportionate"
            className="min-w-0 sm:hidden"
          >
            <h3
              id="costs-disproportionate"
              className="mb-3 text-base font-semibold"
            >
              Pengguna dengan biaya tak sebanding
            </h3>
            <DisproportionateUsers data={data} />
          </section>
          <CostConcentration data={data} />
        </div>
      </section>

      <section aria-labelledby="costs-margin">
        <SectionHeader id="costs-margin" title="Margin & model" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <UserMargin data={data} />
          </div>
          <ModelCosts data={data} />
        </div>
      </section>
    </div>
  );
}
