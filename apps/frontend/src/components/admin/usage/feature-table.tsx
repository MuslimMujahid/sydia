import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Meter, Sparkline } from "../analytics/charts";
import {
  ACTIVITY_FEATURES,
  FEATURE_LABELS,
  featureColor,
  median,
} from "../analytics/meta";
import { formatCount, formatUsd } from "../format";
import type { ActivityFeature, AdminUsageReport } from "../types";
import {
  COST_TONE_NOTE,
  COST_TONE_TEXT,
  costPerAction,
  type CostTone,
} from "./usage-meta";

const DECIMAL = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

type FeatureTableProps = {
  report: AdminUsageReport;
  active: ActivityFeature | null;
  onSelect: (feature: ActivityFeature) => void;
};

/** One row per feature: reach, depth, retention, trend and unit cost. */
export function FeatureTable({ report, active, onSelect }: FeatureTableProps) {
  const activeUsers = report.users.length;
  const unitCosts = costPerAction(report);
  const rows = ACTIVITY_FEATURES.map(
    (feature) =>
      report.features.find((row) => row.feature === feature) ?? {
        feature,
        users: 0,
        actions: 0,
        returning: 0,
        perUser: [],
        series: [],
      }
  );

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-ink/6 bg-canvas shadow-card">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[960px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">
            Pemakaian dan biaya per fitur. Pilih fitur untuk melihat rinciannya.
          </caption>
          <thead className="text-left text-xs text-ink-muted">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 border-b border-ink/6 bg-canvas py-3 pr-3 pl-4 font-medium sm:pl-5"
              >
                Fitur
              </th>
              <th
                scope="col"
                className="border-b border-ink/6 px-3 py-3 font-medium"
              >
                Pengguna aktif
              </th>
              <th
                scope="col"
                className="border-b border-ink/6 px-3 py-3 font-medium"
              >
                Aksi
              </th>
              <th
                scope="col"
                className="border-b border-ink/6 px-3 py-3 font-medium"
              >
                Median / pengguna
              </th>
              <th
                scope="col"
                className="border-b border-ink/6 px-3 py-3 font-medium"
              >
                Kembali ≥2 hari
              </th>
              <th
                scope="col"
                className="border-b border-ink/6 px-3 py-3 font-medium"
              >
                Tren
              </th>
              <th
                scope="col"
                className="border-b border-ink/6 px-3 py-3 text-right font-medium"
              >
                Biaya
              </th>
              <th
                scope="col"
                className="border-b border-ink/6 py-3 pr-4 pl-3 text-right font-medium sm:pr-5"
              >
                Biaya / aksi
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const label = FEATURE_LABELS[row.feature];
              const unit = unitCosts[row.feature];
              const middle = median(row.perUser);
              const selected = row.feature === active;

              return (
                <tr
                  key={row.feature}
                  onClick={() => onSelect(row.feature)}
                  className={cn(
                    "cursor-pointer *:bg-canvas hover:*:bg-[color-mix(in_srgb,var(--color-ink)_3%,var(--color-canvas))]",
                    selected &&
                      "*:bg-[color-mix(in_srgb,var(--color-ink)_5%,var(--color-canvas))]"
                  )}
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-ink/6 py-3 pr-3 pl-4 text-left font-medium sm:pl-5"
                  >
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-label={`Rincian fitur ${label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(row.feature);
                      }}
                      className="flex items-center gap-2 rounded-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-[3px]"
                        style={{ backgroundColor: featureColor(row.feature) }}
                      />
                      {label}
                    </button>
                  </th>
                  <td className="border-b border-ink/6 px-3 py-3">
                    <Ratio value={row.users} max={activeUsers} />
                  </td>
                  <td className="border-b border-ink/6 px-3 py-3 font-mono whitespace-nowrap">
                    {formatCount(row.actions)}{" "}
                    {row.feature === "chat" ? "pesan" : "aksi"}
                  </td>
                  <td className="border-b border-ink/6 px-3 py-3 font-mono">
                    {middle === null ? "–" : DECIMAL.format(middle)}
                  </td>
                  <td className="border-b border-ink/6 px-3 py-3">
                    <Ratio value={row.returning} max={row.users} />
                  </td>
                  <td className="border-b border-ink/6 px-3 py-3">
                    {row.series.length > 0 ? (
                      <Sparkline
                        values={row.series}
                        label={`Tren aksi ${label}: ${row.series.join(", ")}`}
                      />
                    ) : (
                      <span className="text-ink-muted">–</span>
                    )}
                  </td>
                  <td className="border-b border-ink/6 px-3 py-3 text-right font-mono whitespace-nowrap">
                    {formatUsd(report.featureCosts[row.feature] ?? 0)}
                  </td>
                  <td className="border-b border-ink/6 py-3 pr-4 pl-3 text-right font-mono whitespace-nowrap sm:pr-5">
                    {unit ? (
                      <UnitCost value={unit.value} tone={unit.tone} />
                    ) : (
                      "–"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="flex gap-2 bg-ink/[0.025] px-4 py-3 text-xs leading-relaxed text-ink-muted sm:px-5">
        <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        <span>
          Biaya overhead routing ({formatUsd(report.featureCosts.overhead ?? 0)}
          ) dan proses proaktif ({formatUsd(report.featureCosts.proactive ?? 0)}
          ) tidak dibagi ke fitur. Biaya Memori termasuk Hindsight gabungan{" "}
          {formatUsd(report.pooledMemoryUsd)}.
        </span>
      </p>
    </article>
  );
}

function Ratio({ value, max }: { value: number; max: number }) {
  return (
    <span className="flex items-center gap-2">
      <Meter value={value} max={max} className="h-1.5 w-16 shrink-0" />
      <span className="font-mono text-xs whitespace-nowrap text-ink-muted">
        {formatCount(value)}/{formatCount(max)}
      </span>
    </span>
  );
}

/** Cost per action; a warning icon and note back the colour when it is high. */
export function UnitCost({ value, tone }: { value: number; tone: CostTone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", COST_TONE_TEXT[tone])}
    >
      {formatUsd(value)}
      {tone !== "normal" && (
        <>
          <AlertTriangle aria-hidden="true" className="size-3.5" />
          <span className="sr-only">, {COST_TONE_NOTE[tone]}</span>
        </>
      )}
    </span>
  );
}
