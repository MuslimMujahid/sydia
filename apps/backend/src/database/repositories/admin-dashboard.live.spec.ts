import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma';
import { PrismaAdminAnalyticsRepository } from './prisma-admin-analytics.repository';
import { PrismaAdminRepository } from './prisma-admin.repository';
import { PrismaBillingRepository } from './prisma-billing.repository';
import { PrismaModelUsageRepository } from './prisma-model-usage.repository';
import type { ModelUsageEntry } from '../interfaces';

const url = process.env.ADMIN_CONTRACT_DB_URL;
if (
  url &&
  (new URL(url).pathname !== '/sydia_admin_contract' ||
    !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
)
  throw new Error(
    'Admin contracts require dedicated local sydia_admin_contract database',
  );
const live = url ? describe : describe.skip;
const now = new Date('2026-11-07T12:00:00Z');
const rolloutAt = new Date('2026-10-01T00:00:00Z');
const input = {
  now,
  period: '30d' as const,
  environment: 'sandbox',
  rolloutAt,
};

live('Admin dashboard PostgreSQL contracts', () => {
  let db: PrismaService;
  let analytics: PrismaAdminAnalyticsRepository;
  let users: PrismaAdminRepository;
  let billing: PrismaBillingRepository;
  let usage: PrismaModelUsageRepository;
  beforeAll(async () => {
    db = new PrismaService(new ConfigService({ BACKEND_DB_URL: url }));
    await db.$connect();
    analytics = new PrismaAdminAnalyticsRepository(db);
    users = new PrismaAdminRepository(db);
    billing = new PrismaBillingRepository(db);
    usage = new PrismaModelUsageRepository(db);
  });

  async function clear() {
    await db.modelUsage.deleteMany();
    await db.providerUsageSnapshot.deleteMany();
    await db.billingPayment.deleteMany();
    await db.billingOrder.deleteMany();
    await db.auditEvent.deleteMany();
    await db.user.deleteMany();
  }

  beforeEach(clear);
  afterAll(async () => {
    await clear();
    await db.$disconnect();
  });

  async function account(
    id: string,
    createdAt = new Date('2026-10-15T00:00:00Z'),
  ) {
    await db.user.create({
      data: { id, name: id, email: `${id}@example.test`, createdAt },
    });
    await billing.ensureAccount(id, rolloutAt, 7);
  }

  function entry(
    overrides: Partial<ModelUsageEntry> & { createdAt?: Date },
  ): ModelUsageEntry & { createdAt?: Date } {
    return {
      userId: null,
      kind: 'message',
      job: null,
      stage: 'assistant.reply',
      provider: 'openrouter',
      model: 'test',
      attempt: 1,
      status: 'ok',
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.01,
      costMissing: false,
      conversationId: null,
      runId: null,
      ...overrides,
    };
  }

  async function payment(
    userId: string,
    key: string,
    at: Date,
    environment = 'sandbox',
  ) {
    const { order } = await billing.createOrder({
      userId,
      environment,
      idempotencyKey: key,
      amount: 29000,
      now: at,
      expiresAt: new Date(at.getTime() + 900000),
    });

    await billing.applyPayment(order.id, key, at);
  }

  test('empty data yields real zeros and Jakarta daily buckets', async () => {
    const d = await analytics.dashboard(input);
    expect(d.overview).toMatchObject({
      totalUsers: 0,
      activeUsers: 0,
      subscribedUsers: 0,
    });
    expect(d.bucket).toBe('day');
    expect(d.timeline).toHaveLength(30);
    expect(d.timeline[0]?.start).toBe('2026-10-09T00:00:00+07:00');
    expect(d.costs).toMatchObject({
      byKind: [],
      topAccounts: [],
      unpricedCalls: 0,
      trackedSince: null,
    });
    expect(d.metrics.conversion).toMatchObject({ converted: 0, trials: 0 });
  });
  test('30-day activity deduplicates channels and excludes logins and assistant activity', async () => {
    await account('chat');
    await account('old');
    await account('login');
    await account('web');
    await account('assistant');
    const web = await db.conversation.create({
      data: { userId: 'chat', channel: 'web' },
    });

    const telegram = await db.conversation.create({
      data: { userId: 'chat', channel: 'telegram' },
    });

    const auto = await db.conversation.create({
      data: { userId: 'assistant', channel: 'web' },
    });

    await db.message.createMany({
      data: [
        {
          conversationId: web.id,
          userId: 'chat',
          role: 'user',
          content: 'Hi',
          createdAt: new Date('2026-10-08T12:00:00Z'),
        },
        {
          conversationId: telegram.id,
          userId: 'chat',
          role: 'user',
          content: 'Hi',
          createdAt: new Date('2026-11-07T00:00:00Z'),
        },
        {
          conversationId: auto.id,
          userId: 'assistant',
          role: 'assistant',
          content: 'Automatic',
          createdAt: new Date('2026-11-06T00:00:00Z'),
        },
      ],
    });
    await db.auditEvent.createMany({
      data: [
        {
          userId: 'old',
          eventType: 'task.updated',
          metadata: {},
          createdAt: new Date('2026-10-08T11:59:59Z'),
        },
        {
          userId: 'web',
          eventType: 'user.activity',
          metadata: { feature: 'notes' },
          createdAt: new Date('2026-11-06T00:00:00Z'),
        },
        {
          userId: 'login',
          eventType: 'auth.login',
          metadata: {},
          createdAt: new Date('2026-11-06T00:00:00Z'),
        },
      ],
    });
    expect(
      (await analytics.dashboard({ ...input, period: '7d' })).overview
        .activeUsers,
    ).toBe(2);
    const active = await users.users(now, {
      offset: 0,
      limit: 25,
      activity: 'active',
    });

    expect(active.items.map((x) => x.id).sort()).toEqual(['chat', 'web']);
    const inactive = await users.users(now, {
      offset: 0,
      limit: 25,
      activity: 'inactive',
    });

    expect(inactive.items.map((x) => x.id).sort()).toEqual([
      'assistant',
      'login',
      'old',
    ]);
    expect(
      inactive.items.find((x) => x.id === 'login')?.lastActivityAt,
    ).toBeNull();
  });
  test('paid subscribers exclude gifts and isolate sandbox revenue and first conversion', async () => {
    await account('paid');
    await account('gift');
    await account('production');
    await payment('paid', 'first', new Date('2026-11-01T00:00:00Z'));
    await payment('paid', 'renewal', new Date('2026-11-02T00:00:00Z'));
    await payment(
      'production',
      'prod',
      new Date('2026-11-01T00:00:00Z'),
      'production',
    );
    await users.giftPlus({
      actorId: 'paid',
      userId: 'gift',
      durationDays: 30,
      requestId: 'gift',
      now,
      rolloutAt,
      trialDays: 7,
    });
    const d = await analytics.dashboard(input);
    expect(d.overview.subscribedUsers).toBe(1);
    expect(d.metrics.revenue).toMatchObject({ value: 58000, payments: 2 });
    expect(d.metrics.conversion).toMatchObject({ converted: 1, trials: 3 });
  });
  test('a gift after paid coverage expires does not revive paid subscriber status', async () => {
    await account('expired', new Date('2026-09-01T00:00:00Z'));
    await payment('expired', 'old-payment', new Date('2026-09-01T00:00:00Z'));
    await users.giftPlus({
      actorId: 'expired',
      userId: 'expired',
      durationDays: 30,
      requestId: 'gift',
      now,
      rolloutAt,
      trialDays: 7,
    });
    expect((await analytics.dashboard(input)).overview.subscribedUsers).toBe(0);
  });
  test('attention counts agree with the expiring trial and paid access filters', async () => {
    await account('trial', new Date('2026-11-04T00:00:00Z'));
    await account('paid', new Date('2026-09-01T00:00:00Z'));
    await payment('paid', 'expiring', new Date('2026-10-14T00:00:00Z'));
    const d = await analytics.dashboard(input);
    expect(d.attention).toMatchObject({ expiringTrials: 1, expiringPlus: 1 });
    expect(
      (
        await users.users(now, {
          offset: 0,
          limit: 25,
          attention: 'trial-expiring',
          environment: 'sandbox',
          rolloutAt,
        })
      ).items.map((x) => x.id),
    ).toEqual(['trial']);
    expect(
      (
        await users.users(now, {
          offset: 0,
          limit: 25,
          attention: 'plus-expiring',
          environment: 'sandbox',
          rolloutAt,
        })
      ).items.map((x) => x.id),
    ).toEqual(['paid']);
  });
  test('verified revenue remains after the customer account is deleted', async () => {
    await account('deleted');
    await payment(
      'deleted',
      'retained-payment',
      new Date('2026-11-01T00:00:00Z'),
    );
    await db.user.delete({ where: { id: 'deleted' } });
    const d = await analytics.dashboard(input);
    expect(d.metrics.revenue.value).toBe(29000);
    expect(d.overview.subscribedUsers).toBe(0);
  });
  test('billing without a rollout does not invent trials', async () => {
    await db.user.create({
      data: {
        id: 'no-billing',
        name: 'No billing',
        email: 'no-billing@example.test',
        createdAt: now,
      },
    });
    const d = await analytics.dashboard({ ...input, rolloutAt: null });
    expect(d.attention.expiringTrials).toBe(0);
    expect(d.recentUsers[0]?.plan).toBe('disabled');
    expect(
      (await users.users(now, { offset: 0, limit: 25 })).items[0]?.plan,
    ).toBe('disabled');
  });
  test('24-hour reliability excludes queued runs and assigns messages to Jakarta dates', async () => {
    await account('runs');
    const c = await db.conversation.create({
      data: { userId: 'runs', channel: 'web' },
    });

    const m = await db.message.create({
      data: {
        userId: 'runs',
        conversationId: c.id,
        role: 'user',
        content: 'Hi',
        createdAt: new Date('2026-11-06T18:00:00Z'),
      },
    });

    await db.assistantRun.createMany({
      data: [
        {
          conversationId: c.id,
          inputMessageId: m.id,
          idempotencyKey: 'completed',
          status: 'completed',
          provider: 'test',
          model: 'test',
          costUsd: '0.25',
          createdAt: new Date('2026-11-06T18:00:00Z'),
        },
        {
          conversationId: c.id,
          inputMessageId: m.id,
          idempotencyKey: 'failed',
          status: 'failed',
          provider: 'test',
          model: 'test',
          errorMessage: 'Provider timeout',
          createdAt: new Date('2026-11-06T19:00:00Z'),
        },
        {
          conversationId: c.id,
          inputMessageId: m.id,
          idempotencyKey: 'queued',
          status: 'queued',
          provider: 'test',
          model: 'test',
          createdAt: new Date('2026-11-06T20:00:00Z'),
        },
      ],
    });
    const completed = await db.assistantRun.findUniqueOrThrow({
      where: { idempotencyKey: 'completed' },
    });

    await usage.record(
      entry({
        userId: 'runs',
        costUsd: 0.25,
        createdAt: new Date('2026-11-06T18:00:00Z'),
      }),
    );

    await db.toolInvocation.createMany({
      data: [
        {
          assistantRunId: completed.id,
          toolCallId: 'task',
          name: 'create_task',
          label: 'Tugas',
          status: 'completed',
          arguments: {},
          idempotencyKey: 'task-tool',
          createdAt: new Date('2026-11-06T18:00:00Z'),
        },
        {
          assistantRunId: completed.id,
          toolCallId: 'reminder',
          name: 'create_reminder',
          label: 'Pengingat',
          status: 'failed',
          arguments: {},
          idempotencyKey: 'failed-tool',
          createdAt: new Date('2026-11-06T18:00:00Z'),
        },
      ],
    });
    const d = await analytics.dashboard(input);
    expect(d.adoption).toEqual([{ feature: 'tasks', users: 1 }]);
    expect(d.metrics.reliability).toMatchObject({
      value: 50,
      completed: 1,
      failed: 1,
    });
    expect(
      d.timeline.find((x) => x.start === '2026-11-07T00:00:00+07:00'),
    ).toMatchObject({ messages: 1, activeUsers: 1, costUsd: 0.25 });
    expect(d.failures[0]?.errorMessage).toBe('Provider timeout');
    expect(d.failures[0]?.createdAt).toMatch(/Z|\+00:00$/);
  });

  test('model cost comes from every recorded call, split by purpose and account', async () => {
    await account('heavy');
    await account('light');
    await account('gone');
    const at = new Date('2026-11-07T03:00:00Z');

    await usage.record(entry({ userId: 'heavy', costUsd: 0.5, createdAt: at }));
    await usage.record(
      entry({
        userId: 'heavy',
        stage: 'decision.turn',
        costUsd: 0.01,
        createdAt: at,
      }),
    );
    await usage.record(
      entry({
        userId: 'heavy',
        status: 'failed',
        attempt: 1,
        costUsd: 0.02,
        costMissing: true,
        createdAt: at,
      }),
    );
    await usage.record(
      entry({
        userId: 'light',
        kind: 'background',
        job: 'conversation-summaries',
        stage: 'conversation-summary',
        costUsd: 0.1,
        createdAt: at,
      }),
    );
    await usage.record(
      entry({
        kind: 'background',
        job: 'secretary',
        stage: 'embedding',
        costUsd: null,
        costMissing: true,
        createdAt: at,
      }),
    );
    await usage.record(entry({ userId: 'gone', costUsd: 0.04, createdAt: at }));
    // Outside the period: counted as the previous period only.
    await usage.record(
      entry({
        userId: 'light',
        costUsd: 9,
        createdAt: new Date('2026-09-20T00:00:00Z'),
      }),
    );
    await db.user.delete({ where: { id: 'gone' } });

    const d = await analytics.dashboard(input);

    expect(d.metrics.cost.value).toBeCloseTo(0.67);
    expect(d.metrics.cost.previous).toBeCloseTo(9);
    expect(d.costs.byKind).toEqual([
      { kind: 'message', costUsd: 0.57, calls: 4 },
      { kind: 'background', costUsd: 0.1, calls: 2 },
    ]);
    expect(d.costs.breakdown).toContainEqual({
      kind: 'background',
      job: 'secretary',
      stage: 'embedding',
      costUsd: 0,
      calls: 1,
      failedCalls: 0,
      unpricedCalls: 1,
    });
    expect(d.costs.topAccounts.map((x) => [x.userId, x.costUsd])).toEqual([
      ['heavy', 0.53],
      ['light', 0.1],
    ]);
    // A deleted account's spend stays in the totals without an owner.
    expect(d.costs.unattributedUsd).toBeCloseTo(0.04);
    expect(d.costs.failedUsd).toBeCloseTo(0.02);
    expect(d.costs.unpricedCalls).toBe(2);
    expect(d.costs.trackedSince).toBe('2026-09-20T00:00:00.000Z');
    expect(d.overview.llmCostUsd).toBeCloseTo(9.67);

    const page = await users.users(now, { offset: 0, limit: 25, sort: 'cost' });
    expect(page.items.map((x) => x.id)).toEqual(['heavy', 'light']);
    expect(page.items[0]).toMatchObject({
      llmCost30DaysUsd: 0.53,
      llmCost30DaysByKind: [{ kind: 'message', costUsd: 0.53, calls: 3 }],
    });
    expect(page.items[1]?.llmCostUsd).toBeCloseTo(9.1);
  });

  test('today and the last 24 hours use hourly Jakarta buckets', async () => {
    await account('hourly');
    // 2026-11-07 19:00 Jakarta is 12:00Z; today began at 17:00Z the day before.
    await usage.record(
      entry({
        userId: 'hourly',
        costUsd: 0.3,
        createdAt: new Date('2026-11-07T10:30:00Z'),
      }),
    );
    await usage.record(
      entry({
        userId: 'hourly',
        costUsd: 0.7,
        createdAt: new Date('2026-11-06T16:30:00Z'),
      }),
    );

    const today = await analytics.dashboard({ ...input, period: 'today' });
    expect(today).toMatchObject({
      bucket: 'hour',
      from: '2026-11-06T17:00:00.000Z',
    });
    expect(today.timeline).toHaveLength(20);
    expect(today.timeline[0]?.start).toBe('2026-11-07T00:00:00+07:00');
    expect(
      today.timeline.find((x) => x.start === '2026-11-07T17:00:00+07:00')
        ?.costUsd,
    ).toBe(0.3);
    expect(today.metrics.cost).toMatchObject({ value: 0.3, previous: 0 });

    const day = await analytics.dashboard({ ...input, period: '24h' });
    expect(day.from).toBe('2026-11-06T12:00:00.000Z');
    expect(day.timeline).toHaveLength(25);
    expect(day.metrics.cost.value).toBeCloseTo(1);
  });

  test('cumulative provider spend records growth since the last reading', async () => {
    const reading = (totalUsd: number, takenAt: string) =>
      usage.recordCumulative({
        source: 'openrouter-key:hindsight',
        totalUsd,
        takenAt: new Date(takenAt),
        entry: {
          ...entry({ kind: 'hindsight', stage: 'hindsight' }),
          job: 'hindsight',
        },
      });

    expect(await reading(5, '2026-11-07T10:00:00Z')).toBe(0);
    const concurrent = await Promise.all([
      reading(5.5, '2026-11-07T10:05:00Z'),
      reading(5.5, '2026-11-07T10:05:00Z'),
    ]);

    expect(concurrent.sort()).toEqual([0, 0.5]);
    // A replaced key starts lower; it becomes the new baseline.
    expect(await reading(1, '2026-11-07T10:10:00Z')).toBe(0);
    expect(await reading(1.25, '2026-11-07T10:15:00Z')).toBe(0.25);

    const d = await analytics.dashboard({ ...input, period: 'today' });
    expect(d.costs.byKind).toEqual([
      { kind: 'hindsight', costUsd: 0.75, calls: 2 },
    ]);
    expect(d.costs.unattributedUsd).toBe(0);
  });
});
