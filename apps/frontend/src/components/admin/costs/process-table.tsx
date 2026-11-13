import { Fragment, useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { AdminPeriod, AdminProcess } from "../types";
import {
  FEATURE_LABELS,
  featureColor,
  percent,
  stageLabel,
} from "../analytics/meta";
import { formatCount, formatUsd } from "../format";
import { formatPerCall, formatTokens, kindLabel } from "./cost-format";
import { isWasteFlagged, processCache } from "./cost-model";

type ProcessListProps = {
  processes: AdminProcess[];
  period: AdminPeriod;
};

type ProcessDetailProps = {
  process: AdminProcess;
  period: AdminPeriod;
  id: string;
};

function processInsights(process: AdminProcess): string[] {
  const insights: string[] = [];
  const cache = processCache(process);
  const attempts = process.retried + process.failed;

  if (process.wastedUsd > 0)
    insights.push(
      `${formatUsd(process.wastedUsd)} terbuang di ${formatCount(attempts)} panggilan ulang/gagal.`
    );
  if (cache === 0)
    insights.push(
      `Belum ada input dari cache untuk ${formatCount(process.inputTokens)} token input — prompt yang berulang bisa di-cache.`
    );

  return insights;
}

function ProcessDetail({ process, period, id }: ProcessDetailProps) {
  const insights = processInsights(process);

  return (
    <div
      id={id}
      className="space-y-4 rounded-xl border border-ink/6 bg-canvas p-4"
    >
      <div className="grid gap-5 md:grid-cols-2 md:divide-x md:divide-ink/6">
        <section className="min-w-0 md:pr-5">
          <h4 className="text-xs font-semibold">Model & percobaan</h4>
          {process.models.length ? (
            <ul className="mt-2 space-y-1.5 font-mono text-[11px]">
              {process.models.map((model) => (
                <li
                  key={`${model.model}-${model.retry}`}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3",
                    model.retry && "text-red-600"
                  )}
                >
                  <span className="truncate" title={model.model}>
                    {model.model} ·{" "}
                    {model.retry ? "percobaan 2+" : "percobaan 1"}
                  </span>
                  <span className={cn(!model.retry && "text-ink-muted")}>
                    {formatCount(model.calls)}{" "}
                    {model.retry ? "diulang" : "panggilan"}
                  </span>
                  <span className="font-semibold">
                    {formatUsd(model.costUsd)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-ink-muted">
              Tidak ada rincian model.
            </p>
          )}
          {(process.failed > 0 || process.unpriced > 0) && (
            <p className="mt-2 text-[11px] text-ink-muted">
              {[
                process.failed > 0 && (
                  <span key="failed" className="text-red-600">
                    {formatCount(process.failed)} panggilan gagal
                  </span>
                ),
                process.unpriced > 0 && (
                  <span key="unpriced">
                    {formatCount(process.unpriced)} tanpa harga
                  </span>
                ),
              ]
                .filter(Boolean)
                .flatMap((node, index) => (index ? [" · ", node] : [node]))}
            </p>
          )}
        </section>
        <section className="min-w-0 md:pl-5">
          <h4 className="text-xs font-semibold">Akun</h4>
          {process.accounts.length ? (
            <ul className="mt-2 space-y-1.5 text-xs">
              {process.accounts.map((account) => (
                <li
                  key={account.userId}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"
                >
                  <Link
                    to="/admin/users"
                    search={{ period, user: account.userId }}
                    className="truncate underline-offset-2 outline-none hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {account.name}
                  </Link>
                  <span className="font-mono font-semibold">
                    {formatUsd(account.costUsd)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-ink-muted">
              Tidak teratribusi ke akun.
            </p>
          )}
        </section>
      </div>
      {insights.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          {insights.map((insight) => (
            <li key={insight} className="flex gap-2">
              <AlertTriangle
                aria-hidden="true"
                className="mt-px size-3.5 shrink-0"
              />
              {insight}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CacheCell({ process }: { process: AdminProcess }) {
  const cache = processCache(process);
  if (cache === null) return <span className="text-ink-muted">–</span>;

  return (
    <span className={cn(cache === 0 && "font-medium text-amber-700")}>
      {percent(cache, 0)}
    </span>
  );
}

const COLUMNS = [
  "Proses",
  "Fitur",
  "Jenis",
  "Panggilan",
  "Biaya",
  "/ panggilan",
  "Token in / out",
  "Cache",
  "Terbuang",
] as const;

/** Every ledger stage of the window, costliest first; rows expand for detail. */
export function ProcessTable({ processes, period }: ProcessListProps) {
  const [open, setOpen] = useState<string | null>(null);
  const baseId = useId();

  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <caption className="sr-only">
          Proses model menurut biaya, diurutkan dari yang termahal
        </caption>
        <thead className="text-xs text-ink-muted">
          <tr className="border-b border-ink/8">
            {COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                aria-sort={column === "Biaya" ? "descending" : undefined}
                className="px-3 py-3 font-medium first:pl-5"
              >
                {column === "Biaya" ? (
                  <span className="inline-flex items-center gap-1 text-ink">
                    Biaya{" "}
                    <ChevronDown aria-hidden="true" className="size-3.5" />
                  </span>
                ) : (
                  column
                )}
              </th>
            ))}
            <th scope="col" className="w-12 pr-5">
              <span className="sr-only">Rincian</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {processes.map((process, index) => {
            const expanded = open === process.stage;
            const detailId = `${baseId}-${index}`;
            const tokens = process.inputTokens + process.outputTokens;

            return (
              <Fragment key={process.stage}>
                <tr
                  className={cn(
                    "border-b border-ink/6 align-middle",
                    expanded && "border-transparent bg-ink/[0.03]"
                  )}
                >
                  <th scope="row" className="py-3 pr-3 pl-5 font-normal">
                    <span className="block font-medium">
                      {stageLabel(process.stage)}
                    </span>
                    <span className="block font-mono text-[11px] text-ink-muted">
                      {process.stage}
                    </span>
                  </th>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-[2px]"
                        style={{
                          backgroundColor: featureColor(process.feature),
                        }}
                      />
                      {FEATURE_LABELS[process.feature]}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-ink-muted">
                    {kindLabel(process.kind)}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">
                    {formatCount(process.calls)}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs font-semibold">
                    {formatUsd(process.costUsd)}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-ink-muted">
                    {process.calls > 0
                      ? formatPerCall(process.costUsd / process.calls)
                      : "–"}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-ink-muted">
                    {tokens > 0
                      ? `${formatTokens(process.inputTokens)} / ${formatTokens(process.outputTokens)}`
                      : "–"}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">
                    <CacheCell process={process} />
                  </td>
                  <td
                    className={cn(
                      "px-3 py-3 font-mono text-xs",
                      isWasteFlagged(process) && "font-semibold text-red-600"
                    )}
                  >
                    {formatUsd(process.wastedUsd)}
                  </td>
                  <td className="py-3 pr-5 text-right">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={expanded ? detailId : undefined}
                      aria-label={`Rincian ${stageLabel(process.stage)}`}
                      onClick={() => setOpen(expanded ? null : process.stage)}
                      className="inline-flex size-8 items-center justify-center rounded-full text-ink-muted outline-none hover:bg-ink/6 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {expanded ? (
                        <ChevronDown aria-hidden="true" className="size-4" />
                      ) : (
                        <ChevronRight aria-hidden="true" className="size-4" />
                      )}
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-b border-ink/6 bg-ink/[0.03]">
                    <td colSpan={COLUMNS.length + 1} className="px-5 pb-4">
                      <ProcessDetail
                        process={process}
                        period={period}
                        id={detailId}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const MOBILE_PROCESSES = 4;

function cardNote(process: AdminProcess) {
  const cache = processCache(process);
  if (isWasteFlagged(process))
    return (
      <span className="text-red-600">
        terbuang {formatUsd(process.wastedUsd)}
      </span>
    );
  if (cache === 0) return <span className="text-amber-700">cache 0%</span>;
  if (cache !== null)
    return <span className="text-ink-muted">cache {percent(cache, 0)}</span>;

  return null;
}

/** The process list as stacked cards for narrow screens. */
export function ProcessCards({ processes, period }: ProcessListProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const baseId = useId();
  const visible = showAll ? processes : processes.slice(0, MOBILE_PROCESSES);
  const hidden = processes.length - visible.length;

  return (
    <div>
      <ul className="divide-y divide-ink/6">
        {visible.map((process, index) => {
          const expanded = open === process.stage;
          const detailId = `${baseId}-${index}`;

          return (
            <li key={process.stage} className="py-3 first:pt-0">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={expanded ? detailId : undefined}
                onClick={() => setOpen(expanded ? null : process.stage)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {stageLabel(process.stage)}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {kindLabel(process.kind)} · {formatCount(process.calls)}{" "}
                    panggilan
                    {process.retried > 0 &&
                      ` · ${formatCount(process.retried)} diulang`}
                  </span>
                  <span className="block text-xs font-semibold">
                    {cardNote(process)}
                  </span>
                </span>
                <span className="self-start font-mono text-sm font-semibold">
                  {formatUsd(process.costUsd)}
                </span>
                {expanded ? (
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 text-ink-muted"
                  />
                ) : (
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 text-ink-muted"
                  />
                )}
              </button>
              {expanded && (
                <div className="mt-3">
                  <ProcessDetail
                    process={process}
                    period={period}
                    id={detailId}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 text-sm font-semibold text-brand outline-none hover:underline focus-visible:underline"
        >
          Lihat {formatCount(hidden)} proses lainnya
        </button>
      )}
    </div>
  );
}
