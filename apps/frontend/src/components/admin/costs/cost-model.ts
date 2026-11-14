import type { AdminCostReport, AdminPlan } from "../types";
import type { KpiTileProps } from "../analytics/widgets";
import {
  COST_CATEGORIES,
  change,
  formatIdr,
  groupCosts,
  percent,
  type CostCategory,
  rateLabel,
} from "../analytics/meta";
import { formatCount, formatUsd } from "../format";

type Delta = NonNullable<KpiTileProps["delta"]>;

/** Waste above this share of a process's cost is flagged. */
export const WASTE_FLAG_SHARE = 0.05;
/** A category growth worth calling out in the ranking, in US$. */
export const GROWTH_NOTE_USD = 0.1;

function share(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/** Spend going up is a warning, doubling is bad; going down is good. */
export function costDelta(current: number, previous: number): Delta {
  if (current === previous) return { tone: "neutral", text: "sama" };
  if (previous <= 0) return { direction: "up", tone: "warn", text: "baru" };
  const pct = change(current, previous)!;
  if (Math.abs(pct) < 0.5) return { tone: "neutral", text: "sama" };

  return pct > 0
    ? {
        direction: "up",
        tone: pct > 100 ? "bad" : "warn",
        text: `+${percent(pct, 0)}`,
      }
    : { direction: "down", tone: "good", text: `−${percent(-pct, 0)}` };
}

/** Waste is small in dollars, so its change reads better as dollars. */
function wasteDelta(current: number, previous: number): Delta {
  const diff = current - previous;
  if (Math.abs(diff) < 0.005) return { tone: "neutral", text: "sama" };
  const pct = change(current, previous);
  const up = diff > 0;

  return {
    direction: up ? "up" : "down",
    tone: up ? (pct === null || pct > 100 ? "bad" : "warn") : "good",
    text: `${up ? "+" : "−"}${formatUsd(Math.abs(diff))}`,
  };
}

function countDelta(current: number, previous: number): Delta {
  const diff = current - previous;
  if (diff === 0) return { tone: "neutral", text: "sama" };

  return {
    direction: diff > 0 ? "up" : "down",
    tone: diff > 0 ? "warn" : "good",
    text: `${diff > 0 ? "+" : "−"}${formatCount(Math.abs(diff))}`,
  };
}

function cacheShare(cached: number, input: number): number | null {
  return input > 0 ? (cached / input) * 100 : null;
}

export function costKpis(data: AdminCostReport): KpiTileProps[] {
  const { current, previous, pricing } = data;
  const cache = cacheShare(current.cachedInputTokens, current.inputTokens);
  const previousCache = cacheShare(
    previous.cachedInputTokens,
    previous.inputTokens
  );

  const cachePoints =
    cache !== null && previousCache !== null
      ? Math.round(cache - previousCache)
      : null;

  return [
    {
      label: "Biaya total",
      value: formatUsd(current.costUsd),
      delta: costDelta(current.costUsd, previous.costUsd),
      detail: `≈ ${formatIdr(current.costUsd * pricing.usdIdrRate)} · ${rateLabel(pricing)}`,
    },
    {
      label: "Interaktif",
      value: formatUsd(current.interactiveUsd),
      delta: costDelta(current.interactiveUsd, previous.interactiveUsd),
      detail: `${percent(share(current.interactiveUsd, current.costUsd), 0)} · balasan, routing, suara`,
    },
    {
      label: "Proses latar",
      value: formatUsd(current.backgroundUsd),
      delta: costDelta(current.backgroundUsd, previous.backgroundUsd),
      detail: `${percent(share(current.backgroundUsd, current.costUsd), 0)} · memori, catatan, dokumen`,
    },
    {
      label: "Terbuang",
      value: formatUsd(current.wastedUsd),
      delta: wasteDelta(current.wastedUsd, previous.wastedUsd),
      detail: `${percent(share(current.wastedUsd, current.costUsd))} · gagal & diulang`,
    },
    {
      label: "Input dari cache",
      value: cache === null ? "–" : percent(cache, 0),
      delta:
        cachePoints === null
          ? undefined
          : cachePoints === 0
            ? { tone: "neutral", text: "sama" }
            : {
                direction: cachePoints > 0 ? "up" : "down",
                tone: cachePoints > 0 ? "good" : "warn",
                text: `${cachePoints > 0 ? "+" : "−"}${Math.abs(cachePoints)} poin`,
              },
      detail:
        current.inputTokens > 0
          ? `dari ${formatCount(current.inputTokens)} token input`
          : "belum ada token input",
    },
    {
      label: "Tanpa harga",
      value: `${formatCount(current.unpricedCalls)} panggilan`,
      delta: countDelta(current.unpricedCalls, previous.unpricedCalls),
      detail:
        current.unpricedCalls > 0
          ? "biaya mungkin lebih tinggi"
          : "semua panggilan berharga",
    },
  ];
}

export type FeatureRank = {
  key: CostCategory;
  label: string;
  color: string;
  costUsd: number;
  share: number;
  /** Growth vs the previous period in US$, when worth a note. */
  growth: { deltaUsd: number; isNew: boolean } | null;
};

export function featureRanking(data: AdminCostReport): FeatureRank[] {
  const current = groupCosts(data.featureCosts.current);
  const previous = groupCosts(data.featureCosts.previous);
  const total = COST_CATEGORIES.reduce((sum, { key }) => sum + current[key], 0);

  return COST_CATEGORIES.map(({ key, label, color }) => {
    const deltaUsd = current[key] - previous[key];

    return {
      key,
      label,
      color,
      costUsd: current[key],
      share: share(current[key], total),
      growth:
        deltaUsd >= GROWTH_NOTE_USD
          ? { deltaUsd, isNew: previous[key] <= 0 }
          : null,
    };
  }).sort((a, b) => b.costUsd - a.costUsd);
}

export type ConcentrationRow = {
  key: string;
  label: string;
  costUsd: number;
  cumulative: number;
  kind: "user" | "rest" | "pooled";
};

export type Concentration = {
  rows: ConcentrationRow[];
  /** Users before the divider: the fewest whose cumulative share reaches half. */
  leaders: number;
  leadersShare: number;
};

const CONCENTRATION_USERS = 7;

export function costConcentration(data: AdminCostReport): Concentration {
  const users = data.users
    .filter((user) => user.costUsd > 0)
    .sort((a, b) => b.costUsd - a.costUsd);

  const total = data.current.costUsd;
  const pooled = data.unattributedUsd + data.pooledMemoryUsd;
  const shown = users.slice(0, CONCENTRATION_USERS);
  const rest = users.slice(CONCENTRATION_USERS);

  const entries: Array<Omit<ConcentrationRow, "cumulative">> = shown.map(
    (user) => ({
      key: user.userId,
      label: user.name,
      costUsd: user.costUsd,
      kind: "user",
    })
  );

  if (rest.length)
    entries.push({
      key: "rest",
      label: `${formatCount(rest.length)} pengguna lainnya`,
      costUsd: rest.reduce((sum, user) => sum + user.costUsd, 0),
      kind: "rest",
    });
  if (pooled > 0)
    entries.push({
      key: "pooled",
      label: "Tanpa pengguna",
      costUsd: pooled,
      kind: "pooled",
    });

  let running = 0;
  const rows = entries.map((entry) => {
    running += entry.costUsd;

    return { ...entry, cumulative: Math.min(share(running, total), 100) };
  });

  const half = rows.findIndex(
    (row) => row.kind === "user" && row.cumulative >= 50
  );

  const leaders = half === -1 ? shown.length : half + 1;

  return {
    rows,
    leaders,
    leadersShare: leaders > 0 ? rows[leaders - 1]!.cumulative : 0,
  };
}

export type MarginRow = {
  userId: string;
  name: string;
  plan: AdminPlan;
  valueIdr: number;
  costIdr: number;
  marginIdr: number;
};

export type Margins = {
  /** Plus revenue one user is worth over the window. */
  plusPerPeriodIdr: number;
  days: number;
  rows: MarginRow[];
  plus: { costIdr: number; valueIdr: number; users: number };
  trial: { costIdr: number; users: number };
};

/** Days the window covers; hourly windows count as one. */
export function windowDays(data: AdminCostReport): number {
  return data.bucket === "day" ? Math.max(data.buckets.length, 1) : 1;
}

export function userMargins(data: AdminCostReport): Margins {
  const { plusPriceIdr, termDays, usdIdrRate } = data.pricing;
  const days = windowDays(data);
  const plusPerPeriodIdr = termDays > 0 ? (plusPriceIdr * days) / termDays : 0;

  const rows = data.users
    .filter((user) => user.costUsd > 0)
    .map((user) => {
      const valueIdr = user.plan === "plus" ? plusPerPeriodIdr : 0;
      const costIdr = user.costUsd * usdIdrRate;

      return {
        userId: user.userId,
        name: user.name,
        plan: user.plan,
        valueIdr,
        costIdr,
        marginIdr: valueIdr - costIdr,
      };
    })
    .sort(
      (a, b) =>
        Number(b.plan === "plus") - Number(a.plan === "plus") ||
        b.marginIdr - a.marginIdr
    );

  const plusRows = rows.filter((row) => row.plan === "plus");
  const trialRows = rows.filter((row) => row.plan === "trial");

  return {
    plusPerPeriodIdr,
    days,
    rows,
    plus: {
      costIdr: plusRows.reduce((sum, row) => sum + row.costIdr, 0),
      valueIdr: plusRows.reduce((sum, row) => sum + row.valueIdr, 0),
      users: plusRows.length,
    },
    trial: {
      costIdr: trialRows.reduce((sum, row) => sum + row.costIdr, 0),
      users: trialRows.length,
    },
  };
}

/** Share of a process's input tokens served from cache; null without input. */
export function processCache(process: {
  inputTokens: number;
  cachedInputTokens: number;
}): number | null {
  return cacheShare(process.cachedInputTokens, process.inputTokens);
}

export function isWasteFlagged(process: {
  wastedUsd: number;
  costUsd: number;
}): boolean {
  return (
    process.wastedUsd > 0 &&
    process.wastedUsd >= process.costUsd * WASTE_FLAG_SHARE
  );
}
