import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import { dayWindow } from '../../shared/date-time';
import type { Task, TaskWrite } from '../entities';
import type { ITaskRepository, TaskFilters } from '../interfaces';

const categorySelect = {
  id: true,
  name: true,
  color: true,
  iconKey: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { tasks: true } },
} as const;

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueAt: true,
  sourceType: true,
  sourceMessageId: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  categories: { select: { category: { select: categorySelect } } },
} as const;

type TaskRow = Prisma.TaskGetPayload<{ select: typeof taskSelect }>;

function present(value: TaskRow): Task {
  return {
    id: value.id,
    title: value.title,
    description: value.description,
    status: value.status as Task['status'],
    priority: value.priority as Task['priority'],
    dueAt: value.dueAt,
    categories: value.categories.map(({ category }) => ({
      ...category,
      color: category.color as Task['categories'][number]['color'],
      iconKey: category.iconKey as Task['categories'][number]['iconKey'],
      taskCount: category._count.tasks,
    })),
    completedAt: value.completedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    source: {
      type: value.sourceType as Task['source']['type'],
      label: value.sourceMessageId ? 'Dibuat lewat chat' : 'Dibuat di dasbor',
      messageId: value.sourceMessageId,
    },
  };
}

function categoryLinks(categoryIds: string[] | undefined) {
  return categoryIds === undefined
    ? undefined
    : {
        deleteMany: {},
        create: categoryIds.map((categoryId) => ({ categoryId })),
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
        categories: filters.categoryIds?.length
          ? {
              some: {
                categoryId: { in: filters.categoryIds },
                category: { userId },
              },
            }
          : undefined,
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
    const { categoryIds, ...data } = input;
    const ids = [...new Set(categoryIds ?? [])];
    if (ids.length > 5)
      throw new Error('Satu tugas maksimal memiliki 5 kategori.');

    if (ids.length) {
      const count = await this.prisma.category.count({
        where: { id: { in: ids }, userId },
      });

      if (count !== ids.length) throw new Error('Kategori tidak valid.');
    }

    const row = await this.prisma.task.create({
      data: {
        userId,
        ...data,
        status: input.status ?? 'inbox',
        completedAt: input.status === 'done' ? new Date() : null,
        categories: ids.length
          ? { create: ids.map((categoryId) => ({ categoryId })) }
          : undefined,
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
    const { categoryIds, ...data } = input;
    const ids =
      categoryIds === undefined ? undefined : [...new Set(categoryIds)];

    if (ids && ids.length > 5)
      throw new Error('Satu tugas maksimal memiliki 5 kategori.');

    if (ids?.length) {
      const count = await this.prisma.category.count({
        where: { id: { in: ids }, userId },
      });

      if (count !== ids.length) throw new Error('Kategori tidak valid.');
    }

    const row = await this.prisma.task.update({
      where: { id },
      data: {
        ...data,
        categories: categoryLinks(ids),
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
