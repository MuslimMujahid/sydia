import { describe, expect, it } from '@jest/globals';
import type {
  AdminSummaryData,
  AdminTotals,
  AdminUserActivity,
} from '../../database/interfaces';
import {
  attentionItems,
  buildUsage,
  costMultiple,
  isLeak,
  movers,
  typicalCostPerAction,
  userGroup,
} from './admin-insights';

const totals = (overrides: Partial<AdminTotals> = {}): AdminTotals => ({
  activeUsers: 0,
  messages: 0,
  costUsd: 0,
  interactiveUsd: 0,
  backgroundUsd: 0,
  wastedUsd: 0,
  revenueIdr: 0,
  payments: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  unpricedCalls: 0,
  ...overrides,
});

const user = (overrides: Partial<AdminUserActivity>): AdminUserActivity => ({
  userId: 'u',
  name: 'User',
  email: 'u@example.test',
  plan: 'trial',
  actions: 0,
  previousActions: 0,
  activeDays: 0,
  costUsd: 0,
  previousCostUsd: 0,
  backgroundUsd: 0,
  growthFeature: null,
  firstMessageAt: null,
  ...overrides,
});

function summary(overrides: Partial<AdminSummaryData>): AdminSummaryData {
  return {
    generatedAt: '2026-11-13T13:00:00Z',
    from: '2026-11-06T17:00:00Z',
    until: '2026-11-13T13:00:00Z',
    period: '7d',
    bucket: 'day',
    timezone: 'Asia/Jakarta',
    buckets: [],
    totalAccounts: 0,
    current: totals(),
    previous: totals(),
    series: {
      activeUsers: [],
      messages: [],
      costUsd: [],
      interactiveUsd: [],
      backgroundUsd: [],
      revenueIdr: [],
      featureCosts: [],
    },
    normal: null,
    featureCosts: { current: {}, previous: {} },
    users: [],
    wastedTopStage: null,
    runs: { failed: 0, total: 0, lastFailedAt: null, lastError: null },
    failures: [],
    expiring: { trials: 0, activeTrials: 0, plus: 0 },
    channels: [],
    newAccounts: [],
    ...overrides,
  };
}

describe('typical cost and leaks', () => {
  const users = [
    { actions: 46, costUsd: 0.96 },
    { actions: 37, costUsd: 0.61 },
    { actions: 18, costUsd: 0.22 },
    { actions: 2, costUsd: 0.5 },
  ];

  it('uses the median cost per action of users with enough actions', () => {
    expect(typicalCostPerAction(users)).toBeCloseTo(0.61 / 37);
  });

  it('flags spend several times the typical cost of the same actions', () => {
    const typical = 0.02;
    expect(isLeak({ actions: 3, costUsd: 0.74 }, typical)).toBe(true);
    expect(isLeak({ actions: 46, costUsd: 0.96 }, typical)).toBe(false);
    expect(costMultiple({ actions: 0, costUsd: 0.1 }, typical)).toBeCloseTo(5);
  });

  it('never flags noise-level spend or anything without a typical rate', () => {
    expect(isLeak({ actions: 0, costUsd: 0.05 }, 0.001)).toBe(false);
    expect(isLeak({ actions: 0, costUsd: 5 }, null)).toBe(false);
  });
});

describe('attentionItems', () => {
  it('flags cost growing much faster than messages, with its drivers', () => {
    const items = attentionItems(
      summary({
        current: totals({ costUsd: 4.32, messages: 58 }),
        previous: totals({ costUsd: 2.1, messages: 41 }),
        featureCosts: {
          current: { documents: 0.71, memory: 0.98, chat: 0.8 },
          previous: { memory: 0.37, chat: 0.9 },
        },
      }),
      null,
    );

    expect(items[0]).toMatchObject({
      kind: 'cost-outpacing',
      drivers: [
        { feature: 'documents', deltaUsd: 0.71 },
        { feature: 'memory' },
      ],
    });
  });

  it('stays quiet when cost and usage grow together', () => {
    expect(
      attentionItems(
        summary({
          current: totals({ costUsd: 2.2, messages: 60 }),
          previous: totals({ costUsd: 2, messages: 50 }),
        }),
        null,
      ),
    ).toEqual([]);
  });

  it('lists leaking users, wasted spend and operational items', () => {
    const items = attentionItems(
      summary({
        current: totals({ costUsd: 2, wastedUsd: 0.2 }),
        previous: totals({ costUsd: 2 }),
        users: [
          user({
            userId: 'arif',
            actions: 3,
            costUsd: 0.74,
            backgroundUsd: 0.68,
          }),
        ],
        wastedTopStage: 'memory-dream.extract',
        runs: {
          failed: 2,
          total: 74,
          lastFailedAt: null,
          lastError: 'timeout',
        },
        expiring: { trials: 5, activeTrials: 2, plus: 0 },
      }),
      0.02,
    );

    expect(items.map((item) => item.kind)).toEqual([
      'user-leak',
      'wasted',
      'failed-runs',
      'expiring-trials',
    ]);
    expect(items[0]).toMatchObject({
      userId: 'arif',
      backgroundShare: expect.closeTo(0.919, 2),
    });
  });
});

describe('movers', () => {
  it('ranks new users, cost jumps and activity changes', () => {
    const result = movers(
      [
        user({ userId: 'bima', costUsd: 1.42, previousCostUsd: 0.32 }),
        user({ userId: 'dewi', actions: 37, previousActions: 16 }),
        user({
          userId: 'nadia',
          actions: 3,
          firstMessageAt: '2026-11-12T03:00:00.000Z',
        }),
        user({ userId: 'quiet', actions: 2, previousActions: 1 }),
      ],
      '2026-11-06T17:00:00Z',
    );

    expect(result.map((mover) => [mover.userId, mover.kind])).toEqual([
      ['bima', 'cost'],
      ['dewi', 'actions'],
      ['nadia', 'new'],
    ]);
  });
});

describe('userGroup', () => {
  it('separates power, regular and casual users by active days and breadth', () => {
    expect(userGroup(6, 5, 7)).toBe('power');
    expect(userGroup(6, 2, 7)).toBe('regular');
    expect(userGroup(3, 4, 7)).toBe('regular');
    expect(userGroup(1, 1, 7)).toBe('casual');
  });
});

describe('buildUsage', () => {
  const usageUser = (userId: string, chat: number, costUsd: number) => ({
    userId,
    name: userId,
    email: `${userId}@example.test`,
    plan: 'trial' as const,
    activeDays: 1,
    actions: { chat },
    costUsd,
    costs: { chat: costUsd },
    activity: [chat],
  });

  it('flags a user spending several times the typical cost of their actions', () => {
    const report = buildUsage({
      generatedAt: '2026-11-13T13:00:00Z',
      from: '2026-11-13T00:00:00Z',
      until: '2026-11-13T13:00:00Z',
      period: 'today',
      bucket: 'hour',
      timezone: 'Asia/Jakarta',
      buckets: [],
      totalAccounts: 4,
      dormantAccounts: 0,
      neverActiveAccounts: 0,
      users: [
        usageUser('rani', 40, 0.8),
        usageUser('dewi', 30, 0.6),
        usageUser('arif', 3, 0.74),
      ],
      features: [],
      featureCosts: {},
      pooledMemoryUsd: 0,
    });

    expect(report.typicalCostPerAction).toBeCloseTo(0.02);
    expect(report.users.map((entry) => [entry.userId, entry.leak])).toEqual([
      ['rani', false],
      ['dewi', false],
      ['arif', true],
    ]);
  });
});
