import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { AdminCostReport } from "../types";
import { Meter } from "../analytics/charts";
import { Card } from "../analytics/widgets";
import { formatIdr, percent } from "../analytics/meta";
import { formatCount } from "../format";
import { PLAN_LABELS, formatSignedIdr, formatUsdShort } from "./cost-format";
import { userMargins, type Margins } from "./cost-model";

type MarginProps = { data: AdminCostReport };

const MARGIN_ROWS = 10;

function summaryLine({ plus, trial }: Margins): string {
  const parts: string[] = [];
  if (plus.users > 0)
    parts.push(
      `Plus: biaya ${formatIdr(plus.costIdr)} vs nilai ${formatIdr(plus.valueIdr)}${
        plus.valueIdr > 0
          ? ` → ${percent((plus.costIdr / plus.valueIdr) * 100, 0)}`
          : ""
      }`
    );
  if (trial.users > 0)
    parts.push(`Trial: biaya ${formatIdr(trial.costIdr)} (biaya akuisisi)`);

  return parts.join(" · ");
}

/** What each user is worth this window against what they cost, in rupiah. */
export function UserMargin({ data }: MarginProps) {
  const [showAll, setShowAll] = useState(false);
  const margins = userMargins(data);
  const { pricing } = data;
  const rows = showAll ? margins.rows : margins.rows.slice(0, MARGIN_ROWS);
  const maxAbs = Math.max(
    ...margins.rows.map((row) => Math.abs(row.marginIdr)),
    0
  );

  const span =
    margins.days === 1 ? "hari" : `${formatCount(margins.days)} hari`;

  const summary = summaryLine(margins);

  return (
    <Card
      title="Margin per pengguna"
      description={`Plus ${formatIdr(pricing.plusPriceIdr)}/${formatCount(pricing.termDays)} hari → ${formatIdr(margins.plusPerPeriodIdr)} per ${span} · biaya dalam Rp (kurs ${formatCount(pricing.usdIdrRate)})`}
    >
      {margins.rows.length ? (
        <>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">
                Nilai langganan, biaya model dan margin per pengguna
              </caption>
              <thead className="text-xs text-ink-muted">
                <tr>
                  <th scope="col" className="pr-3 pb-2 font-medium">
                    Pengguna
                  </th>
                  <th scope="col" className="pr-3 pb-2 font-medium">
                    Paket
                  </th>
                  <th scope="col" className="pr-3 pb-2 font-medium">
                    Nilai
                  </th>
                  <th scope="col" className="pr-3 pb-2 font-medium">
                    Biaya
                  </th>
                  <th scope="col" className="pr-3 pb-2 font-medium">
                    Margin
                  </th>
                  <th scope="col" className="w-[30%] pb-2">
                    <span className="sr-only">Grafik margin</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const positive = row.marginIdr >= 0;
                  const width =
                    maxAbs > 0 ? (Math.abs(row.marginIdr) / maxAbs) * 50 : 0;

                  return (
                    <tr key={row.userId}>
                      <th scope="row" className="py-1.5 pr-3 font-normal">
                        <span
                          className="block max-w-40 truncate"
                          title={row.name}
                        >
                          {row.name}
                        </span>
                      </th>
                      <td
                        className={cn(
                          "py-1.5 pr-3",
                          row.plan === "plus"
                            ? "font-medium text-brand"
                            : "text-ink-muted"
                        )}
                      >
                        {PLAN_LABELS[row.plan]}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs whitespace-nowrap">
                        {row.valueIdr > 0 ? formatIdr(row.valueIdr) : "–"}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs whitespace-nowrap">
                        {formatIdr(row.costIdr)}
                      </td>
                      <td
                        className={cn(
                          "py-1.5 pr-3 font-mono text-xs font-semibold whitespace-nowrap",
                          positive ? "text-emerald-700" : "text-red-600"
                        )}
                      >
                        {formatSignedIdr(row.marginIdr)}
                      </td>
                      <td className="py-1.5" aria-hidden="true">
                        <span className="relative block h-3">
                          <span className="absolute inset-y-[-6px] left-1/2 w-px bg-ink/25" />
                          <span
                            className={cn(
                              "absolute inset-y-0 rounded-[3px]",
                              positive
                                ? "left-1/2 bg-emerald-600"
                                : "right-1/2 bg-red-500"
                            )}
                            style={{
                              width: `${Math.max(width, row.marginIdr === 0 ? 0 : 1)}%`,
                            }}
                          />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {margins.rows.length > MARGIN_ROWS && (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="mt-2 text-xs font-semibold text-brand outline-none hover:underline focus-visible:underline"
            >
              {showAll
                ? "Tampilkan lebih sedikit"
                : `Tampilkan semua ${formatCount(margins.rows.length)} pengguna`}
            </button>
          )}
          {summary && (
            <p className="mt-4 border-t border-ink/8 pt-3 text-sm font-medium">
              {summary}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-muted">
          Belum ada biaya yang teratribusi ke pengguna.
        </p>
      )}
    </Card>
  );
}

const MODEL_ROWS = 8;

/** Priced spend per model, costliest first. */
export function ModelCosts({ data }: MarginProps) {
  const models = data.models.slice(0, MODEL_ROWS);
  const total = data.models.reduce((sum, model) => sum + model.costUsd, 0);
  const max = models[0]?.costUsd ?? 0;

  return (
    <Card title="Model" description="Biaya berharga per model">
      {models.length ? (
        <ol className="space-y-3">
          {models.map((model, index) => (
            <li
              key={model.model}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3"
            >
              <div className="min-w-0">
                <span
                  className="block truncate font-mono text-xs"
                  title={model.model}
                >
                  {model.model}
                </span>
                <Meter
                  value={model.costUsd}
                  max={max}
                  color={
                    index === 0
                      ? "var(--color-ink)"
                      : "color-mix(in srgb, var(--color-ink) 45%, transparent)"
                  }
                  className="mt-1"
                />
              </div>
              <span className="font-mono text-xs whitespace-nowrap text-ink-muted">
                <span className="text-ink">
                  {formatUsdShort(model.costUsd)}
                </span>{" "}
                · {percent(total > 0 ? (model.costUsd / total) * 100 : 0, 0)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-muted">Belum ada panggilan berharga.</p>
      )}
      {data.models.length > MODEL_ROWS && (
        <p className="mt-3 text-[11px] text-ink-muted">
          +{formatCount(data.models.length - MODEL_ROWS)} model lainnya
        </p>
      )}
    </Card>
  );
}
