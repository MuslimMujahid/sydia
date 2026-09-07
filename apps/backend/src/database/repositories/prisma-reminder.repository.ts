import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Reminder as PrismaReminder,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import { dayWindow } from '../../shared/date-time';
import type { Reminder, ReminderRecurrence, ReminderWrite } from '../entities';
import type { IReminderRepository, ReminderFilters } from '../interfaces';

const reminderSelect = {
  id: true,
  userId: true,
  title: true,
  notes: true,
  status: true,
  scheduledAt: true,
  recurrence: true,
  sourceType: true,
  sourceMessageId: true,
  completedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ReminderRow = Pick<PrismaReminder, keyof typeof reminderSelect>;

function present(row: ReminderRow): Reminder {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status as Reminder['status'],
    scheduledAt: row.scheduledAt,
    recurrence: row.recurrence as ReminderRecurrence | null,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    source: {
      type: row.sourceType as Reminder['source']['type'],
      label: row.sourceMessageId ? 'Dibuat lewat chat' : 'Dibuat di dasbor',
      messageId: row.sourceMessageId,
    },
  };
}

function presentForDelivery(row: ReminderRow): Reminder & { userId: string } {
  return { ...present(row), userId: row.userId };
}

function updateData(input: Partial<ReminderWrite>): Prisma.ReminderUpdateInput {
  return {
    title: input.title,
    notes: input.notes,
    status: input.status,
    scheduledAt: input.scheduledAt,
    timezone: input.timezone,
    recurrence:
      input.recurrence === undefined
        ? undefined
        : input.recurrence === null
          ? Prisma.JsonNull
          : input.recurrence,
    sourceType: input.sourceType,
    sourceMessageId: input.sourceMessageId,
  };
}

@Injectable()
export class PrismaReminderRepository implements IReminderRepository {
  constructor(private readonly prisma: PrismaService) {}
  async list(
    userId: string,
    filters: ReminderFilters = {},
  ): Promise<Reminder[]> {
    const now = filters.now ?? new Date();
    const { start, end } = dayWindow(now, filters.timezone ?? 'UTC');
    const scheduledAt =
      filters.schedule === 'today'
        ? { gte: start, lt: end }
        : filters.schedule === 'upcoming'
          ? { gte: end }
          : filters.schedule === 'past'
            ? { lt: start }
            : undefined;

    const rows = await this.prisma.reminder.findMany({
      where: {
        userId,
        status: filters.status,
        scheduledAt,
        OR: filters.search
          ? [
              { title: { contains: filters.search, mode: 'insensitive' } },
              { notes: { contains: filters.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      orderBy: { scheduledAt: 'asc' },
      select: reminderSelect,
    });

    return rows.map(present);
  }

  async findById(userId: string, id: string): Promise<Reminder | null> {
    const row = await this.prisma.reminder.findFirst({
      where: { id, userId },
      select: reminderSelect,
    });

    return row ? present(row) : null;
  }

  async findByIdForDelivery(
    id: string,
  ): Promise<(Reminder & { userId: string }) | null> {
    const row = await this.prisma.reminder.findUnique({
      where: { id },
      select: reminderSelect,
    });

    return row ? presentForDelivery(row) : null;
  }

  async updateDeliverySchedule(
    id: string,
    scheduledAt: Date,
  ): Promise<Reminder | null> {
    const row = await this.prisma.reminder.update({
      where: { id },
      data: { scheduledAt },
      select: reminderSelect,
    });

    return present(row);
  }

  async findReference(
    userId: string,
    id?: string,
    query?: string,
  ): Promise<Reminder | null> {
    const row = await this.prisma.reminder.findFirst({
      where: {
        userId,
        ...(id ? { id } : {}),
        ...(query ? { title: { contains: query, mode: 'insensitive' } } : {}),
        status: 'scheduled',
      },
      orderBy: { updatedAt: 'desc' },
      select: reminderSelect,
    });

    return row ? present(row) : null;
  }

  async create(userId: string, input: ReminderWrite): Promise<Reminder> {
    const row = await this.prisma.reminder.create({
      data: {
        userId,
        title: input.title,
        scheduledAt: input.scheduledAt,
        timezone: input.timezone,
        notes: input.notes,
        status: input.status,
        recurrence:
          input.recurrence === null ? Prisma.JsonNull : input.recurrence,
        sourceType: input.sourceType,
        sourceMessageId: input.sourceMessageId,
      },
      select: reminderSelect,
    });

    return present(row);
  }

  async update(
    userId: string,
    id: string,
    input: Partial<ReminderWrite>,
  ): Promise<Reminder | null> {
    if (
      !(await this.prisma.reminder.findFirst({
        where: { id, userId },
        select: { id: true },
      }))
    )
      return null;
    const row = await this.prisma.reminder.update({
      where: { id },
      data: {
        ...updateData(input),
        completedAt:
          input.status === 'completed'
            ? new Date()
            : input.status === 'scheduled'
              ? null
              : undefined,
        cancelledAt:
          input.status === 'cancelled'
            ? new Date()
            : input.status === 'scheduled'
              ? null
              : undefined,
      },
      select: reminderSelect,
    });

    return present(row);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return (
      (await this.prisma.reminder.deleteMany({ where: { id, userId } }))
        .count === 1
    );
  }

  async createOccurrence(
    reminderId: string,
    occurrenceAt: Date,
  ): Promise<string> {
    const idempotencyKey = `${reminderId}:${occurrenceAt.toISOString()}`;
    const row = await this.prisma.reminderOccurrence.upsert({
      where: { idempotencyKey },
      create: { reminderId, occurrenceAt, idempotencyKey },
      update: {},
      select: { idempotencyKey: true },
    });

    return row.idempotencyKey;
  }

  async markOccurrenceDelivered(idempotencyKey: string): Promise<void> {
    await this.prisma.reminderOccurrence.updateMany({
      where: { idempotencyKey, status: { not: 'delivered' } },
      data: {
        status: 'delivered',
        attemptedAt: new Date(),
        deliveredAt: new Date(),
      },
    });
  }
}
