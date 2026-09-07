import { describe, expect, jest, test } from '@jest/globals';
import type { PrismaService } from '../../infra/prisma';
import { PrismaMemoryRepository } from './prisma-memory.repository';

describe('PrismaMemoryRepository listing', () => {
  test('limits the default list to user-visible statuses', async () => {
    const findMany = jest.fn<(input: unknown) => Promise<never[]>>();
    findMany.mockResolvedValue([]);
    const repository = new PrismaMemoryRepository({
      memory: { findMany },
    } as unknown as PrismaService);

    await repository.list('user-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          status: { in: ['active', 'archived'] },
        }),
      }),
    );
  });

  test('preserves an explicit status filter, including superseded history', async () => {
    const findMany = jest.fn<(input: unknown) => Promise<never[]>>();
    findMany.mockResolvedValue([]);
    const repository = new PrismaMemoryRepository({
      memory: { findMany },
    } as unknown as PrismaService);

    await repository.list('user-1', { status: 'superseded' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          status: 'superseded',
        }),
      }),
    );
  });
});
