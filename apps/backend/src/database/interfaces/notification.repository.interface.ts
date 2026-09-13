import type {
  NotificationDelivery,
  NotificationDeliveryAttempt,
  UserPreference,
  UserPreferenceUpdate,
} from '../entities';

export interface INotificationRepository {
  findDeliveryByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
    channel: string,
  ): Promise<NotificationDelivery | null>;
  createDelivery(input: {
    userId: string;
    kind: string;
    content: string;
    idempotencyKey: string;
    channel: string;
    proactive: boolean;
    sourceId?: string | null;
    reminderOccurrenceId?: string | null;
  }): Promise<NotificationDelivery>;
  claimDelivery(userId: string, id: string): Promise<boolean>;
  createAttempt(input: {
    deliveryId: string;
    attemptNumber?: number;
    status: string;
    providerMessageId?: string | null;
    errorMessage?: string | null;
    attemptedAt?: Date;
    deliveredAt?: Date | null;
  }): Promise<NotificationDeliveryAttempt>;
  updateDelivery(
    userId: string,
    id: string,
    input: Partial<
      Pick<
        NotificationDelivery,
        | 'status'
        | 'policyOutcome'
        | 'providerMessageId'
        | 'attemptedAt'
        | 'deliveredAt'
        | 'failedAt'
        | 'lastError'
      >
    >,
  ): Promise<NotificationDelivery | null>;
  getPreferences(userId: string): Promise<UserPreference | null>;
  savePreferences(
    userId: string,
    input: UserPreferenceUpdate,
  ): Promise<UserPreference>;
  /**
   * Every non-banned user with the profile and preference fields a proactive
   * sweep needs, in one query. Sweeps run across all users on a timer, so this
   * deliberately avoids per-user round trips.
   */
  listSchedulingTargets(): Promise<NotificationSchedulingTarget[]>;
}

export type NotificationSchedulingTarget = {
  userId: string;
  timezone: string;
  briefingEnabled: boolean;
  briefingTime: string | null;
  /** False when every delivery channel is off, so a sweep can skip the work. */
  notifiable: boolean;
};

export const NOTIFICATION_REPOSITORY = Symbol('INotificationRepository');
