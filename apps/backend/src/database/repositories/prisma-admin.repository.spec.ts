import { describe, expect, jest, test } from '@jest/globals';
import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../infra/prisma';
import { PrismaAdminRepository } from './prisma-admin.repository';

function mockResolved<T>(value: T) {
  return jest.fn<(input: unknown) => Promise<T>>().mockResolvedValue(value);
}

describe('PrismaAdminRepository deleteUser', () => {
  test('records document cleanup in the transaction before deleting the user', async () => {
    const tx = {
      $queryRaw: mockResolved([{ id: 'user-1' }]),
      fileAsset: {
        findMany: mockResolved([{ storageKey: 'user-1/document-1' }]),
      },
      documentArtifactCleanup: {
        createMany: mockResolved({ count: 1 }),
        updateMany: mockResolved({ count: 1 }),
      },
      user: { deleteMany: mockResolved({ count: 1 }) },
    };

    const prisma = {
      $transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<boolean>) =>
          callback(tx),
      ),
    };

    const repository = new PrismaAdminRepository(
      prisma as unknown as PrismaService,
    );

    await expect(repository.deleteUser('user-1')).resolves.toBe(true);

    expect(tx.documentArtifactCleanup.createMany).toHaveBeenCalledWith({
      data: [{ ownerId: 'user-1', storageKey: 'user-1/document-1' }],
      skipDuplicates: true,
    });
    expect(tx.documentArtifactCleanup.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 'user-1' },
      data: { cleanupRequestedAt: expect.any(Date) },
    });
    expect(
      tx.documentArtifactCleanup.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      tx.user.deleteMany.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

const now = new Date('2026-10-24T00:00:00Z');

function usersRepository(total: bigint) {
  const queryRaw = jest
    .fn<(query: Prisma.Sql) => Promise<unknown>>()
    .mockResolvedValueOnce([{ total }])
    .mockResolvedValueOnce([]);

  return {
    repository: new PrismaAdminRepository({
      $queryRaw: queryRaw,
    } as unknown as PrismaService),
    queryRaw,
  };
}

describe('PrismaAdminRepository users pagination', () => {
  test('limits selected users before calculating usage and uses stable ordering', async () => {
    const { repository, queryRaw } = usersRepository(60n);
    const result = await repository.users(now, { offset: 25, limit: 25 });
    const query = queryRaw.mock.calls[1]![0];
    expect(result).toEqual({ items: [], total: 60, offset: 25 });
    expect(query.sql).toMatch(/WITH page_users AS MATERIALIZED/);
    expect(query.sql.indexOf('LIMIT')).toBeLessThan(
      query.sql.indexOf('"storageBytes"'),
    );
    expect(query.sql).toContain('ORDER BY u."createdAt" DESC, u."id" DESC');
    expect(query.sql).not.toContain('LEFT JOIN');
    expect(query.values.slice(0, 2)).toEqual([25, 25]);
  });

  test('applies literal case-insensitive search and status to both count and page', async () => {
    const { repository, queryRaw } = usersRepository(1n);
    await repository.users(now, {
      offset: 0,
      limit: 25,
      q: '  A_%  ',
      status: 'banned',
    });
    const countQuery = queryRaw.mock.calls[0]![0];
    const pageQuery = queryRaw.mock.calls[1]![0];
    expect(countQuery.sql).toContain('strpos(lower(u."name"), lower(?))');
    expect(countQuery.sql).toContain('strpos(lower(u."email"), lower(?))');
    expect(countQuery.sql).toContain('u."banned" = ?');
    expect(countQuery.values).toEqual(['A_%', 'A_%', true]);
    expect(pageQuery.values.slice(0, 3)).toEqual(['A_%', 'A_%', true]);
  });

  test('returns the previous page after its last user is deleted', async () => {
    const { repository, queryRaw } = usersRepository(25n);
    const result = await repository.users(now, { offset: 25, limit: 25 });
    expect(result.offset).toBe(0);
    expect(queryRaw.mock.calls[1]![0].values.slice(0, 2)).toEqual([25, 0]);
  });

  test('returns zero total and offset for an empty search', async () => {
    const { repository } = usersRepository(0n);
    await expect(
      repository.users(now, { offset: 50, limit: 25, q: 'missing' }),
    ).resolves.toEqual({ items: [], total: 0, offset: 0 });
  });
});
