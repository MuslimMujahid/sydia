import type { BillingAccount, BillingOrder, BillingWebhook } from '../entities';

export const BILLING_REPOSITORY = Symbol('IBillingRepository');
export interface IBillingRepository {
  ensureAccount(
    userId: string,
    rolloutAt: Date,
    trialDays: number,
  ): Promise<BillingAccount | null>;
  initializeTrials(rolloutAt: Date, trialDays: number): Promise<number>;
  reviewOrders(): Promise<BillingOrder[]>;
  reviewOrder(id: string): Promise<BillingOrder | null>;
  linkReviewedInvoice(
    id: string,
    invoiceId: string,
    transactionId: string,
    actorId: string,
  ): Promise<boolean>;
  closeReviewedOrder(
    id: string,
    actorId: string,
    reason: string,
  ): Promise<boolean>;
  listOrders(userId: string): Promise<BillingOrder[]>;
  findOrder(userId: string, id: string): Promise<BillingOrder | null>;
  findByProvider(
    environment: string,
    transactionId?: string,
    invoiceId?: string,
  ): Promise<BillingOrder | null>;
  createOrder(input: {
    userId: string;
    environment: string;
    idempotencyKey: string;
    amount: number;
    now: Date;
    expiresAt: Date;
  }): Promise<{ order: BillingOrder; created: boolean }>;
  attachInvoice(
    id: string,
    invoice: {
      id: string;
      transactionId: string;
      link: string;
      expiresAt: Date;
    },
  ): Promise<void>;
  markOrder(
    id: string,
    status: string,
    errorCode: string | null,
    nextCheckAt: Date,
  ): Promise<void>;
  applyPayment(id: string, transactionId: string, now: Date): Promise<boolean>;
  dueOrders(now: Date): Promise<BillingOrder[]>;
  receiveWebhook(input: {
    id: string;
    environment: string;
    event: string;
    transactionId: string | null;
    invoiceId: string | null;
  }): Promise<void>;
  pendingWebhooks(): Promise<BillingWebhook[]>;
  completeWebhook(
    id: string,
    status: string,
    errorCode?: string,
  ): Promise<void>;
  storageUsed(userId: string): Promise<number>;
  reserveStorage(
    userId: string,
    storageKey: string,
    bytes: number,
    limit: number,
  ): Promise<boolean>;
  releaseStorage(storageKey: string): Promise<void>;
  recoverStorageReservations(): Promise<void>;
}
