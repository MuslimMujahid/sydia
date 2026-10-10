import { describe, expect, jest, test } from '@jest/globals';
import type { PrismaService } from '../../infra/prisma';
import type { TokenCipher } from '../../infra/crypto';
import { PrismaCalendarRepository } from './prisma-calendar.repository.js';

describe('PrismaCalendarRepository OAuth request expiry', () => {
  test('calculates the expiry from the database clock inside the transaction', async () => {
    const databaseNow = new Date('2026-10-10T12:00:00.000Z');
    const create = jest
      .fn<(input: unknown) => Promise<Record<string, never>>>()
      .mockResolvedValue({});

    const tx = {
      $queryRaw: jest
        .fn<(...args: unknown[]) => Promise<Array<{ now: Date }>>>()
        .mockResolvedValue([{ now: databaseNow }]),
      calendarOAuthRequest: { create },
    };

    const prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    const repository = new PrismaCalendarRepository(
      prisma as unknown as PrismaService,
      {} as TokenCipher,
    );

    await repository.createOAuthRequest({
      userId: 'user-1',
      sessionId: 'session-1',
      stateHash: 'state-hash',
      browserNonceHash: 'browser-hash',
      idTokenNonceHash: 'id-token-hash',
      returnTo: 'https://app.sydia.test/settings?tab=integrations',
      expiresInMs: 600_000,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        sessionId: 'session-1',
        stateHash: 'state-hash',
        browserNonceHash: 'browser-hash',
        idTokenNonceHash: 'id-token-hash',
        returnTo: 'https://app.sydia.test/settings?tab=integrations',
        expiresAt: new Date(databaseNow.getTime() + 600_000),
      },
    });
  });

  test('rejects an invalid TTL before opening a database transaction', async () => {
    const transaction = jest.fn();
    const prisma = { $transaction: transaction };
    const repository = new PrismaCalendarRepository(
      prisma as unknown as PrismaService,
      {} as TokenCipher,
    );

    await expect(
      repository.createOAuthRequest({
        userId: 'user-1',
        sessionId: 'session-1',
        stateHash: 'state-hash',
        browserNonceHash: 'browser-hash',
        idTokenNonceHash: 'id-token-hash',
        returnTo: 'https://app.sydia.test/settings?tab=integrations',
        expiresInMs: 0,
      }),
    ).rejects.toThrow('Calendar OAuth request TTL must be a positive integer.');

    expect(transaction).not.toHaveBeenCalled();
  });
});
