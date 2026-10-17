import { describe, expect, jest, test } from '@jest/globals';
import type { PrismaService } from '../../infra/prisma';
import { PrismaTaskRepository } from './prisma-task.repository';

const NOW = new Date('2026-09-06T12:00:00.000Z');

test('weekly task query bounds the due range and excludes completed work at the database boundary', async () => {
  const findMany = jest
    .fn<(input: unknown) => Promise<never[]>>()
    .mockResolvedValue([]);

  const repository = new PrismaTaskRepository({
    task: { findMany },
  } as unknown as PrismaService);

  await repository.list('user-1', {
    status: ['inbox'],
    now: NOW,
    dueRange: {
      from: new Date('2026-10-18T16:00:00Z'),
      to: new Date('2026-10-25T16:00:00Z'),
    },
  });
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-1',
        status: { in: ['inbox'] },
        dueAt: {
          gte: new Date('2026-10-18T16:00:00Z'),
          lt: new Date('2026-10-25T16:00:00Z'),
        },
      }),
    }),
  );
});

function taskRow(status: string, completedAt: Date | null = null) {
  return {
    id: 'task-1',
    title: 'Kirim invoice',
    description: null,
    status,
    priority: 'medium',
    dueAt: null,
    categories: [],
    sourceType: 'dashboard',
    sourceMessageId: null,
    completedAt,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

type PrismaCall = { data: Record<string, unknown> };

describe('PrismaTaskRepository status transitions', () => {
  test('creates new tasks in inbox by default', async () => {
    const create =
      jest.fn<(input: unknown) => Promise<ReturnType<typeof taskRow>>>();

    create.mockResolvedValue(taskRow('inbox'));
    const repository = new PrismaTaskRepository({
      task: { create },
    } as unknown as PrismaService);

    await repository.create('user-1', { title: 'Kirim invoice' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'inbox', completedAt: null }),
      }),
    );
  });

  test('sets completion time only when moving to done', async () => {
    const findFirst = jest.fn<(input: unknown) => Promise<{ id: string }>>();
    findFirst.mockResolvedValue({ id: 'task-1' });
    const update =
      jest.fn<(input: unknown) => Promise<ReturnType<typeof taskRow>>>();

    update
      .mockResolvedValueOnce(taskRow('done', NOW))
      .mockResolvedValueOnce(taskRow('cancelled'));
    const repository = new PrismaTaskRepository({
      task: { findFirst, update },
    } as unknown as PrismaService);

    await repository.update('user-1', 'task-1', { status: 'done' });
    await repository.update('user-1', 'task-1', { status: 'cancelled' });

    const doneData = (update.mock.calls[0]?.[0] as PrismaCall).data;
    const cancelledData = (update.mock.calls[1]?.[0] as PrismaCall).data;

    expect(doneData.status).toBe('done');
    expect(doneData.completedAt).toBeInstanceOf(Date);
    expect(cancelledData).toEqual(
      expect.objectContaining({ status: 'cancelled', completedAt: null }),
    );
  });

  test('queries multiple board states together', async () => {
    const findMany = jest.fn<(input: unknown) => Promise<never[]>>();
    findMany.mockResolvedValue([]);
    const repository = new PrismaTaskRepository({
      task: { findMany },
    } as unknown as PrismaService);

    await repository.list('user-1', { status: ['inbox', 'done'] });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['inbox', 'done'] },
        }),
      }),
    );
  });

  test('finds active task references only in inbox', async () => {
    const findFirst = jest.fn<(input: unknown) => Promise<null>>();
    findFirst.mockResolvedValue(null);
    const repository = new PrismaTaskRepository({
      task: { findFirst },
    } as unknown as PrismaService);

    await repository.findReference('user-1', undefined, 'invoice');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          title: { contains: 'invoice', mode: 'insensitive' },
          status: { in: ['inbox'] },
        },
      }),
    );
  });

  test('matches any selected category owned by the user', async () => {
    const findMany = jest.fn<(input: unknown) => Promise<never[]>>();
    findMany.mockResolvedValue([]);
    const repository = new PrismaTaskRepository({
      task: { findMany },
    } as unknown as PrismaService);

    await repository.list('user-1', { categoryIds: ['cat-1', 'cat-2'] });

    expect(findMany.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          categories: {
            some: {
              categoryId: { in: ['cat-1', 'cat-2'] },
              category: { userId: 'user-1' },
            },
          },
        }),
      }),
    );
  });
});
