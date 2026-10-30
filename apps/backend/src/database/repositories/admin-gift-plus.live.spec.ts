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
import { PrismaAdminRepository } from './prisma-admin.repository';
import { PrismaBillingRepository } from './prisma-billing.repository';
import { AdminGiftPlusService } from '../../modules/admin/admin-gift-plus.service';
import { BillingAccessService } from '../../modules/billing/billing-access.service';

const url = process.env.BILLING_CONTRACT_DB_URL;
if (
  url &&
  (new URL(url).pathname !== '/sydia_billing_contract' ||
    !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
)
  throw new Error(
    'Gift contracts require the dedicated local sydia_billing_contract database',
  );
const live = url ? describe : describe.skip;
const now = new Date('2026-11-01T00:00:00Z');
const rolloutAt = new Date('2026-10-01T00:00:00Z');
const userId = 'admin-gift-contract-user';
const input = {
  actorId: 'admin-gift-contract-admin',
  userId,
  durationDays: 30,
  requestId: '00000000-0000-4000-8000-000000000001',
  now,
  rolloutAt,
  trialDays: 7,
};

live('Admin Plus gift PostgreSQL contracts', () => {
  let db: PrismaService;
  let admin: PrismaAdminRepository;
  let billing: PrismaBillingRepository;

  beforeAll(async () => {
    db = new PrismaService(new ConfigService({ BACKEND_DB_URL: url }));
    await db.$connect();
    admin = new PrismaAdminRepository(db);
    billing = new PrismaBillingRepository(db);
  });
  beforeEach(async () => {
    await db.auditEvent.deleteMany({
      where: { eventType: 'admin.user.gift-plus', userId },
    });
    await db.user.deleteMany({ where: { id: userId } });
    await db.user.create({
      data: {
        id: userId,
        name: 'Gift contract',
        email: 'admin-gift@example.test',
        createdAt: new Date('2026-09-01T00:00:00Z'),
      },
    });
  });
  afterAll(async () => {
    await db.auditEvent.deleteMany({
      where: { eventType: 'admin.user.gift-plus', userId },
    });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  test('creates access for an expired user without creating a payment or resetting their trial', async () => {
    expect(await admin.giftPlus(input)).toEqual({
      status: 'applied',
      paidUntil: new Date('2026-12-01T00:00:00Z'),
    });
    expect(
      await db.billingAccount.findUniqueOrThrow({ where: { userId } }),
    ).toMatchObject({
      trialStartsAt: rolloutAt,
      trialEndsAt: new Date('2026-10-08T00:00:00Z'),
      lastActivatedAt: now,
    });
    expect(await db.billingOrder.count({ where: { userId } })).toBe(0);
    expect(
      await db.billingPayment.count({ where: { order: { userId } } }),
    ).toBe(0);
  });

  test('preserves remaining paid time and the activation anchor', async () => {
    await billing.ensureAccount(userId, rolloutAt, 7);
    await db.billingAccount.update({
      where: { userId },
      data: { paidUntil: new Date('2026-11-15T00:00:00Z') },
    });
    await admin.giftPlus(input);
    expect(
      await db.billingAccount.findUniqueOrThrow({ where: { userId } }),
    ).toMatchObject({
      paidUntil: new Date('2026-12-15T00:00:00Z'),
      lastActivatedAt: rolloutAt,
    });
  });

  test('preserves remaining trial time', async () => {
    await billing.ensureAccount(userId, new Date('2026-10-29T00:00:00Z'), 7);
    expect(await admin.giftPlus(input)).toMatchObject({
      paidUntil: new Date('2026-12-05T00:00:00Z'),
    });
  });

  test('concurrent retries apply the gift once and record the administrator and duration', async () => {
    const results = await Promise.all([
      admin.giftPlus(input),
      admin.giftPlus(input),
    ]);

    expect(results).toEqual([
      { status: 'applied', paidUntil: new Date('2026-12-01T00:00:00Z') },
      { status: 'applied', paidUntil: new Date('2026-12-01T00:00:00Z') },
    ]);
    const events = await db.auditEvent.findMany({
      where: { userId, eventType: 'admin.user.gift-plus' },
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.metadata).toEqual({
      actorId: input.actorId,
      requestId: input.requestId,
      durationDays: 30,
      paidUntil: '2026-12-01T00:00:00.000Z',
    });
  });

  test('a reused request cannot change its duration', async () => {
    await admin.giftPlus(input);
    expect(await admin.giftPlus({ ...input, durationDays: 90 })).toEqual({
      status: 'conflict',
    });
    expect(
      (await db.billingAccount.findUniqueOrThrow({ where: { userId } }))
        .paidUntil,
    ).toEqual(new Date('2026-12-01T00:00:00Z'));
  });

  test('a reused request cannot change its administrator', async () => {
    await admin.giftPlus(input);
    expect(await admin.giftPlus({ ...input, actorId: 'other-admin' })).toEqual({
      status: 'conflict',
    });
  });

  test('distinct concurrent gifts preserve both durations', async () => {
    await Promise.all([
      admin.giftPlus({ ...input, durationDays: 7 }),
      admin.giftPlus({
        ...input,
        durationDays: 90,
        requestId: '00000000-0000-4000-8000-000000000002',
      }),
    ]);
    expect(
      (await db.billingAccount.findUniqueOrThrow({ where: { userId } }))
        .paidUntil,
    ).toEqual(new Date('2027-02-06T00:00:00Z'));
  });

  test('a gift racing with a verified payment preserves both durations', async () => {
    await billing.ensureAccount(userId, rolloutAt, 7);
    const { order } = await billing.createOrder({
      userId,
      environment: 'sandbox',
      idempotencyKey: 'gift-race',
      amount: 29000,
      now,
      expiresAt: new Date('2026-11-01T00:15:00Z'),
    });

    await Promise.all([
      admin.giftPlus({ ...input, durationDays: 7 }),
      billing.applyPayment(order.id, 'gift-race-payment', now),
    ]);
    expect(
      (await db.billingAccount.findUniqueOrThrow({ where: { userId } }))
        .paidUntil,
    ).toEqual(new Date('2026-12-08T00:00:00Z'));
  });

  test('missing recipients are reported without an audit event', async () => {
    expect(
      await admin.giftPlus({ ...input, userId: 'missing-gift-recipient' }),
    ).toEqual({ status: 'not-found' });
    expect(
      await db.auditEvent.count({
        where: { userId: 'missing-gift-recipient' },
      }),
    ).toBe(0);
  });

  test('the existing billing access check recognizes the gifted entitlement', async () => {
    await admin.giftPlus(input);
    const access = new BillingAccessService(
      billing,
      new ConfigService({
        BACKEND_BILLING_ROLLOUT_AT: rolloutAt.toISOString(),
        BACKEND_BILLING_ENFORCEMENT_ENABLED: true,
      }),
    );

    expect(await access.snapshot(userId, now)).toMatchObject({
      active: true,
      state: 'paid',
      paidUntil: new Date('2026-12-01T00:00:00Z'),
    });
  });

  test('admin user results expose the gifted expiry', async () => {
    await admin.giftPlus(input);
    const page = await admin.users(now, {
      offset: 0,
      limit: 25,
      q: 'admin-gift@example.test',
    });

    expect(page.items).toEqual([
      expect.objectContaining({
        id: userId,
        paidUntil: new Date('2026-12-01T00:00:00Z'),
      }),
    ]);
  });

  test('gifting is unavailable without a billing rollout and leaves the account untouched', async () => {
    const service = new AdminGiftPlusService(admin, new ConfigService({}));
    await expect(
      service.gift(input.actorId, userId, input),
    ).rejects.toMatchObject({ status: 503 });
    expect(await db.billingAccount.count({ where: { userId } })).toBe(0);
  });
});
