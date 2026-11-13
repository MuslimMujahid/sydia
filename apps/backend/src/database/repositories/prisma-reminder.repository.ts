import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Reminder as PrismaReminder,
  type ReminderOccurrence as PrismaReminderOccurrence,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import { dayWindow } from '../../shared/date-time';
import {
  DISPATCHED_OCCURRENCE_STATUSES,
  type Reminder,
  type ReminderOccurrenceStatus,
  type ReminderOccurrenceSummary,
  type ReminderRecurrence,
  type ReminderWrite,
} from '../entities';
import type {
  IReminderRepository,
  ReminderFilters,
  ReminderOccurrenceDetail,
} from '../interfaces';

const occurrenceSelect = {
  id: true,
  reminderId: true,
  occurrenceAt: true,
  status: true,
  important: true,
  messagesSent: true,
  lastSentAt: true,
  deliveredAt: true,
  acknowledgedAt: true,
} as const;

const occurrenceDetailSelect = {
  ...occurrenceSelect,
  idempotencyKey: true,
  reminder: { select: { userId: true, title: true } },
} as const;

const dispatchedStatuses = [...DISPATCHED_OCCURRENCE_STATUSES];

const reminderSelect = {
  id: true,
  userId: true,
  title: true,
  notes: true,
  scheduledAt: true,
  timezone: true,
  recurrence: true,
  sourceType: true,
  sourceMessageId: true,
  important: true,
  repeatIntervalMinutes: true,
  createdAt: true,
  updatedAt: true,
  snoozedFrom: { select: { id: true, occurrenceAt: true } },
  occurrences: {
    where: { status: { in: dispatchedStatuses } },
    orderBy: { occurrenceAt: 'desc' },
    take: 1,
    select: occurrenceSelect,
  },
} as const satisfies Prisma.ReminderSelect;

type OccurrenceRow = Pick<
  PrismaReminderOccurrence,
  keyof typeof occurrenceSelect
>;
type OccurrenceDetailRow = OccurrenceRow &
  Pick<PrismaReminderOccurrence, 'idempotencyKey'> & {
    reminder: Pick<PrismaReminder, 'userId' | 'title'>;
  };
type ReminderRow = Prisma.ReminderGetPayload<{ select: typeof reminderSelect }>;

function presentOccurrence(row: OccurrenceRow): ReminderOccurrenceSummary {
  return {
    id: row.id,
    reminderId: row.reminderId,
    occurrenceAt: row.occurrenceAt,
    status: row.status as ReminderOccurrenceStatus,
    important: row.important,
    messagesSent: row.messagesSent,
    lastSentAt: row.lastSentAt,
    deliveredAt: row.deliveredAt,
    acknowledgedAt: row.acknowledgedAt,
  };
}

function presentOccurrenceDetail(
  row: OccurrenceDetailRow,
): ReminderOccurrenceDetail {
  return {
    ...presentOccurrence(row),
    idempotencyKey: row.idempotencyKey,
    userId: row.reminder.userId,
    title: row.reminder.title,
  };
}

function present(row: ReminderRow): Reminder {
  const latest = row.occurrences[0];

  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    scheduledAt: row.scheduledAt,
    timezone: row.timezone,
    recurrence: row.recurrence as ReminderRecurrence | null,
    important: row.important,
    repeatIntervalMinutes: row.repeatIntervalMinutes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    source: {
      type: row.sourceType as Reminder['source']['type'],
      label: row.sourceMessageId ? 'Dibuat lewat chat' : 'Dibuat di dasbor',
      messageId: row.sourceMessageId,
    },
    snoozedFrom: row.snoozedFrom
      ? {
          occurrenceId: row.snoozedFrom.id,
          occurrenceAt: row.snoozedFrom.occurrenceAt,
        }
      : null,
    latestOccurrence: latest ? presentOccurrence(latest) : null,
  };
}

function presentForDelivery(row: ReminderRow): Reminder & { userId: string } {
  return { ...present(row), userId: row.userId };
}

function updateData(input: Partial<ReminderWrite>): Prisma.ReminderUpdateInput {
  return {
    title: input.title,
    notes: input.notes,
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
    important: input.important,
    repeatIntervalMinutes: input.repeatIntervalMinutes,
  };
}

function createData(
  userId: string,
  input: ReminderWrite,
): Prisma.ReminderUncheckedCreateInput {
  return {
    userId,
    title: input.title,
    scheduledAt: input.scheduledAt,
    timezone: input.timezone,
    notes: input.notes,
    recurrence:
      input.recurrence === null || input.recurrence === undefined
        ? Prisma.JsonNull
        : input.recurrence,
    sourceType: input.sourceType,
    sourceMessageId: input.sourceMessageId,
    important: input.important,
    repeatIntervalMinutes: input.repeatIntervalMinutes,
    snoozedFromOccurrenceId: input.snoozedFromOccurrenceId,
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
    const scheduledAt = filters.scheduleRange
      ? { gte: filters.scheduleRange.from, lt: filters.scheduleRange.to }
      : filters.schedule === 'today'
        ? { gte: start, lt: end }
        : filters.schedule === 'upcoming'
          ? { gte: end }
          : filters.schedule === 'past'
            ? { lt: start }
            : undefined;

    const rows = await this.prisma.reminder.findMany({
      where: {
        userId,
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

  async create(userId: string, input: ReminderWrite): Promise<Reminder> {
    const row = await this.prisma.reminder.create({
      data: createData(userId, input),
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
      data: updateData(input),
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
  ): Promise<{ id: string; idempotencyKey: string; status: string }> {
    const idempotencyKey = `${reminderId}:${occurrenceAt.toISOString()}`;

    return this.prisma.reminderOccurrence.upsert({
      where: { idempotencyKey },
      create: { reminderId, occurrenceAt, idempotencyKey },
      update: {},
      select: { id: true, idempotencyKey: true, status: true },
    });
  }

  async markOccurrenceDelivered(idempotencyKey: string): Promise<void> {
    const now = new Date();

    // Dispatch already chose the status; a pre-lifecycle occurrence still
    // pending here becomes delivered so it never looks unsent.
    await this.prisma.reminderOccurrence.updateMany({
      where: { idempotencyKey, status: 'pending' },
      data: { status: 'delivered', messagesSent: 1, lastSentAt: now },
    });
    await this.prisma.reminderOccurrence.updateMany({
      where: { idempotencyKey, deliveredAt: null },
      data: { attemptedAt: now, deliveredAt: now },
    });
  }

  async findOccurrence(
    userId: string,
    occurrenceId: string,
  ): Promise<ReminderOccurrenceDetail | null> {
    const row = await this.prisma.reminderOccurrence.findFirst({
      where: { id: occurrenceId, reminder: { userId } },
      select: occurrenceDetailSelect,
    });

    return row ? presentOccurrenceDetail(row) : null;
  }

  async findOccurrenceForDelivery(
    occurrenceId: string,
  ): Promise<ReminderOccurrenceDetail | null> {
    const row = await this.prisma.reminderOccurrence.findUnique({
      where: { id: occurrenceId },
      select: occurrenceDetailSelect,
    });

    return row ? presentOccurrenceDetail(row) : null;
  }

  async findLatestDispatchedOccurrence(
    userId: string,
    reminderId: string,
  ): Promise<ReminderOccurrenceDetail | null> {
    const row = await this.prisma.reminderOccurrence.findFirst({
      where: {
        reminderId,
        reminder: { userId },
        status: { in: dispatchedStatuses },
      },
      orderBy: { occurrenceAt: 'desc' },
      select: occurrenceDetailSelect,
    });

    return row ? presentOccurrenceDetail(row) : null;
  }

  async markDispatched(
    occurrenceId: string,
    input: { important: boolean; at: Date },
  ): Promise<boolean> {
    const { count } = await this.prisma.reminderOccurrence.updateMany({
      where: { id: occurrenceId, status: 'pending' },
      data: {
        status: input.important ? 'awaiting_ack' : 'delivered',
        important: input.important,
        messagesSent: 1,
        lastSentAt: input.at,
      },
    });

    return count === 1;
  }

  async recordRepeat(
    occurrenceId: string,
    expectedMessagesSent: number,
    at: Date,
  ): Promise<boolean> {
    const { count } = await this.prisma.reminderOccurrence.updateMany({
      where: {
        id: occurrenceId,
        status: 'awaiting_ack',
        messagesSent: expectedMessagesSent,
      },
      data: { messagesSent: { increment: 1 }, lastSentAt: at },
    });

    return count === 1;
  }

  async transitionOccurrence(
    occurrenceId: string,
    from: readonly ReminderOccurrenceStatus[],
    to: ReminderOccurrenceStatus,
    patch: { acknowledgedAt?: Date } = {},
  ): Promise<boolean> {
    const { count } = await this.prisma.reminderOccurrence.updateMany({
      where: { id: occurrenceId, status: { in: [...from] } },
      data: { status: to, ...patch },
    });

    return count === 1;
  }

  async acknowledge(
    userId: string,
    occurrenceId: string,
    at: Date,
  ): Promise<ReminderOccurrenceDetail | null> {
    const { count } = await this.prisma.reminderOccurrence.updateMany({
      where: {
        id: occurrenceId,
        status: 'awaiting_ack',
        reminder: { userId },
      },
      data: { status: 'acknowledged', acknowledgedAt: at },
    });

    return count === 1 ? this.findOccurrence(userId, occurrenceId) : null;
  }

  async supersedeAwaiting(
    reminderId: string,
    exceptOccurrenceId: string,
  ): Promise<string[]> {
    return this.moveAwaiting(
      { reminderId, id: { not: exceptOccurrenceId } },
      'superseded',
    );
  }

  async cancelAwaiting(reminderId: string): Promise<string[]> {
    return this.moveAwaiting({ reminderId }, 'cancelled');
  }

  async listAwaitingAcknowledgement(
    userId: string,
  ): Promise<ReminderOccurrenceDetail[]> {
    const rows = await this.prisma.reminderOccurrence.findMany({
      where: { status: 'awaiting_ack', reminder: { userId } },
      orderBy: { occurrenceAt: 'desc' },
      select: occurrenceDetailSelect,
    });

    return rows.map(presentOccurrenceDetail);
  }

  async listRecentlyDispatched(
    userId: string,
    input: { since: Date; limit: number },
  ): Promise<ReminderOccurrenceDetail[]> {
    const rows = await this.prisma.reminderOccurrence.findMany({
      where: {
        reminder: { userId },
        status: { in: dispatchedStatuses },
        lastSentAt: { gte: input.since },
      },
      orderBy: { lastSentAt: 'desc' },
      take: input.limit,
      select: occurrenceDetailSelect,
    });

    return rows.map(presentOccurrenceDetail);
  }

  async createSnoozeCopy(
    userId: string,
    occurrenceId: string,
    allowedFrom: readonly ReminderOccurrenceStatus[],
    copy: ReminderWrite,
  ): Promise<Reminder | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.reminderOccurrence.updateMany({
        where: {
          id: occurrenceId,
          status: { in: [...allowedFrom] },
          reminder: { userId },
        },
        data: { status: 'snoozed' },
      });

      if (count !== 1) return null;
      const row = await tx.reminder.create({
        data: createData(userId, {
          ...copy,
          snoozedFromOccurrenceId: occurrenceId,
        }),
        select: reminderSelect,
      });

      return present(row);
    });
  }

  private async moveAwaiting(
    where: Prisma.ReminderOccurrenceWhereInput,
    to: ReminderOccurrenceStatus,
  ): Promise<string[]> {
    const rows = await this.prisma.reminderOccurrence.findMany({
      where: { ...where, status: 'awaiting_ack' },
      select: { id: true },
    });

    if (!rows.length) return [];
    const ids = rows.map(({ id }) => id);
    await this.prisma.reminderOccurrence.updateMany({
      where: { id: { in: ids }, status: 'awaiting_ack' },
      data: { status: to },
    });

    return ids;
  }
}
