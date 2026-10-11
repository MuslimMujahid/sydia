import { describe, expect, jest, test } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../infra/prisma';
import type { TokenCipher } from '../../infra/crypto';
import { GoogleCalendarService } from '../../infra/calendar';
import type { GoogleCalendarRequestLimiter } from '../../infra/calendar';
import type { QueueService } from '../../infra/queue';
import { CalendarSyncService } from '../../modules/calendar/calendar-sync.service.js';
import { PrismaCalendarRepository } from './prisma-calendar.repository.js';

const NOW = new Date('2026-10-12T00:10:00Z');
const PREVIOUS_SYNC = new Date('2026-10-12T00:08:00Z');

function pollHarness(input?: {
  state?: string;
  dirtyRevision?: number;
  leaseExpiresAt?: Date;
  lastSyncedAt?: Date;
  lastErrorCode?: string;
  queueFailure?: boolean;
  connected?: boolean;
}) {
  const binding = {
    id: 'binding-1',
    calendarId: 'calendar-1',
    state: input?.state ?? 'active',
    dirtyRevision: input?.dirtyRevision ?? 4,
    syncedRevision: 4,
    leaseExpiresAt: input?.leaseExpiresAt ?? null,
    lastSyncedAt: input?.lastSyncedAt ?? PREVIOUS_SYNC,
    lastErrorCode: input?.lastErrorCode ?? null,
    nextSyncAt: new Date('2026-10-12T00:13:00Z'),
  };

  const updateMany = jest
    .fn<(args: unknown) => Promise<{ count: number }>>()
    .mockResolvedValue({ count: 1 });

  const findFirst = jest
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue(
      input?.connected === false
        ? null
        : {
            connectionGeneration: 7,
            activeBinding: binding,
          },
    );

  const tx = {
    $queryRaw: jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValueOnce([{ id: 'user-1' }])
      .mockResolvedValue([{ now: NOW }]),
    calendarIntegration: { findFirst },
    calendarBinding: { updateMany },
  };

  const prisma = {
    $transaction: (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
  };

  const repository = new PrismaCalendarRepository(
    prisma as unknown as PrismaService,
    {} as TokenCipher,
  );

  const add = jest.fn<(...args: unknown[]) => Promise<void>>();
  if (input?.queueFailure)
    add.mockRejectedValue(new Error('Synthetic Redis failure'));
  else add.mockResolvedValue(undefined);
  const config = new ConfigService({
    BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED: 'true',
    BACKEND_GOOGLE_CLIENT_ID: 'test-client',
    BACKEND_GOOGLE_CLIENT_SECRET: 'test-secret',
    BACKEND_GOOGLE_REDIRECT_URI:
      'http://localhost:5000/calendar/google/callback',
  });

  const google = new GoogleCalendarService(
    config,
    {} as GoogleCalendarRequestLimiter,
  );

  const service = new CalendarSyncService(
    repository,
    google,
    { calendarSync: { add } } as unknown as QueueService,
    config,
  );

  return { repository, service, findFirst, updateMany, add };
}

describe('calendar page refresh polls', () => {
  test('durably schedules an incremental pull for the authenticated user without resetting its cursor', async () => {
    const { service, updateMany, findFirst, add } = pollHarness();
    await expect(service.requestPoll('user-1')).resolves.toEqual({
      status: 'queued',
      calendarId: 'calendar-1',
      lastSyncedAt: PREVIOUS_SYNC,
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          provider: 'google',
          status: 'connected',
          accessToken: { not: null },
        },
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'binding-1',
        state: 'active',
        dirtyRevision: 4,
        lastSyncedAt: PREVIOUS_SYNC,
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: NOW } }],
        integration: {
          is: {
            status: 'connected',
            activeBindingId: 'binding-1',
            connectionGeneration: 7,
          },
        },
      },
      data: { dirtyRevision: { increment: 1 }, nextSyncAt: NOW },
    });
    expect(add).toHaveBeenCalledWith('calendar-page-refresh', {
      kind: 'pull',
      bindingId: 'binding-1',
      connectionGeneration: 7,
    });
  });

  test('coalesces a second reload with an already pending pull', async () => {
    const { service, updateMany, add } = pollHarness({ dirtyRevision: 5 });
    expect((await service.requestPoll('user-1')).status).toBe('pending');
    expect(updateMany).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  test('waits for an active worker lease instead of enqueueing another pull', async () => {
    const { service, updateMany, add } = pollHarness({
      leaseExpiresAt: new Date('2026-10-12T00:10:10Z'),
    });

    expect((await service.requestPoll('user-1')).status).toBe('pending');
    expect(updateMany).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  test('serves a sync completed less than thirty seconds ago without another provider request', async () => {
    const { service, updateMany, add } = pollHarness({
      lastSyncedAt: new Date('2026-10-12T00:09:31Z'),
    });

    expect((await service.requestPoll('user-1')).status).toBe('fresh');
    expect(updateMany).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  test('allows another poll when the thirty second cooldown expires', async () => {
    const { service } = pollHarness({
      lastSyncedAt: new Date('2026-10-12T00:09:30Z'),
    });

    expect((await service.requestPoll('user-1')).status).toBe('queued');
  });

  test('preserves provider backoff after a failed pull', async () => {
    const { service, updateMany, add } = pollHarness({
      lastErrorCode: 'google_429_rateLimitExceeded',
    });

    expect((await service.requestPoll('user-1')).status).toBe('pending');
    expect(updateMany).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  test('continues an initial import without resetting it', async () => {
    const { service, updateMany } = pollHarness({ state: 'initializing' });
    expect((await service.requestPoll('user-1')).status).toBe('pending');
    expect(updateMany).not.toHaveBeenCalled();
  });

  test('does not dispatch work if the lease fence was lost', async () => {
    const { service, updateMany, add } = pollHarness();
    updateMany.mockResolvedValue({ count: 0 });
    expect((await service.requestPoll('user-1')).status).toBe('pending');
    expect(add).not.toHaveBeenCalled();
  });

  test('rejects a disconnected account without changing its binding', async () => {
    const { service, updateMany, add } = pollHarness({ connected: false });
    await expect(service.requestPoll('user-1')).rejects.toMatchObject({
      status: 409,
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  test('reports queue degradation while preserving the durable request for recovery', async () => {
    const { service, updateMany } = pollHarness({ queueFailure: true });
    const errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    try {
      expect((await service.requestPoll('user-1')).status).toBe('deferred');
      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining('is durable but queue dispatch failed'),
        expect.any(String),
      );
    } finally {
      errorLog.mockRestore();
    }
  });
});
