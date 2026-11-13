import type {
  Reminder,
  ReminderOccurrenceStatus,
  ReminderOccurrenceSummary,
  ReminderWrite,
} from '../entities';

export type ReminderDelivery = Reminder & { userId: string };
export type ReminderOccurrenceDetail = ReminderOccurrenceSummary & {
  userId: string;
  idempotencyKey: string;
  title: string;
};
export type ReminderFilters = {
  schedule?: 'today' | 'upcoming' | 'past';
  /** Explicit range, inclusive start and exclusive end; overrides `schedule`. */
  scheduleRange?: { from: Date; to: Date };
  search?: string;
  now?: Date;
  timezone?: string;
};

export interface IReminderRepository {
  list(userId: string, filters?: ReminderFilters): Promise<Reminder[]>;
  findById(userId: string, id: string): Promise<Reminder | null>;
  create(userId: string, input: ReminderWrite): Promise<Reminder>;
  update(
    userId: string,
    id: string,
    input: Partial<ReminderWrite>,
  ): Promise<Reminder | null>;
  findByIdForDelivery(id: string): Promise<ReminderDelivery | null>;
  updateDeliverySchedule(
    id: string,
    scheduledAt: Date,
  ): Promise<Reminder | null>;
  delete(userId: string, id: string): Promise<boolean>;
  createOccurrence(
    reminderId: string,
    occurrenceAt: Date,
  ): Promise<{ id: string; idempotencyKey: string; status: string }>;
  /** Stamps channel delivery time; never overrides the dispatch status. */
  markOccurrenceDelivered(idempotencyKey: string): Promise<void>;
  findOccurrence(
    userId: string,
    occurrenceId: string,
  ): Promise<ReminderOccurrenceDetail | null>;
  /** Worker lookup, not user-scoped. */
  findOccurrenceForDelivery(
    occurrenceId: string,
  ): Promise<ReminderOccurrenceDetail | null>;
  findLatestDispatchedOccurrence(
    userId: string,
    reminderId: string,
  ): Promise<ReminderOccurrenceDetail | null>;
  /** pending → delivered | awaiting_ack; false when another worker won. */
  markDispatched(
    occurrenceId: string,
    input: { important: boolean; at: Date },
  ): Promise<boolean>;
  /** Counts one more message while still awaiting acknowledgement. */
  recordRepeat(
    occurrenceId: string,
    expectedMessagesSent: number,
    at: Date,
  ): Promise<boolean>;
  transitionOccurrence(
    occurrenceId: string,
    from: readonly ReminderOccurrenceStatus[],
    to: ReminderOccurrenceStatus,
    patch?: { acknowledgedAt?: Date },
  ): Promise<boolean>;
  acknowledge(
    userId: string,
    occurrenceId: string,
    at: Date,
  ): Promise<ReminderOccurrenceDetail | null>;
  supersedeAwaiting(
    reminderId: string,
    exceptOccurrenceId: string,
  ): Promise<string[]>;
  /** awaiting_ack → cancelled; returns the affected occurrence ids. */
  cancelAwaiting(reminderId: string): Promise<string[]>;
  listAwaitingAcknowledgement(
    userId: string,
  ): Promise<ReminderOccurrenceDetail[]>;
  listRecentlyDispatched(
    userId: string,
    input: { since: Date; limit: number },
  ): Promise<ReminderOccurrenceDetail[]>;
  /** Creates the snooze copy and marks the source occurrence snoozed atomically. */
  createSnoozeCopy(
    userId: string,
    occurrenceId: string,
    allowedFrom: readonly ReminderOccurrenceStatus[],
    copy: ReminderWrite,
  ): Promise<Reminder | null>;
}

export const REMINDER_REPOSITORY = Symbol('IReminderRepository');
