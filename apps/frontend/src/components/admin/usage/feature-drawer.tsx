import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, RefreshCw, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminFeatureQueryOptions } from "@/lib/services/api/admin/admin.queries";
import { cn } from "@/lib/utils/cn";
import { BarChart, ChartTable, Meter } from "../analytics/charts";
import {
  chartUnit,
  FEATURE_LABELS,
  bucketLabels,
  featureColor,
  percent,
  stageLabel,
  sum,
} from "../analytics/meta";
import { Skeleton } from "../analytics/widgets";
import { formatCount, formatUsd } from "../format";
import type {
  ActivityFeature,
  AdminFeatureDetail,
  AdminPeriod,
  AdminUsageReport,
} from "../types";
import { UnitCost } from "./feature-table";
import { costPerAction, kindLabel, rangeLabel } from "./usage-meta";

const POOLED_COLOR = "#b8b1bc";

const KIND_SHARE_LABELS: Record<string, string> = {
  background: "Proses latar",
  message: "interaktif",
  hindsight: "gabungan",
};

type FeatureDrawerProps = {
  feature: ActivityFeature | null;
  period: AdminPeriod;
  report: AdminUsageReport;
  onClose: () => void;
};

/** Right-side drawer explaining where one feature's actions and spend come from. */
export function FeatureDrawer({
  feature,
  period,
  report,
  onClose,
}: FeatureDrawerProps) {
  // Keep the last feature so the drawer keeps its content while it animates out.
  const [shown, setShown] = useState<ActivityFeature | null>(feature);
  if (feature && feature !== shown) setShown(feature);

  return (
    <Dialog open={feature !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showClose={false}
        className="top-0 right-0 bottom-0 left-auto flex h-dvh max-w-[520px] translate-x-0 translate-y-0 flex-col rounded-none border-0 border-l p-0 data-[ending-style]:translate-x-6 data-[ending-style]:scale-100 data-[starting-style]:translate-x-6 data-[starting-style]:scale-100"
      >
        {shown && (
          <FeatureDrawerBody
            feature={shown}
            open={feature !== null}
            period={period}
            report={report}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FeatureDrawerBody({
  feature,
  open,
  period,
  report,
  onClose,
}: Omit<FeatureDrawerProps, "feature"> & {
  feature: ActivityFeature;
  open: boolean;
}) {
  const query = useQuery({
    ...adminFeatureQueryOptions(period, feature),
    enabled: open,
  });

  const label = FEATURE_LABELS[feature];
  const row = report.features.find((entry) => entry.feature === feature);
  const users = row?.users ?? 0;
  const cost = report.featureCosts[feature] ?? 0;
  const unit = costPerAction(report)[feature];

  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b border-ink/6 px-5 pt-6 pb-5 sm:px-6">
        <div className="min-w-0">
          <DialogTitle className="flex items-center gap-2.5 text-[22px]">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-[3px]"
              style={{ backgroundColor: featureColor(feature) }}
            />
            {label}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            {rangeLabel(report)} · {formatCount(users)} pengguna memakai fitur
            ini
          </DialogDescription>
        </div>
        <Button
          variant="dark-outline"
          size="icon-sm"
          className="shrink-0 rounded-full"
          aria-label="Tutup rincian fitur"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8 sm:px-6">
        <dl className="grid grid-cols-2 gap-4 border-b border-ink/6 py-5 sm:grid-cols-4">
          <Stat label="Aksi">{formatCount(row?.actions ?? 0)}</Stat>
          <Stat label="Biaya">{formatUsd(cost)}</Stat>
          <Stat label="Biaya / aksi">
            {unit ? <UnitCost value={unit.value} tone={unit.tone} /> : "–"}
          </Stat>
          <Stat label="Kembali ≥2 hari">
            {formatCount(row?.returning ?? 0)} dari {formatCount(users)}
          </Stat>
        </dl>

        {query.data ? (
          <FeatureDetailSections detail={query.data} label={label} />
        ) : query.isError ? (
          <div
            role="alert"
            className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700"
          >
            <AlertTriangle
              aria-hidden="true"
              className="size-[18px] shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                Rincian {label} gagal dimuat
              </p>
              <p className="mt-0.5 text-xs">{query.error.message}</p>
            </div>
            <Button
              size="sm"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  query.isFetching && "animate-spin motion-reduce:animate-none"
                )}
              />
              Coba lagi
            </Button>
          </div>
        ) : (
          <DetailSkeleton />
        )}

        <Link
          to="/admin/costs"
          search={{ period }}
          className={cn(
            buttonVariants({ variant: "dark", size: "sm" }),
            "mt-8 rounded-xl"
          )}
        >
          Lihat proses di Biaya
          <ChevronRight aria-hidden="true" />
        </Link>
      </div>
    </>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-muted">{label}</dt>
      <dd className="mt-1 truncate text-lg font-semibold">{children}</dd>
    </div>
  );
}

function FeatureDetailSections({
  detail,
  label,
}: {
  detail: AdminFeatureDetail;
  label: string;
}) {
  const color = featureColor(detail.feature);
  const sourceTotal = sum(detail.sources.map((source) => source.costUsd));
  const topSource = Math.max(
    0,
    ...detail.sources.map((source) => source.costUsd)
  );

  const kindShares = Object.entries(
    detail.sources.reduce<Record<string, number>>((shares, source) => {
      shares[source.kind] = (shares[source.kind] ?? 0) + source.costUsd;

      return shares;
    }, {})
  )
    .filter(([, value]) => value > 0)
    .sort(([, a], [, b]) => b - a);

  const labels = bucketLabels(detail);
  const unit = chartUnit(detail);

  return (
    <>
      <section
        aria-labelledby="feature-sources"
        className="border-b border-ink/6 py-5"
      >
        <h3 id="feature-sources" className="text-sm font-semibold">
          Dari mana biaya {label}
        </h3>
        {kindShares.length > 0 && sourceTotal > 0 && (
          <p className="mt-0.5 text-xs text-ink-muted">
            {kindShares
              .map(
                ([kind, value]) =>
                  `${KIND_SHARE_LABELS[kind] ?? kind} ${percent((value / sourceTotal) * 100, 0)}`
              )
              .join(" · ")}
          </p>
        )}
        {detail.sources.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            Belum ada biaya model untuk fitur ini.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {detail.sources.map((source) => (
              <li
                key={source.stage}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_9rem_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{stageLabel(source.stage)}</p>
                  <p className="text-[11px] text-ink-muted">
                    {kindLabel(source.kind)}
                    {source.kind !== "hindsight" &&
                      ` · ${formatCount(source.calls)} panggilan`}
                    {source.retried > 0 &&
                      ` · ${formatCount(source.retried)} diulang`}
                  </p>
                </div>
                <Meter
                  value={source.costUsd}
                  max={topSource}
                  color={source.kind === "hindsight" ? POOLED_COLOR : color}
                  className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
                />
                <span className="col-start-2 row-start-1 text-right font-mono text-xs sm:col-start-auto sm:row-start-auto">
                  {formatUsd(source.costUsd)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="feature-series"
        className="border-b border-ink/6 py-5"
      >
        <h3 id="feature-series" className="mb-4 text-sm font-semibold">
          Aksi per {unit}
        </h3>
        <BarChart
          label={`Aksi ${label} per ${unit}`}
          labels={labels}
          series={[
            { key: detail.feature, label, color, values: detail.series },
          ]}
          format={formatCount}
          height={140}
        />
        <ChartTable
          caption={`Aksi ${label} per ${detail.bucket === "hour" ? "jam" : "hari"}`}
          columns={[detail.bucket === "hour" ? "Jam" : "Hari", "Aksi"]}
          rows={labels.map((bucket, index) => [
            bucket,
            formatCount(detail.series[index] ?? 0),
          ])}
        />
      </section>

      <section aria-labelledby="feature-users" className="py-5">
        <h3 id="feature-users" className="text-sm font-semibold">
          Pengguna
        </h3>
        {detail.users.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            Tidak ada pengguna di periode ini.
          </p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">
              Aksi dan biaya {label} per pengguna
            </caption>
            <thead className="text-left text-[11px] text-ink-muted">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Nama
                </th>
                <th
                  scope="col"
                  className="w-16 py-1.5 pr-3 text-right font-medium"
                >
                  Aksi
                </th>
                <th scope="col" className="w-24 py-1.5 text-right font-medium">
                  Biaya
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.users.map((user) => {
                const leak = user.costUsd > 0 && user.actions === 0;

                return (
                  <tr
                    key={user.userId}
                    className="border-t border-ink/6 align-top"
                  >
                    <th
                      scope="row"
                      className={cn(
                        "py-2.5 pr-3 text-left font-normal",
                        leak && "text-red-600"
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {leak && (
                          <AlertTriangle
                            aria-hidden="true"
                            className="size-3.5 shrink-0"
                          />
                        )}
                        <span className="truncate">{user.name}</span>
                      </span>
                      {leak && (
                        <span className="mt-0.5 block text-[11px]">
                          Tidak memakai {label}, tapi proses latar berjalan
                        </span>
                      )}
                    </th>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs">
                      {formatCount(user.actions)}
                    </td>
                    <td
                      className={cn(
                        "py-2.5 text-right font-mono text-xs",
                        leak && "font-semibold text-red-600"
                      )}
                    >
                      {formatUsd(user.costUsd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function DetailSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Memuat rincian fitur"
      className="space-y-6 py-5"
    >
      <div className="space-y-4">
        <Skeleton className="h-3.5 w-40" />
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-4">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
            <Skeleton className="h-2 w-32 rounded-full" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
      <div className="flex h-32 items-end gap-3">
        {[30, 30, 5, 65, 30, 95, 65].map((height, index) => (
          <Skeleton key={index} className="flex-1" height={height} />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
