import { useId } from "react";
import { cn } from "@/lib/utils/cn";

type Series = {
  label: string;
  values: number[];
  color: string;
  format?: (value: number) => string;
};
type AdminChartProps = {
  series: Series[];
  labels: string[];
  compact?: boolean;
  label: string;
  /** Summary of the data-table disclosure. */
  tableLabel?: string;
};

export function AdminChart({
  series,
  labels,
  compact = false,
  label,
  tableLabel = "Lihat data harian",
}: AdminChartProps) {
  const id = useId();
  const width = 600;
  const height = compact ? 54 : 170;
  const populated = series.some((entry) =>
    entry.values.some((value) => value > 0)
  );

  if (!populated)
    return compact ? (
      <div className="h-12" />
    ) : (
      <div className="flex h-48 items-center justify-center text-sm text-ink-muted">
        Belum ada aktivitas pada periode ini.
      </div>
    );

  return (
    <div className="space-y-3">
      {!compact && (
        <ul className="flex flex-wrap justify-end gap-4 text-xs text-ink-muted">
          {series.map((entry) => (
            <li key={entry.label} className="flex items-center gap-2">
              <span
                className="h-0.5 w-4"
                style={{ backgroundColor: entry.color }}
              />
              {entry.label}
            </li>
          ))}
        </ul>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn("w-full overflow-visible", compact ? "h-12" : "h-44")}
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
      >
        <title>{label}</title>
        {series.map((entry, index) => {
          const maximum = Math.max(1, ...entry.values);
          const points = entry.values.map(
            (value, point) =>
              [
                (point * width) / Math.max(1, entry.values.length - 1),
                height - 4 - (value / maximum) * (height - 12),
              ] as const
          );

          const line = points
            .map(([x, y], point) => `${point ? "L" : "M"}${x},${y}`)
            .join(" ");

          return (
            <g key={entry.label}>
              <defs>
                <linearGradient
                  id={`${id}-${index}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={entry.color}
                    stopOpacity="0.13"
                  />
                  <stop
                    offset="100%"
                    stopColor={entry.color}
                    stopOpacity="0.02"
                  />
                </linearGradient>
              </defs>
              {index === 0 && (
                <path
                  d={`${line} L${width},${height} L0,${height} Z`}
                  fill={`url(#${id}-${index})`}
                />
              )}
              <path
                d={line}
                fill="none"
                stroke={entry.color}
                strokeWidth="2"
                strokeDasharray={index ? "5 4" : undefined}
                vectorEffect="non-scaling-stroke"
              />
              {!compact &&
                points.map(([x, y], point) => (
                  <circle key={point} cx={x} cy={y} r="5" fill="transparent">
                    <title>
                      {labels[point]} · {entry.label}:{" "}
                      {entry.format
                        ? entry.format(entry.values[point]!)
                        : entry.values[point]}
                    </title>
                  </circle>
                ))}
            </g>
          );
        })}
      </svg>
      {!compact && (
        <>
          <div className="flex justify-between font-mono text-[10px] text-ink-muted">
            <span>{labels[0]}</span>
            <span>{labels[Math.floor(labels.length / 2)]}</span>
            <span>{labels.at(-1)}</span>
          </div>
          <details className="text-xs text-ink-muted">
            <summary className="cursor-pointer py-1 outline-none focus-visible:ring-2 focus-visible:ring-brand">
              {tableLabel}
            </summary>
            <div className="mt-2 max-h-52 overflow-auto">
              <table className="w-full text-left">
                <caption className="sr-only">{label}</caption>
                <thead>
                  <tr>
                    <th className="py-1 font-medium">Waktu</th>
                    {series.map((entry) => (
                      <th key={entry.label} className="px-2 py-1 font-medium">
                        {entry.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {labels.map((day, point) => (
                    <tr key={point}>
                      <th className="py-1 font-normal">{day}</th>
                      {series.map((entry) => (
                        <td key={entry.label} className="px-2 font-mono">
                          {entry.format
                            ? entry.format(entry.values[point]!)
                            : entry.values[point]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
