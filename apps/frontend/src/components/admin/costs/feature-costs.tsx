import type { AdminCostReport } from "../types";
import { BarChart, ChartLegend, ChartTable, Meter } from "../analytics/charts";
import { Card } from "../analytics/widgets";
import {
  chartUnit,
  COST_CATEGORIES,
  bucketLabels,
  groupCosts,
  percent,
  periodLabel,
} from "../analytics/meta";
import { formatUsd } from "../format";
import { formatUsdShort } from "./cost-format";
import { featureRanking } from "./cost-model";

type FeatureCostsProps = { data: AdminCostReport };

/** Spend per bucket, stacked by the seven cost categories. */
export function DailyCostChart({ data }: FeatureCostsProps) {
  const labels = bucketLabels(data);
  const grouped = data.series.featureCosts.map(groupCosts);
  const series = COST_CATEGORIES.map(({ key, label, color }) => ({
    key,
    label,
    color,
    values: grouped.map((bucket) => bucket[key]),
  }));

  const unit = chartUnit(data);

  return (
    <Card
      title={`Biaya per ${unit}`}
      description="US$ · ditumpuk menurut fitur"
    >
      <BarChart
        label={`Biaya per ${unit}, ditumpuk menurut fitur`}
        labels={labels}
        series={series}
        format={formatUsdShort}
        height={220}
      />
      <ChartLegend items={COST_CATEGORIES} className="mt-4" />
      <ChartTable
        caption={`Biaya per ${data.bucket === "day" ? "hari" : "jam"} menurut fitur, dalam US$`}
        columns={[
          data.bucket === "day" ? "Hari" : "Jam",
          ...COST_CATEGORIES.map((c) => c.label),
          "Total",
        ]}
        rows={labels.map((label, index) => {
          const bucket = grouped[index];
          const values = COST_CATEGORIES.map(({ key }) => bucket?.[key] ?? 0);

          return [
            label,
            ...values.map(formatUsd),
            formatUsd(values.reduce((sum, value) => sum + value, 0)),
          ];
        })}
      />
    </Card>
  );
}

/** Categories ranked by spend, with growth worth a look called out. */
export function FeatureRanking({ data }: FeatureCostsProps) {
  const ranking = featureRanking(data);
  const max = Math.max(...ranking.map((entry) => entry.costUsd), 0);
  const total = ranking.reduce((sum, entry) => sum + entry.costUsd, 0);

  return (
    <Card
      title="Peringkat fitur"
      description={`Total ${periodLabel(data.period)} · bagian dari ${formatUsd(total)}`}
    >
      <ol className="space-y-3">
        {ranking.map((entry) => (
          <li
            key={entry.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3"
          >
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm">{entry.label}</span>
                {entry.growth && (
                  <span className="shrink-0 text-[11px] font-medium text-amber-700">
                    {entry.growth.isNew ? "baru " : "▲ "}+
                    {formatUsd(entry.growth.deltaUsd)}
                  </span>
                )}
              </div>
              <Meter
                value={entry.costUsd}
                max={max}
                color={entry.color}
                className="mt-1"
              />
            </div>
            <span className="font-mono text-xs whitespace-nowrap text-ink-muted">
              <span className="text-ink">{formatUsdShort(entry.costUsd)}</span>{" "}
              · {percent(entry.share, 0)}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
