import type { Reminder, ReminderStatus, ReminderWrite } from '../entities';

export type ReminderDelivery = Reminder & { userId: string };
export type ReminderFilters = {
  status?: ReminderStatus;
  schedule?: 'today' | 'upcoming' | 'past';
  search?: string;
  now?: Date;
  timezone?: string;
};

export interface IReminderRepository {
  list(userId: string, filters?: ReminderFilters): Promise<Reminder[]>;
  findById(userId: string, id: string): Promise<Reminder | null>;
  findReference(
    userId: string,
    id?: string,
    query?: string,
  ): Promise<Reminder | null>;
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
  ): Promise<{ id: string; idempotencyKey: string }>;
  markOccurrenceDelivered(idempotencyKey: string): Promise<void>;
}

export const REMINDER_REPOSITORY = Symbol('IReminderRepository');
