import type {
  NotificationDelivery,
  NotificationDeliveryAttempt,
  UserPreference,
  UserPreferenceUpdate,
} from '../entities';

export interface INotificationRepository {
  findDeliveryByProviderMessageId(
    userId: string,
    channel: string,
    providerMessageId: string,
    connection?: { id: string; generation: number },
  ): Promise<NotificationDelivery | null>;
  rearmEventReminder(
    userId: string,
    id: string,
    content: string,
    whatsappSchedule?: { scheduledAt: Date; payload: Record<string, unknown> },
  ): Promise<NotificationDelivery | null>;
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
    whatsappSchedule?: { scheduledAt: Date; payload: Record<string, unknown> };
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
  /** Deliveries of one kind created at or after an instant (outreach budget). */
  /** Content of delivered notifications of one kind since an instant, newest first. */
  listDeliveredContentSince(
    userId: string,
    kind: string,
    since: Date,
    limit: number,
  ): Promise<string[]>;
  countDeliveriesSince(
    userId: string,
    kind: string,
    since: Date,
    statuses: readonly string[],
  ): Promise<number>;
}

export type NotificationSchedulingTarget = {
  userId: string;
  timezone: string;
  briefingEnabled: boolean;
  weeklyBriefingEnabled: boolean;
  weeklyBriefingDay: number;
  briefingTime: string | null;
  followUpIntervalMinutes: number;
  /** False when every delivery channel is off, so a sweep can skip the work. */
  notifiable: boolean;
};

export const NOTIFICATION_REPOSITORY = Symbol('INotificationRepository');
