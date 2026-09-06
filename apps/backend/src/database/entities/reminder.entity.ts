import type { Reminder as PrismaReminder } from '../../generated/prisma/client';

export const REMINDER_STATUSES = [
  'scheduled',
  'completed',
  'cancelled',
] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];
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

export type Reminder = Pick<
  PrismaReminder,
  | 'id'
  | 'title'
  | 'notes'
  | 'scheduledAt'
  | 'completedAt'
  | 'cancelledAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  status: ReminderStatus;
  recurrence: ReminderRecurrence | null;
  source: {
    type: 'dashboard' | 'chat' | 'whatsapp';
    label: string | null;
    messageId: string | null;
  };
};

export type ReminderWrite = {
  title: string;
  notes?: string | null;
  status?: ReminderStatus;
  scheduledAt: Date;
  timezone: string;
  recurrence?: ReminderRecurrence | null;
  sourceType?: 'dashboard' | 'chat' | 'whatsapp';
  sourceMessageId?: string | null;
};
