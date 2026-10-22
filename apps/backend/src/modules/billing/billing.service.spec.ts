import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { billingRepositoryFixture } from '../../../test/support/billing-fixtures';
import type { BillingAccount, BillingOrder } from '../../database/entities';
import type { IUserRepository } from '../../database/interfaces';
import {
  PaymentGatewayError,
  type PaymentGateway,
  type VerifiedInvoice,
} from '../../infra/mayar';
import { BillingAccessService } from './billing-access.service';
import { BillingService } from './billing.service';
import { BillingOperationsService } from './billing-operations.service';
import { StorageQuotaService } from './storage-quota.service';

const now = new Date('2026-11-01T00:00:00Z');

function account(overrides: Partial<BillingAccount> = {}): BillingAccount {
  return {
    userId: 'owner',
    trialStartsAt: new Date('2026-10-22T00:00:00Z'),
    trialEndsAt: new Date('2026-10-29T00:00:00Z'),
    paidUntil: null,
    lastActivatedAt: new Date('2026-10-22T00:00:00Z'),
    ...overrides,
  };
}

function order(overrides: Partial<BillingOrder> = {}): BillingOrder {
  return {
    id: 'order',
    userId: 'owner',
    environment: 'sandbox',
    idempotencyKey: 'key',
    amount: 29_000,
    durationDays: 30,
    status: 'pending',
    providerInvoiceId: 'invoice',
    providerTransactionId: 'transaction',
    paymentUrl: 'https://merchant.myr.id/invoices/test',
    paymentMethod: null,
    expiresAt: new Date('2026-11-01T00:15:00Z'),
    appliedAt: null,
    nextCheckAt: now,
    attempts: 0,
    errorCode: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function runtime(overrides: Partial<BillingOrder> = {}, role = 'user') {
  const row = order(overrides);
  const repository = billingRepositoryFixture({
    ensureAccount: () => Promise.resolve(account()),
    findOrder: () => Promise.resolve(row),
    createOrder: () => Promise.resolve({ order: row, created: true }),
    markOrder: jest.fn(() => Promise.resolve(undefined)),
    attachInvoice: jest.fn(() => Promise.resolve(undefined)),
    applyPayment: jest.fn(() => Promise.resolve(true)),
    reviewOrder: () => Promise.resolve(row),
    linkReviewedInvoice: jest.fn(() => Promise.resolve(true)),
  });

  const config = new ConfigService({
    BACKEND_BILLING_ENFORCEMENT_ENABLED: true,
    BACKEND_BILLING_CHECKOUT_ENABLED: true,
    BACKEND_BILLING_ROLLOUT_AT: '2026-10-22T00:00:00Z',
    BACKEND_BILLING_PRICE_IDR: 29_000,
    MAYAR_ENVIRONMENT: 'sandbox',
    MAYAR_MERCHANT_ID: 'merchant',
    FRONTEND_URL: 'http://localhost:3000',
  });

  const paid: VerifiedInvoice = {
    orderReference: 'order',
    invoiceId: 'invoice',
    transactionId: 'transaction',
    merchantId: 'merchant',
    transactionMerchantId: 'merchant',
    invoiceAmount: 29_000,
    amount: 29_000,
    invoiceStatus: 'paid',
    status: 'paid',
    paymentLinkId: 'invoice',
    paymentMethod: 'ewallet/DANA',
  };

  const gateway: PaymentGateway = {
    createInvoice: jest.fn(() =>
      Promise.resolve({
        id: 'invoice',
        transactionId: 'transaction',
        link: 'https://merchant.myr.id/invoices/test',
        expiresAt: row.expiresAt,
      }),
    ),
    inspectInvoice: jest.fn(() => Promise.resolve(paid)),
  };

  const users = {
    findById: () =>
      Promise.resolve({
        id: 'owner',
        name: 'Customer',
        email: 'customer@example.test',
        role,
      }),
  } as unknown as IUserRepository;

  const access = new BillingAccessService(repository, config);

  return {
    repository,
    gateway,
    paid,
    row,
    access,
    service: new BillingService(repository, users, gateway, access, config),
    operations: new BillingOperationsService(
      repository,
      users,
      gateway,
      config,
    ),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(now);
});

describe('Ambiguous payment operator recovery', () => {
  test('a non-admin cannot link a payment to a review order', async () => {
    const { operations, gateway, repository } = runtime({ status: 'review' });
    await expect(
      operations.linkInvoice('order', 'invoice', 'transaction', 'owner'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(gateway.inspectInvoice).not.toHaveBeenCalled();
    expect(repository.linkReviewedInvoice).not.toHaveBeenCalled();
  });
  test('a paid invoice for another local order cannot be linked by an admin', async () => {
    const { operations, paid, repository } = runtime(
      { status: 'review' },
      'admin',
    );

    paid.orderReference = 'another-order';
    await expect(
      operations.linkInvoice('order', 'invoice', 'transaction', 'admin'),
    ).rejects.toThrow('does not match');
    expect(repository.linkReviewedInvoice).not.toHaveBeenCalled();
    expect(repository.applyPayment).not.toHaveBeenCalled();
  });
  test('a matched paid invoice can be linked and settled with an admin audit actor', async () => {
    const { operations, repository } = runtime({ status: 'review' }, 'admin');
    await operations.linkInvoice('order', 'invoice', 'transaction', 'admin');
    expect(repository.linkReviewedInvoice).toHaveBeenCalledWith(
      'order',
      'invoice',
      'transaction',
      'admin',
    );
    expect(repository.applyPayment).toHaveBeenCalledWith(
      'order',
      'transaction',
      now,
      'ewallet/DANA',
    );
  });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Single-plan prepaid billing', () => {
  test('expired trial blocks new work with a billing link', async () => {
    await expect(
      runtime().access.assertActive('owner', 'en'),
    ).rejects.toMatchObject({
      code: 'BILLING_REQUIRED',
      message: expect.stringContaining('/settings/billing'),
    });
  });
  test('trial has full access until its exact end', async () => {
    const { access, repository } = runtime();
    repository.ensureAccount = () =>
      Promise.resolve(
        account({ trialEndsAt: new Date('2026-11-01T00:00:00.001Z') }),
      );
    await expect(access.snapshot('owner', now)).resolves.toMatchObject({
      active: true,
      state: 'trial',
    });
  });
  test('trial does not authorize work at its exact end', async () => {
    const { access, repository } = runtime();
    repository.ensureAccount = () =>
      Promise.resolve(account({ trialEndsAt: now }));
    await expect(access.snapshot('owner', now)).resolves.toMatchObject({
      active: false,
      state: 'expired',
    });
  });
  test('active paid time authorizes an account after trial expiry', async () => {
    const { access, repository } = runtime();
    repository.ensureAccount = () =>
      Promise.resolve(account({ paidUntil: new Date('2026-11-30T00:00:00Z') }));
    await expect(access.snapshot('owner', now)).resolves.toMatchObject({
      active: true,
      state: 'paid',
    });
  });
  test('invoice creation uses the price persisted on the order', async () => {
    const { service, gateway } = runtime({ amount: 59_000 });
    await service.checkout('owner', {
      mobile: '+6281234567890',
      idempotencyKey: 'key',
    });
    expect(gateway.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 59_000, orderId: 'order' }),
    );
  });
  test('repeated checkout returns the unresolved order without another provider write', async () => {
    const { service, repository, gateway, row } = runtime();
    repository.createOrder = () =>
      Promise.resolve({ order: row, created: false });
    await service.checkout('owner', {
      mobile: '+6281234567890',
      idempotencyKey: 'key',
    });
    expect(gateway.createInvoice).not.toHaveBeenCalled();
  });
  test('ambiguous invoice creation becomes review instead of a retryable purchase', async () => {
    const { service, repository, gateway } = runtime();

    gateway.createInvoice = () =>
      Promise.reject(new PaymentGatewayError('mayar_transport_error', true));

    await service.checkout('owner', {
      mobile: '+6281234567890',
      idempotencyKey: 'key',
    });
    expect(repository.markOrder).toHaveBeenCalledWith(
      'order',
      'review',
      'mayar_transport_error',
      now,
    );
  });
  test('verified invoice and transaction payment applies access', async () => {
    const { service, repository, row } = runtime();
    await service.verify(row);
    expect(repository.applyPayment).toHaveBeenCalledWith(
      'order',
      'transaction',
      now,
      'ewallet/DANA',
    );
  });
  test('reconciliation verifies and settles a pending payment without any webhook', async () => {
    const { service, repository, row } = runtime();
    repository.pendingWebhooks = () => Promise.resolve([]);
    repository.dueOrders = () => Promise.resolve([row]);
    repository.recoverStorageReservations = () => Promise.resolve(undefined);
    await service.recover();
    expect(repository.applyPayment).toHaveBeenCalledWith(
      'order',
      'transaction',
      now,
      'ewallet/DANA',
    );
  });
  test('a success webhook cannot override an unpaid provider transaction', async () => {
    const { service, repository, paid, row } = runtime();
    paid.status = 'unpaid';
    await service.verify(row);
    expect(repository.applyPayment).not.toHaveBeenCalled();
  });
  test.each(['amount', 'invoiceAmount'] as const)(
    'mismatched %s enters review without granting access',
    async (field) => {
      const { service, repository, paid, row } = runtime();
      paid[field] = 1;
      await service.verify(row);
      expect(repository.markOrder).toHaveBeenCalledWith(
        'order',
        'review',
        'verification_mismatch',
        now,
      );
      expect(repository.applyPayment).not.toHaveBeenCalled();
    },
  );
  test('a different merchant cannot activate an order', async () => {
    const { service, repository, paid, row } = runtime();
    paid.transactionMerchantId = 'stranger';
    await service.verify(row);
    expect(repository.applyPayment).not.toHaveBeenCalled();
  });
  test('another environment cannot activate an order', async () => {
    const { service, repository, gateway, row } = runtime({
      environment: 'production',
    });

    await service.verify(row);
    expect(gateway.inspectInvoice).not.toHaveBeenCalled();
    expect(repository.applyPayment).not.toHaveBeenCalled();
  });
  test('another user cannot refresh an order', async () => {
    const { service, repository } = runtime();
    repository.findOrder = () => Promise.resolve(null);
    await expect(service.refresh('stranger', 'order')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  test('provider downtime gives a retryable verification error without creating another invoice', async () => {
    const { service, repository, gateway } = runtime();
    gateway.inspectInvoice = () =>
      Promise.reject(
        new PaymentGatewayError('mayar_transport_error', false, 60),
      );
    await expect(service.refresh('owner', 'order')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
    });
    expect(gateway.createInvoice).not.toHaveBeenCalled();
    expect(repository.applyPayment).not.toHaveBeenCalled();
  });
});

describe('Global upload capacity', () => {
  test('a file of exactly 100 MB can reserve storage', async () => {
    const repository = billingRepositoryFixture({
      reserveStorage: jest.fn(() => Promise.resolve(true)),
    });

    await new StorageQuotaService(repository).reserve(
      'owner',
      'file',
      100_000_000,
    );
    expect(repository.reserveStorage).toHaveBeenCalledWith(
      'owner',
      'file',
      100_000_000,
      10_000_000_000,
    );
  });
  test('a file exceeding 100 MB is rejected before storage reservation', async () => {
    const repository = billingRepositoryFixture({
      reserveStorage: jest.fn(() => Promise.resolve(true)),
    });

    await expect(
      new StorageQuotaService(repository).reserve('owner', 'file', 100_000_001),
    ).rejects.toMatchObject({ status: 413 });
    expect(repository.reserveStorage).not.toHaveBeenCalled();
  });
  test('full storage gives an actionable typed rejection', async () => {
    const repository = billingRepositoryFixture({
      reserveStorage: () => Promise.resolve(false),
    });

    await expect(
      new StorageQuotaService(repository).reserve('owner', 'file', 1),
    ).rejects.toMatchObject({ code: 'STORAGE_FULL' });
  });
  test('backfill stores the provider payment method on paid orders that lack it', async () => {
    const { operations, repository, row } = runtime({
      status: 'paid',
      appliedAt: now,
    });

    repository.paidOrdersWithoutMethod = () => Promise.resolve([row]);
    repository.setPaymentMethod = jest.fn(() => Promise.resolve(undefined));
    await expect(operations.backfillPaymentMethods()).resolves.toBe(1);
    expect(repository.setPaymentMethod).toHaveBeenCalledWith(
      'order',
      'ewallet/DANA',
    );
  });
  test('backfill skips a transaction the provider no longer reports as paid', async () => {
    const { operations, repository, paid, row } = runtime({
      status: 'paid',
      appliedAt: now,
    });

    paid.status = 'unpaid';
    repository.paidOrdersWithoutMethod = () => Promise.resolve([row]);
    repository.setPaymentMethod = jest.fn(() => Promise.resolve(undefined));
    await expect(operations.backfillPaymentMethods()).resolves.toBe(0);
    expect(repository.setPaymentMethod).not.toHaveBeenCalled();
  });
});
