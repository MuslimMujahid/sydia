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
const input = { now, period: 30 as const, environment: 'sandbox', rolloutAt };
live('Admin dashboard PostgreSQL contracts', () => {
  let db: PrismaService;
  let analytics: PrismaAdminAnalyticsRepository;
  let users: PrismaAdminRepository;
  let billing: PrismaBillingRepository;
  beforeAll(async () => {
    db = new PrismaService(new ConfigService({ BACKEND_DB_URL: url }));
    await db.$connect();
    analytics = new PrismaAdminAnalyticsRepository(db);
    users = new PrismaAdminRepository(db);
    billing = new PrismaBillingRepository(db);
  });

  async function clear() {
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
    expect(d.daily).toHaveLength(30);
    expect(d.daily[0]?.date).toBe('2026-10-09');
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
      (await analytics.dashboard({ ...input, period: 7 })).overview.activeUsers,
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
    expect(d.daily.find((x) => x.date === '2026-11-07')).toMatchObject({
      messages: 1,
      activeUsers: 1,
      costUsd: 0.25,
    });
    expect(d.failures[0]?.errorMessage).toBe('Provider timeout');
    expect(d.failures[0]?.createdAt).toMatch(/Z|\+00:00$/);
  });
});
