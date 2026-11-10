import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { AdminDashboard } from '../../database/interfaces';
import { PrismaAdminAnalyticsRepository } from '../../database/repositories/prisma-admin-analytics.repository';
import type { HindsightUsageService } from '../../infra/model-usage';
import type { PrismaService } from '../../infra/prisma';
import { AdminDashboardService } from './admin-dashboard.service';

const metric = { value: 0, previous: 0, series: [] };

function dashboard(): AdminDashboard {
  return {
    generatedAt: '2026-11-07T12:00:00Z',
    from: '2026-10-09T00:00:00Z',
    until: '2026-11-07T12:00:00Z',
    period: '30d',
    bucket: 'day',
    timezone: 'Asia/Jakarta',
    environment: 'sandbox',
    overview: {
      totalUsers: 0,
      allowedUsers: 0,
      activeUsers: 0,
      subscribedUsers: 0,
      bannedUsers: 0,
      activeSessions: 0,
      storageBytes: 0,
      llmCostUsd: 0,
      llmCostBreakdown: [],
    },
    metrics: {
      registrations: metric,
      activeUsers: metric,
      conversion: { ...metric, converted: 0, trials: 0 },
      revenue: { ...metric, payments: 0 },
      cost: metric,
      reliability: { ...metric, completed: 0, failed: 0 },
    },
    attention: {
      failedRuns: 0,
      totalRuns: 0,
      expiringTrials: 0,
      expiringPlus: 0,
      activeExpiringTrials: 0,
    },
    failures: [],
    timeline: [],
    costs: {
      byKind: [],
      breakdown: [],
      topAccounts: [],
      unattributedUsd: 0,
      failedUsd: 0,
      unpricedCalls: 0,
      trackedSince: null,
      hindsightTracked: false,
    },
    channels: [],
    adoption: [],
    acquisition: [],
    models: [],
    recentUsers: [],
  };
}

function setup() {
  const query = jest
    .fn<
      () => Promise<
        Array<{ dashboard: AdminDashboard; missingReceipts: bigint }>
      >
    >()
    .mockResolvedValue([{ dashboard: dashboard(), missingReceipts: 0n }]);

  const repository = new PrismaAdminAnalyticsRepository({
    $queryRaw: query,
  } as unknown as PrismaService);

  return {
    query,
    service: new AdminDashboardService(
      repository,
      new ConfigService({ MAYAR_ENVIRONMENT: 'sandbox' }),
      { configured: true } as HindsightUsageService,
    ),
  };
}

describe('AdminDashboardService cache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-07T12:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  test('coalesces concurrent requests and refreshes after two minutes', async () => {
    const { query, service } = setup();
    await Promise.all([service.dashboard('30d'), service.dashboard('30d')]);
    await service.dashboard('30d');
    expect(query).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(120_000);
    await service.dashboard('30d');
    expect(query).toHaveBeenCalledTimes(2);
  });
  test('today and the last 24 hours refresh after thirty seconds', async () => {
    const { query, service } = setup();
    await service.dashboard('today');
    jest.advanceTimersByTime(29_000);
    await service.dashboard('today');
    expect(query).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1_000);
    await service.dashboard('today');
    expect(query).toHaveBeenCalledTimes(2);
  });
  test('reports whether Hindsight spend is tracked', async () => {
    const { service } = setup();
    await expect(service.dashboard('7d')).resolves.toMatchObject({
      costs: { hindsightTracked: true },
    });
  });
  test('periods cache independently', async () => {
    const { query, service } = setup();
    await service.dashboard('7d');
    await service.dashboard('30d');
    await service.dashboard('7d');
    expect(query).toHaveBeenCalledTimes(2);
  });
  test('failed aggregation rejects and the next request can recover', async () => {
    const { query, service } = setup();
    query.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.dashboard('30d')).rejects.toThrow(
      'database unavailable',
    );
    await expect(service.dashboard('30d')).resolves.toMatchObject({
      period: '30d',
    });
  });
  test('invalidating during aggregation prevents old results from repopulating the cache', async () => {
    const { query, service } = setup();
    let resolve!: (
      value: Array<{ dashboard: AdminDashboard; missingReceipts: bigint }>,
    ) => void;

    query.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const old = service.dashboard('30d');
    service.invalidate();
    await service.dashboard('30d');
    resolve([
      {
        dashboard: { ...dashboard(), generatedAt: 'old' },
        missingReceipts: 0n,
      },
    ]);
    await old;
    expect((await service.dashboard('30d')).generatedAt).toBe(
      '2026-11-07T12:00:00Z',
    );
    expect(query).toHaveBeenCalledTimes(2);
  });
});
