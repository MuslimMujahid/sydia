import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
};

type BarChartProps = {
  /** Accessible name of the chart. */
  label: string;
  labels: string[];
  /** Stacked bottom to top in this order. */
  series: ChartSeries[];
  /** Middle-half range of a normal bucket, drawn behind each bar. */
  band?: Array<[number, number] | null> | null;
  format: (value: number) => string;
  /** Buckets after this index have not happened yet. */
  upcomingFrom?: number;
  height?: number;
  /** Extra line under each axis label, e.g. active users. */
  footer?: (index: number) => ReactNode;
  /** Longer series fold consecutive buckets into one summed bar. */
  maxBars?: number;
  className?: string;
};

export type SeriesAggregate = "sum" | "mean" | "max";

/** Bucket groupings a long series may be folded into, smallest first. */
const BIN_SIZES = [2, 7, 14, 30];

/** How many buckets go into one bar so that at most `maxBars` remain. */
export function binSize(count: number, maxBars: number): number {
  if (count <= maxBars) return 1;

  return (
    BIN_SIZES.find((size) => Math.ceil(count / size) <= maxBars) ??
    Math.ceil(count / maxBars)
  );
}

/** Folds consecutive buckets into groups of `size`. */
export function binValues(
  values: readonly number[],
  size: number,
  aggregate: SeriesAggregate = "sum"
): number[] {
  if (size <= 1) return [...values];
  const result: number[] = [];

  for (let start = 0; start < values.length; start += size) {
    const group = values.slice(start, start + size);
    const total = group.reduce((sum, value) => sum + value, 0);
    result.push(
      aggregate === "max"
        ? Math.max(...group)
        : aggregate === "mean"
          ? total / group.length
          : total
    );
  }

  return result;
}

/** "1 Okt" or "1 Okt – 7 Okt" for each group of `size` labels. */
export function binLabels(labels: readonly string[], size: number): string[] {
  if (size <= 1) return [...labels];
  const result: string[] = [];

  for (let start = 0; start < labels.length; start += size) {
    const first = labels[start]!;
    const last = labels[Math.min(start + size, labels.length) - 1]!;
    result.push(first === last ? first : `${first} – ${last}`);
  }

  return result;
}

/** Most bars a full-width chart draws; longer windows fold into weeks. */
export const MAX_CHART_BARS = 31;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((n) => n * magnitude >= value) ?? 10;

  return step * magnitude;
}

/**
 * Vertical bars, stacked when several series are given, with a hover/focus
 * tooltip per bucket and an optional normal-range band. Bars are HTML so they
 * stay crisp and rounded at any width.
 */
export function BarChart({
  label,
  labels: rawLabels,
  series: rawSeries,
  band: rawBand,
  format,
  upcomingFrom: rawUpcoming,
  height = 200,
  footer: rawFooter,
  maxBars = MAX_CHART_BARS,
  className,
}: BarChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const size = binSize(rawLabels.length, maxBars);
  const binned = size > 1;
  const labels = binLabels(rawLabels, size);
  const series = binned
    ? rawSeries.map((entry) => ({
        ...entry,
        values: binValues(entry.values, size),
      }))
    : rawSeries;

  // Per-bucket extras do not survive folding; they only exist for short windows.
  const band = binned ? null : rawBand;
  const upcomingFrom = binned ? undefined : rawUpcoming;
  const footer = binned ? undefined : rawFooter;
  const axisLabels = binned
    ? rawLabels.filter((_, index) => index % size === 0)
    : labels;

  const totals = labels.map((_, index) =>
    series.reduce((sum, entry) => sum + (entry.values[index] ?? 0), 0)
  );

  const max = niceMax(
    Math.max(...totals, ...(band ?? []).map((range) => range?.[1] ?? 0))
  );

  const ticks = [max, max / 2, 0];
  // Dense hourly or 90-day charts label every few buckets.
  const every = Math.ceil(labels.length / 12);

  return (
    <div className={cn("relative", className)}>
      <div
        role="img"
        aria-label={label}
        className="relative flex gap-2"
        style={{ height }}
      >
        <div className="flex w-9 shrink-0 flex-col justify-between pb-0 text-right font-mono text-[10px] text-ink-muted">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="-translate-y-1/2 first:translate-y-0 last:translate-y-0"
            >
              {format(tick)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {ticks.map((tick, index) => (
            <span
              key={tick}
              aria-hidden="true"
              className={cn(
                "absolute inset-x-0 h-px",
                index === ticks.length - 1 ? "bg-ink/18" : "bg-ink/6"
              )}
              style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end">
            {labels.map((bucket, index) => {
              const range = band?.[index];
              const upcoming =
                upcomingFrom !== undefined && index > upcomingFrom;

              return (
                <button
                  key={`${bucket}-${index}`}
                  type="button"
                  aria-label={`${bucket}: ${format(totals[index] ?? 0)}`}
                  onMouseEnter={() => setActive(index)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  className={cn(
                    "relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none focus-visible:bg-brand/8",
                    upcoming && "bg-ink/[0.03]",
                    active === index && "bg-ink/[0.04]"
                  )}
                >
                  {range && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-px bg-ink/7"
                      style={{
                        bottom: `${(range[0] / max) * 100}%`,
                        height: `${Math.max(((range[1] - range[0]) / max) * 100, 0.5)}%`,
                      }}
                    />
                  )}
                  <span className="relative flex w-[60%] max-w-9 min-w-1 flex-col-reverse gap-0.5">
                    {series.map((entry, position) => {
                      const value = entry.values[index] ?? 0;
                      if (value <= 0) return null;
                      const top = series
                        .slice(position + 1)
                        .every((next) => (next.values[index] ?? 0) <= 0);

                      return (
                        <span
                          key={entry.key}
                          className={cn(
                            "block w-full",
                            top && "rounded-t-[4px]"
                          )}
                          style={{
                            height: `${(value / max) * height}px`,
                            minHeight: 2,
                            backgroundColor: entry.color,
                          }}
                        />
                      );
                    })}
                  </span>
                </button>
              );
            })}
          </div>
          {active !== null && (
            <ChartTooltip
              index={active}
              count={labels.length}
              title={`${labels[active]} · ${format(totals[active] ?? 0)}`}
              rows={
                series.length > 1
                  ? series
                      .map((entry) => ({
                        label: entry.label,
                        color: entry.color,
                        value: entry.values[active] ?? 0,
                      }))
                      .filter((row) => row.value > 0)
                      .sort((a, b) => b.value - a.value)
                      .map((row) => ({ ...row, value: format(row.value) }))
                  : []
              }
              note={
                band?.[active]
                  ? `Normal ${format(band[active]![0])}–${format(band[active]![1])}`
                  : undefined
              }
            />
          )}
        </div>
      </div>
      <div className="mt-2 flex gap-2 pl-11">
        {labels.map((bucket, index) => (
          <div
            key={`${bucket}-${index}`}
            className="min-w-0 flex-1 text-center font-mono text-[10px] text-ink-muted"
          >
            <span
              className={cn(
                index === labels.length - 1 && "font-semibold text-ink"
              )}
            >
              {index % every === 0 || index === labels.length - 1
                ? axisLabels[index]
                : ""}
            </span>
            {footer && <span className="block truncate">{footer(index)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartTooltip({
  index,
  count,
  title,
  rows,
  note,
}: {
  index: number;
  count: number;
  title: string;
  rows: Array<{ label: string; color: string; value: string }>;
  note?: string;
}) {
  const position = (index + 0.5) / count;

  return (
    <div
      role="status"
      className="pointer-events-none absolute top-1 z-10 w-max max-w-56 rounded-[10px] bg-ink px-3 py-2.5 text-xs text-canvas shadow-card"
      style={
        position > 0.5
          ? { right: `${(1 - position) * 100 + 4}%` }
          : { left: `${position * 100 + 4}%` }
      }
    >
      <p className="font-semibold">{title}</p>
      {rows.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: row.color }}
              />
              <span className="text-canvas/80">{row.label}</span>
              <span className="ml-auto pl-3 font-mono">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-1.5 text-canvas/70">{note}</p>}
    </div>
  );
}

/** A legend for two or more series; the swatch never carries meaning alone. */
export function ChartLegend({
  items,
  className,
}: {
  items: ReadonlyArray<{ label: string; color: string }>;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted",
        className
      )}
    >
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[3px]"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

const SPARKLINE_BARS = 15;

/** Tiny trend bars, at most `maxBars`; the last bar is emphasised. */
export function Sparkline({
  values: rawValues,
  className,
  label,
  aggregate = "sum",
  maxBars = SPARKLINE_BARS,
}: {
  values: number[];
  className?: string;
  label?: string;
  /** How folded buckets combine: sum counts, average rates, max peaks. */
  aggregate?: SeriesAggregate;
  maxBars?: number;
}) {
  const values = binValues(
    rawValues,
    binSize(rawValues.length, maxBars),
    aggregate
  );

  const max = Math.max(...values, 0);

  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex h-6 w-20 items-end gap-[2px]", className)}
    >
      {values.map((value, index) => (
        <span
          key={index}
          className={cn(
            "min-w-[2px] flex-1 rounded-[1px]",
            index === values.length - 1 ? "bg-ink/85" : "bg-ink/22"
          )}
          style={{
            height:
              max > 0 && value > 0
                ? `${Math.max((value / max) * 100, 12)}%`
                : "2px",
            opacity: max > 0 && value > 0 ? 1 : 0.5,
          }}
        />
      ))}
    </span>
  );
}

/** A horizontal bar for ranked lists, sized against `max`. */
export function Meter({
  value,
  max,
  color = "var(--color-ink)",
  className,
}: {
  value: number;
  max: number;
  color?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block h-2 overflow-hidden rounded-full bg-ink/6",
        className
      )}
    >
      <span
        className="block h-full rounded-full"
        style={{
          width: `${max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0}%`,
          backgroundColor: color,
        }}
      />
    </span>
  );
}

/** The table view every chart offers for screen readers and exact values. */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-ink-muted outline-none hover:text-ink focus-visible:text-ink">
        Lihat tabel data
      </summary>
      <div className="relative mt-2 max-h-64 overflow-auto">
        <table className="w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="text-ink-muted">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="py-1 pr-3 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-ink/6">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="py-1 pr-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
