import type {
  NotificationDelivery as PrismaNotificationDelivery,
  NotificationDeliveryAttempt as PrismaNotificationDeliveryAttempt,
  UserPreference as PrismaUserPreference,
} from '../../generated/prisma/client';

export type NotificationDelivery = Pick<
  PrismaNotificationDelivery,
  | 'id'
  | 'userId'
  | 'kind'
  | 'content'
  | 'idempotencyKey'
  | 'channel'
  | 'proactive'
  | 'sourceId'
  | 'providerMessageId'
  | 'status'
  | 'policyOutcome'
  | 'attemptedAt'
  | 'deliveredAt'
  | 'failedAt'
  | 'lastError'
  | 'reminderOccurrenceId'
  | 'createdAt'
  | 'updatedAt'
>;

export type NotificationDeliveryAttempt = Pick<
  PrismaNotificationDeliveryAttempt,
  | 'id'
  | 'deliveryId'
  | 'attemptNumber'
  | 'providerMessageId'
  | 'status'
  | 'errorMessage'
  | 'attemptedAt'
  | 'deliveredAt'
  | 'createdAt'
>;

export type UserPreference = Pick<
  PrismaUserPreference,
  | 'userId'
  | 'briefingEnabled'
  | 'briefingTime'
  | 'webNotificationsEnabled'
  | 'telegramNotificationsEnabled'
  | 'whatsappNotificationsEnabled'
  | 'createdAt'
  | 'updatedAt'
>;

export type UserPreferenceUpdate = Partial<
  Omit<UserPreference, 'userId' | 'createdAt' | 'updatedAt'>
>;
