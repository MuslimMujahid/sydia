import { describe, expect, jest, test } from '@jest/globals';
import type { PrismaService } from '../../infra/prisma';
import { PrismaMemoryRepository } from './prisma-memory.repository';

describe('PrismaMemoryRepository listing', () => {
  test('limits the default list to active memories', async () => {
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
          status: 'active',
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

describe('PrismaMemoryRepository embeddings', () => {
  test('rejects non-finite vector components before issuing SQL', async () => {
    const executeRaw = jest.fn<() => Promise<number>>();
    const repository = new PrismaMemoryRepository({
      $executeRaw: executeRaw,
    } as unknown as PrismaService);

    await expect(
      repository.setEmbedding('memory-1', [0.1, Number.NaN], 'model', 'v1'),
    ).rejects.toThrow('Embedding must contain only finite values.');
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
