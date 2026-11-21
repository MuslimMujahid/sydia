import type {
  NotificationDelivery,
  NotificationDeliveryAttempt,
  UserPreference,
  UserPreferenceUpdate,
} from '../entities';
import type { ReminderReference } from '../../shared/messaging';

export interface INotificationRepository {
  findReminderReference(
    userId: string,
    occurrenceId: string,
  ): Promise<ReminderReference | null>;
  /** The current status of the reminder occurrence a delivery belongs to. */
  findDeliveryOccurrenceStatus(
    userId: string,
    deliveryId: string,
  ): Promise<string | null>;
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
  /**
   * Users whose schedule in a lane needs work now, in id order after
   * `afterUserId`: a trigger-written change mark exists or their stored due
   * time has passed. `changeIds` are the marks read now.
   */
  listProactiveWork(
    lane: ProactiveLane,
    now: Date,
    afterUserId: string | null,
    limit: number,
  ): Promise<ProactiveWork[]>;
  /**
   * Stores when the user next needs work in the lane (null: not until a
   * change) and clears exactly the change marks that were read.
   */
  completeProactiveWork(
    lane: ProactiveLane,
    userId: string,
    changeIds: readonly string[],
    dueAt: Date | null,
  ): Promise<void>;
  /** Drops change marks left by deleted users; returns how many. */
  discardOrphanProactiveChanges(): Promise<number>;
  /**
   * When each notification of one kind was sent since an instant, newest
   * first: one time per send however many channels it went to. Sends that
   * were skipped or failed on every channel are left out.
   */
  listSendTimesSince(
    userId: string,
    kind: string,
    since: Date,
  ): Promise<Date[]>;
}

/** The two proactive schedules kept by the due index. */
export type ProactiveLane = 'briefing' | 'follow_up';

/** A user whose schedule in one lane needs work now, with the marks read. */
export type ProactiveWork = NotificationSchedulingTarget & {
  banned: boolean;
  changeIds: string[];
};

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
