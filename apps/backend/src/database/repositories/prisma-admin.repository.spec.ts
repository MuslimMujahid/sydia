import { describe, expect, jest, test } from '@jest/globals';
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
