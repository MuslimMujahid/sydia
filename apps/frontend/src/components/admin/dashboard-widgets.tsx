import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { AdminMetric } from "./types";
import { AdminChart } from "./admin-chart";
import { ORANGE, PINK } from "./dashboard-format";
import { cn } from "@/lib/utils/cn";

type MetricCardProps = {
  title: string;
  metric: AdminMetric;
  value: string;
  detail: string;
  points?: boolean;
  inverse?: boolean;
  labels: string[];
};

export function MetricCard({
  title,
  metric,
  value,
  detail,
  points = false,
  inverse = false,
  labels,
}: MetricCardProps) {
  const difference = points
    ? metric.value - metric.previous
    : metric.previous > 0
      ? ((metric.value - metric.previous) / metric.previous) * 100
      : null;

  const good =
    difference !== null && (inverse ? difference <= 0 : difference >= 0);

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-ink/6 bg-canvas p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-ink-muted sm:text-[13px]">
          {title}
        </h3>
        {difference !== null && (
          <span
            className={cn(
              "inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold",
              good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            )}
          >
            {difference >= 0 ? (
              <ArrowUpRight className="size-3" />
            ) : (
              <ArrowDownRight className="size-3" />
            )}
            {difference > 0 ? "+" : ""}
            {new Intl.NumberFormat("id-ID", {
              maximumFractionDigits: 1,
            }).format(difference)}
            {points ? " pt" : "%"}
          </span>
        )}
      </div>
      <p className="mt-3 break-words font-mono text-xl font-medium tracking-tight sm:text-[28px]">
        {value}
      </p>
      <div className="mt-3 hidden sm:block">
        <AdminChart
          compact
          label={`Tren ${title}`}
          labels={labels}
          series={[
            {
              label: title,
              values: metric.series,
              color: inverse ? ORANGE : PINK,
            },
          ]}
        />
      </div>
      <p className="mt-auto pt-3 text-[11px] leading-relaxed text-ink-muted">
        {detail}
      </p>
    </article>
  );
}

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-ink/6 bg-canvas p-5 sm:p-6">
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
      <div className="mt-5">{children}</div>
    </article>
  );
}
