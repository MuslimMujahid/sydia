import { ConfigService } from '@nestjs/config';
import type { BillingAccount } from '../../src/database/entities';
import type { IBillingRepository } from '../../src/database/interfaces';
import {
  BillingAccessService,
  StorageQuotaService,
} from '../../src/modules/billing';

const unused = (): never => {
  throw new Error(
    'Unexpected billing persistence call in a non-billing fixture',
  );
};

export function billingRepositoryFixture(
  overrides: Partial<IBillingRepository> = {},
): IBillingRepository {
  return {
    ensureAccount: unused,
    initializeTrials: unused,
    reviewOrders: unused,
    reviewOrder: unused,
    linkReviewedInvoice: unused,
    closeReviewedOrder: unused,
    listOrders: unused,
    findOrder: unused,
    findByProvider: unused,
    createOrder: unused,
    attachInvoice: unused,
    markOrder: unused,
    applyPayment: unused,
    paidOrdersWithoutMethod: unused,
    setPaymentMethod: unused,
    dueOrders: unused,
    receiveWebhook: unused,
    pendingWebhooks: unused,
    completeWebhook: unused,
    storageUsed: unused,
    reserveStorage: () => Promise.resolve(true),
    releaseStorage: () => Promise.resolve(undefined),
    recoverStorageReservations: unused,
    ...overrides,
  };
}

export function billingTestAccess(): BillingAccessService {
  return new BillingAccessService(
    billingRepositoryFixture(),
    new ConfigService({
      BACKEND_BILLING_ENFORCEMENT_ENABLED: false,
      FRONTEND_URL: 'http://localhost:3000',
    }),
  );
}

export function billingTestStorage(): StorageQuotaService {
  return new StorageQuotaService(billingRepositoryFixture());
}

/** Fixed billing persistence for channel/worker contracts using the real access policy. */
export function billingAccountTestAccess(
  account: BillingAccount,
): BillingAccessService {
  return new BillingAccessService(
    billingRepositoryFixture({ ensureAccount: () => Promise.resolve(account) }),
    new ConfigService({
      BACKEND_BILLING_ENFORCEMENT_ENABLED: true,
      BACKEND_BILLING_ROLLOUT_AT: '2026-10-22T00:00:00Z',
      FRONTEND_URL: 'http://localhost:3000',
    }),
  );
}
