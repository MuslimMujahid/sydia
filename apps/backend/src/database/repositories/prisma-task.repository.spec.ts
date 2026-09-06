import { describe, expect, jest, test } from '@jest/globals';
import type { PrismaService } from '../../infra/prisma';
import { PrismaTaskRepository } from './prisma-task.repository';

const NOW = new Date('2026-09-06T12:00:00.000Z');

function taskRow(status: string, completedAt: Date | null = null) {
  return {
    id: 'task-1',
    title: 'Kirim invoice',
    description: null,
    status,
    priority: 'medium',
    dueAt: null,
    tags: [],
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

    await repository.list('user-1', { status: ['inbox', 'doing'] });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['inbox', 'doing'] },
        }),
      }),
    );
  });
});
