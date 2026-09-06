import { Injectable } from '@nestjs/common';
import type { Task as PrismaTask } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import { dayWindow } from '../../shared/date-time';
import type { Task, TaskWrite } from '../entities';
import type { ITaskRepository, TaskFilters } from '../interfaces';

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueAt: true,
  tags: true,
  sourceType: true,
  sourceMessageId: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type TaskRow = Pick<PrismaTask, keyof typeof taskSelect>;

function present(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    dueAt: row.dueAt,
    tags: row.tags,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    source: {
      type: row.sourceType as Task['source']['type'],
      label: row.sourceMessageId ? 'Dibuat lewat chat' : 'Dibuat di dasbor',
      messageId: row.sourceMessageId,
    },
  };
}

@Injectable()
export class PrismaTaskRepository implements ITaskRepository {
  constructor(private readonly prisma: PrismaService) {}
  async list(userId: string, filters: TaskFilters = {}): Promise<Task[]> {
    const now = filters.now ?? new Date();
    const { start, end } = dayWindow(now, filters.timezone ?? 'UTC');
    const dueAt =
      filters.due === 'today'
        ? { gte: start, lt: end }
        : filters.due === 'upcoming'
          ? { gte: end }
          : filters.due === 'overdue'
            ? { lt: start }
            : filters.due === 'none'
              ? null
              : undefined;

    const rows = await this.prisma.task.findMany({
      where: {
        userId,
        status: Array.isArray(filters.status)
          ? { in: filters.status }
          : filters.status,
        dueAt,
        OR: filters.search
          ? [
              { title: { contains: filters.search, mode: 'insensitive' } },
              {
                description: { contains: filters.search, mode: 'insensitive' },
              },
            ]
          : undefined,
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      select: taskSelect,
    });

    return rows.map(present);
  }

  async findById(userId: string, id: string): Promise<Task | null> {
    const row = await this.prisma.task.findFirst({
      where: { id, userId },
      select: taskSelect,
    });

    return row ? present(row) : null;
  }

  async findReference(
    userId: string,
    id?: string,
    query?: string,
  ): Promise<Task | null> {
    const row = await this.prisma.task.findFirst({
      where: {
        userId,
        ...(id ? { id } : {}),
        ...(query ? { title: { contains: query, mode: 'insensitive' } } : {}),
        ...(!id ? { status: { in: ['inbox', 'doing'] } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: taskSelect,
    });

    return row ? present(row) : null;
  }

  async create(userId: string, input: TaskWrite): Promise<Task> {
    const row = await this.prisma.task.create({
      data: {
        userId,
        ...input,
        status: input.status ?? 'inbox',
        completedAt: input.status === 'done' ? new Date() : null,
      },
      select: taskSelect,
    });

    return present(row);
  }

  async update(
    userId: string,
    id: string,
    input: Partial<TaskWrite>,
  ): Promise<Task | null> {
    if (
      !(await this.prisma.task.findFirst({
        where: { id, userId },
        select: { id: true },
      }))
    )
      return null;
    const row = await this.prisma.task.update({
      where: { id },
      data: {
        ...input,
        completedAt:
          input.status === 'done'
            ? new Date()
            : input.status !== undefined
              ? null
              : undefined,
      },
      select: taskSelect,
    });

    return present(row);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return (
      (await this.prisma.task.deleteMany({ where: { id, userId } })).count === 1
    );
  }
}
