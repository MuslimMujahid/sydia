import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import {
  BarChart,
  ChartLegend,
  ChartTable,
  type ChartSeries,
} from "../analytics/charts";
import {
  chartUnit,
  ACTIVITY_FEATURES,
  COST_CATEGORIES,
  FEATURE_LABELS,
  bucketLabels,
  costCategory,
  featureColor,
  formatIdr,
  periodLabel,
} from "../analytics/meta";
import { formatBytes, formatCount, formatDate, formatUsd } from "../format";
import type {
  ActivityFeature,
  AdminPricing,
  AdminUser,
  AdminUserInsights,
} from "../types";
import {
  LEAK_MULTIPLE,
  engagementGroup,
  formatDayMonth,
  formatRecent,
  formatSignedIdr,
  marginIdr,
  planValueIdr,
  type EngagementGroup,
} from "./user-metrics";
import { cn } from "@/lib/utils/cn";

const ACTIVITY_SET = new Set<string>(ACTIVITY_FEATURES);

function isActivityFeature(feature: string): feature is ActivityFeature {
  return ACTIVITY_SET.has(feature);
}

/** Days the insights window covers; hourly windows count as one. */
function windowDays(insights: AdminUserInsights): number {
  return insights.bucket === "day" ? insights.buckets.length : 1;
}

function totals(insights: AdminUserInsights) {
  const actions = insights.features.reduce((sum, row) => sum + row.actions, 0);
  const costUsd = insights.interactiveUsd + insights.backgroundUsd;
  const features = insights.features.filter(
    (row) => row.actions > 0 && isActivityFeature(row.feature)
  ).length;

  return { actions, costUsd, features, days: windowDays(insights) };
}

export function insightsGroup(
  insights: AdminUserInsights,
  lastActivityAt: string | null | undefined
): EngagementGroup {
  const { actions, features, days } = totals(insights);

  return engagementGroup({
    actions,
    activeDays: insights.activeDays,
    features,
    days,
    lastActivityAt,
  });
}

/** "$0,2" axis ticks; small values keep two significant digits. */
function compactUsd(value: number): string {
  return `$${new Intl.NumberFormat("id-ID", value > 0 && value < 1 ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: 0 }).format(value)}`;
}

/** Activity stacked by chart category, so tasks and reminders share a colour. */
function actionSeries(insights: AdminUserInsights): ChartSeries[] {
  return COST_CATEGORIES.map((category) => {
    const features = ACTIVITY_FEATURES.filter(
      (feature) => costCategory(feature) === category.key
    );

    return {
      key: category.key,
      label: category.label,
      color: category.color,
      values: insights.series.map((bucket) =>
        features.reduce(
          (sum, feature) => sum + (bucket.actions[feature] ?? 0),
          0
        )
      ),
    };
  }).filter((series) => series.values.some((value) => value > 0));
}

type StatProps = {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone?: "bad" | "good";
};

function Stat({ label, value, detail, tone }: StatProps) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd
        className={cn(
          "mt-1 truncate text-xl font-semibold tracking-tight",
          tone === "bad" && "text-red-600",
          tone === "good" && "text-emerald-700"
        )}
      >
        {value}
      </dd>
      <dd className="mt-1 truncate text-[11px] text-ink-muted">{detail}</dd>
    </div>
  );
}

type Props = {
  insights: AdminUserInsights;
  user: AdminUser | undefined;
  /** Null until the backend's price and exchange rate have loaded. */
  pricing: AdminPricing | null;
  now: number;
  isFetching: boolean;
};

export function UserInsightsBody({
  insights,
  user,
  pricing,
  now,
  isFetching,
}: Props) {
  const { actions, costUsd, days } = totals(insights);
  const delta = actions - insights.previousActions;
  const margin =
    user && pricing ? marginIdr(user.plan, costUsd, days, pricing) : null;

  const labels = bucketLabels(insights);
  const unit = chartUnit(insights);
  const series = actionSeries(insights);
  const average = actions > 0 ? costUsd / actions : null;
  const previous = periodLabel(insights.period);

  return (
    <div aria-busy={isFetching} className="space-y-7">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-b border-ink/6 pb-5 sm:grid-cols-4">
        <Stat
          label="Aksi"
          value={formatCount(actions)}
          detail={`${delta > 0 ? "+" : ""}${formatCount(delta)} vs ${previous} sblm`}
        />
        <Stat
          label="Hari aktif"
          value={`${insights.activeDays}/${days}`}
          detail={`dari ${formatCount(days)} hari`}
        />
        <Stat
          label="Biaya"
          value={formatUsd(costUsd)}
          detail={
            average !== null ? `${formatUsd(average)}/aksi` : "tanpa aksi"
          }
        />
        <Stat
          label="Margin"
          value={margin === null ? "—" : formatSignedIdr(margin)}
          tone={
            margin === null
              ? undefined
              : margin < 0
                ? "bad"
                : margin > 0
                  ? "good"
                  : undefined
          }
          detail={
            user && pricing
              ? `nilai ${formatIdr(planValueIdr(user.plan, days, pricing))}`
              : user
                ? "kurs belum dimuat"
                : "paket tidak dimuat"
          }
        />
      </dl>

      <div className="grid gap-6 border-b border-ink/6 pb-6 sm:grid-cols-2">
        <section aria-labelledby="user-actions-chart" className="min-w-0">
          <h3 id="user-actions-chart" className="mb-3 text-sm font-semibold">
            Aksi per {unit}
          </h3>
          <BarChart
            label={`Aksi per ${unit} menurut fitur`}
            labels={labels}
            series={
              series.length
                ? series
                : [
                    {
                      key: "none",
                      label: "Aksi",
                      color: "var(--color-ink)",
                      values: labels.map(() => 0),
                    },
                  ]
            }
            format={formatCount}
            height={140}
          />
          {series.length > 1 && <ChartLegend items={series} className="mt-3" />}
          <ChartTable
            caption="Aksi per hari menurut fitur"
            columns={["Hari", ...series.map((entry) => entry.label), "Total"]}
            rows={labels.map((label, index) => [
              label,
              ...series.map((entry) => entry.values[index] ?? 0),
              series.reduce(
                (sum, entry) => sum + (entry.values[index] ?? 0),
                0
              ),
            ])}
          />
        </section>
        <section aria-labelledby="user-cost-chart" className="min-w-0">
          <h3 id="user-cost-chart" className="mb-3 text-sm font-semibold">
            Biaya per {unit}
          </h3>
          <BarChart
            label={`Biaya model per ${unit}`}
            labels={labels}
            series={[
              {
                key: "cost",
                label: "Biaya",
                color: "var(--color-ink)",
                values: insights.series.map((bucket) => bucket.costUsd),
              },
            ]}
            format={compactUsd}
            height={140}
          />
          <ChartTable
            caption="Biaya model per hari"
            columns={["Hari", "Biaya"]}
            rows={labels.map((label, index) => [
              label,
              formatUsd(insights.series[index]?.costUsd ?? 0),
            ])}
          />
        </section>
      </div>

      <section
        aria-labelledby="user-features"
        className="border-b border-ink/6 pb-6"
      >
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="user-features" className="text-sm font-semibold">
            Per fitur
          </h3>
          <p className="font-mono text-[11px] text-ink-muted">
            Interaktif {formatUsd(insights.interactiveUsd)} · latar{" "}
            {formatUsd(insights.backgroundUsd)}
          </p>
        </div>
        {insights.features.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Belum ada aktivitas atau biaya pada periode ini.
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[13px]">
              <caption className="sr-only">Aksi dan biaya per fitur</caption>
              <thead className="text-xs text-ink-muted">
                <tr>
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    Fitur
                  </th>
                  <th
                    scope="col"
                    className="py-1.5 pr-3 text-right font-medium"
                  >
                    Aksi
                  </th>
                  <th
                    scope="col"
                    className="py-1.5 pr-3 text-right font-medium"
                  >
                    Biaya
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    Biaya / aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {insights.features.map((row) => {
                  const perAction =
                    row.actions > 0 ? row.costUsd / row.actions : null;

                  const hot =
                    perAction !== null &&
                    average !== null &&
                    average > 0 &&
                    perAction >= LEAK_MULTIPLE * average;

                  return (
                    <tr key={row.feature} className="border-t border-ink/6">
                      <th scope="row" className="py-2 pr-3 font-normal">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="size-2.5 shrink-0 rounded-[3px]"
                            style={{
                              backgroundColor: featureColor(row.feature),
                            }}
                          />
                          {FEATURE_LABELS[row.feature]}
                        </span>
                      </th>
                      <td className="py-2 pr-3 text-right font-mono">
                        {formatCount(row.actions)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono font-semibold">
                        {formatUsd(row.costUsd)}
                      </td>
                      <td
                        className={cn(
                          "py-2 text-right font-mono",
                          hot ? "font-semibold text-red-600" : "text-ink-muted"
                        )}
                      >
                        <span className="inline-flex items-center gap-1">
                          {hot && (
                            <AlertTriangle
                              aria-hidden="true"
                              className="size-3.5"
                            />
                          )}
                          {perAction === null ? "—" : formatUsd(perAction)}
                          {hot && (
                            <span className="sr-only">
                              , {LEAK_MULTIPLE}× atau lebih dari rata-rata
                              pengguna
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        aria-labelledby="user-conversations"
        className="border-b border-ink/6 pb-6"
      >
        <h3 id="user-conversations" className="mb-2 text-sm font-semibold">
          Percakapan termahal
        </h3>
        {insights.conversations.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Belum ada biaya percakapan pada periode ini.
          </p>
        ) : (
          <ul>
            {insights.conversations.map((conversation) => (
              <li
                key={conversation.id}
                className="flex items-center justify-between gap-4 border-t border-ink/6 py-2.5 first:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {conversation.title ?? "Percakapan tanpa judul"}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDayMonth(conversation.lastMessageAt)} ·{" "}
                    {formatCount(conversation.messages)} pesan ·{" "}
                    {formatCount(conversation.toolSteps)} langkah alat
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[13px] font-semibold">
                  {formatUsd(conversation.costUsd)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {user && (
        <section aria-labelledby="user-account">
          <h3 id="user-account" className="mb-2 text-sm font-semibold">
            Akun
          </h3>
          <dl className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-2 text-[13px]">
            <dt className="text-ink-muted">Pembayaran</dt>
            <dd>
              {user.payments === 0
                ? "Belum ada"
                : [
                    `${formatCount(user.payments)}× ${formatIdr(user.paymentTotalIdr)}`,
                    user.lastPaymentAt && formatDate(user.lastPaymentAt),
                    user.lastPaymentMethod,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </dd>
            <dt className="text-ink-muted">Sesi aktif</dt>
            <dd>{formatCount(user.activeSessions)} perangkat</dd>
            <dt className="text-ink-muted">Penyimpanan</dt>
            <dd>{formatBytes(user.storageBytes)}</dd>
            <dt className="text-ink-muted">Terakhir aktif</dt>
            <dd>
              {user.lastActivityAt
                ? formatRecent(user.lastActivityAt, now)
                : "Belum pernah aktif"}
            </dd>
          </dl>
        </section>
      )}
    </div>
  );
}
