import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { AdminCostReport } from "../types";
import { ChartTable } from "../analytics/charts";
import { Card } from "../analytics/widgets";
import { percent, periodLabel } from "../analytics/meta";
import { formatCount, formatUsd } from "../format";
import {
  PLAN_LABELS,
  formatMultiple,
  formatUsdShort,
  niceMax,
} from "./cost-format";

type CostUser = AdminCostReport["users"][number];
type UsersProps = { data: AdminCostReport };

const X_TICKS = 5;
const Y_TICKS = 4;

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

function backgroundShare(user: CostUser): number {
  return user.costUsd > 0 ? (user.backgroundUsd / user.costUsd) * 100 : 0;
}

function multipleText(user: CostUser): string {
  return user.multiple === null
    ? ""
    : ` · ${formatMultiple(user.multiple)} tipikal`;
}

/** Where a line y = rate·x leaves the plot, in percent of the plot box. */
function lineEnd(rate: number, xMax: number, yMax: number) {
  const x = Math.min(xMax, yMax / rate);

  return { x: (x / xMax) * 100, y: 100 - ((rate * x) / yMax) * 100 };
}

function typicalNote(typical: number | null): string {
  return typical === null
    ? "Belum cukup data untuk biaya tipikal"
    : `garis = biaya tipikal ${formatUsd(typical)}/aksi`;
}

/** One dot per user: actions against spend, against the typical rate. */
export function UsageScatter({ data }: UsersProps) {
  const [active, setActive] = useState<number | null>(null);
  const typical = data.typicalCostPerAction;
  const users = data.users;
  const xMax = niceMax(Math.max(...users.map((user) => user.actions), 1));
  const yMax = niceMax(Math.max(...users.map((user) => user.costUsd), 0.01));
  const xTicks = Array.from(
    { length: X_TICKS + 1 },
    (_, i) => (xMax / X_TICKS) * i
  );

  const yTicks = Array.from(
    { length: Y_TICKS + 1 },
    (_, i) => (yMax / Y_TICKS) * i
  );

  const typicalEnd = typical ? lineEnd(typical, xMax, yMax) : null;
  const doubleEnd = typical ? lineEnd(typical * 2, xMax, yMax) : null;
  const point = (user: CostUser) => ({
    x: (user.actions / xMax) * 100,
    y: 100 - (user.costUsd / yMax) * 100,
  });

  const activeUser = active === null ? undefined : users[active];

  return (
    <Card
      title="Pemakaian vs biaya"
      description={`Satu titik = satu pengguna · ${typicalNote(typical)}`}
    >
      <div className="relative h-64 pr-2 pb-6 pl-10">
        {yTicks.map((tick) => (
          <span
            key={tick}
            aria-hidden="true"
            className="absolute left-0 w-8 -translate-y-1/2 text-right font-mono text-[10px] text-ink-muted"
            style={{ top: `calc((100% - 1.5rem) * ${1 - tick / yMax})` }}
          >
            {formatUsdShort(tick)}
          </span>
        ))}
        <div className="relative h-full">
          <svg
            aria-hidden="true"
            className="absolute inset-0 size-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {yTicks.map((tick) => (
              <line
                key={tick}
                x1={0}
                x2={100}
                y1={100 - (tick / yMax) * 100}
                y2={100 - (tick / yMax) * 100}
                vectorEffect="non-scaling-stroke"
                className={tick === 0 ? "stroke-ink/20" : "stroke-ink/6"}
              />
            ))}
            {typicalEnd && (
              <line
                x1={0}
                y1={100}
                x2={typicalEnd.x}
                y2={typicalEnd.y}
                vectorEffect="non-scaling-stroke"
                strokeDasharray="6 4"
                className="stroke-ink/40"
              />
            )}
            {doubleEnd && (
              <line
                x1={0}
                y1={100}
                x2={doubleEnd.x}
                y2={doubleEnd.y}
                vectorEffect="non-scaling-stroke"
                strokeDasharray="2 3"
                className="stroke-red-400"
              />
            )}
          </svg>
          {doubleEnd && (
            <span
              aria-hidden="true"
              className="absolute -translate-x-full -translate-y-1/2 pr-1 text-[10px] whitespace-nowrap text-red-600"
              style={{
                left: `${doubleEnd.x}%`,
                top: `${Math.max(doubleEnd.y, 4)}%`,
              }}
            >
              2× tipikal
            </span>
          )}
          {users.map((user, index) => {
            const { x, y } = point(user);

            return (
              <button
                key={user.userId}
                type="button"
                aria-label={`${user.name}: ${formatCount(user.actions)} aksi, ${formatUsd(user.costUsd)}${multipleText(user)}${user.leak ? ", tidak sebanding" : ""}`}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className={cn(
                  "absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  active === index && "z-10"
                )}
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <span
                  className={cn(
                    "block size-2.5 rounded-full",
                    user.leak ? "bg-red-600" : "bg-ink/70",
                    active === index && "ring-2 ring-canvas"
                  )}
                />
              </button>
            );
          })}
          {users.map((user) => {
            if (!user.leak) return null;
            const { x, y } = point(user);

            return (
              <span
                key={user.userId}
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute -translate-y-1/2 px-2.5 text-[11px] font-semibold whitespace-nowrap text-red-600",
                  x > 75 && "-translate-x-full"
                )}
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                {firstName(user.name)}
              </span>
            );
          })}
          {activeUser && (
            <ScatterTooltip user={activeUser} {...point(activeUser)} />
          )}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-full h-5 font-mono text-[10px] text-ink-muted"
          >
            {xTicks.map((tick) => (
              <span
                key={tick}
                className="absolute top-1.5 -translate-x-1/2"
                style={{ left: `${(tick / xMax) * 100}%` }}
              >
                {formatCount(tick)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-right text-[11px] text-ink-muted">
        Aksi dalam {periodLabel(data.period).toLowerCase()} →
      </p>
      <ChartTable
        caption="Aksi dan biaya per pengguna"
        columns={["Pengguna", "Paket", "Aksi", "Biaya", "× tipikal"]}
        rows={users.map((user) => [
          user.leak ? `${user.name} (tak sebanding)` : user.name,
          PLAN_LABELS[user.plan],
          formatCount(user.actions),
          formatUsd(user.costUsd),
          user.multiple === null ? "–" : formatMultiple(user.multiple),
        ])}
      />
    </Card>
  );
}

function ScatterTooltip({
  user,
  x,
  y,
}: {
  user: CostUser;
  x: number;
  y: number;
}) {
  // Open away from the dot's corner so the card does not cover its neighbours.
  const horizontal =
    x > 50
      ? { right: `calc(${100 - x}% + 14px)` }
      : { left: `calc(${x}% + 14px)` };

  const vertical = y < 45 ? { top: `${y}%` } : { bottom: `${100 - y}%` };

  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 w-max max-w-60 rounded-[10px] bg-ink px-3 py-2.5 text-xs text-canvas shadow-card"
      style={{ ...horizontal, ...vertical }}
    >
      <p className="font-semibold">
        {user.name} · {PLAN_LABELS[user.plan]}
      </p>
      <p className="mt-1 text-canvas/80">
        {formatCount(user.actions)} aksi · {formatUsd(user.costUsd)}
        {multipleText(user)}
      </p>
      {user.costUsd > 0 && (
        <p className="mt-0.5 text-canvas/80">
          {percent(backgroundShare(user), 0)} proses latar
        </p>
      )}
    </div>
  );
}

const MOBILE_USERS = 5;

/** The scatter as a ranked list for narrow screens. */
export function DisproportionateUsers({ data }: UsersProps) {
  const typical = data.typicalCostPerAction;
  const users = data.users
    .filter((user) => user.costUsd > 0)
    .sort(
      (a, b) => (b.multiple ?? -1) - (a.multiple ?? -1) || b.costUsd - a.costUsd
    )
    .slice(0, MOBILE_USERS);

  return (
    <Card
      description={
        typical === null
          ? "Belum cukup data untuk biaya tipikal"
          : `Diurutkan menurut kelipatan dari biaya tipikal (${formatUsd(typical)}/aksi)`
      }
    >
      {users.length ? (
        <ol className="divide-y divide-ink/6">
          {users.map((user) => (
            <li
              key={user.userId}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p
                  className={cn(
                    "truncate text-sm font-semibold",
                    user.leak && "text-red-600"
                  )}
                >
                  {user.name}
                </p>
                <p className="font-mono text-[11px] text-ink-muted">
                  {formatCount(user.actions)} aksi · {formatUsd(user.costUsd)}
                </p>
              </div>
              <MultipleChip user={user} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-muted">
          Belum ada pengguna dengan biaya.
        </p>
      )}
    </Card>
  );
}

function MultipleChip({ user }: { user: CostUser }) {
  const base = "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold";
  if (user.leak && user.multiple !== null)
    return (
      <span className={cn(base, "bg-red-50 text-red-600")}>
        {formatMultiple(user.multiple)}
        <span className="sr-only"> tipikal, tidak sebanding</span>
      </span>
    );
  if (user.actions === 0)
    return (
      <span className={cn(base, "bg-amber-50 text-amber-700")}>tanpa aksi</span>
    );
  if (user.multiple === null) return null;

  return (
    <span className={cn(base, "bg-ink/6 text-ink-muted")}>
      {formatMultiple(user.multiple)}
      <span className="sr-only"> tipikal</span>
    </span>
  );
}
