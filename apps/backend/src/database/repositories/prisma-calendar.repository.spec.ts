import { describe, expect, jest, test } from '@jest/globals';
import type { PrismaService } from '../../infra/prisma';
import type { TokenCipher } from '../../infra/crypto';
import { PrismaCalendarRepository } from './prisma-calendar.repository.js';

const USER_ID = 'user-1';
const NOW = new Date('2026-10-10T12:00:00.000Z');

test('a local save records its edit clock in both the event and durable Google operation', async () => {
  const { repository, tx } = eventCreateHarness();

  const result = await repository.createMutation(
    USER_ID,
    {
      title: 'Clocked event',
      startAt: new Date('2026-10-12T09:00:00Z'),
      endAt: new Date('2026-10-12T10:00:00Z'),
      timezone: 'UTC',
    },
    'google',
    { key: 'clocked', fingerprint: 'clocked', expiresAt: NOW },
  );

  expect(result).toMatchObject({
    status: 'saved',
    event: { localEditedAt: NOW },
  });
  expect(tx.calendarSyncOperation.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          localEditedAt: '2026-10-10T12:00:00.000Z',
        }),
      }),
    }),
  );
});

test('new Google events are saved and queued while authorization needs reconnection', async () => {
  const { repository, tx } = eventCreateHarness();
  tx.calendarIntegration.findUnique.mockResolvedValue({
    status: 'reconnect_required',
    connectionGeneration: 3,
    activeBindingId: 'binding-1',
  });

  const result = await repository.createMutation(
    USER_ID,
    {
      title: 'Saved while paused',
      startAt: new Date('2026-10-12T09:00:00Z'),
      endAt: new Date('2026-10-12T10:00:00Z'),
      timezone: 'UTC',
    },
    'google',
    { key: 'paused', fingerprint: 'paused', expiresAt: NOW },
  );

  expect(result).toMatchObject({
    status: 'saved',
    operationId: 'operation-1',
    event: { provider: 'google', syncState: 'pending' },
  });
  expect(tx.calendarSyncOperation.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ bindingId: 'binding-1' }),
    }),
  );
});

function eventCreateHarness() {
  const tx = {
    $queryRaw: jest
      .fn<(...args: unknown[]) => Promise<Array<{ id: string; now: Date }>>>()
      .mockResolvedValue([{ id: USER_ID, now: NOW }]),
    calendarMutationReceipt: {
      findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null),
      create: jest.fn<() => Promise<void>>().mockResolvedValue(),
    },
    calendarIntegration: {
      findUnique: jest
        .fn<
          () => Promise<{
            status: string;
            connectionGeneration: number;
            activeBindingId: string;
          }>
        >()
        .mockResolvedValue({
          status: 'connected',
          connectionGeneration: 3,
          activeBindingId: 'binding-1',
        }),
    },
    calendarBinding: {
      findFirst: jest
        .fn<() => Promise<{ id: string }>>()
        .mockResolvedValue({ id: 'binding-1' }),
    },
    calendarEvent: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...eventRow(), ...data }),
      ),
    },
    calendarSyncOperation: {
      create: jest
        .fn<(args: unknown) => Promise<{ id: string }>>()
        .mockResolvedValue({ id: 'operation-1' }),
    },
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

  return { repository, tx };
}

test('a Google Meet request is persisted in the durable operation without becoming an event column', async () => {
  const { repository, tx } = eventCreateHarness();
  const result = await repository.createMutation(
    USER_ID,
    {
      title: 'Video meeting',
      startAt: new Date('2026-10-12T09:00:00Z'),
      endAt: new Date('2026-10-12T10:00:00Z'),
      timezone: 'UTC',
      createGoogleMeet: true,
    },
    'google',
    {
      key: 'create-meet',
      fingerprint: 'create-meet-fingerprint',
      expiresAt: NOW,
    },
  );

  expect(result).toMatchObject({ status: 'saved', operationId: 'operation-1' });
  expect(tx.calendarEvent.create.mock.calls[0]![0].data).not.toHaveProperty(
    'createGoogleMeet',
  );
  expect(tx.calendarSyncOperation.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({ createGoogleMeet: true }),
      }),
    }),
  );
});

test('a local-only event rejects a Google Meet request before writing', async () => {
  const { repository, tx } = eventCreateHarness();
  const result = await repository.createMutation(
    USER_ID,
    {
      title: 'Video meeting',
      startAt: new Date('2026-10-12T09:00:00Z'),
      endAt: new Date('2026-10-12T10:00:00Z'),
      timezone: 'UTC',
      createGoogleMeet: true,
    },
    'local',
    {
      key: 'create-meet',
      fingerprint: 'create-meet-fingerprint',
      expiresAt: NOW,
    },
  );

  expect(result).toEqual({ status: 'read_only' });
  expect(tx.calendarEvent.create).not.toHaveBeenCalled();
});

test('reading an event exposes its saved Meet link without leaking its provider snapshot', async () => {
  const prisma = {
    calendarEvent: {
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        ...eventRow(),
        providerLink: {
          remoteSnapshot: {
            hangoutLink: 'https://meet.google.com/abc-defg-hij',
          },
        },
      }),
    },
  };

  const repository = new PrismaCalendarRepository(
    prisma as unknown as PrismaService,
    {} as TokenCipher,
  );

  const result = await repository.findById(USER_ID, 'event-1');

  expect(result).toMatchObject({
    googleMeetUrl: 'https://meet.google.com/abc-defg-hij',
    googleMeetStatus: 'success',
  });
  expect(result).not.toHaveProperty('providerLink');
});

function eventRow() {
  return {
    id: 'event-1',
    provider: 'google',
    providerEventId: 'google-event-1',
    title: 'Sydia title',
    reminderMinutes: null,
    description: null,
    location: null,
    startAt: new Date('2026-10-11T09:00:00.000Z'),
    endAt: new Date('2026-10-11T10:00:00.000Z'),
    timezone: 'UTC',
    allDayStartDate: null,
    allDayEndDate: null,
    recurrence: [],
    recurrenceOverrideFields: [],
    recurringParentEventId: null,
    recurrenceExceptionKey: null,
    recurringParentProviderEventId: null,
    originalStartAt: null,
    originalStartDate: null,
    attendees: [],
    status: 'confirmed',
    syncState: 'conflict',
    revision: 4,
    lastSyncedAt: null,
    syncErrorCode: 'simultaneous_edit',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function remoteSnapshot() {
  return {
    resource: {
      id: 'google-event-1',
      etag: 'etag-4',
      summary: 'Google title',
    },
    common: {
      title: 'Google title',
      description: null,
      location: null,
      startAt: '2026-10-11T09:00:00.000Z',
      endAt: '2026-10-11T10:00:00.000Z',
      timezone: 'UTC',
      allDayStartDate: null,
      allDayEndDate: null,
      recurrence: [],
      attendees: [],
      status: 'confirmed',
    },
  };
}

function repositoryHarness() {
  const current = eventRow();
  const conflict = {
    id: 'conflict-1',
    state: 'open',
    localRevision: current.revision,
    remoteSnapshot: remoteSnapshot(),
    eventLink: {
      id: 'link-1',
      googleEventId: 'google-event-1',
      etag: 'etag-4',
      commonSnapshot: {
        title: 'Base title',
        description: null,
        location: null,
        startAt: current.startAt.toISOString(),
        endAt: current.endAt.toISOString(),
        timezone: 'UTC',
        allDayStartDate: null,
        allDayEndDate: null,
        recurrence: [],
        attendees: [],
        status: 'confirmed',
      },
      recurringParentProviderEventId: null,
      originalStartAt: null,
      originalStartDate: null,
      tombstoneAt: null,
      calendarEvent: current,
      binding: {
        id: 'binding-1',
        state: 'active',
        integration: {
          status: 'connected',
          activeBindingId: 'binding-1',
          connectionGeneration: 3,
        },
      },
    },
  };

  const tx = {
    $queryRaw: jest
      .fn<(...args: unknown[]) => Promise<Array<{ id?: string; now?: Date }>>>()
      .mockResolvedValueOnce([{ id: USER_ID }])
      .mockResolvedValue([{ now: NOW }]),
    calendarSyncConflict: {
      findFirst: jest
        .fn<(input: unknown) => Promise<typeof conflict>>()
        .mockResolvedValue(conflict),
      updateMany: jest
        .fn<(input: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
    },
    calendarSyncOperation: {
      count: jest
        .fn<(input: unknown) => Promise<number>>()
        .mockResolvedValue(0),
      updateMany: jest
        .fn<(input: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
      create: jest
        .fn<(input: unknown) => Promise<{ id: string }>>()
        .mockResolvedValue({ id: 'operation-1' }),
    },
    calendarEvent: {
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...current,
          ...data,
        }),
      ),
    },
    calendarEventLink: {
      update: jest
        .fn<(input: unknown) => Promise<Record<string, never>>>()
        .mockResolvedValue({}),
    },
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

  return { repository, tx };
}

function calendarSelectionHarness(input?: {
  activeBindingId?: string | null;
  activeBinding?: { calendarId: string; state: string } | null;
  existingBindingId?: string | null;
}) {
  const integration = {
    id: 'integration-1',
    status: 'connected',
    googleSubject: 'google-subject-1',
    activeBindingId: input?.activeBindingId ?? null,
    connectionGeneration: 3,
    activeBinding: input?.activeBinding ?? null,
  };

  const tx = {
    $queryRaw: jest
      .fn<(...args: unknown[]) => Promise<Array<{ id?: string; now?: Date }>>>()
      .mockResolvedValueOnce([{ id: USER_ID }])
      .mockResolvedValue([{ now: NOW }]),
    calendarIntegration: {
      findUnique: jest
        .fn<(args: unknown) => Promise<typeof integration>>()
        .mockResolvedValue(integration),
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
      update: jest
        .fn<(args: unknown) => Promise<Record<string, never>>>()
        .mockResolvedValue({}),
    },
    calendarBinding: {
      findFirst: jest
        .fn<(args: unknown) => Promise<{ id: string } | null>>()
        .mockResolvedValue(
          input?.existingBindingId ? { id: input.existingBindingId } : null,
        ),
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
      update: jest
        .fn<(args: unknown) => Promise<Record<string, never>>>()
        .mockResolvedValue({}),
      create: jest
        .fn<(args: unknown) => Promise<{ id: string }>>()
        .mockResolvedValue({ id: 'binding-new' }),
    },
    calendarSyncOperation: {
      findMany: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 0 }),
    },
    calendarEvent: {
      findMany: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 0 }),
    },
    calendarEventLink: {
      findMany: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
    },
    calendarWatchChannel: {
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 0 }),
    },
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

  return { repository, tx };
}

function localOccurrenceHarness(input?: { existingException?: boolean }) {
  const series = {
    ...eventRow(),
    provider: 'local',
    providerEventId: null,
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=SU;COUNT=3'],
    recurringParentEventId: null,
    recurrenceExceptionKey: null,
    revision: 4,
    syncState: 'local',
    syncErrorCode: null,
  };

  const exception = {
    ...series,
    id: 'exception-1',
    recurrence: [],
    recurringParentEventId: series.id,
    recurrenceExceptionKey: '2026-10-11T09:00:00.000Z',
    originalStartAt: new Date('2026-10-11T09:00:00.000Z'),
    startAt: new Date('2026-10-11T09:00:00.000Z'),
    endAt: new Date('2026-10-11T10:00:00.000Z'),
    revision: 1,
  };

  const tx = {
    $queryRaw: jest
      .fn<(...args: unknown[]) => Promise<Array<{ id: string }>>>()
      .mockResolvedValue([{ id: USER_ID }]),
    calendarEvent: {
      findFirst: jest
        .fn<(args: unknown) => Promise<typeof series | null>>()
        .mockResolvedValue(series),
      findUnique: jest
        .fn<(args: unknown) => Promise<typeof exception | null>>()
        .mockResolvedValue(input?.existingException ? exception : null),
      create: jest
        .fn<(args: unknown) => Promise<typeof exception>>()
        .mockResolvedValue(exception),
    },
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

  return { repository, tx, exception };
}

function localExceptionMutationHarness(input?: { overrideFields?: string[] }) {
  const series = {
    ...eventRow(),
    id: 'series-1',
    provider: 'local',
    providerEventId: null,
    title: 'Series title',
    description: 'Series description',
    location: 'Room 1',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=SU;COUNT=3'],
    recurringParentEventId: null,
    recurrenceExceptionKey: null,
    recurrenceOverrideFields: [],
    revision: 4,
    syncState: 'local',
    syncErrorCode: null,
  };

  const exception = {
    ...series,
    id: 'exception-1',
    recurrence: [],
    recurringParentEventId: series.id,
    recurrenceExceptionKey: '2026-10-11T09:00:00.000Z',
    originalStartAt: new Date('2026-10-11T09:00:00.000Z'),
    startAt: new Date('2026-10-11T09:00:00.000Z'),
    endAt: new Date('2026-10-11T10:00:00.000Z'),
    recurrenceOverrideFields: input?.overrideFields ?? [],
    revision: 1,
  };

  const findFirst = jest
    .fn<(args: unknown) => Promise<typeof exception | typeof series | null>>()
    .mockImplementation((args) => {
      const where = (args as { where: { id: string } }).where;

      return Promise.resolve(where.id === series.id ? series : exception);
    });

  const update = jest
    .fn<(args: unknown) => Promise<typeof exception>>()
    .mockImplementation((args) => {
      const data = (args as { data: Record<string, unknown> }).data;

      return Promise.resolve({
        ...exception,
        ...data,
        revision: exception.revision + 1,
      });
    });

  const tx = {
    $queryRaw: jest
      .fn<(...args: unknown[]) => Promise<Array<{ id?: string; now?: Date }>>>()
      .mockResolvedValueOnce([{ id: USER_ID }])
      .mockResolvedValue([{ now: NOW }]),
    calendarMutationReceipt: {
      findUnique: jest
        .fn<(args: unknown) => Promise<null>>()
        .mockResolvedValue(null),
      create: jest.fn<(args: unknown) => Promise<void>>().mockResolvedValue(),
    },
    calendarEvent: { findFirst, update },
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

  return { repository, tx, series, exception };
}

function calendarListHarness() {
  const findMany = jest
    .fn<(args: unknown) => Promise<never[]>>()
    .mockResolvedValue([]);

  const prisma = { calendarEvent: { findMany } };
  const repository = new PrismaCalendarRepository(
    prisma as unknown as PrismaService,
    {} as TokenCipher,
  );

  return { repository, findMany };
}

function fullResyncHarness(input?: {
  userExists?: boolean;
  integration?: {
    activeBindingId: string | null;
    connectionGeneration: number;
    activeBinding: {
      id: string;
      state: string;
      leaseExpiresAt: Date | null;
      fullImportGeneration: number;
    } | null;
  } | null;
  updateCount?: number;
}) {
  const integration =
    input?.integration === undefined
      ? {
          activeBindingId: 'binding-active',
          connectionGeneration: 7,
          activeBinding: {
            id: 'binding-active',
            state: 'active',
            leaseExpiresAt: null,
            fullImportGeneration: 4,
          },
        }
      : input.integration;

  const updateMany = jest
    .fn<(args: unknown) => Promise<{ count: number }>>()
    .mockResolvedValue({ count: input?.updateCount ?? 1 });

  const findFirst = jest
    .fn<(args: unknown) => Promise<typeof integration>>()
    .mockResolvedValue(integration);

  const tx = {
    $queryRaw: jest
      .fn<(...args: unknown[]) => Promise<Array<{ id?: string; now?: Date }>>>()
      .mockResolvedValueOnce(
        input?.userExists === false ? [] : [{ id: USER_ID }],
      )
      .mockResolvedValue([{ now: NOW }]),
    calendarIntegration: { findFirst },
    calendarBinding: { updateMany },
    calendarSyncOperation: {
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    },
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

  return { repository, tx, updateMany, findFirst };
}

describe('PrismaCalendarRepository Google calendar selection', () => {
  test('creates an initializing binding and advances the connection generation', async () => {
    const { repository, tx } = calendarSelectionHarness();
    const target = {
      id: 'team-calendar@example.com',
      name: 'Team calendar',
      timezone: 'Asia/Makassar',
    };

    await expect(
      repository.selectGoogleCalendar(USER_ID, target),
    ).resolves.toEqual({
      status: 'selected',
      bindingId: 'binding-new',
      connectionGeneration: 4,
    });

    expect(tx.calendarIntegration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          calendarId: target.id,
          activeBindingId: null,
          connectionGeneration: { increment: 1 },
        }),
      }),
    );
    expect(tx.calendarBinding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          integrationId: 'integration-1',
          googleSubject: 'google-subject-1',
          calendarId: target.id,
          state: 'initializing',
        }),
      }),
    );
    expect(tx.calendarIntegration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { activeBindingId: 'binding-new' },
      }),
    );
  });

  test('reactivates a known binding with a fresh pull before rebuilding linked writes', async () => {
    const { repository, tx } = calendarSelectionHarness({
      activeBindingId: 'binding-current',
      activeBinding: { calendarId: 'current-calendar', state: 'active' },
      existingBindingId: 'binding-target',
    });

    await expect(
      repository.selectGoogleCalendar(USER_ID, {
        id: 'previous-calendar',
        name: 'Previous calendar',
        timezone: 'UTC',
      }),
    ).resolves.toEqual({
      status: 'selected',
      bindingId: 'binding-target',
      connectionGeneration: 4,
    });

    expect(tx.calendarBinding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['binding-current'] },
          state: { not: 'disconnected' },
        },
      }),
    );
    expect(tx.calendarBinding.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'binding-target' },
        data: expect.objectContaining({ syncToken: null, nextPageToken: null }),
      }),
    );
    expect(tx.calendarSyncOperation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bindingId: 'binding-target',
          calendarEvent: { providerLink: { isNot: null } },
        }),
        data: { state: 'cancelled', claimToken: null, claimedUntil: null },
      }),
    );
  });

  test('does not advance the generation when the selected calendar is already active', async () => {
    const { repository, tx } = calendarSelectionHarness({
      activeBindingId: 'binding-current',
      activeBinding: { calendarId: 'current-calendar', state: 'active' },
    });

    await expect(
      repository.selectGoogleCalendar(USER_ID, {
        id: 'current-calendar',
        name: 'Current calendar',
        timezone: 'UTC',
      }),
    ).resolves.toEqual({ status: 'unchanged' });

    expect(tx.calendarIntegration.updateMany).not.toHaveBeenCalled();
    expect(tx.calendarBinding.create).not.toHaveBeenCalled();
  });
});

describe('PrismaCalendarRepository full resync requests', () => {
  test('resets the active binding cursor under a conditional lease fence', async () => {
    const { repository, updateMany, tx } = fullResyncHarness();

    await expect(repository.requestFullResync(USER_ID)).resolves.toEqual({
      status: 'queued',
      bindingId: 'binding-active',
      connectionGeneration: 7,
      fullImportGeneration: 5,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'binding-active',
        state: { in: ['active', 'initializing'] },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: NOW } }],
        integration: {
          is: {
            status: 'connected',
            activeBindingId: 'binding-active',
            connectionGeneration: 7,
          },
        },
      },
      data: {
        state: 'initializing',
        syncToken: null,
        nextPageToken: null,
        pendingFullImportSyncToken: null,
        fullImportFinalizationCursor: null,
        pullTargetRevision: 0,
        fullImportGeneration: { increment: 1 },
        nextSyncAt: NOW,
        lastErrorCode: null,
        lastErrorMessage: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseEpoch: { increment: 1 },
      },
    });
    expect(tx.calendarIntegration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: USER_ID,
          provider: 'google',
          status: 'connected',
          accessToken: { not: null },
        },
      }),
    );
    expect(tx.calendarSyncOperation.updateMany).not.toHaveBeenCalled();
  });

  test('does not change state while the active binding lease is live', async () => {
    const { repository, updateMany } = fullResyncHarness({
      integration: {
        activeBindingId: 'binding-active',
        connectionGeneration: 7,
        activeBinding: {
          id: 'binding-active',
          state: 'active',
          leaseExpiresAt: new Date(NOW.getTime() + 1_000),
          fullImportGeneration: 4,
        },
      },
    });

    await expect(repository.requestFullResync(USER_ID)).resolves.toEqual({
      status: 'busy',
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  test('reports a lost conditional update as busy', async () => {
    const { repository, updateMany } = fullResyncHarness({ updateCount: 0 });

    await expect(repository.requestFullResync(USER_ID)).resolves.toEqual({
      status: 'busy',
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  test('distinguishes a missing user from a user without a ready active binding', async () => {
    const missing = fullResyncHarness({ userExists: false });
    await expect(
      missing.repository.requestFullResync(USER_ID),
    ).resolves.toEqual({ status: 'missing' });
    expect(missing.findFirst).not.toHaveBeenCalled();

    const notReady = fullResyncHarness({
      integration: {
        activeBindingId: null,
        connectionGeneration: 7,
        activeBinding: null,
      },
    });

    await expect(
      notReady.repository.requestFullResync(USER_ID),
    ).resolves.toEqual({ status: 'not_ready' });
    expect(notReady.updateMany).not.toHaveBeenCalled();
  });
});

describe('PrismaCalendarRepository conflict resolution', () => {
  test('rejects a stale local revision without changing the event', async () => {
    const { repository, tx } = repositoryHarness();

    await expect(
      repository.resolveConflict(
        USER_ID,
        'conflict-1',
        'use_google',
        3,
        'etag-4',
        { key: 'resolve-1', fingerprint: 'fingerprint', expiresAt: NOW },
      ),
    ).resolves.toEqual({ status: 'stale' });

    expect(tx.calendarEvent.update).not.toHaveBeenCalled();
    expect(tx.calendarSyncConflict.updateMany).not.toHaveBeenCalled();
  });

  test('applies the latest Google snapshot and resolves the conflict atomically', async () => {
    const { repository, tx } = repositoryHarness();

    const result = await repository.resolveConflict(
      USER_ID,
      'conflict-1',
      'use_google',
      4,
      'etag-4',
      { key: 'resolve-2', fingerprint: 'fingerprint', expiresAt: NOW },
    );

    expect(result).toMatchObject({
      status: 'saved',
      event: { title: 'Google title', revision: 5, syncState: 'synced' },
      operationId: null,
    });
    expect(tx.calendarEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-1' },
        data: expect.objectContaining({
          title: 'Google title',
          revision: 5,
          syncState: 'synced',
        }),
      }),
    );
    expect(tx.calendarEventLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'link-1' },
        data: expect.objectContaining({
          commonSnapshot: expect.objectContaining({ title: 'Google title' }),
          syncedRevision: 5,
          tombstoneAt: null,
        }),
      }),
    );
    expect(tx.calendarSyncConflict.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventLinkId: 'link-1', state: 'open' },
        data: expect.objectContaining({
          state: 'resolved',
          resolution: 'use_google',
        }),
      }),
    );
  });

  test('keeps Sydia as the new revision and creates one durable Google update', async () => {
    const { repository, tx } = repositoryHarness();

    const result = await repository.resolveConflict(
      USER_ID,
      'conflict-1',
      'keep_sydia',
      4,
      'etag-4',
      { key: 'resolve-3', fingerprint: 'fingerprint', expiresAt: NOW },
    );

    expect(result).toMatchObject({
      status: 'saved',
      event: { title: 'Sydia title', revision: 5, syncState: 'pending' },
      operationId: 'operation-1',
    });
    expect(tx.calendarSyncOperation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'update',
          eventRevision: 5,
          payload: expect.objectContaining({ title: 'Sydia title' }),
        }),
      }),
    );
    expect(tx.calendarSyncConflict.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: 'resolved',
          resolution: 'keep_sydia',
        }),
      }),
    );
  });
});

describe('PrismaCalendarRepository local recurrence exceptions', () => {
  test('loads local recurrence exceptions by occurrence identity, including cancellations', async () => {
    const { repository, findMany } = calendarListHarness();
    const from = new Date('2026-10-11T00:00:00.000Z');
    const to = new Date('2026-10-12T00:00:00.000Z');

    await expect(repository.list(USER_ID, from, to)).resolves.toEqual([]);

    const query = findMany.mock.calls[0]?.[0] as {
      where: { OR: Array<Record<string, unknown>> };
    };

    const localExceptionFilter = query.where.OR.find(
      (filter) => filter.recurrenceExceptionKey !== undefined,
    );

    expect(localExceptionFilter).toBeDefined();
    expect(localExceptionFilter).not.toHaveProperty('status');
    expect(localExceptionFilter).toHaveProperty('recurringParentEventId', {
      not: null,
    });
    expect(localExceptionFilter).toHaveProperty('recurrenceExceptionKey', {
      not: null,
    });
    expect(localExceptionFilter).toHaveProperty(
      'OR',
      expect.arrayContaining([
        expect.objectContaining({ originalStartAt: { gte: from, lt: to } }),
      ]),
    );
  });

  test('materializes one durable local exception for an occurrence identity', async () => {
    const { repository, tx, exception } = localOccurrenceHarness();
    const occurrenceKey = '2026-10-11T09:00:00.000Z';

    const result = await repository.materializeLocalOccurrence({
      userId: USER_ID,
      seriesEventId: 'event-1',
      occurrenceKey,
      expectedSeriesRevision: 4,
      startAt: new Date('2026-10-11T09:00:00.000Z'),
      endAt: new Date('2026-10-11T10:00:00.000Z'),
      allDayStartDate: null,
      allDayEndDate: null,
      now: NOW,
    });

    expect(result).toMatchObject({
      id: exception.id,
      provider: 'local',
      recurringParentEventId: 'event-1',
      recurrenceExceptionKey: occurrenceKey,
      originalStartAt: new Date(occurrenceKey),
      syncState: 'local',
    });
    expect(tx.calendarEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recurringParentEventId: 'event-1',
          recurrenceExceptionKey: occurrenceKey,
          originalStartAt: new Date(occurrenceKey),
          revision: 1,
          syncState: 'local',
        }),
      }),
    );
  });

  test('returns an existing exception instead of creating a duplicate', async () => {
    const { repository, tx, exception } = localOccurrenceHarness({
      existingException: true,
    });

    await expect(
      repository.materializeLocalOccurrence({
        userId: USER_ID,
        seriesEventId: 'event-1',
        occurrenceKey: '2026-10-11T09:00:00.000Z',
        expectedSeriesRevision: 4,
        startAt: new Date('2026-10-11T09:00:00.000Z'),
        endAt: new Date('2026-10-11T10:00:00.000Z'),
        allDayStartDate: null,
        allDayEndDate: null,
        now: NOW,
      }),
    ).resolves.toMatchObject({ id: exception.id });

    expect(tx.calendarEvent.create).not.toHaveBeenCalled();
  });

  test('tracks an edited local occurrence field while leaving inherited fields clear', async () => {
    const { repository, tx } = localExceptionMutationHarness();

    const result = await repository.updateMutation(
      USER_ID,
      'exception-1',
      { title: 'Occurrence title' },
      {
        key: 'mutation-1',
        fingerprint: 'fingerprint-1',
        expiresAt: new Date('2026-10-11T12:00:00.000Z'),
      },
    );

    expect(result).toMatchObject({
      status: 'saved',
      event: { title: 'Occurrence title', recurrenceOverrideFields: ['title'] },
    });
    expect(tx.calendarEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'exception-1' },
        data: expect.objectContaining({ recurrenceOverrideFields: ['title'] }),
      }),
    );
  });

  test('clears an occurrence override when its value is set back to the series value', async () => {
    const { repository } = localExceptionMutationHarness({
      overrideFields: ['title'],
    });

    const result = await repository.updateMutation(
      USER_ID,
      'exception-1',
      { title: 'Series title' },
      {
        key: 'mutation-2',
        fingerprint: 'fingerprint-2',
        expiresAt: new Date('2026-10-11T12:00:00.000Z'),
      },
    );

    expect(result).toMatchObject({
      status: 'saved',
      event: { recurrenceOverrideFields: [] },
    });
  });

  test('marks a changed occurrence schedule as one time-group override', async () => {
    const { repository } = localExceptionMutationHarness();

    const result = await repository.updateMutation(
      USER_ID,
      'exception-1',
      {
        startAt: new Date('2026-10-11T11:00:00.000Z'),
        endAt: new Date('2026-10-11T12:00:00.000Z'),
        timezone: 'UTC',
      },
      {
        key: 'mutation-3',
        fingerprint: 'fingerprint-3',
        expiresAt: new Date('2026-10-11T12:00:00.000Z'),
      },
    );

    expect(result).toMatchObject({
      status: 'saved',
      event: {
        startAt: new Date('2026-10-11T11:00:00.000Z'),
        endAt: new Date('2026-10-11T12:00:00.000Z'),
        recurrenceOverrideFields: ['time'],
      },
    });
  });
});

test('new events receive a ten-minute reminder when none is specified', async () => {
  const { repository } = eventCreateHarness();
  const result = await repository.createMutation(
    USER_ID,
    {
      title: 'Meeting',
      startAt: new Date('2026-10-14T09:00:00Z'),
      endAt: new Date('2026-10-14T10:00:00Z'),
      timezone: 'UTC',
    },
    'local',
    {
      key: 'reminder-default',
      fingerprint: 'default',
      expiresAt: new Date('2026-10-15T00:00:00Z'),
    },
  );

  expect(result).toMatchObject({
    status: 'saved',
    event: { reminderMinutes: 10 },
  });
});

test('new events preserve the selected reminder lead time', async () => {
  const { repository } = eventCreateHarness();
  const result = await repository.createMutation(
    USER_ID,
    {
      title: 'Meeting',
      reminderMinutes: 60,
      startAt: new Date('2026-10-14T09:00:00Z'),
      endAt: new Date('2026-10-14T10:00:00Z'),
      timezone: 'UTC',
    },
    'local',
    {
      key: 'reminder-selected',
      fingerprint: 'selected',
      expiresAt: new Date('2026-10-15T00:00:00Z'),
    },
  );

  expect(result).toMatchObject({
    status: 'saved',
    event: { reminderMinutes: 60 },
  });
});
