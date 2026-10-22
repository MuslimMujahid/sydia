import type {
  BillingAccount as PrismaBillingAccount,
  BillingOrder as PrismaBillingOrder,
  BillingWebhook as PrismaBillingWebhook,
} from '../../generated/prisma/client';

export type BillingAccount = Pick<
  PrismaBillingAccount,
  'userId' | 'trialStartsAt' | 'trialEndsAt' | 'paidUntil' | 'lastActivatedAt'
>;
export type BillingOrder = Omit<PrismaBillingOrder, 'user'>;
export type BillingWebhook = Pick<
  PrismaBillingWebhook,
  | 'id'
  | 'environment'
  | 'event'
  | 'transactionId'
  | 'invoiceId'
  | 'status'
  | 'receivedAt'
  | 'attempts'
>;
