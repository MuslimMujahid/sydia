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
  period: '7d' as const,
  environment: 'sandbox',
  rolloutAt,
};

live('Admin analytics PostgreSQL contracts', () => {
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
    await db.toolInvocation.deleteMany();
    await db.assistantRun.deleteMany();
    await db.message.deleteMany();
    await db.conversation.deleteMany();
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
      feature: 'chat',
      featureCosts: null,
      cachedInputTokens: null,
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

  async function message(
    userId: string,
    createdAt: Date,
    channel = 'web',
  ): Promise<{ conversationId: string; messageId: string }> {
    const conversation = await db.conversation.create({
      data: { userId, channel, title: `${userId} ${channel}` },
    });

    const created = await db.message.create({
      data: {
        conversationId: conversation.id,
        userId,
        role: 'user',
        content: 'Hi',
        createdAt,
      },
    });

    return { conversationId: conversation.id, messageId: created.id };
  }

  async function tools(
    userId: string,
    createdAt: Date,
    calls: Array<{ name: string; status?: string }>,
  ) {
    const { conversationId, messageId } = await message(userId, createdAt);
    const run = await db.assistantRun.create({
      data: {
        conversationId,
        inputMessageId: messageId,
        idempotencyKey: `run-${userId}-${createdAt.getTime()}`,
        status: 'completed',
        provider: 'test',
        model: 'test',
        createdAt,
      },
    });

    await db.toolInvocation.createMany({
      data: calls.map((call, index) => ({
        assistantRunId: run.id,
        toolCallId: `${run.id}-${index}`,
        name: call.name,
        label: call.name,
        status: call.status ?? 'completed',
        arguments: {},
        idempotencyKey: `${run.id}-${index}`,
        createdAt,
      })),
    });

    return { conversationId, runId: run.id };
  }

  test('empty data yields real zeros and Jakarta buckets', async () => {
    const week = await analytics.summary(input);
    expect(week.buckets).toHaveLength(7);
    expect(week.buckets[0]).toBe('2026-11-01T00:00:00+07:00');
    expect(week.series.messages).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(week.current).toMatchObject({
      activeUsers: 0,
      messages: 0,
      costUsd: 0,
      revenueIdr: 0,
    });
    expect(week.normal).toBeNull();

    const today = await analytics.summary({ ...input, period: 'today' });
    expect(today.bucket).toBe('hour');
    expect(today.buckets[0]).toBe('2026-11-07T00:00:00+07:00');
    expect(today.buckets).toHaveLength(20);
    expect(today.normal).toHaveLength(20);

    const costs = await analytics.costs(input);
    expect(costs).toMatchObject({ processes: [], users: [], models: [] });
  });

  test('actions count messages, app writes and completed feature tools only', async () => {
    await account('chat');
    await account('web');
    await account('login');
    await account('assistant');
    const day = new Date('2026-11-06T03:00:00Z');
    await tools('chat', day, [
      { name: 'create_task' },
      { name: 'save_memory' },
      { name: 'update_plan' },
      { name: 'create_reminder', status: 'failed' },
    ]);
    await message('chat', new Date('2026-11-07T01:00:00Z'), 'telegram');
    const auto = await db.conversation.create({
      data: { userId: 'assistant', channel: 'web' },
    });

    await db.message.create({
      data: {
        conversationId: auto.id,
        userId: 'assistant',
        role: 'assistant',
        content: 'Automatic',
        createdAt: day,
      },
    });
    await db.auditEvent.createMany({
      data: [
        {
          userId: 'web',
          eventType: 'user.activity',
          metadata: { feature: 'memories' },
          createdAt: day,
        },
        {
          userId: 'login',
          eventType: 'auth.login',
          metadata: {},
          createdAt: day,
        },
      ],
    });

    const usageData = await analytics.usage(input);
    const chat = usageData.users.find((user) => user.userId === 'chat');
    expect(chat).toMatchObject({
      activeDays: 2,
      actions: { chat: 2, tasks: 1, memory: 1 },
    });
    expect(chat?.activity).toHaveLength(usageData.buckets.length);
    expect(chat?.activity.filter((count) => count > 0)).toHaveLength(2);
    expect(chat?.activity.reduce((sum, count) => sum + count, 0)).toBe(4);
    expect(typeof chat?.costs).toBe('object');
    expect(
      usageData.users.find((user) => user.userId === 'web')?.actions,
    ).toEqual({
      memory: 1,
    });
    expect(usageData.users.map((user) => user.userId).sort()).toEqual([
      'chat',
      'web',
    ]);
    expect(usageData.neverActiveAccounts).toBe(3);
    expect(
      usageData.features.find((f) => f.feature === 'memory'),
    ).toMatchObject({
      users: 2,
      actions: 2,
      returning: 0,
    });

    const summary = await analytics.summary(input);
    expect(summary.current).toMatchObject({ activeUsers: 2, messages: 2 });
    expect(summary.channels).toEqual(
      expect.arrayContaining([
        { channel: 'web', messages: 1, users: 1 },
        { channel: 'telegram', messages: 1, users: 1 },
      ]),
    );
  });

  test('costs expand per-feature splits without double-counting calls', async () => {
    await account('split');
    const { conversationId, runId } = await tools(
      'split',
      new Date('2026-11-06T03:00:00Z'),
      [{ name: 'create_task' }],
    );

    await usage.record(
      entry({
        userId: 'split',
        conversationId,
        runId,
        costUsd: 0.06,
        cachedInputTokens: 4,
        feature: 'chat',
        featureCosts: { tasks: 0.04, memory: 0.02 },
        createdAt: new Date('2026-11-06T03:00:00Z'),
      }),
    );
    await usage.record(
      entry({
        userId: 'split',
        kind: 'background',
        job: 'memory-dreams',
        stage: 'memory-dream.extract',
        feature: 'memory',
        attempt: 2,
        costUsd: 0.01,
        createdAt: new Date('2026-11-06T04:00:00Z'),
      }),
    );
    await usage.record(
      entry({
        kind: 'hindsight',
        stage: 'hindsight',
        feature: 'memory',
        costUsd: 0.03,
        createdAt: new Date('2026-11-06T05:00:00Z'),
      }),
    );
    await usage.record(
      entry({
        stage: 'decision.turn',
        feature: 'overhead',
        costUsd: 0.005,
        costMissing: true,
        createdAt: new Date('2026-11-06T05:00:00Z'),
      }),
    );

    const costs = await analytics.costs(input);
    expect(costs.current.costUsd).toBeCloseTo(0.105);
    expect(costs.current.interactiveUsd).toBeCloseTo(0.065);
    expect(costs.current.backgroundUsd).toBeCloseTo(0.04);
    expect(costs.current.wastedUsd).toBeCloseTo(0.01);
    expect(costs.current.unpricedCalls).toBe(1);
    expect(costs.current.cachedInputTokens).toBe(4);
    expect(costs.featureCosts.current.tasks).toBeCloseTo(0.04);
    expect(costs.featureCosts.current.memory).toBeCloseTo(0.06);
    expect(costs.pooledMemoryUsd).toBeCloseTo(0.03);
    expect(costs.unattributedUsd).toBeCloseTo(0.005);
    const reply = costs.processes.find((p) => p.stage === 'assistant.reply');
    expect(reply).toMatchObject({ calls: 1, feature: 'tasks' });
    expect(reply?.costUsd).toBeCloseTo(0.06);
    const dream = costs.processes.find(
      (p) => p.stage === 'memory-dream.extract',
    );

    expect(dream).toMatchObject({ retried: 1, calls: 1 });
    expect(dream?.wastedUsd).toBeCloseTo(0.01);
    expect(costs.users).toEqual([
      expect.objectContaining({
        userId: 'split',
        actions: 2,
        featureActions: { chat: 1, tasks: 1 },
      }),
    ]);
    expect(costs.users[0]?.costUsd).toBeCloseTo(0.07);
    expect(costs.users[0]?.backgroundUsd).toBeCloseTo(0.01);

    const memory = await analytics.featureDetail({
      ...input,
      feature: 'memory',
    });

    expect(memory.sources.map((source) => source.stage).sort()).toEqual([
      'assistant.reply',
      'hindsight',
      'memory-dream.extract',
    ]);

    const insights = await analytics.userInsights({
      ...input,
      userId: 'split',
    });

    expect(insights?.conversations).toEqual([
      expect.objectContaining({
        id: conversationId,
        messages: 1,
        toolSteps: 1,
      }),
    ]);
    expect(insights?.interactiveUsd).toBeCloseTo(0.06);
    expect(insights?.backgroundUsd).toBeCloseTo(0.01);
    expect(
      await analytics.userInsights({ ...input, userId: 'missing' }),
    ).toBeNull();

    const page = await users.users(now, { offset: 0, limit: 25, sort: 'cost' });
    expect(page.items[0]).toMatchObject({
      id: 'split',
      periodActions: 2,
      periodActiveDays: 1,
      periodFeatures: 2,
    });
    expect(page.items[0]?.periodActivity).toHaveLength(7);
    expect(page.items[0]?.periodCostUsd).toBeCloseTo(0.07);
  });

  test('revenue isolates the environment and survives account deletion', async () => {
    await account('paid');
    await account('production');
    await account('deleted');
    await payment('paid', 'first', new Date('2026-11-02T00:00:00Z'));
    await payment(
      'production',
      'prod',
      new Date('2026-11-02T00:00:00Z'),
      'production',
    );
    await payment('deleted', 'kept', new Date('2026-11-03T00:00:00Z'));
    await db.user.delete({ where: { id: 'deleted' } });

    const summary = await analytics.summary(input);
    expect(summary.current).toMatchObject({ revenueIdr: 58000, payments: 2 });
  });

  test('expiring counts agree with the user list filters', async () => {
    await account('trial', new Date('2026-11-04T00:00:00Z'));
    await account('paid', new Date('2026-09-01T00:00:00Z'));
    await payment('paid', 'expiring', new Date('2026-10-14T00:00:00Z'));
    const summary = await analytics.summary(input);
    expect(summary.expiring).toMatchObject({ trials: 1, plus: 1 });
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

  test('billing without a rollout does not invent trials', async () => {
    await db.user.create({
      data: {
        id: 'no-billing',
        name: 'No billing',
        email: 'no-billing@example.test',
        createdAt: new Date(now.getTime() - 3_600_000),
      },
    });
    const summary = await analytics.summary({ ...input, rolloutAt: null });
    expect(summary.expiring.trials).toBe(0);
    expect(summary.newAccounts[0]).toMatchObject({
      id: 'no-billing',
      messages: 0,
    });
  });

  test('24-hour run reliability excludes queued runs', async () => {
    await account('runs');
    const { conversationId, messageId } = await message(
      'runs',
      new Date('2026-11-07T00:00:00Z'),
    );

    await db.assistantRun.createMany({
      data: ['completed', 'failed', 'queued'].map((status, index) => ({
        conversationId,
        inputMessageId: messageId,
        idempotencyKey: status,
        status,
        provider: 'test',
        model: 'test',
        errorMessage: status === 'failed' ? 'Provider timeout' : null,
        createdAt: new Date(`2026-11-07T0${index + 1}:00:00Z`),
      })),
    });
    const summary = await analytics.summary(input);
    expect(summary.runs).toMatchObject({
      failed: 1,
      total: 2,
      lastError: 'Provider timeout',
    });
    expect(summary.failures).toHaveLength(1);
  });
});
