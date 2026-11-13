import type { Reminder as PrismaReminder } from '../../generated/prisma/client';

export const RECURRENCE_FREQUENCIES = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export type ReminderRecurrence = {
  frequency: RecurrenceFrequency;
  interval: number;
  daysOfWeek?: number[];
  endsAt?: string | null;
};

/** Repeat cadence bounds for important reminders, in whole minutes. */
export const REMINDER_REPEAT_INTERVAL = {
  min: 5,
  max: 60,
  default: 5,
} as const;

/** Reminder messages per occurrence, counting the first send. */
export const REMINDER_MESSAGE_CAP = 10;

export const REMINDER_OCCURRENCE_STATUSES = [
  'pending',
  'delivered',
  'awaiting_ack',
  'acknowledged',
  'snoozed',
  'superseded',
  'expired',
  'cancelled',
  'obsolete',
] as const;
export type ReminderOccurrenceStatus =
  (typeof REMINDER_OCCURRENCE_STATUSES)[number];

/** Statuses of an occurrence that has been dispatched to the user. */
export const DISPATCHED_OCCURRENCE_STATUSES = [
  'delivered',
  'awaiting_ack',
  'acknowledged',
  'snoozed',
  'superseded',
  'expired',
  'cancelled',
] as const satisfies readonly ReminderOccurrenceStatus[];

/** Dispatched statuses a snooze may start from. */
export const SNOOZABLE_OCCURRENCE_STATUSES = [
  'delivered',
  'awaiting_ack',
  'acknowledged',
  'snoozed',
  'superseded',
  'expired',
  'cancelled',
] as const satisfies readonly ReminderOccurrenceStatus[];

export type ReminderOccurrenceSummary = {
  id: string;
  reminderId: string;
  occurrenceAt: Date;
  status: ReminderOccurrenceStatus;
  important: boolean;
  messagesSent: number;
  lastSentAt: Date | null;
  deliveredAt: Date | null;
  acknowledgedAt: Date | null;
};

export type Reminder = Pick<
  PrismaReminder,
  | 'id'
  | 'title'
  | 'notes'
  | 'scheduledAt'
  | 'timezone'
  | 'important'
  | 'repeatIntervalMinutes'
  | 'createdAt'
  | 'updatedAt'
> & {
  recurrence: ReminderRecurrence | null;
  source: {
    type: 'dashboard' | 'chat' | 'whatsapp';
    label: string | null;
    messageId: string | null;
  };
  snoozedFrom: { occurrenceId: string; occurrenceAt: Date } | null;
  /** The newest occurrence already dispatched to the user. */
  latestOccurrence: ReminderOccurrenceSummary | null;
};

export type ReminderWrite = {
  title: string;
  notes?: string | null;
  scheduledAt: Date;
  timezone: string;
  recurrence?: ReminderRecurrence | null;
  sourceType?: 'dashboard' | 'chat' | 'whatsapp';
  sourceMessageId?: string | null;
  important?: boolean;
  repeatIntervalMinutes?: number;
  snoozedFromOccurrenceId?: string | null;
};

/** Clamps a requested repeat interval into the supported range. */
export function clampRepeatInterval(minutes: number): number {
  return Math.min(
    REMINDER_REPEAT_INTERVAL.max,
    Math.max(REMINDER_REPEAT_INTERVAL.min, Math.round(minutes)),
  );
}
