import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { AdminPeriod, AdminWindow } from "../types";
import { PERIODS, comparisonLabel, updatedLabel } from "./meta";

type PeriodBarProps = {
  period: AdminPeriod;
  onPeriodChange: (period: AdminPeriod) => void;
  onRefresh: () => void;
  isFetching: boolean;
  window?: AdminWindow;
  /** Overrides the default "vs previous period" description. */
  comparison?: string;
  /** Overrides the "Diperbarui …" line, e.g. while loading or after a failure. */
  status?: string;
};

/** The period selector, refresh and freshness line every analytics page shares. */
export function PeriodBar({
  period,
  onPeriodChange,
  onRefresh,
  isFetching,
  window,
  comparison,
  status,
}: PeriodBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <div
          role="group"
          aria-label="Periode"
          className="relative flex overflow-x-auto rounded-full border border-ink/8 bg-canvas p-1"
        >
          {PERIODS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === period}
              onClick={() => onPeriodChange(value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand sm:px-3.5",
                value === period
                  ? "bg-ink font-semibold text-canvas"
                  : "text-ink-muted hover:bg-surface-1 hover:text-ink"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          variant="dark-outline"
          size="icon"
          className="shrink-0 rounded-full"
          aria-label="Muat ulang data"
          disabled={isFetching}
          onClick={onRefresh}
        >
          <RefreshCw
            className={cn(
              "size-4",
              isFetching && "animate-spin motion-reduce:animate-none"
            )}
          />
        </Button>
      </div>
      <div className="text-right">
        <p className="text-xs text-ink-muted">
          {comparison ?? comparisonLabel(period)}
        </p>
        <p className="font-mono text-[11px] text-ink-muted">
          {status ?? (window ? updatedLabel(window) : "Memuat data…")}
        </p>
      </div>
    </div>
  );
}

export type DeltaTone = "good" | "warn" | "bad" | "neutral";

const TONES: Record<DeltaTone, string> = {
  good: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-600",
  neutral: "bg-ink/6 text-ink-muted",
};

/** A change chip. Direction is an icon, so tone is never the only signal. */
export function DeltaChip({
  direction,
  tone,
  children,
}: {
  direction?: "up" | "down";
  tone: DeltaTone;
  children: ReactNode;
}) {
  const Icon =
    direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        TONES[tone]
      )}
    >
      {Icon && <Icon aria-hidden="true" className="size-3" />}
      {children}
    </span>
  );
}

export type KpiTileProps = {
  label: string;
  value: string;
  delta?: { direction?: "up" | "down"; tone: DeltaTone; text: string };
  detail?: string;
  trend?: ReactNode;
};

/** Headline numbers in one card, divided rather than boxed individually. */
export function KpiStrip({ tiles }: { tiles: KpiTileProps[] }) {
  return (
    <section
      aria-label="Ringkasan angka"
      className="grid grid-cols-2 overflow-hidden rounded-2xl border border-ink/6 bg-canvas shadow-card sm:grid-cols-3 2xl:grid-cols-6"
    >
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="min-w-0 border-ink/6 p-4 not-first:border-l max-sm:[&:nth-child(2n+1)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t sm:max-2xl:[&:nth-child(3n+1)]:border-l-0 sm:max-2xl:[&:nth-child(n+4)]:border-t sm:p-5"
        >
          <p className="text-xs font-medium text-ink-muted">{tile.label}</p>
          <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight">
            {tile.value}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            {tile.delta ? (
              <DeltaChip
                direction={tile.delta.direction}
                tone={tile.delta.tone}
              >
                {tile.delta.text}
              </DeltaChip>
            ) : (
              <span />
            )}
            {tile.trend}
          </div>
          {tile.detail && (
            <p className="mt-2 truncate text-[11px] text-ink-muted">
              {tile.detail}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[26px] font-semibold tracking-tight sm:text-[28px]">
          {title}
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">{description}</p>
      </div>
      {actions}
    </header>
  );
}

export function SectionHeader({
  id,
  title,
  meta,
  action,
}: {
  id: string;
  title: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {meta && (
          <span className="font-mono text-[11px] text-ink-muted">{meta}</span>
        )}
      </div>
      {action}
    </div>
  );
}

export function Card({
  title,
  description,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <article
      className={cn(
        "min-w-0 rounded-2xl border border-ink/6 bg-canvas shadow-card",
        className
      )}
    >
      {(title || description) && (
        <div className="px-5 pt-5">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              {description}
            </p>
          )}
        </div>
      )}
      <div
        className={cn("p-5", (title || description) && "pt-4", bodyClassName)}
      >
        {children}
      </div>
    </article>
  );
}

/** A page-level empty or failed state: icon and message, no container. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  tone = "neutral",
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  tone?: "neutral" | "error";
}) {
  return (
    <div className="flex flex-col items-center px-4 py-20 text-center sm:py-28">
      <span
        className={cn(
          "flex size-16 items-center justify-center rounded-full",
          tone === "error"
            ? "bg-red-50 text-red-600"
            : "bg-ink/6 text-ink-muted"
        )}
      >
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <h2 className="mt-6 text-lg font-semibold">{title}</h2>
      {description && (
        <p className="mt-2 max-w-md text-sm text-ink-muted">{description}</p>
      )}
    </div>
  );
}

/** A failed read with the retry it needs. */
export function ErrorBanner({
  title,
  message,
  onRetry,
  isRetrying,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  isRetrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700"
    >
      <AlertTriangle aria-hidden="true" className="size-[18px] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs">{message}</p>
      </div>
      <Button size="sm" onClick={onRetry} disabled={isRetrying}>
        <RefreshCw
          className={cn(
            "size-4",
            isRetrying && "animate-spin motion-reduce:animate-none"
          )}
        />
        Coba lagi
      </Button>
    </div>
  );
}

export function Skeleton({
  className,
  height,
}: {
  className?: string;
  /** Height in percent of the parent, for bar placeholders. */
  height?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block animate-pulse rounded-md bg-ink/6 motion-reduce:animate-none",
        className
      )}
      style={height === undefined ? undefined : { height: `${height}%` }}
    />
  );
}

/** A loading layout: key-number strip, two list cards and a chart card. */
export function AnalyticsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat data" className="space-y-8">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink/6 bg-canvas sm:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="space-y-3 bg-canvas p-5">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {[5, 5].map((rows, card) => (
          <div
            key={card}
            className="space-y-5 rounded-2xl border border-ink/6 bg-canvas p-5"
          >
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-2.5 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex h-40 items-end gap-6 rounded-2xl border border-ink/6 bg-canvas p-5">
        {[40, 60, 25, 75, 45, 65, 55].map((height, index) => (
          <Skeleton key={index} className="flex-1" height={height} />
        ))}
      </div>
    </div>
  );
}
