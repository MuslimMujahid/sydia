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
import { PrismaBillingRepository } from './prisma-billing.repository';

const url = process.env.BILLING_CONTRACT_DB_URL;
if (
  url &&
  (new URL(url).pathname !== '/sydia_billing_contract' ||
    !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
)
  throw new Error(
    'Billing contracts require the dedicated local sydia_billing_contract database',
  );
const live = url ? describe : describe.skip;
const now = new Date('2026-11-01T00:00:00Z');
const rollout = new Date('2026-10-22T00:00:00Z');

live('Billing PostgreSQL contracts', () => {
  let db: PrismaService;
  let repository: PrismaBillingRepository;
  beforeAll(async () => {
    db = new PrismaService(new ConfigService({ BACKEND_DB_URL: url }));
    await db.$connect();
    repository = new PrismaBillingRepository(db);
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE billing_payment, billing_order, billing_webhook, "user" CASCADE',
    );
    await db.user.create({
      data: {
        id: 'owner',
        name: 'Billing contract',
        email: 'billing@example.test',
        createdAt: new Date('2026-10-01T00:00:00Z'),
      },
    });
    await repository.ensureAccount('owner', rollout, 7);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  async function pendingOrder(key = 'key') {
    const { order } = await repository.createOrder({
      userId: 'owner',
      idempotencyKey: key,
      environment: 'sandbox',
      amount: 29_000,
      now,
      expiresAt: new Date('2026-11-01T00:15:00Z'),
    });

    await repository.attachInvoice(order.id, {
      id: `invoice-${key}`,
      transactionId: `transaction-${key}`,
      link: 'https://merchant.myr.id/invoices/test',
      expiresAt: order.expiresAt,
    });

    return order;
  }

  async function fillStorage(bytes: number) {
    const count = Math.ceil(bytes / 100_000_000);
    await db.fileAsset.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        userId: 'owner',
        originalName: 'fixture.bin',
        mimeType: 'application/octet-stream',
        size: Math.min(100_000_000, bytes - index * 100_000_000),
        checksum: `fixture-${index}`,
        storageKey: `fixture-${index}`,
        kind: 'document',
      })),
    });
  }

  test('existing users receive exactly seven days from the fixed rollout', async () => {
    expect(await repository.ensureAccount('owner', rollout, 7)).toMatchObject({
      trialStartsAt: rollout,
      trialEndsAt: new Date('2026-10-29T00:00:00Z'),
    });
  });
  test('new users receive seven days from signup', async () => {
    await db.user.create({
      data: {
        id: 'new-user',
        name: 'New',
        email: 'new@example.test',
        createdAt: new Date('2026-11-01T00:00:00Z'),
      },
    });
    expect(
      await repository.ensureAccount('new-user', rollout, 7),
    ).toMatchObject({ trialEndsAt: new Date('2026-11-08T00:00:00Z') });
  });
  test('reinitializing an account never restarts its trial', async () => {
    expect(await repository.ensureAccount('owner', now, 7)).toMatchObject({
      trialStartsAt: rollout,
      trialEndsAt: new Date('2026-10-29T00:00:00Z'),
    });
  });
  test('rollout creates trials once and excludes development preview accounts', async () => {
    await db.user.createMany({
      data: [
        {
          id: 'second-user',
          name: 'Second',
          email: 'second@example.test',
          createdAt: new Date('2026-10-01T00:00:00Z'),
        },
        {
          id: 'chat-preview-web',
          name: 'Preview',
          email: 'preview@example.test',
          createdAt: new Date('2026-10-01T00:00:00Z'),
        },
      ],
    });
    expect(await repository.initializeTrials(rollout, 7)).toBe(1);
    expect(await repository.initializeTrials(now, 7)).toBe(0);
    expect(
      await db.billingAccount.findUnique({ where: { userId: 'second-user' } }),
    ).toMatchObject({
      trialStartsAt: rollout,
      trialEndsAt: new Date('2026-10-29T00:00:00Z'),
    });
    expect(
      await db.billingAccount.findUnique({
        where: { userId: 'chat-preview-web' },
      }),
    ).toBeNull();
  });
  test('concurrent checkouts create one unresolved order', async () => {
    const input = {
      userId: 'owner',
      environment: 'sandbox',
      amount: 29_000,
      now,
      expiresAt: new Date('2026-11-01T00:15:00Z'),
    };

    const results = await Promise.all([
      repository.createOrder({ ...input, idempotencyKey: 'one' }),
      repository.createOrder({ ...input, idempotencyKey: 'two' }),
    ]);

    expect(results[0]?.order.id).toBe(results[1]?.order.id);
    expect(await db.billingOrder.count()).toBe(1);
  });
  test('duplicate payment settlement adds only thirty days and one receipt', async () => {
    const order = await pendingOrder();
    await Promise.all([
      repository.applyPayment(order.id, 'transaction-key', now),
      repository.applyPayment(order.id, 'transaction-key', now),
    ]);
    expect(
      (await repository.ensureAccount('owner', rollout, 7))?.paidUntil,
    ).toEqual(new Date('2026-12-01T00:00:00Z'));
    expect(await db.billingPayment.count()).toBe(1);
  });
  test('payment during trial starts thirty paid days immediately', async () => {
    await db.billingAccount.update({
      where: { userId: 'owner' },
      data: { trialEndsAt: new Date('2026-11-05T00:00:00Z') },
    });
    const order = await pendingOrder();
    await repository.applyPayment(order.id, 'transaction-key', now);
    expect(
      (await repository.ensureAccount('owner', rollout, 7))?.paidUntil,
    ).toEqual(new Date('2026-12-01T00:00:00Z'));
  });
  test('renewal extends existing paid time rather than replacing it', async () => {
    await db.billingAccount.update({
      where: { userId: 'owner' },
      data: { paidUntil: new Date('2026-11-10T00:00:00Z') },
    });
    const order = await pendingOrder();
    await repository.applyPayment(order.id, 'transaction-key', now);
    expect(
      (await repository.ensureAccount('owner', rollout, 7))?.paidUntil,
    ).toEqual(new Date('2026-12-10T00:00:00Z'));
  });
  test('concurrent uploads cannot exceed ten billion bytes', async () => {
    await fillStorage(9_900_000_000);
    const results = await Promise.all([
      repository.reserveStorage('owner', 'one', 100_000_000, 10_000_000_000),
      repository.reserveStorage('owner', 'two', 100_000_000, 10_000_000_000),
    ]);

    expect(results.sort()).toEqual([false, true]);
    expect(await repository.storageUsed('owner')).toBe(10_000_000_000);
  });
  test('committed assets are not counted twice with their upload reservation', async () => {
    await repository.reserveStorage('owner', 'uploaded', 100, 10_000_000_000);
    await db.fileAsset.create({
      data: {
        userId: 'owner',
        originalName: 'fixture.txt',
        mimeType: 'text/plain',
        size: 100,
        checksum: 'fixture',
        storageKey: 'uploaded',
        kind: 'document',
      },
    });
    expect(await repository.storageUsed('owner')).toBe(100);
  });
  test('deletion makes storage available again', async () => {
    await fillStorage(10_000_000_000);
    await db.fileAsset.delete({ where: { storageKey: 'fixture-0' } });
    expect(
      await repository.reserveStorage(
        'owner',
        'replacement',
        100_000_000,
        10_000_000_000,
      ),
    ).toBe(true);
  });
  test('deleted accounts cannot be restored by a payment replay', async () => {
    const order = await pendingOrder();
    await db.user.delete({ where: { id: 'owner' } });
    expect(
      await repository.applyPayment(order.id, 'transaction-key', now),
    ).toBe(false);
    expect(await db.billingAccount.count()).toBe(0);
  });
});
