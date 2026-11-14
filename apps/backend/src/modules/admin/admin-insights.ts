import type {
  AdminCostsData,
  AdminSummaryData,
  AdminUsageData,
  AdminUserActivity,
  AdminWindow,
} from '../../database/interfaces';
import type { UsageFeature } from '../../shared/activity/usage-features';

/** A user counts toward the typical rate only with enough actions to be stable. */
const TYPICAL_MIN_ACTIONS = 3;
/** Spend below this is noise, never a leak. */
const LEAK_MIN_USD = 0.1;
/** Spend this many times the typical cost of the same actions is a leak. */
export const LEAK_MULTIPLE = 3;

export type CostedUser = { actions: number; costUsd: number };

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Median cost per action across users with a stable number of actions. */
export function typicalCostPerAction(
  users: readonly CostedUser[],
): number | null {
  return median(
    users
      .filter((user) => user.actions >= TYPICAL_MIN_ACTIONS && user.costUsd > 0)
      .map((user) => user.costUsd / user.actions),
  );
}

/**
 * How many times the typical cost of their actions a user spent; null when
 * there is no typical rate yet. A user without actions counts as one action.
 */
export function costMultiple(
  user: CostedUser,
  typical: number | null,
): number | null {
  if (typical === null || typical <= 0) return null;

  return user.costUsd / (Math.max(user.actions, 1) * typical);
}

export function isLeak(user: CostedUser, typical: number | null): boolean {
  const multiple = costMultiple(user, typical);

  return (
    user.costUsd >= LEAK_MIN_USD &&
    multiple !== null &&
    multiple >= LEAK_MULTIPLE
  );
}

/** Relative change in percent; null without a previous value. */
export function change(value: number, previous: number): number | null {
  return previous > 0 ? ((value - previous) / previous) * 100 : null;
}

export type AdminAttention =
  | {
      kind: 'cost-outpacing';
      costChange: number;
      messageChange: number | null;
      drivers: Array<{ feature: UsageFeature; deltaUsd: number }>;
    }
  | {
      kind: 'user-leak';
      userId: string;
      name: string;
      costUsd: number;
      actions: number;
      multiple: number;
      backgroundShare: number;
    }
  | { kind: 'wasted'; costUsd: number; share: number; topStage: string | null }
  | {
      kind: 'failed-runs';
      failed: number;
      total: number;
      lastFailedAt: string | null;
      lastError: string | null;
    }
  | { kind: 'expiring-trials'; count: number; active: number }
  | { kind: 'expiring-plus'; count: number };

/** Cost growth this much faster than message growth (in points) is flagged. */
const OUTPACE_POINTS = 25;
/** Wasted spend at or above this share of the total is flagged. */
const WASTED_SHARE = 0.05;

export function attentionItems(
  data: AdminSummaryData,
  typical: number | null,
): AdminAttention[] {
  const items: AdminAttention[] = [];
  const { current, previous } = data;
  const costChange = change(current.costUsd, previous.costUsd);
  const messageChange = change(current.messages, previous.messages);

  if (
    costChange !== null &&
    costChange > 0 &&
    costChange - (messageChange ?? 0) >= OUTPACE_POINTS
  )
    items.push({
      kind: 'cost-outpacing',
      costChange,
      messageChange,
      drivers: featureDeltas(
        data.featureCosts.current,
        data.featureCosts.previous,
      )
        .filter((entry) => entry.deltaUsd > 0)
        .slice(0, 2),
    });

  for (const user of data.users
    .filter((entry) => isLeak(entry, typical))
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, 3))
    items.push({
      kind: 'user-leak',
      userId: user.userId,
      name: user.name,
      costUsd: user.costUsd,
      actions: user.actions,
      multiple: costMultiple(user, typical)!,
      backgroundShare: user.costUsd ? user.backgroundUsd / user.costUsd : 0,
    });

  if (
    current.costUsd > 0 &&
    current.wastedUsd / current.costUsd >= WASTED_SHARE
  )
    items.push({
      kind: 'wasted',
      costUsd: current.wastedUsd,
      share: current.wastedUsd / current.costUsd,
      topStage: data.wastedTopStage,
    });

  if (data.runs.failed > 0) items.push({ kind: 'failed-runs', ...data.runs });
  if (data.expiring.trials > 0)
    items.push({
      kind: 'expiring-trials',
      count: data.expiring.trials,
      active: data.expiring.activeTrials,
    });
  if (data.expiring.plus > 0)
    items.push({ kind: 'expiring-plus', count: data.expiring.plus });

  return items;
}

export function featureDeltas(
  current: Partial<Record<UsageFeature, number>>,
  previous: Partial<Record<UsageFeature, number>>,
): Array<{ feature: UsageFeature; deltaUsd: number }> {
  const features = new Set([
    ...Object.keys(current),
    ...Object.keys(previous),
  ]) as Set<UsageFeature>;

  return [...features]
    .map((feature) => ({
      feature,
      deltaUsd: (current[feature] ?? 0) - (previous[feature] ?? 0),
    }))
    .sort((a, b) => b.deltaUsd - a.deltaUsd);
}

export type AdminMover = {
  userId: string;
  name: string;
  kind: 'cost' | 'actions' | 'new';
  delta: number;
  feature: UsageFeature | null;
  actions: number;
  previousActions: number;
  activeDays: number;
};

/** Cost changes below this are not worth a row. */
const MOVER_MIN_USD = 0.05;
const MOVER_MIN_ACTIONS = 5;

/** The users whose spend or activity changed most against the previous window. */
export function movers(
  users: readonly AdminUserActivity[],
  from: string,
  limit = 5,
): AdminMover[] {
  const candidates = users.flatMap(
    (user): Array<AdminMover & { score: number }> => {
      const base = {
        userId: user.userId,
        name: user.name,
        feature: user.growthFeature,
        actions: user.actions,
        previousActions: user.previousActions,
        activeDays: user.activeDays,
      };

      if (
        user.firstMessageAt &&
        user.firstMessageAt >= from &&
        user.actions > 0
      )
        return [{ ...base, kind: 'new', delta: user.actions, score: 1 }];

      const costDelta = user.costUsd - user.previousCostUsd;
      const actionDelta = user.actions - user.previousActions;
      const rows: Array<AdminMover & { score: number }> = [];

      if (Math.abs(costDelta) >= MOVER_MIN_USD)
        rows.push({
          ...base,
          kind: 'cost',
          delta: costDelta,
          score: Math.abs(costDelta) / 0.25,
        });
      if (Math.abs(actionDelta) >= MOVER_MIN_ACTIONS)
        rows.push({
          ...base,
          kind: 'actions',
          delta: actionDelta,
          score: Math.abs(actionDelta) / 10,
        });

      return rows.sort((a, b) => b.score - a.score).slice(0, 1);
    },
  );

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((candidate): AdminMover => ({
      userId: candidate.userId,
      name: candidate.name,
      kind: candidate.kind,
      delta: candidate.delta,
      feature: candidate.feature,
      actions: candidate.actions,
      previousActions: candidate.previousActions,
      activeDays: candidate.activeDays,
    }));
}

export type AdminUserGroup = 'power' | 'regular' | 'casual';

/** Days a window covers; hourly windows count as one day. */
export function windowDays(
  window: Pick<AdminWindow, 'bucket' | 'buckets'>,
): number {
  return window.bucket === 'day' ? window.buckets.length : 1;
}

/**
 * How engaged an active user is: power users act on most days across three or
 * more features, regular users on a good share of days, casual users rarely.
 */
export function userGroup(
  activeDays: number,
  features: number,
  days: number,
): AdminUserGroup {
  const share = activeDays / Math.max(days, 1);

  if (share >= 0.7 && features >= 3) return 'power';
  if (share >= 0.4) return 'regular';

  return 'casual';
}

export type AdminSummary = Omit<AdminSummaryData, 'users'> & {
  typicalCostPerAction: number | null;
  attention: AdminAttention[];
  movers: AdminMover[];
};

export function buildSummary(data: AdminSummaryData): AdminSummary {
  const typical = typicalCostPerAction(data.users);
  const { users, ...rest } = data;

  return {
    ...rest,
    typicalCostPerAction: typical,
    attention: attentionItems(data, typical),
    movers: movers(users, data.from),
  };
}

export type AdminUsage = Omit<AdminUsageData, 'users'> & {
  days: number;
  typicalCostPerAction: number | null;
  users: Array<
    AdminUsageData['users'][number] & {
      group: AdminUserGroup;
      multiple: number | null;
      leak: boolean;
    }
  >;
  groups: Record<AdminUserGroup | 'dormant' | 'inactive', number>;
};

export function buildUsage(data: AdminUsageData): AdminUsage {
  const days = windowDays(data);
  const typical = typicalCostPerAction(
    data.users.map((user) => ({
      actions: total(user.actions),
      costUsd: user.costUsd,
    })),
  );

  const users = data.users
    .map((user) => ({
      ...user,
      multiple: costMultiple(
        { actions: total(user.actions), costUsd: user.costUsd },
        typical,
      ),
      leak: isLeak(
        { actions: total(user.actions), costUsd: user.costUsd },
        typical,
      ),
      group: userGroup(
        user.activeDays,
        Object.values(user.actions).filter((value) => (value ?? 0) > 0).length,
        days,
      ),
    }))
    .sort(
      (a, b) => total(b.actions) - total(a.actions) || b.costUsd - a.costUsd,
    );

  const count = (group: AdminUserGroup) =>
    users.filter((user) => user.group === group).length;

  return {
    ...data,
    days,
    typicalCostPerAction: typical,
    users,
    groups: {
      power: count('power'),
      regular: count('regular'),
      casual: count('casual'),
      dormant: data.dormantAccounts,
      inactive: data.neverActiveAccounts,
    },
  };
}

function total(counts: Partial<Record<string, number>>): number {
  return Object.values(counts).reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0,
  );
}

export type AdminPricing = {
  plusPriceIdr: number;
  termDays: number;
  usdIdrRate: number;
  /** `ecb` for the live reference rate, `fallback` for the configured one. */
  rateSource: 'ecb' | 'fallback';
  /** The business day of the ECB rate, `YYYY-MM-DD`; null for the fallback. */
  rateDate: string | null;
};

export type AdminCosts = Omit<AdminCostsData, 'users'> & {
  typicalCostPerAction: number | null;
  pricing: AdminPricing;
  users: Array<
    AdminCostsData['users'][number] & {
      multiple: number | null;
      leak: boolean;
    }
  >;
};

export function buildCosts(
  data: AdminCostsData,
  pricing: AdminPricing,
): AdminCosts {
  const typical = typicalCostPerAction(data.users);

  return {
    ...data,
    typicalCostPerAction: typical,
    pricing,
    users: data.users.map((user) => ({
      ...user,
      multiple: costMultiple(user, typical),
      leak: isLeak(user, typical),
    })),
  };
}
