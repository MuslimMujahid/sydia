import { jest } from '@jest/globals';
import type { PrismaService } from '../../infra/prisma';
import { PrismaTelegramRepository } from './prisma-telegram.repository';

const now = new Date('2026-09-15T12:00:00.000Z');
const input = {
  tokenHash: 'hash-1',
  externalId: 'telegram-1',
  now,
};

const token = {
  id: 'token-1',
  userId: 'user-1',
  tokenHash: 'hash-1',
  expiresAt: new Date('2026-09-15T12:10:00.000Z'),
  consumedAt: null,
  consumedByExternalId: null,
  createdAt: now,
};

const identity = {
  id: 'identity-1',
  userId: 'user-1',
  provider: 'telegram',
  externalId: 'telegram-1',
  verifiedAt: now,
  createdAt: now,
  updatedAt: now,
};

function repositoryWith(transaction: Record<string, unknown>) {
  return new PrismaTelegramRepository({
    $transaction: jest.fn(
      (work: (tx: Record<string, unknown>) => Promise<unknown>) =>
        work(transaction),
    ),
  } as unknown as PrismaService);
}

describe('PrismaTelegramRepository commitLink', () => {
  it('releases the prior identity only after the new binding is written', async () => {
    const order: string[] = [];
    const transaction = {
      telegramLinkToken: {
        findFirst: jest.fn(() => Promise.resolve(token)),
        updateMany: jest.fn(() => {
          order.push('consume');

          return Promise.resolve({ count: 1 });
        }),
      },
      externalIdentity: {
        findFirst: jest.fn(() => Promise.resolve(null)),
        create: jest.fn(() => {
          order.push('create');

          return Promise.resolve(identity);
        }),
        deleteMany: jest.fn(() => {
          order.push('release-prior');

          return Promise.resolve({ count: 1 });
        }),
      },
    };

    await expect(
      repositoryWith(transaction).commitLink(input),
    ).resolves.toEqual({ status: 'linked', identity });

    expect(order).toEqual(['consume', 'create', 'release-prior']);
    expect(transaction.externalIdentity.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        provider: 'telegram',
        id: { not: 'identity-1' },
      },
    });
  });

  it('rolls back the identity swap when the token is consumed concurrently', async () => {
    const transaction = {
      telegramLinkToken: {
        findFirst: jest.fn(() => Promise.resolve(token)),
        updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
      },
      externalIdentity: {
        findFirst: jest.fn(() => Promise.resolve(null)),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    await expect(
      repositoryWith(transaction).commitLink(input),
    ).resolves.toEqual({ status: 'token_unavailable' });

    expect(transaction.externalIdentity.create).not.toHaveBeenCalled();
    expect(transaction.externalIdentity.deleteMany).not.toHaveBeenCalled();
  });

  it('disconnects the previous owner and creates a fresh identity for the token owner', async () => {
    const previousIdentity = {
      ...identity,
      id: 'previous-identity',
      userId: 'user-2',
    };

    const transaction = {
      telegramLinkToken: {
        findFirst: jest.fn(() => Promise.resolve(token)),
        updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
      },
      externalIdentity: {
        findFirst: jest.fn(() => Promise.resolve(previousIdentity)),
        create: jest.fn(() => Promise.resolve(identity)),
        deleteMany: jest.fn(() => Promise.resolve({ count: 1 })),
      },
    };

    await expect(
      repositoryWith(transaction).commitLink(input),
    ).resolves.toEqual({ status: 'linked', identity });

    expect(transaction.externalIdentity.deleteMany).toHaveBeenCalledWith({
      where: { id: 'previous-identity' },
    });
    expect(transaction.externalIdentity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: 'user-1',
          provider: 'telegram',
          externalId: 'telegram-1',
          verifiedAt: now,
        },
      }),
    );
    expect(transaction.externalIdentity.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        provider: 'telegram',
        id: { not: 'identity-1' },
      },
    });
  });

  it('preserves the previous owner when another request already consumed the token', async () => {
    const transaction = {
      telegramLinkToken: {
        findFirst: jest.fn(() => Promise.resolve(token)),
        updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
      },
      externalIdentity: {
        findFirst: jest.fn(() =>
          Promise.resolve({ ...identity, userId: 'user-2' }),
        ),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    await expect(
      repositoryWith(transaction).commitLink(input),
    ).resolves.toEqual({ status: 'token_unavailable' });

    expect(transaction.externalIdentity.deleteMany).not.toHaveBeenCalled();
    expect(transaction.externalIdentity.create).not.toHaveBeenCalled();
  });

  it('surfaces a failed transfer instead of reporting a successful link', async () => {
    const failure = new Error('Identity insert failed');
    const transaction = {
      telegramLinkToken: {
        findFirst: jest.fn(() => Promise.resolve(token)),
        updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
      },
      externalIdentity: {
        findFirst: jest.fn(() =>
          Promise.resolve({ ...identity, userId: 'user-2' }),
        ),
        deleteMany: jest.fn(() => Promise.resolve({ count: 1 })),
        create: jest.fn(() => Promise.reject(failure)),
      },
    };

    await expect(repositoryWith(transaction).commitLink(input)).rejects.toThrow(
      failure,
    );
  });

  it('refuses an expired or already consumed token without binding anything', async () => {
    const transaction = {
      telegramLinkToken: {
        findFirst: jest.fn(() => Promise.resolve(null)),
        updateMany: jest.fn(),
      },
      externalIdentity: {
        findFirst: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    await expect(
      repositoryWith(transaction).commitLink(input),
    ).resolves.toEqual({ status: 'token_unavailable' });

    expect(transaction.externalIdentity.findFirst).not.toHaveBeenCalled();
    expect(transaction.externalIdentity.create).not.toHaveBeenCalled();
  });

  it('reuses the sender\u2019s existing identity instead of inserting a duplicate', async () => {
    const existing = { ...identity, userId: 'user-1' };
    const transaction = {
      telegramLinkToken: {
        findFirst: jest.fn(() => Promise.resolve(token)),
        updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
      },
      externalIdentity: {
        findFirst: jest.fn(() => Promise.resolve(existing)),
        create: jest.fn(),
        deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
      },
    };

    await expect(
      repositoryWith(transaction).commitLink(input),
    ).resolves.toEqual({ status: 'linked', identity: existing });

    expect(transaction.externalIdentity.create).not.toHaveBeenCalled();
  });
});
