import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Meter } from "../analytics/charts";
import { ACTIVITY_FEATURES, FEATURE_LABELS } from "../analytics/meta";
import { formatCount, formatUsd } from "../format";
import type { AdminPeriod, AdminUsageReport } from "../types";
import {
  COST_HEAT_STEPS,
  COST_TONE_NOTE,
  COST_TONE_TEXT,
  HEAT_STEPS,
  SORT_OPTIONS,
  heatStep,
  sortUsers,
  totalActions,
  userCostTone,
  type HeatMode,
  type UsageSort,
  type UsageUser,
} from "./usage-meta";

const VISIBLE_USERS = 10;
/** Daily windows up to this many days show one square per day. */
const MAX_DAY_SQUARES = 14;

const PLAN_LABELS: Record<UsageUser["plan"], string> = {
  plus: "Plus",
  trial: "Trial",
  expired: "Kedaluwarsa",
  disabled: "Nonaktif",
};

const MODES: ReadonlyArray<{ value: HeatMode; label: string }> = [
  { value: "actions", label: "Aksi" },
  { value: "cost", label: "Biaya" },
];

type UsageHeatmapProps = {
  report: AdminUsageReport;
  period: AdminPeriod;
};

/** Users × features: every cell shows its count or spend on a sequential ramp. */
export function UsageHeatmap({ report, period }: UsageHeatmapProps) {
  const sortId = useId();
  const [mode, setMode] = useState<HeatMode>("actions");
  const [sort, setSort] = useState<UsageSort>("actions");
  const [expanded, setExpanded] = useState(false);
  const users = sortUsers(report.users, sort);
  const visible = expanded ? users : users.slice(0, VISIBLE_USERS);
  const idle = report.groups.dormant + report.groups.inactive;
  const steps = mode === "cost" ? COST_HEAT_STEPS : HEAT_STEPS;
  // Hourly windows cover a single day, so active days say nothing there.
  const daily = report.bucket === "day";
  const squares = daily && report.buckets.length <= MAX_DAY_SQUARES;

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-ink/6 bg-canvas shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="radiogroup"
            aria-label="Isi sel"
            className="flex rounded-full border border-ink/8 p-1"
          >
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                onClick={() => setMode(option.value)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  mode === option.value
                    ? "bg-ink text-canvas"
                    : "text-ink-muted hover:text-ink"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="relative">
            <label htmlFor={sortId} className="sr-only">
              Urutkan
            </label>
            <select
              id={sortId}
              value={sort}
              onChange={(event) => setSort(event.target.value as UsageSort)}
              className="h-10 appearance-none rounded-lg border border-ink/10 bg-canvas py-1 pr-9 pl-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  Urutkan: {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
            />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-muted">
            {mode === "cost" ? "US$" : "Aksi"}
          </span>
          <ul
            aria-label={
              mode === "cost" ? "Skala biaya per fitur" : "Skala jumlah aksi"
            }
            className="flex gap-1"
          >
            {steps.map((step) => (
              <li
                key={step.label}
                className={cn(
                  "rounded-[4px] px-2 py-0.5 font-mono text-[10px]",
                  step.dark ? "text-canvas" : "text-ink"
                )}
                style={{ backgroundColor: step.color }}
              >
                {step.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="relative mt-3 overflow-x-auto px-4 sm:px-5">
        <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">
            {mode === "cost"
              ? "Biaya setiap pengguna per fitur"
              : "Jumlah aksi setiap pengguna per fitur"}
            , diurutkan menurut{" "}
            {SORT_OPTIONS.find((option) => option.value === sort)?.label}
          </caption>
          <thead className="text-left text-xs text-ink-muted">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-44 border-b border-ink/8 bg-canvas py-2.5 pr-3 font-medium"
              >
                Pengguna
              </th>
              {daily && (
                <th
                  scope="col"
                  className="w-28 border-b border-ink/8 px-2 py-2.5 font-medium"
                >
                  Hari aktif
                </th>
              )}
              {ACTIVITY_FEATURES.map((feature) => (
                <th
                  key={feature}
                  scope="col"
                  className="border-b border-ink/8 px-[3px] py-2.5 text-center font-medium whitespace-nowrap"
                >
                  {FEATURE_LABELS[feature]}
                </th>
              ))}
              <th
                scope="col"
                className="border-b border-ink/8 py-2.5 pr-2 pl-4 font-medium"
              >
                Total
              </th>
              <th
                scope="col"
                className="border-b border-ink/8 px-2 py-2.5 font-medium"
              >
                Biaya
              </th>
              <th scope="col" className="w-6 border-b border-ink/8 py-2.5">
                <span className="sr-only">Peringatan biaya</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((user) => {
              const tone = userCostTone(user);

              return (
                <tr key={user.userId}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-canvas py-1.5 pr-3 text-left font-normal"
                  >
                    <Link
                      to="/admin/users"
                      search={{ period, user: user.userId }}
                      className="block max-w-40 truncate font-medium outline-none hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {user.name}
                    </Link>
                    <span
                      className={cn(
                        "text-xs",
                        user.plan === "plus" ? "text-brand" : "text-ink-muted"
                      )}
                    >
                      {PLAN_LABELS[user.plan]}
                    </span>
                  </th>
                  {daily && (
                    <td className="px-2 py-1.5">
                      <ActiveDays
                        user={user}
                        days={report.days}
                        squares={squares}
                      />
                    </td>
                  )}
                  {ACTIVITY_FEATURES.map((feature) => (
                    <td key={feature} className="px-[3px] py-[3px]">
                      {mode === "cost" ? (
                        <HeatCell
                          value={user.costs[feature] ?? 0}
                          step={heatStep(
                            user.costs[feature] ?? 0,
                            COST_HEAT_STEPS
                          )}
                          label={cellUsd(user.costs[feature] ?? 0)}
                        />
                      ) : (
                        <HeatCell
                          value={user.actions[feature] ?? 0}
                          step={heatStep(user.actions[feature] ?? 0)}
                          label={formatCount(user.actions[feature] ?? 0)}
                        />
                      )}
                    </td>
                  ))}
                  <td className="py-1.5 pr-2 pl-4 font-mono">
                    {formatCount(totalActions(user))}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1.5 font-mono whitespace-nowrap",
                      COST_TONE_TEXT[tone]
                    )}
                  >
                    {formatUsd(user.costUsd)}
                  </td>
                  <td className="w-6 py-1.5 pl-1">
                    {tone !== "normal" && (
                      <span className={cn("inline-flex", COST_TONE_TEXT[tone])}>
                        <AlertTriangle aria-hidden="true" className="size-4" />
                        <span className="sr-only">
                          {user.multiple !== null
                            ? `${user.multiple.toFixed(1).replace(".", ",")}× biaya biasa untuk aksinya`
                            : COST_TONE_NOTE[tone]}
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 bg-ink/[0.025] px-4 py-3 text-xs text-ink-muted sm:px-5">
        <p>
          {formatCount(idle)} akun tanpa aktivitas di periode ini (
          {formatCount(report.groups.dormant)} dorman,{" "}
          {formatCount(report.groups.inactive)} belum aktif)
        </p>
        {users.length > VISIBLE_USERS && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="rounded-sm font-semibold text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
          >
            {expanded
              ? "Tampilkan lebih sedikit"
              : `Tampilkan semua (${formatCount(users.length)})`}
          </button>
        )}
      </div>
    </article>
  );
}

/** Cell-sized spend without the currency: "0,21", "<0,01". */
function cellUsd(value: number): string {
  return value < 0.01 ? "<0,01" : value.toFixed(2).replace(".", ",");
}

/** One square per day for short daily windows, a meter otherwise. */
function ActiveDays({
  user,
  days,
  squares,
}: {
  user: UsageUser;
  days: number;
  squares: boolean;
}) {
  const count = (
    <span className="font-mono text-xs">
      {user.activeDays}/{days}
      <span className="sr-only"> hari aktif</span>
    </span>
  );

  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      {squares ? (
        <span aria-hidden="true" className="flex gap-[2px]">
          {user.activity.map((value, index) => (
            <span
              key={index}
              className={cn(
                "size-[7px] rounded-[1.5px]",
                value > 0 ? "bg-ink" : "bg-ink/10"
              )}
            />
          ))}
        </span>
      ) : (
        // Same footprint as seven day squares, so every period lines up.
        <Meter
          value={user.activeDays}
          max={days}
          className="h-[7px] w-[61px] shrink-0 rounded-[1.5px]"
        />
      )}
      {count}
    </span>
  );
}

function HeatCell({
  value,
  step,
  label,
}: {
  value: number;
  step: (typeof HEAT_STEPS)[number];
  label: string;
}) {
  return (
    <span
      className={cn(
        "flex h-8 min-w-12 items-center justify-center rounded-[5px] px-1.5 font-mono text-xs whitespace-nowrap",
        value <= 0
          ? "text-ink-muted"
          : step.dark
            ? "font-semibold text-canvas"
            : "text-ink"
      )}
      style={{ backgroundColor: step.color }}
    >
      {value > 0 ? (
        label
      ) : (
        <>
          <span aria-hidden="true">–</span>
          <span className="sr-only">0</span>
        </>
      )}
    </span>
  );
}
