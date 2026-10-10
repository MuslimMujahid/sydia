import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { QueueEvents, Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import {
  GoogleCalendarApiError,
  GoogleCalendarService,
  GoogleCalendarRequestLimiter,
  type GoogleEventResource,
} from '../../infra/calendar';
import { QueueService, type CalendarSyncJob } from '../../infra/queue';
import { CalendarReadService } from '../../modules/calendar/calendar-read.service.js';
import { CalendarService } from '../../modules/calendar/calendar.service.js';
import {
  CalendarSyncService,
  parseInboundEvent,
} from '../../modules/calendar/calendar-sync.service.js';
import type { CalendarInboundEventInput } from '../interfaces/calendar.repository.interface';
import { PrismaService } from '../../infra/prisma';
import { TokenCipher } from '../../infra/crypto';
import { PrismaCalendarRepository } from './prisma-calendar.repository.js';

const databaseUrl = process.env.CALENDAR_SYNC_CONTRACT_URL;
const redisUrl = process.env.CALENDAR_SYNC_REDIS_CONTRACT_URL;
if (
  databaseUrl &&
  decodeURIComponent(new URL(databaseUrl).pathname) !==
    '/sydia_calendar_sync_contract'
)
  throw new Error(
    'Calendar sync contracts require a dedicated synthetic database',
  );
if (redisUrl && new URL(redisUrl).pathname !== '/15')
  throw new Error(
    'Calendar sync contracts require dedicated Redis database 15',
  );

const live = databaseUrl ? describe : describe.skip;
const TOKEN_KEY = 'calendar-sync-contract-test-key';

function createIndependentRepositoryClient(tokenCipher: TokenCipher): {
  client: PrismaService;
  repository: PrismaCalendarRepository;
} {
  if (!databaseUrl)
    throw new Error('The isolated PostgreSQL contract URL is required.');

  const client = new PrismaService(
    new ConfigService({
      BACKEND_DB_URL: databaseUrl,
      BACKEND_TOKEN_ENCRYPTION_KEY: TOKEN_KEY,
    }),
  );

  return {
    client,
    repository: new PrismaCalendarRepository(client, tokenCipher),
  };
}

function inboundEvent(
  googleEventId: string,
  title: string,
): CalendarInboundEventInput & {
  commonSnapshot: Prisma.InputJsonObject;
  event: NonNullable<CalendarInboundEventInput['event']>;
} {
  const startAt = new Date('2026-10-11T09:00:00.000Z');
  const endAt = new Date('2026-10-11T10:00:00.000Z');

  return {
    googleEventId,
    etag: `etag-${googleEventId}`,
    rawSnapshot: {
      id: googleEventId,
      etag: `etag-${googleEventId}`,
      summary: title,
    },
    commonSnapshot: {
      title,
      description: null,
      location: null,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      timezone: 'UTC',
      allDayStartDate: null,
      allDayEndDate: null,
      recurrence: [],
      attendees: [],
      status: 'confirmed',
    },
    event: { title, startAt, endAt, timezone: 'UTC' },
    status: 'confirmed',
    recurringParentProviderEventId: null,
    originalStartAt: null,
    originalStartDate: null,
  };
}

live('Calendar sync PostgreSQL contract', () => {
  let prisma: PrismaService;
  let repository: PrismaCalendarRepository;
  let tokenCipher: TokenCipher;
  const ownerIds: string[] = [];

  beforeAll(async () => {
    const config = new ConfigService({
      BACKEND_DB_URL: databaseUrl,
      BACKEND_TOKEN_ENCRYPTION_KEY: TOKEN_KEY,
    });

    prisma = new PrismaService(config);
    tokenCipher = new TokenCipher(config);
    repository = new PrismaCalendarRepository(prisma, tokenCipher);
    await prisma.$connect();
  });

  afterEach(async () => {
    if (ownerIds.length === 0) return;

    await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
    ownerIds.length = 0;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function createBinding() {
    const userId = `calendar-contract-${randomUUID()}`;
    ownerIds.push(userId);
    await prisma.user.create({
      data: {
        id: userId,
        name: 'Calendar contract user',
        email: `${userId}@example.invalid`,
      },
    });

    const integration = await prisma.calendarIntegration.create({
      data: {
        userId,
        status: 'connected',
        accessToken: tokenCipher.encrypt('synthetic-access-token'),
        refreshToken: tokenCipher.encrypt('synthetic-refresh-token'),
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        googleSubject: `google-subject-${userId}`,
        googleEmail: `${userId}@google.example.invalid`,
        connectionGeneration: 1,
        credentialGeneration: 1,
        calendarId: 'contract-calendar',
      },
    });

    const binding = await prisma.calendarBinding.create({
      data: {
        integrationId: integration.id,
        googleSubject: integration.googleSubject ?? 'missing-subject',
        calendarId: 'contract-calendar',
        calendarName: 'Contract calendar',
        timezone: 'UTC',
        state: 'initializing',
        dirtyRevision: 1,
      },
    });

    await prisma.calendarIntegration.update({
      where: { id: integration.id },
      data: { activeBindingId: binding.id },
    });

    return { userId, bindingId: binding.id };
  }

  async function commitInboundPage(
    bindingId: string,
    events: CalendarInboundEventInput[],
    connectionGeneration = 1,
    nextSyncToken = `contract-sync-${randomUUID()}`,
  ) {
    const claim = await repository.claimBindingSync(
      bindingId,
      connectionGeneration,
      `worker-${randomUUID()}`,
      30_000,
    );

    if (!claim) throw new Error('The import worker did not acquire its lease.');

    return repository.saveCalendarSyncPage({
      bindingId,
      connectionGeneration,
      owner: claim.leaseOwner,
      leaseEpoch: claim.leaseEpoch,
      capturedDirtyRevision: claim.capturedDirtyRevision,
      fullImportGeneration: claim.fullImportGeneration,
      fullImport: true,
      nextPageToken: null,
      nextSyncToken,
      events,
    });
  }

  async function createLegacyCandidate(
    userId: string,
    providerEventId: string,
    title: string,
  ) {
    return prisma.calendarEvent.create({
      data: {
        userId,
        provider: 'google',
        providerEventId,
        title,
        startAt: new Date('2026-10-11T09:00:00.000Z'),
        endAt: new Date('2026-10-11T10:00:00.000Z'),
        timezone: 'UTC',
        syncState: 'reconnect_required',
        syncErrorCode: 'legacy_link_unverified',
      },
      select: { id: true },
    });
  }

  async function importSeriesAcrossCalendarSwitch(
    oldInstance: CalendarInboundEventInput,
  ) {
    const { userId, bindingId } = await createBinding();
    const recurrence = ['RRULE:FREQ=DAILY;COUNT=2'];
    const oldMaster = inboundEvent('shared-series', 'Old calendar series');
    oldMaster.event = { ...oldMaster.event, recurrence };
    oldMaster.commonSnapshot = { ...oldMaster.commonSnapshot, recurrence };
    await commitInboundPage(bindingId, [oldMaster, oldInstance]);

    const selected = await repository.selectGoogleCalendar(userId, {
      id: 'second-contract-calendar',
      name: 'Second calendar',
      timezone: 'UTC',
    });

    if (selected.status !== 'selected')
      throw new Error('Calendar switch did not establish a new binding.');
    const newMaster = inboundEvent('shared-series', 'Active calendar series');
    newMaster.event = { ...newMaster.event, recurrence };
    newMaster.commonSnapshot = { ...newMaster.commonSnapshot, recurrence };
    await commitInboundPage(
      selected.bindingId,
      [newMaster],
      selected.connectionGeneration,
    );

    return {
      userId,
      oldBindingId: bindingId,
      newBindingId: selected.bindingId,
    };
  }

  test('calendar switch keeps moved instances scoped to their original binding in agenda reads', async () => {
    const moved = inboundEvent('shared-instance', 'Moved old occurrence');
    moved.recurringParentProviderEventId = 'shared-series';
    moved.originalStartAt = new Date('2026-10-11T09:00:00.000Z');
    moved.event = {
      title: 'Moved old occurrence',
      timezone: 'UTC',
      startAt: new Date('2026-10-11T12:00:00.000Z'),
      endAt: new Date('2026-10-11T13:00:00.000Z'),
    };
    moved.commonSnapshot = {
      ...moved.commonSnapshot,
      startAt: '2026-10-11T12:00:00.000Z',
      endAt: '2026-10-11T13:00:00.000Z',
    };
    const { userId } = await importSeriesAcrossCalendarSwitch(moved);

    const events = await new CalendarReadService(repository).list(
      userId,
      new Date('2026-10-11T00:00:00.000Z'),
      new Date('2026-10-12T00:00:00.000Z'),
    );

    expect(
      events.map((event) => [event.title, event.startAt?.toISOString()]),
    ).toEqual([
      ['Active calendar series', '2026-10-11T09:00:00.000Z'],
      ['Moved old occurrence', '2026-10-11T12:00:00.000Z'],
    ]);
  });

  test('calendar switch does not apply old binding cancellation tombstones to a new binding', async () => {
    const cancelled: CalendarInboundEventInput = {
      googleEventId: 'cancelled-instance',
      etag: 'cancelled-etag',
      rawSnapshot: { id: 'cancelled-instance', status: 'cancelled' },
      commonSnapshot: { status: 'cancelled' },
      event: null,
      status: 'cancelled',
      recurringParentProviderEventId: 'shared-series',
      originalStartAt: new Date('2026-10-11T09:00:00.000Z'),
      originalStartDate: null,
    };

    const { userId, oldBindingId } =
      await importSeriesAcrossCalendarSwitch(cancelled);

    const tombstones = await repository.listCancelledRecurringInstances(
      userId,
      new Date('2026-10-11T00:00:00.000Z'),
      new Date('2026-10-12T00:00:00.000Z'),
    );

    expect(tombstones).toEqual([
      {
        bindingId: oldBindingId,
        recurringParentProviderEventId: 'shared-series',
        originalStartAt: new Date('2026-10-11T09:00:00.000Z'),
        originalStartDate: null,
      },
    ]);
    const events = await new CalendarReadService(repository).list(
      userId,
      new Date('2026-10-11T00:00:00.000Z'),
      new Date('2026-10-12T00:00:00.000Z'),
    );

    expect(events.map((event) => event.title)).toEqual([
      'Active calendar series',
    ]);
  });

  async function claimedCompletion(kind: 'delete' | 'update' = 'delete') {
    const { userId, bindingId } = await createBinding();
    const providerId = `completion-${randomUUID()}`;
    const inbound = inboundEvent(providerId, 'Completion event');
    const snapshot = await createLegacyCandidate(
      userId,
      providerId,
      'Completion event',
    );

    await prisma.calendarEvent.update({
      where: { id: snapshot.id },
      data: {
        status: kind === 'delete' ? 'cancelled' : 'confirmed',
        syncState: 'pending',
        revision: 2,
        syncErrorCode: 'synthetic-old-error',
      },
    });
    const link = await prisma.calendarEventLink.create({
      data: {
        bindingId,
        calendarEventId: snapshot.id,
        googleEventId: providerId,
        etag: 'etag-before-write',
        commonSnapshot: inbound.commonSnapshot,
        remoteSnapshot: { id: providerId, summary: 'Completion event' },
        syncedRevision: 1,
      },
    });

    const operation = await prisma.calendarSyncOperation.create({
      data: {
        bindingId,
        calendarEventId: snapshot.id,
        operationKey: `completion-${randomUUID()}`,
        kind,
        nextAttemptAt: new Date(0),
        connectionGeneration: 1,
        eventRevision: 2,
        payload: {
          ...inbound.commonSnapshot,
          providerEventId: providerId,
          status: kind === 'delete' ? 'cancelled' : 'confirmed',
        },
      },
    });

    const claim = await repository.claimOperation(
      operation.id,
      'completion-claim',
      60000,
    );

    if (!claim)
      throw new Error('The synthetic completion operation was not claimed.');
    const completion = {
      operationId: operation.id,
      claimToken: claim.operation.claimToken,
      claimEpoch: claim.operation.claimEpoch,
    };

    return {
      userId,
      bindingId,
      eventId: snapshot.id,
      providerId,
      linkId: link.id,
      operationId: operation.id,
      completion,
    };
  }

  test('delete completion confirms the cancelled event and its remote baseline', async () => {
    const fixture = await claimedCompletion();
    expect(await repository.completeOperation(fixture.completion)).toBe(true);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      status: 'cancelled',
      syncState: 'synced',
      revision: 2,
      lastSyncedAt: expect.any(Date),
      syncErrorCode: null,
    });
    expect(
      await prisma.calendarEventLink.findUnique({
        where: { id: fixture.linkId },
      }),
    ).toMatchObject({
      tombstoneAt: expect.any(Date),
      syncedRevision: 2,
      commonSnapshot: expect.objectContaining({ status: 'cancelled' }),
      remoteSnapshot: expect.objectContaining({
        id: fixture.providerId,
        status: 'cancelled',
      }),
    });
    expect(
      await prisma.calendarSyncOperation.findUnique({
        where: { id: fixture.operationId },
      }),
    ).toMatchObject({ state: 'completed', claimToken: null });
  });

  test('delete completion preserves a newer pending edit while recording the confirmed deletion revision', async () => {
    const fixture = await claimedCompletion();
    await prisma.calendarEvent.update({
      where: { id: fixture.eventId },
      data: { title: 'Newer desired title', revision: 3, syncState: 'pending' },
    });
    expect(await repository.completeOperation(fixture.completion)).toBe(true);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      title: 'Newer desired title',
      revision: 3,
      syncState: 'pending',
    });
    expect(
      await prisma.calendarEventLink.findUnique({
        where: { id: fixture.linkId },
      }),
    ).toMatchObject({
      syncedRevision: 2,
      commonSnapshot: expect.objectContaining({
        title: 'Completion event',
        status: 'cancelled',
      }),
    });
  });

  test.each([
    [2, 'conflict'],
    [3, 'conflict'],
    [3, 'error'],
  ] as const)(
    'write completion preserves revision %s in %s with its actionable error',
    async (revision, syncState) => {
      const fixture = await claimedCompletion('update');
      await prisma.calendarEvent.update({
        where: { id: fixture.eventId },
        data: {
          title: 'Conflict edit',
          revision,
          syncState,
          syncErrorCode: 'remote_deleted',
        },
      });
      expect(
        await repository.completeOperation({
          ...fixture.completion,
          remoteEventId: fixture.providerId,
          remoteEtag: 'new-etag',
          remoteSnapshot: {
            id: fixture.providerId,
            summary: 'Completion event',
          },
        }),
      ).toBe(true);
      expect(
        await prisma.calendarEvent.findUnique({
          where: { id: fixture.eventId },
        }),
      ).toMatchObject({
        title: 'Conflict edit',
        revision,
        syncState,
        syncErrorCode: 'remote_deleted',
      });
    },
  );

  test('delete completion rejects stale claims without confirming the event', async () => {
    const fixture = await claimedCompletion();
    expect(
      await repository.completeOperation({
        ...fixture.completion,
        claimEpoch: fixture.completion.claimEpoch + 1,
      }),
    ).toBe(false);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({ syncState: 'pending', lastSyncedAt: null });
    expect(
      await prisma.calendarEventLink.findUnique({
        where: { id: fixture.linkId },
      }),
    ).toMatchObject({ tombstoneAt: null, syncedRevision: 1 });
  });

  test('delete completion uses the saved remote identity after its local event is removed', async () => {
    const fixture = await claimedCompletion();
    const unrelated = await retentionTombstone(fixture.bindingId);
    await prisma.calendarEventLink.update({
      where: { id: unrelated.id },
      data: { tombstoneAt: null },
    });
    await prisma.calendarEvent.delete({ where: { id: fixture.eventId } });
    expect(await repository.completeOperation(fixture.completion)).toBe(true);
    expect(
      await prisma.calendarEventLink.findUnique({
        where: { id: fixture.linkId },
      }),
    ).toMatchObject({ tombstoneAt: expect.any(Date), syncedRevision: 2 });
    expect(
      await prisma.calendarEventLink.findUnique({
        where: { id: unrelated.id },
      }),
    ).toMatchObject({ tombstoneAt: null });
  });

  test('delete completion with no surviving identity does not tombstone an unrelated link', async () => {
    const fixture = await claimedCompletion();
    await prisma.calendarEvent.delete({ where: { id: fixture.eventId } });
    await prisma.calendarSyncOperation.update({
      where: { id: fixture.operationId },
      data: {
        payload: {
          ...inboundEvent(fixture.providerId, 'Completion event')
            .commonSnapshot,
          providerEventId: null,
          status: 'cancelled',
        },
      },
    });
    expect(await repository.completeOperation(fixture.completion)).toBe(true);
    expect(
      await prisma.calendarEventLink.findUnique({
        where: { id: fixture.linkId },
      }),
    ).toMatchObject({ tombstoneAt: null });
  });

  test('delete completion is fenced after disconnect without confirming cached data', async () => {
    const fixture = await claimedCompletion();
    await repository.beginDisconnect(fixture.userId);
    expect(await repository.completeOperation(fixture.completion)).toBe(false);
    expect(
      await prisma.calendarSyncOperation.findUnique({
        where: { id: fixture.operationId },
      }),
    ).toMatchObject({ state: 'paused' });
    expect(
      await prisma.calendarEventLink.findUnique({
        where: { id: fixture.linkId },
      }),
    ).toMatchObject({ tombstoneAt: null });
  });

  test('delete completion rolls back operation and link changes when event confirmation fails', async () => {
    const fixture = await claimedCompletion();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION calendar_contract_completion_failure() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic event confirmation failure'; END; $$`);

    try {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER calendar_contract_completion_failure
        BEFORE UPDATE ON calendar_event FOR EACH ROW EXECUTE FUNCTION calendar_contract_completion_failure()`);
      await expect(
        repository.completeOperation(fixture.completion),
      ).rejects.toThrow('synthetic event confirmation failure');
      expect(
        await prisma.calendarSyncOperation.findUnique({
          where: { id: fixture.operationId },
        }),
      ).toMatchObject({ state: 'processing', claimToken: 'completion-claim' });
      expect(
        await prisma.calendarEventLink.findUnique({
          where: { id: fixture.linkId },
        }),
      ).toMatchObject({ tombstoneAt: null, syncedRevision: 1 });
      expect(
        await prisma.calendarEvent.findUnique({
          where: { id: fixture.eventId },
        }),
      ).toMatchObject({ syncState: 'pending', lastSyncedAt: null });
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS calendar_contract_completion_failure ON calendar_event',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION calendar_contract_completion_failure()',
      );
    }
  });

  async function uncertainUpdate() {
    const fixture = await claimedCompletion('update');
    const baseline = inboundEvent(fixture.providerId, 'Original title');
    await prisma.calendarSyncOperation.update({
      where: { id: fixture.operationId },
      data: {
        state: 'pending',
        claimedUntil: null,
        claimToken: null,
        attempts: 0,
        retryBudgetAttempts: 0,
        firstAttemptAt: null,
        nextAttemptAt: new Date(0),
        baseSnapshot: baseline.commonSnapshot,
      },
    });
    let remote: GoogleEventResource = {
      id: fixture.providerId,
      etag: 'etag-before-write',
      summary: 'Original title',
      status: 'confirmed',
      start: { dateTime: '2026-10-11T09:00:00.000Z', timeZone: 'UTC' },
      end: { dateTime: '2026-10-11T10:00:00.000Z', timeZone: 'UTC' },
    };

    const updateEvent = jest
      .fn<GoogleCalendarService['updateEvent']>()
      .mockImplementation((...args) => {
        const [, , eventId, operationId, patch, etag] = args;
        if (eventId !== remote.id || etag !== remote.etag)
          throw new GoogleCalendarApiError(412, 'conditionNotMet', null);
        remote = {
          ...remote,
          etag: `etag-after-${updateEvent.mock.calls.length}`,
          ...(patch.title !== undefined ? { summary: patch.title } : {}),
          extendedProperties: { private: { sydiaOperationId: operationId } },
        };

        return Promise.resolve(remote);
      });

    const getEvent = jest
      .fn<GoogleCalendarService['getEvent']>()
      .mockImplementation(() => Promise.resolve(remote));

    const sync = new CalendarSyncService(
      repository,
      {
        available: () => true,
        updateEvent,
        getEvent,
      } as unknown as GoogleCalendarService,
      {} as QueueService,
      new ConfigService({}),
    );

    return {
      ...fixture,
      sync,
      updateEvent,
      getEvent,
      remote: () => remote,
      editRemote: (fields: GoogleEventResource) => {
        remote = { ...remote, ...fields, etag: 'etag-external-edit' };
      },
    };
  }

  test('an update accepted before completion rollback recovers without another provider write', async () => {
    const fixture = await uncertainUpdate();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION calendar_contract_update_failure() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic update completion failure'; END; $$`);

    try {
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER calendar_contract_update_failure BEFORE UPDATE ON calendar_event FOR EACH ROW EXECUTE FUNCTION calendar_contract_update_failure()`,
      );
      await expect(
        fixture.sync.processOperation(fixture.operationId),
      ).rejects.toThrow('synthetic update completion failure');
      expect(fixture.updateEvent).toHaveBeenCalledTimes(1);
      expect(
        await prisma.calendarSyncOperation.findUnique({
          where: { id: fixture.operationId },
        }),
      ).toMatchObject({ state: 'processing' });
      expect(
        await prisma.calendarEventLink.findUnique({
          where: { id: fixture.linkId },
        }),
      ).toMatchObject({ etag: 'etag-before-write', syncedRevision: 1 });
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS calendar_contract_update_failure ON calendar_event',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION calendar_contract_update_failure()',
      );
    }

    fixture.editRemote({ location: 'Independent Google location' });
    await prisma.calendarSyncOperation.update({
      where: { id: fixture.operationId },
      data: { claimedUntil: new Date(0), nextAttemptAt: new Date(0) },
    });
    await fixture.sync.processOperation(fixture.operationId);
    expect(fixture.updateEvent).toHaveBeenCalledTimes(1);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      title: 'Completion event',
      location: 'Independent Google location',
      syncState: 'synced',
      revision: 3,
    });
    expect(
      await prisma.calendarEventLink.findUnique({
        where: { id: fixture.linkId },
      }),
    ).toMatchObject({
      commonSnapshot: expect.objectContaining({
        title: 'Completion event',
        location: 'Independent Google location',
      }),
      etag: 'etag-external-edit',
      syncedRevision: 3,
    });
    expect(
      await prisma.calendarSyncOperation.findUnique({
        where: { id: fixture.operationId },
      }),
    ).toMatchObject({ state: 'completed', attempts: 2 });
  });

  test('an old operation marker cannot overwrite a later edit to the same provider field', async () => {
    const fixture = await uncertainUpdate();
    fixture.editRemote({
      summary: 'Later Google title',
      extendedProperties: {
        private: { sydiaOperationId: fixture.operationId },
      },
    });
    await fixture.sync.processOperation(fixture.operationId);
    expect(fixture.updateEvent).not.toHaveBeenCalled();
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({ title: 'Completion event', syncState: 'conflict' });
    expect(
      await prisma.calendarSyncConflict.findFirst({
        where: { eventLinkId: fixture.linkId },
      }),
    ).toMatchObject({
      conflictingFields: ['title'],
      remoteSnapshot: expect.objectContaining({
        resource: expect.objectContaining({ summary: 'Later Google title' }),
        common: expect.objectContaining({ title: 'Later Google title' }),
      }),
    });
  });

  test('completion preserves a queued later edit and its next patch preserves independent Google fields', async () => {
    const fixture = await uncertainUpdate();
    fixture.editRemote({
      summary: 'Completion event',
      location: 'Independent Google location',
    });
    const previous = inboundEvent(fixture.providerId, 'Completion event');
    await prisma.calendarEvent.update({
      where: { id: fixture.eventId },
      data: { title: 'Newer local title', revision: 3, syncState: 'pending' },
    });
    const next = await prisma.calendarSyncOperation.create({
      data: {
        bindingId: fixture.bindingId,
        calendarEventId: fixture.eventId,
        operationKey: `later-${randomUUID()}`,
        kind: 'update',
        nextAttemptAt: new Date(0),
        connectionGeneration: 1,
        eventRevision: 3,
        baseSnapshot: previous.commonSnapshot,
        payload: { ...previous.commonSnapshot, title: 'Newer local title' },
      },
    });

    await fixture.sync.processOperation(fixture.operationId);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      title: 'Newer local title',
      location: null,
      revision: 3,
      syncState: 'pending',
    });
    await fixture.sync.processOperation(next.id);
    expect(fixture.updateEvent).toHaveBeenCalledTimes(1);
    expect(fixture.updateEvent).toHaveBeenLastCalledWith(
      expect.any(String),
      'contract-calendar',
      fixture.providerId,
      next.id,
      { title: 'Newer local title' },
      'etag-external-edit',
      expect.any(Object),
    );
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      title: 'Newer local title',
      location: 'Independent Google location',
      revision: 4,
      syncState: 'synced',
    });
  });

  test('a failed older revision blocks later patches and manual retry restarts the older intent first', async () => {
    const fixture = await uncertainUpdate();
    const baseline = inboundEvent(fixture.providerId, 'Completion event');
    await prisma.calendarEvent.update({
      where: { id: fixture.eventId },
      data: { title: 'Newer local title', revision: 3, syncState: 'pending' },
    });
    const next = await prisma.calendarSyncOperation.create({
      data: {
        bindingId: fixture.bindingId,
        calendarEventId: fixture.eventId,
        operationKey: `dependent-${randomUUID()}`,
        kind: 'update',
        nextAttemptAt: new Date(0),
        connectionGeneration: 1,
        eventRevision: 3,
        baseSnapshot: baseline.commonSnapshot,
        payload: { ...baseline.commonSnapshot, title: 'Newer local title' },
      },
    });

    const claim = await repository.claimOperation(
      fixture.operationId,
      'older-failure',
      60000,
    );

    if (!claim) throw new Error('The older synthetic update was not claimed.');
    await repository.failOperation({
      operationId: fixture.operationId,
      claimToken: claim.operation.claimToken,
      claimEpoch: claim.operation.claimEpoch,
      outcome: 'failed',
      errorCode: 'synthetic-provider-failure',
    });
    expect(
      await repository.claimOperation(next.id, 'must-block', 60000),
    ).toBeNull();
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      title: 'Newer local title',
      revision: 3,
      syncState: 'error',
    });
    expect(
      await repository.retryFailedOperation(fixture.userId, fixture.eventId),
    ).toMatchObject({
      status: 'queued',
      operationId: fixture.operationId,
      event: expect.objectContaining({ revision: 3, syncState: 'pending' }),
    });
    await fixture.sync.processOperation(fixture.operationId);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      title: 'Newer local title',
      revision: 3,
      syncState: 'pending',
    });
    await fixture.sync.processOperation(next.id);
    expect(fixture.updateEvent).toHaveBeenCalledTimes(2);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      title: 'Newer local title',
      revision: 3,
      syncState: 'synced',
    });
  });

  test('keeping Sydia after a conflict replaces superseded operations without blocking the chosen write', async () => {
    const fixture = await uncertainUpdate();
    fixture.editRemote({ summary: 'Conflicting Google title' });
    await fixture.sync.processOperation(fixture.operationId);
    const conflict = await prisma.calendarSyncConflict.findFirstOrThrow({
      where: { eventLinkId: fixture.linkId, state: 'open' },
    });

    const resolution = await repository.resolveConflict(
      fixture.userId,
      conflict.id,
      'keep_sydia',
      2,
      'etag-external-edit',
      {
        key: `resolution-${randomUUID()}`,
        fingerprint: 'synthetic-resolution',
        expiresAt: new Date(Date.now() + 60000),
      },
    );

    if (resolution.status !== 'saved' || !resolution.operationId)
      throw new Error('The synthetic conflict did not queue the chosen write.');
    await prisma.calendarSyncOperation.update({
      where: { id: resolution.operationId },
      data: { nextAttemptAt: new Date(0) },
    });
    await fixture.sync.processOperation(resolution.operationId);
    expect(fixture.updateEvent).toHaveBeenCalledTimes(1);
    expect(
      await prisma.calendarSyncOperation.findUnique({
        where: { id: resolution.operationId },
      }),
    ).toMatchObject({ state: 'completed' });
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({ title: 'Completion event', syncState: 'synced' });
  });

  test('using Google permits later edits and retry ignores the superseded failed operation', async () => {
    const fixture = await uncertainUpdate();
    fixture.editRemote({ summary: 'Chosen Google title' });
    await fixture.sync.processOperation(fixture.operationId);
    const conflict = await prisma.calendarSyncConflict.findFirstOrThrow({
      where: { eventLinkId: fixture.linkId, state: 'open' },
    });

    const resolution = await repository.resolveConflict(
      fixture.userId,
      conflict.id,
      'use_google',
      2,
      'etag-external-edit',
      {
        key: `remote-resolution-${randomUUID()}`,
        fingerprint: 'synthetic-resolution',
        expiresAt: new Date(Date.now() + 60000),
      },
    );

    expect(resolution).toMatchObject({ status: 'saved', operationId: null });
    const edited = await repository.updateMutation(
      fixture.userId,
      fixture.eventId,
      { title: 'Later Sydia title' },
      {
        key: `post-resolution-${randomUUID()}`,
        fingerprint: 'synthetic-edit',
        expiresAt: new Date(Date.now() + 60000),
      },
    );

    if (edited.status !== 'saved' || !edited.operationId)
      throw new Error('The post-resolution edit was not queued.');
    await prisma.calendarSyncOperation.update({
      where: { id: edited.operationId },
      data: { nextAttemptAt: new Date(0) },
    });
    const claim = await repository.claimOperation(
      edited.operationId,
      'post-resolution-failure',
      60000,
    );

    if (!claim)
      throw new Error(
        'A superseded operation blocked the post-resolution claim.',
      );
    await repository.failOperation({
      operationId: edited.operationId,
      claimToken: claim.operation.claimToken,
      claimEpoch: claim.operation.claimEpoch,
      outcome: 'failed',
      errorCode: 'synthetic-provider-failure',
    });
    expect(
      await repository.retryFailedOperation(fixture.userId, fixture.eventId),
    ).toMatchObject({ status: 'queued', operationId: edited.operationId });
    await fixture.sync.processOperation(edited.operationId);
    expect(fixture.updateEvent).toHaveBeenCalledTimes(1);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({ title: 'Later Sydia title', syncState: 'synced' });
    expect(
      await prisma.calendarSyncOperation.findUnique({
        where: { id: fixture.operationId },
      }),
    ).toMatchObject({ state: 'failed', lastErrorCode: 'conflict_resolved' });
  });

  test.each<{ name: string; data: Prisma.CalendarSyncOperationUpdateInput }>([
    { name: 'expired claim', data: { claimedUntil: new Date(0) } },
    { name: 'replaced claim token', data: { claimToken: 'replacement' } },
    { name: 'advanced claim epoch', data: { claimEpoch: { increment: 1 } } },
    { name: 'paused operation', data: { state: 'paused' } },
    {
      name: 'advanced operation generation',
      data: { connectionGeneration: 2 },
    },
  ])(
    'request fencing rejects $name before provider access',
    async ({ data }) => {
      const fixture = await claimedCompletion();
      const fence = {
        kind: 'operation' as const,
        bindingId: fixture.bindingId,
        connectionGeneration: 1,
        ...fixture.completion,
      };

      expect(await repository.canSendCalendarRequest(fence, 20000)).toBe(true);
      await prisma.calendarSyncOperation.update({
        where: { id: fixture.operationId },
        data,
      });
      expect(await repository.canSendCalendarRequest(fence, 20000)).toBe(false);
    },
  );

  test('request fencing rejects a claim with less than one HTTP budget remaining', async () => {
    const fixture = await claimedCompletion();
    await prisma.$executeRaw`UPDATE calendar_sync_operation SET "claimedUntil" = clock_timestamp() + INTERVAL '10 seconds' WHERE id = ${fixture.operationId}`;
    const fence = {
      kind: 'operation' as const,
      bindingId: fixture.bindingId,
      connectionGeneration: 1,
      ...fixture.completion,
    };

    expect(await repository.canSendCalendarRequest(fence, 0)).toBe(true);
    expect(await repository.canSendCalendarRequest(fence, 20000)).toBe(false);
  });

  test('request fencing rejects a disconnected integration while its operation claim still exists', async () => {
    const fixture = await claimedCompletion();
    await repository.beginDisconnect(fixture.userId);
    expect(
      await repository.canSendCalendarRequest(
        {
          kind: 'operation',
          bindingId: fixture.bindingId,
          connectionGeneration: 1,
          ...fixture.completion,
        },
        20000,
      ),
    ).toBe(false);
  });

  test('binding request fencing checks the database epoch and remaining lease budget', async () => {
    const { bindingId } = await createBinding();
    const claim = await repository.claimBindingSync(
      bindingId,
      1,
      'request-worker',
      60000,
    );

    if (!claim)
      throw new Error('The binding request worker did not claim its lease.');
    const fence = {
      kind: 'binding' as const,
      bindingId,
      connectionGeneration: 1,
      owner: claim.leaseOwner,
      leaseEpoch: claim.leaseEpoch,
    };

    expect(await repository.canSendCalendarRequest(fence, 20000)).toBe(true);
    await prisma.calendarBinding.update({
      where: { id: bindingId },
      data: { leaseEpoch: { increment: 1 } },
    });
    expect(await repository.canSendCalendarRequest(fence, 20000)).toBe(false);
  });

  test('credential request fencing rejects a refresh lease replaced by another owner', async () => {
    const { userId, bindingId } = await createBinding();
    await prisma.calendarIntegration.update({
      where: { userId_provider: { userId, provider: 'google' } },
      data: { accessTokenExpiresAt: new Date(0) },
    });
    const claim = await repository.claimCredentialRefresh(
      bindingId,
      1,
      'credential-worker',
      60000,
      60000,
    );

    if (claim.status !== 'leased')
      throw new Error('The synthetic credential refresh was not claimed.');
    const fence = {
      kind: 'credential' as const,
      bindingId,
      owner: 'credential-worker',
      credentialGeneration: claim.credentialGeneration,
    };

    expect(await repository.canSendCalendarRequest(fence, 20000)).toBe(true);
    await prisma.calendarIntegration.update({
      where: { userId_provider: { userId, provider: 'google' } },
      data: { credentialLeaseOwner: 'replacement-owner' },
    });
    expect(await repository.canSendCalendarRequest(fence, 20000)).toBe(false);
  });

  test('disconnect after an update preflight prevents the subsequent provider PATCH', async () => {
    if (!redisUrl)
      throw new Error('The request boundary contract requires isolated Redis.');
    const fixture = await uncertainUpdate();
    const config = new ConfigService({
      BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED: 'true',
      BACKEND_GOOGLE_CLIENT_ID: `request-fence-contract-${randomUUID()}`,
      BACKEND_GOOGLE_CLIENT_SECRET: 'synthetic-secret',
      BACKEND_GOOGLE_REDIRECT_URI: 'https://example.test/callback',
      BACKEND_REDIS_URL: redisUrl,
    });

    const limiter = new GoogleCalendarRequestLimiter(config);
    const google = new GoogleCalendarService(config, limiter);
    const sync = new CalendarSyncService(
      repository,
      google,
      {} as QueueService,
      new ConfigService({}),
    );

    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => {
        await repository.beginDisconnect(fixture.userId);

        return new Response(JSON.stringify(fixture.remote()), { status: 200 });
      });

    try {
      await sync.processOperation(fixture.operationId);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'GET' }),
      );
      expect(
        await prisma.calendarSyncOperation.findUnique({
          where: { id: fixture.operationId },
        }),
      ).toMatchObject({ state: 'paused' });
      expect(
        await prisma.calendarEvent.findUnique({
          where: { id: fixture.eventId },
        }),
      ).toMatchObject({
        title: 'Completion event',
        syncState: 'reconnect_required',
        lastSyncedAt: null,
      });
    } finally {
      fetchSpy.mockRestore();
      limiter.onModuleDestroy();
    }
  });

  test('a short remaining lease after preflight defers the PATCH without consuming a provider attempt', async () => {
    if (!redisUrl)
      throw new Error('The request boundary contract requires isolated Redis.');
    const fixture = await uncertainUpdate();
    const config = new ConfigService({
      BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED: 'true',
      BACKEND_GOOGLE_CLIENT_ID: `request-fence-contract-${randomUUID()}`,
      BACKEND_GOOGLE_CLIENT_SECRET: 'synthetic-secret',
      BACKEND_GOOGLE_REDIRECT_URI: 'https://example.test/callback',
      BACKEND_REDIS_URL: redisUrl,
    });

    const limiter = new GoogleCalendarRequestLimiter(config);
    const google = new GoogleCalendarService(config, limiter);
    const sync = new CalendarSyncService(
      repository,
      google,
      {} as QueueService,
      new ConfigService({}),
    );

    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => {
        await prisma.$executeRaw`UPDATE calendar_sync_operation SET "claimedUntil" = clock_timestamp() + INTERVAL '10 seconds' WHERE id = ${fixture.operationId}`;

        return new Response(JSON.stringify(fixture.remote()), { status: 200 });
      });

    try {
      await sync.processOperation(fixture.operationId);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(
        await prisma.calendarSyncOperation.findUnique({
          where: { id: fixture.operationId },
        }),
      ).toMatchObject({
        state: 'pending',
        attempts: 0,
        retryBudgetAttempts: 0,
        firstAttemptAt: null,
        claimToken: null,
        claimedUntil: null,
        lastErrorCode: null,
      });
      expect(
        await prisma.calendarEvent.findUnique({
          where: { id: fixture.eventId },
        }),
      ).toMatchObject({
        title: 'Completion event',
        syncState: 'pending',
        lastSyncedAt: null,
      });
    } finally {
      fetchSpy.mockRestore();
      limiter.onModuleDestroy();
    }
  });

  async function pendingInboundEdit(local: Prisma.CalendarEventUpdateInput) {
    const { userId, bindingId } = await createBinding();
    const providerId = `inbound-groups-${randomUUID()}`;
    const baseline = inboundEvent(providerId, 'Grouped event');
    await commitInboundPage(bindingId, [baseline]);
    const link = await prisma.calendarEventLink.findUniqueOrThrow({
      where: {
        bindingId_googleEventId: { bindingId, googleEventId: providerId },
      },
    });

    if (!link.calendarEventId)
      throw new Error('The inbound fixture has no local event.');
    await prisma.calendarEvent.update({
      where: { id: link.calendarEventId },
      data: { ...local, revision: 2, syncState: 'pending' },
    });
    const eventRow = await prisma.calendarEvent.findUniqueOrThrow({
      where: { id: link.calendarEventId },
    });

    const operation = await prisma.calendarSyncOperation.create({
      data: {
        bindingId,
        calendarEventId: eventRow.id,
        operationKey: `inbound-local-${randomUUID()}`,
        kind: eventRow.status === 'cancelled' ? 'delete' : 'update',
        nextAttemptAt: new Date(0),
        connectionGeneration: 1,
        eventRevision: 2,
        baseSnapshot: baseline.commonSnapshot,
        payload: {
          ...baseline.commonSnapshot,
          title: eventRow.title,
          startAt: eventRow.startAt?.toISOString(),
          endAt: eventRow.endAt?.toISOString(),
          timezone: eventRow.timezone,
          allDayStartDate: eventRow.allDayStartDate?.toISOString() ?? null,
          allDayEndDate: eventRow.allDayEndDate?.toISOString() ?? null,
          status: eventRow.status,
          recurrence: eventRow.recurrence,
          attendees: eventRow.attendees,
        },
      },
    });

    return {
      userId,
      bindingId,
      providerId,
      baseline,
      eventId: eventRow.id,
      linkId: link.id,
      operationId: operation.id,
    };
  }

  function changedInbound(
    base: ReturnType<typeof inboundEvent>,
    fields: Partial<
      Extract<
        NonNullable<CalendarInboundEventInput['event']>,
        { startAt: Date }
      >
    >,
    snapshot: Prisma.InputJsonObject,
  ) {
    const { startAt, endAt, timezone } = base.event;
    if (!startAt || !endAt || !timezone)
      throw new Error('The changed inbound fixture requires a timed baseline.');

    return {
      ...base,
      etag: 'changed-inbound-etag',
      event: {
        ...base.event,
        ...fields,
        allDayStartDate: undefined,
        allDayEndDate: undefined,
        startAt: fields.startAt ?? startAt,
        endAt: fields.endAt ?? endAt,
        timezone: fields.timezone ?? timezone,
      },
      commonSnapshot: { ...base.commonSnapshot, ...snapshot },
      rawSnapshot: { ...(base.rawSnapshot as object), ...snapshot },
    };
  }

  async function largeMissingImport() {
    const fixture = await createBinding();
    const baseline = inboundEvent('baseline', 'Missing imported event');
    const ids = Array.from(
      { length: 101 },
      (_, index) => `missing-${randomUUID()}-${index}`,
    );

    await prisma.calendarEvent.createMany({
      data: ids.map((id) => ({
        id,
        userId: fixture.userId,
        provider: 'google',
        providerEventId: id,
        title: 'Missing imported event',
        startAt: new Date('2026-10-11T09:00:00Z'),
        endAt: new Date('2026-10-11T10:00:00Z'),
        timezone: 'UTC',
        syncState: 'synced',
      })),
    });
    await prisma.calendarEventLink.createMany({
      data: ids.map((id) => ({
        bindingId: fixture.bindingId,
        googleEventId: id,
        calendarEventId: id,
        commonSnapshot: baseline.commonSnapshot,
        syncedRevision: 1,
        lastSeenFullImportGeneration: 0,
      })),
    });

    return fixture;
  }

  test('full import finalization commits one bounded batch and a replacement worker resumes its stored cursor', async () => {
    const fixture = await largeMissingImport();
    expect(
      await commitInboundPage(fixture.bindingId, [], 1, 'final-import-token'),
    ).toBe('continue');
    expect(
      await prisma.calendarEvent.count({
        where: { userId: fixture.userId, status: 'cancelled' },
      }),
    ).toBe(100);
    expect(
      await prisma.calendarBinding.findUnique({
        where: { id: fixture.bindingId },
      }),
    ).toMatchObject({
      syncToken: null,
      pendingFullImportSyncToken: 'final-import-token',
      fullImportFinalizationCursor: expect.any(String),
      lastSyncedAt: null,
    });

    await prisma.calendarBinding.update({
      where: { id: fixture.bindingId },
      data: { dirtyRevision: 2 },
    });
    expect(
      await commitInboundPage(
        fixture.bindingId,
        [],
        1,
        'unused-replayed-token',
      ),
    ).toBe(true);
    expect(
      await prisma.calendarEvent.count({
        where: { userId: fixture.userId, status: 'cancelled' },
      }),
    ).toBe(101);
    expect(
      await prisma.calendarBinding.findUnique({
        where: { id: fixture.bindingId },
      }),
    ).toMatchObject({
      syncToken: 'final-import-token',
      pendingFullImportSyncToken: null,
      fullImportFinalizationCursor: null,
      lastSyncedAt: expect.any(Date),
      syncedRevision: 1,
      dirtyRevision: 2,
    });
  });

  test('full import finalization rolls back event changes and its cursor when a batch commit fails', async () => {
    const fixture = await largeMissingImport();
    expect(
      await commitInboundPage(fixture.bindingId, [], 1, 'durable-final-token'),
    ).toBe('continue');
    const checkpoint = await prisma.calendarBinding.findUniqueOrThrow({
      where: { id: fixture.bindingId },
    });

    await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_finalization_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD."pendingFullImportSyncToken" IS NOT NULL AND NEW."leaseOwner" IS NULL THEN
          RAISE EXCEPTION 'synthetic finalization commit failure';
        END IF;
        RETURN NEW;
      END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_finalization_commit BEFORE UPDATE ON calendar_binding
      FOR EACH ROW EXECUTE FUNCTION fail_finalization_commit()`);

    try {
      await expect(commitInboundPage(fixture.bindingId, [])).rejects.toThrow(
        'synthetic finalization commit failure',
      );
      expect(
        await prisma.calendarEvent.count({
          where: { userId: fixture.userId, status: 'cancelled' },
        }),
      ).toBe(100);
      expect(
        await prisma.calendarBinding.findUnique({
          where: { id: fixture.bindingId },
        }),
      ).toMatchObject({
        pendingFullImportSyncToken: 'durable-final-token',
        fullImportFinalizationCursor: checkpoint.fullImportFinalizationCursor,
        syncToken: null,
      });
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER fail_finalization_commit ON calendar_binding',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION fail_finalization_commit()',
      );
    }
  });

  test('full import finalization includes missing links with no previous import generation', async () => {
    const fixture = await pendingInboundEdit({ title: 'Unsynced local edit' });
    await prisma.calendarEventLink.update({
      where: { id: fixture.linkId },
      data: { lastSeenFullImportGeneration: null },
    });
    expect(await repository.requestFullResync(fixture.userId)).toMatchObject({
      status: 'queued',
    });

    expect(await commitInboundPage(fixture.bindingId, [])).toBe(true);

    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      title: 'Unsynced local edit',
      syncState: 'conflict',
      syncErrorCode: 'remote_deleted',
    });
  });

  test('full resync confirms a pending cancellation when the provider event is absent', async () => {
    const fixture = await pendingInboundEdit({ status: 'cancelled' });
    expect(await repository.requestFullResync(fixture.userId)).toMatchObject({
      status: 'queued',
    });

    await commitInboundPage(fixture.bindingId, []);

    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({ status: 'cancelled', syncState: 'synced', revision: 2 });
    expect(
      await prisma.calendarEventLink.findUnique({
        where: { id: fixture.linkId },
      }),
    ).toMatchObject({ tombstoneAt: expect.any(Date), syncedRevision: 2 });
    expect(
      await prisma.calendarSyncConflict.count({
        where: { eventLinkId: fixture.linkId },
      }),
    ).toBe(0);
  });

  test('full resync refreshes an existing comparison when a conflicted event disappears', async () => {
    const fixture = await pendingInboundEdit({ title: 'Local title' });
    await commitInboundPage(fixture.bindingId, [
      changedInbound(
        fixture.baseline,
        { title: 'Google title' },
        { title: 'Google title' },
      ),
    ]);
    const conflict = await prisma.calendarSyncConflict.findFirstOrThrow({
      where: { eventLinkId: fixture.linkId },
    });

    expect(await repository.requestFullResync(fixture.userId)).toMatchObject({
      status: 'queued',
    });
    await commitInboundPage(fixture.bindingId, []);

    expect(
      await prisma.calendarSyncConflict.count({
        where: { eventLinkId: fixture.linkId, state: 'open' },
      }),
    ).toBe(1);
    expect(
      await prisma.calendarSyncConflict.findUnique({
        where: { id: conflict.id },
      }),
    ).toMatchObject({
      conflictingFields: ['status'],
      remoteSnapshot: expect.objectContaining({
        resource: expect.objectContaining({ status: 'cancelled' }),
      }),
    });
    expect(
      await prisma.calendarEventLink.findUnique({
        where: { id: fixture.linkId },
      }),
    ).toMatchObject({ etag: null });
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      title: 'Local title',
      status: 'confirmed',
      syncState: 'conflict',
      revision: 2,
    });
  });

  test('full resync preserves an existing conflict even when its local revision equals the baseline', async () => {
    const fixture = await pendingInboundEdit({ title: 'Local title' });
    await commitInboundPage(fixture.bindingId, [
      changedInbound(
        fixture.baseline,
        { title: 'Google title' },
        { title: 'Google title' },
      ),
    ]);
    await prisma.calendarEventLink.update({
      where: { id: fixture.linkId },
      data: { syncedRevision: 2 },
    });
    expect(await repository.requestFullResync(fixture.userId)).toMatchObject({
      status: 'queued',
    });

    await commitInboundPage(fixture.bindingId, []);

    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      title: 'Local title',
      status: 'confirmed',
      syncState: 'conflict',
      revision: 2,
    });
  });

  test('inbound start and end edits conflict as one time group without creating a hybrid interval', async () => {
    const fixture = await pendingInboundEdit({
      startAt: new Date('2026-10-11T09:30:00Z'),
    });

    const remote = changedInbound(
      fixture.baseline,
      { endAt: new Date('2026-10-11T11:00:00Z') },
      { endAt: '2026-10-11T11:00:00.000Z' },
    );

    await commitInboundPage(fixture.bindingId, [remote]);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      startAt: new Date('2026-10-11T09:30:00Z'),
      endAt: new Date('2026-10-11T10:00:00Z'),
      syncState: 'conflict',
    });
    expect(
      await prisma.calendarSyncConflict.findFirst({
        where: { eventLinkId: fixture.linkId },
      }),
    ).toMatchObject({
      conflictingFields: ['time'],
      remoteSnapshot: expect.objectContaining({
        common: expect.objectContaining({
          startAt: '2026-10-11T09:00:00.000Z',
          endAt: '2026-10-11T11:00:00.000Z',
        }),
      }),
    });
    expect(
      await prisma.calendarSyncOperation.findUnique({
        where: { id: fixture.operationId },
      }),
    ).toMatchObject({ state: 'conflict' });
  });

  test('inbound recurrence changes conflict with a pending local time edit', async () => {
    const fixture = await pendingInboundEdit({
      startAt: new Date('2026-10-11T09:30:00Z'),
    });

    await commitInboundPage(fixture.bindingId, [
      changedInbound(
        fixture.baseline,
        { recurrence: ['RRULE:FREQ=WEEKLY'] },
        { recurrence: ['RRULE:FREQ=WEEKLY'] },
      ),
    ]);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({ recurrence: [], syncState: 'conflict' });
    expect(
      await prisma.calendarSyncConflict.findFirst({
        where: { eventLinkId: fixture.linkId },
      }),
    ).toMatchObject({ conflictingFields: ['time'] });
  });

  test('refreshing an inbound conflict preserves its coupled time comparison', async () => {
    const fixture = await pendingInboundEdit({
      startAt: new Date('2026-10-11T09:30:00Z'),
    });

    await commitInboundPage(fixture.bindingId, [
      changedInbound(
        fixture.baseline,
        { endAt: new Date('2026-10-11T11:00:00Z') },
        { endAt: '2026-10-11T11:00:00.000Z' },
      ),
    ]);
    const originalConflict = await prisma.calendarSyncConflict.findFirstOrThrow(
      {
        where: { eventLinkId: fixture.linkId },
      },
    );

    await commitInboundPage(fixture.bindingId, [
      changedInbound(
        fixture.baseline,
        { endAt: new Date('2026-10-11T12:00:00Z') },
        { endAt: '2026-10-11T12:00:00.000Z' },
      ),
    ]);
    expect(
      await prisma.calendarSyncConflict.findUnique({
        where: { id: originalConflict.id },
      }),
    ).toMatchObject({
      conflictingFields: ['time'],
      remoteSnapshot: expect.objectContaining({
        common: expect.objectContaining({
          endAt: '2026-10-11T12:00:00.000Z',
        }),
      }),
    });
    expect(
      await prisma.calendarSyncConflict.count({
        where: { eventLinkId: fixture.linkId },
      }),
    ).toBe(1);
  });

  test('inbound same-value time edits converge without another operation', async () => {
    const fixture = await pendingInboundEdit({
      startAt: new Date('2026-10-11T09:30:00Z'),
    });

    await commitInboundPage(fixture.bindingId, [
      changedInbound(
        fixture.baseline,
        { startAt: new Date('2026-10-11T09:30:00Z') },
        { startAt: '2026-10-11T09:30:00.000Z' },
      ),
    ]);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      startAt: new Date('2026-10-11T09:30:00Z'),
      syncState: 'synced',
    });
    expect(
      await prisma.calendarSyncConflict.count({
        where: { eventLinkId: fixture.linkId },
      }),
    ).toBe(0);
    expect(
      await prisma.calendarSyncOperation.count({
        where: { calendarEventId: fixture.eventId },
      }),
    ).toBe(1);
  });

  test('inbound independent title changes preserve the entire pending local time group', async () => {
    const fixture = await pendingInboundEdit({
      startAt: new Date('2026-10-11T09:30:00Z'),
    });

    await commitInboundPage(fixture.bindingId, [
      changedInbound(
        fixture.baseline,
        { title: 'Remote title' },
        { title: 'Remote title' },
      ),
    ]);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      title: 'Remote title',
      startAt: new Date('2026-10-11T09:30:00Z'),
      endAt: new Date('2026-10-11T10:00:00Z'),
      timezone: 'UTC',
      recurrence: [],
      syncState: 'pending',
    });
    expect(
      await prisma.calendarSyncConflict.count({
        where: { eventLinkId: fixture.linkId },
      }),
    ).toBe(0);
  });

  test('inbound timezone changes conflict with pending local date-range changes', async () => {
    const fixture = await pendingInboundEdit({
      startAt: new Date('2026-10-11T09:30:00Z'),
    });

    await commitInboundPage(fixture.bindingId, [
      changedInbound(
        fixture.baseline,
        { timezone: 'Asia/Makassar' },
        { timezone: 'Asia/Makassar' },
      ),
    ]);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({ timezone: 'UTC', syncState: 'conflict' });
    expect(
      await prisma.calendarSyncConflict.findFirst({
        where: { eventLinkId: fixture.linkId },
      }),
    ).toMatchObject({ conflictingFields: ['time'] });
  });

  test('inbound recurrence changes preserve a conflicting local all-day conversion', async () => {
    const fixture = await pendingInboundEdit({
      startAt: null,
      endAt: null,
      timezone: null,
      allDayStartDate: new Date('2026-10-11T00:00:00Z'),
      allDayEndDate: new Date('2026-10-13T00:00:00Z'),
    });

    await commitInboundPage(fixture.bindingId, [
      changedInbound(
        fixture.baseline,
        { recurrence: ['RRULE:FREQ=WEEKLY'] },
        { recurrence: ['RRULE:FREQ=WEEKLY'] },
      ),
    ]);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      startAt: null,
      endAt: null,
      allDayStartDate: new Date('2026-10-11T00:00:00Z'),
      allDayEndDate: new Date('2026-10-13T00:00:00Z'),
      recurrence: [],
      syncState: 'conflict',
    });
    expect(
      await prisma.calendarSyncConflict.findFirst({
        where: { eventLinkId: fixture.linkId },
      }),
    ).toMatchObject({ conflictingFields: ['time'] });
  });

  test('inbound attendee ordering confirms the same membership without a conflict or extra operation', async () => {
    const fixture = await pendingInboundEdit({
      attendees: ['a@example.test', 'b@example.test'],
    });

    await commitInboundPage(fixture.bindingId, [
      changedInbound(
        fixture.baseline,
        { attendees: ['b@example.test', 'a@example.test'] },
        { attendees: ['b@example.test', 'a@example.test'] },
      ),
    ]);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      attendees: ['a@example.test', 'b@example.test'],
      syncState: 'synced',
    });
    expect(
      await prisma.calendarSyncConflict.count({
        where: { eventLinkId: fixture.linkId },
      }),
    ).toBe(0);
    expect(
      await prisma.calendarSyncOperation.count({
        where: { calendarEventId: fixture.eventId },
      }),
    ).toBe(1);
  });

  test('inbound recurrence ordering confirms the same rule set without a conflict', async () => {
    const fixture = await pendingInboundEdit({
      recurrence: ['RRULE:FREQ=WEEKLY', 'EXDATE:20261018T090000Z'],
    });

    await commitInboundPage(fixture.bindingId, [
      changedInbound(
        fixture.baseline,
        { recurrence: ['EXDATE:20261018T090000Z', 'RRULE:FREQ=WEEKLY'] },
        { recurrence: ['EXDATE:20261018T090000Z', 'RRULE:FREQ=WEEKLY'] },
      ),
    ]);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      recurrence: ['RRULE:FREQ=WEEKLY', 'EXDATE:20261018T090000Z'],
      syncState: 'synced',
    });
    expect(
      await prisma.calendarSyncConflict.count({
        where: { eventLinkId: fixture.linkId },
      }),
    ).toBe(0);
  });

  test('inbound empty optional fields do not create an echo operation beside a pending title edit', async () => {
    const fixture = await pendingInboundEdit({ title: 'Local title' });
    await commitInboundPage(fixture.bindingId, [
      changedInbound(
        fixture.baseline,
        { description: '', location: '' },
        { description: '', location: '' },
      ),
    ]);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      title: 'Local title',
      syncState: 'pending',
      revision: 2,
    });
    expect(
      await prisma.calendarSyncOperation.count({
        where: { calendarEventId: fixture.eventId },
      }),
    ).toBe(1);
  });

  test('a pending local deletion conflicts with a Google edit and preserves both versions', async () => {
    const fixture = await pendingInboundEdit({ status: 'cancelled' });
    await commitInboundPage(fixture.bindingId, [
      changedInbound(
        fixture.baseline,
        { title: 'Google edit before cancellation' },
        { title: 'Google edit before cancellation' },
      ),
    ]);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      title: 'Grouped event',
      status: 'cancelled',
      syncState: 'conflict',
    });
    expect(
      await prisma.calendarSyncConflict.findFirst({
        where: { eventLinkId: fixture.linkId },
      }),
    ).toMatchObject({
      conflictingFields: ['status'],
      remoteSnapshot: expect.objectContaining({
        common: expect.objectContaining({
          title: 'Google edit before cancellation',
          status: 'confirmed',
        }),
      }),
    });
    expect(
      await prisma.calendarSyncOperation.findUnique({
        where: { id: fixture.operationId },
      }),
    ).toMatchObject({ kind: 'delete', state: 'conflict' });
    expect(
      await prisma.calendarSyncOperation.count({
        where: { calendarEventId: fixture.eventId },
      }),
    ).toBe(1);
  });

  test('same-value cancellation converges and replay keeps the confirmed revision stable', async () => {
    const fixture = await pendingInboundEdit({ status: 'cancelled' });
    const cancelled = parseInboundEvent(
      { id: fixture.providerId, status: 'cancelled', etag: 'cancelled-etag' },
      'UTC',
    );

    await commitInboundPage(fixture.bindingId, [cancelled]);
    await commitInboundPage(fixture.bindingId, [cancelled]);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: fixture.eventId } }),
    ).toMatchObject({
      title: 'Grouped event',
      status: 'cancelled',
      syncState: 'synced',
      revision: 2,
    });
    expect(
      await prisma.calendarEventLink.findUnique({
        where: { id: fixture.linkId },
      }),
    ).toMatchObject({ tombstoneAt: expect.any(Date), syncedRevision: 2 });
    expect(
      await prisma.calendarSyncConflict.count({
        where: { eventLinkId: fixture.linkId },
      }),
    ).toBe(0);
    expect(
      await prisma.calendarSyncOperation.count({
        where: { calendarEventId: fixture.eventId },
      }),
    ).toBe(1);
  });

  async function retentionOperation(
    bindingId: string,
    state: string,
    updatedAt = new Date(0),
    calendarEventId: string | null = null,
  ) {
    return prisma.calendarSyncOperation.create({
      data: {
        bindingId,
        state,
        updatedAt,
        calendarEventId,
        operationKey: `retention-${randomUUID()}`,
        kind: 'create',
        connectionGeneration: 1,
        eventRevision: 1,
        payload: { title: 'Synthetic retention operation' },
      },
    });
  }

  async function expiredRetentionRecords(userId: string) {
    const oauth = await prisma.calendarOAuthRequest.create({
      data: {
        userId,
        sessionId: 'synthetic-session',
        stateHash: `state-${randomUUID()}`,
        browserNonceHash: 'synthetic-browser',
        idTokenNonceHash: 'synthetic-id-token',
        returnTo: '/settings/integrations',
        expiresAt: new Date(0),
      },
    });

    const receipt = await prisma.calendarMutationReceipt.create({
      data: {
        userId,
        requestKey: `request-${randomUUID()}`,
        requestFingerprint: 'synthetic-fingerprint',
        expiresAt: new Date(0),
      },
    });

    return { oauth, receipt };
  }

  async function retentionTombstone(
    bindingId: string,
    data: {
      calendarEventId?: string;
      recurringParentProviderEventId?: string;
      tombstoneAt?: Date;
    } = {},
  ) {
    return prisma.calendarEventLink.create({
      data: {
        bindingId,
        googleEventId: `tombstone-${randomUUID()}`,
        tombstoneAt: new Date(0),
        ...data,
      },
    });
  }

  test('tombstone retention removes expired ordinary links while preserving cancelled event snapshots', async () => {
    const { userId, bindingId } = await createBinding();
    const snapshot = await createLegacyCandidate(
      userId,
      'cancelled-event',
      'Cancelled snapshot',
    );

    await prisma.calendarEvent.update({
      where: { id: snapshot.id },
      data: { status: 'cancelled', syncState: 'synced' },
    });
    const linked = await retentionTombstone(bindingId, {
      calendarEventId: snapshot.id,
    });

    const minimal = await retentionTombstone(bindingId);
    const recent = await retentionTombstone(bindingId, {
      tombstoneAt: new Date('9999-01-01T00:00:00.000Z'),
    });

    expect(
      await repository.cleanupSyncRecords({
        completedOperationRetentionDays: 30,
        tombstoneRetentionDays: 90,
        batchSize: 100,
      }),
    ).toMatchObject({ ordinaryTombstones: 2 });
    expect(
      await prisma.calendarEventLink.findMany({
        where: { id: { in: [linked.id, minimal.id] } },
      }),
    ).toEqual([]);
    expect(
      await prisma.calendarEventLink.findUnique({ where: { id: recent.id } }),
    ).not.toBeNull();
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: snapshot.id } }),
    ).toMatchObject({ status: 'cancelled', title: 'Cancelled snapshot' });
  });

  test('tombstone retention keeps recurring cancellations and conflict history', async () => {
    const { bindingId } = await createBinding();
    const recurring = await retentionTombstone(bindingId, {
      recurringParentProviderEventId: 'series',
    });

    const conflicted = await retentionTombstone(bindingId);
    await prisma.calendarSyncConflict.create({
      data: {
        bindingId,
        eventLinkId: conflicted.id,
        localRevision: 1,
        state: 'resolved',
        resolvedAt: new Date(0),
      },
    });

    expect(
      await repository.cleanupSyncRecords({
        completedOperationRetentionDays: 30,
        tombstoneRetentionDays: 90,
        batchSize: 100,
      }),
    ).toMatchObject({ ordinaryTombstones: 0 });
    expect(
      await prisma.calendarEventLink.count({
        where: { id: { in: [recurring.id, conflicted.id] } },
      }),
    ).toBe(2);
    expect(
      await prisma.calendarSyncConflict.count({
        where: { eventLinkId: conflicted.id },
      }),
    ).toBe(1);
  });

  test.each(['pending', 'processing', 'paused', 'conflict', 'failed'])(
    'tombstone retention keeps links referenced by %s operations',
    async (state) => {
      const { userId, bindingId } = await createBinding();
      const snapshot = await createLegacyCandidate(
        userId,
        'unfinished-event',
        'Unfinished snapshot',
      );

      await prisma.calendarEvent.update({
        where: { id: snapshot.id },
        data: { status: 'cancelled', syncState: 'synced' },
      });
      const link = await retentionTombstone(bindingId, {
        calendarEventId: snapshot.id,
      });

      await retentionOperation(bindingId, state, new Date(0), snapshot.id);

      expect(
        await repository.cleanupSyncRecords({
          completedOperationRetentionDays: 30,
          tombstoneRetentionDays: 90,
          batchSize: 100,
        }),
      ).toMatchObject({ ordinaryTombstones: 0 });
      expect(
        await prisma.calendarEventLink.findUnique({ where: { id: link.id } }),
      ).not.toBeNull();
    },
  );

  test('tombstone retention protects stable remote identities even without a local event reference', async () => {
    const { bindingId } = await createBinding();
    const stable = await retentionTombstone(bindingId);
    const payload = await retentionTombstone(bindingId);
    const first = await retentionOperation(bindingId, 'pending');
    const second = await retentionOperation(bindingId, 'paused');
    await prisma.calendarSyncOperation.update({
      where: { id: first.id },
      data: { stableGoogleEventId: stable.googleEventId },
    });
    await prisma.calendarSyncOperation.update({
      where: { id: second.id },
      data: { payload: { providerEventId: payload.googleEventId } },
    });

    expect(
      await repository.cleanupSyncRecords({
        completedOperationRetentionDays: 30,
        tombstoneRetentionDays: 90,
        batchSize: 100,
      }),
    ).toMatchObject({ ordinaryTombstones: 0 });
    expect(await prisma.calendarEventLink.count({ where: { bindingId } })).toBe(
      2,
    );
  });

  test('tombstone retention resumes bounded batches without deleting recurring records', async () => {
    const { bindingId } = await createBinding();
    await retentionTombstone(bindingId, {
      recurringParentProviderEventId: 'series',
    });
    await retentionTombstone(bindingId);
    await retentionTombstone(bindingId);

    expect(
      await repository.cleanupSyncRecords({
        completedOperationRetentionDays: 30,
        tombstoneRetentionDays: 90,
        batchSize: 1,
      }),
    ).toMatchObject({ ordinaryTombstones: 1 });
    expect(
      await repository.cleanupSyncRecords({
        completedOperationRetentionDays: 30,
        tombstoneRetentionDays: 90,
        batchSize: 1,
      }),
    ).toMatchObject({ ordinaryTombstones: 1 });
    expect(await prisma.calendarEventLink.count({ where: { bindingId } })).toBe(
      1,
    );
  });

  async function withRetentionLock(
    table: 'user' | 'calendar_event_link',
    id: string,
    assertion: () => Promise<void>,
  ) {
    const second = createIndependentRepositoryClient(tokenCipher);
    let announceLock!: () => void;
    let releaseLock!: () => void;
    const locked = new Promise<void>((resolve) => {
      announceLock = resolve;
    });

    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const holding = second.client.$transaction(
      async (tx) => {
        const query =
          table === 'user'
            ? 'SELECT id FROM "user" WHERE id = $1 FOR UPDATE'
            : 'SELECT id FROM calendar_event_link WHERE id = $1 FOR UPDATE';

        await tx.$queryRawUnsafe(query, id);
        announceLock();
        await release;
      },
      { timeout: 10000 },
    );

    try {
      await Promise.race([locked, holding]);
      await assertion();
    } finally {
      releaseLock();

      try {
        await holding;
      } finally {
        await second.client.$disconnect();
      }
    }
  }

  test('tombstone retention skips owners actively saving changes and resumes after their transaction', async () => {
    const { userId, bindingId } = await createBinding();
    const link = await retentionTombstone(bindingId);
    await withRetentionLock('user', userId, async () => {
      expect(
        await repository.cleanupSyncRecords({
          completedOperationRetentionDays: 30,
          tombstoneRetentionDays: 90,
          batchSize: 100,
        }),
      ).toMatchObject({ ordinaryTombstones: 0 });
      expect(
        await prisma.calendarEventLink.findUnique({ where: { id: link.id } }),
      ).not.toBeNull();
    });
    expect(
      await repository.cleanupSyncRecords({
        completedOperationRetentionDays: 30,
        tombstoneRetentionDays: 90,
        batchSize: 100,
      }),
    ).toMatchObject({ ordinaryTombstones: 1 });
  });

  test('tombstone retention advances past a busy owner instead of starving other owners', async () => {
    const busy = await createBinding();
    const other = await createBinding();
    const oldest = await retentionTombstone(busy.bindingId);
    const eligible = await retentionTombstone(other.bindingId, {
      tombstoneAt: new Date('1970-01-02T00:00:00.000Z'),
    });

    await withRetentionLock('user', busy.userId, async () => {
      expect(
        await repository.cleanupSyncRecords({
          completedOperationRetentionDays: 30,
          tombstoneRetentionDays: 90,
          batchSize: 1,
        }),
      ).toMatchObject({ ordinaryTombstones: 1 });
      expect(
        await prisma.calendarEventLink.findUnique({
          where: { id: eligible.id },
        }),
      ).toBeNull();
      expect(
        await prisma.calendarEventLink.findUnique({ where: { id: oldest.id } }),
      ).not.toBeNull();
    });
  });

  test('tombstone retention skips locked provider links and resumes after inbound commit', async () => {
    const { bindingId } = await createBinding();
    const link = await retentionTombstone(bindingId);
    await withRetentionLock('calendar_event_link', link.id, async () => {
      expect(
        await repository.cleanupSyncRecords({
          completedOperationRetentionDays: 30,
          tombstoneRetentionDays: 90,
          batchSize: 100,
        }),
      ).toMatchObject({ ordinaryTombstones: 0 });
    });
    expect(
      await repository.cleanupSyncRecords({
        completedOperationRetentionDays: 30,
        tombstoneRetentionDays: 90,
        batchSize: 100,
      }),
    ).toMatchObject({ ordinaryTombstones: 1 });
  });

  test('tombstone retention keeps links referenced by unexpired retry receipts', async () => {
    const { userId, bindingId } = await createBinding();
    const snapshot = await createLegacyCandidate(
      userId,
      'retry-event',
      'Receipt protected snapshot',
    );

    await prisma.calendarEvent.update({
      where: { id: snapshot.id },
      data: { status: 'cancelled', syncState: 'synced' },
    });
    const link = await retentionTombstone(bindingId, {
      calendarEventId: snapshot.id,
    });

    const receipt = await prisma.calendarMutationReceipt.create({
      data: {
        userId,
        requestKey: 'retention-retry',
        requestFingerprint: 'synthetic',
        resultEventId: snapshot.id,
        expiresAt: new Date('9999-01-01T00:00:00.000Z'),
      },
    });

    expect(
      await repository.cleanupSyncRecords({
        completedOperationRetentionDays: 30,
        tombstoneRetentionDays: 90,
        batchSize: 100,
      }),
    ).toMatchObject({ ordinaryTombstones: 0 });
    expect(
      await prisma.calendarEventLink.findUnique({ where: { id: link.id } }),
    ).not.toBeNull();
    await prisma.calendarMutationReceipt.update({
      where: { id: receipt.id },
      data: { expiresAt: new Date(0) },
    });
    expect(
      await repository.cleanupSyncRecords({
        completedOperationRetentionDays: 30,
        tombstoneRetentionDays: 90,
        batchSize: 100,
      }),
    ).toMatchObject({ ordinaryTombstones: 1, expiredMutationReceipts: 1 });
  });

  test('tombstone retention keeps locally unsettled events even without an operation row', async () => {
    const { userId, bindingId } = await createBinding();
    const snapshot = await createLegacyCandidate(
      userId,
      'unsettled-event',
      'Unsettled snapshot',
    );

    await prisma.calendarEvent.update({
      where: { id: snapshot.id },
      data: { status: 'cancelled', syncState: 'pending' },
    });
    const link = await retentionTombstone(bindingId, {
      calendarEventId: snapshot.id,
    });

    expect(
      await repository.cleanupSyncRecords({
        completedOperationRetentionDays: 30,
        tombstoneRetentionDays: 90,
        batchSize: 100,
      }),
    ).toMatchObject({ ordinaryTombstones: 0 });
    expect(
      await prisma.calendarEventLink.findUnique({ where: { id: link.id } }),
    ).not.toBeNull();
  });

  test('tombstone retention scopes remote operation identities to their own calendar binding', async () => {
    const { bindingId } = await createBinding();
    const other = await createBinding();
    const link = await retentionTombstone(bindingId);
    const operation = await retentionOperation(other.bindingId, 'pending');
    await prisma.calendarSyncOperation.update({
      where: { id: operation.id },
      data: {
        stableGoogleEventId: link.googleEventId,
        payload: { providerEventId: link.googleEventId },
      },
    });

    expect(
      await repository.cleanupSyncRecords({
        completedOperationRetentionDays: 30,
        tombstoneRetentionDays: 90,
        batchSize: 100,
      }),
    ).toMatchObject({ ordinaryTombstones: 1 });
    expect(
      await prisma.calendarSyncOperation.findUnique({
        where: { id: operation.id },
      }),
    ).not.toBeNull();
  });

  test('tombstone retention keeps cancelled series identities', async () => {
    const { userId, bindingId } = await createBinding();
    const snapshot = await createLegacyCandidate(
      userId,
      'cancelled-series',
      'Cancelled series',
    );

    await prisma.calendarEvent.update({
      where: { id: snapshot.id },
      data: {
        status: 'cancelled',
        syncState: 'synced',
        recurrence: ['RRULE:FREQ=DAILY;COUNT=3'],
      },
    });
    const link = await retentionTombstone(bindingId, {
      calendarEventId: snapshot.id,
    });

    expect(
      await repository.cleanupSyncRecords({
        completedOperationRetentionDays: 30,
        tombstoneRetentionDays: 90,
        batchSize: 100,
      }),
    ).toMatchObject({ ordinaryTombstones: 0 });
    expect(
      await prisma.calendarEventLink.findUnique({ where: { id: link.id } }),
    ).not.toBeNull();
  });

  test('retention deletes only old completed operations and preserves unexpired receipt references', async () => {
    const { userId, bindingId } = await createBinding();
    const old = await retentionOperation(bindingId, 'completed');
    const fresh = await retentionOperation(
      bindingId,
      'completed',
      new Date('9999-01-01T00:00:00.000Z'),
    );

    const failed = await retentionOperation(bindingId, 'failed');
    const protectedEvent = await createLegacyCandidate(
      userId,
      'protected-event',
      'Protected event',
    );

    const protectedOperation = await retentionOperation(
      bindingId,
      'completed',
      new Date(0),
      protectedEvent.id,
    );

    await prisma.calendarMutationReceipt.create({
      data: {
        userId,
        requestKey: 'unexpired-request',
        requestFingerprint: 'synthetic-fingerprint',
        resultEventId: protectedEvent.id,
        expiresAt: new Date('9999-01-01T00:00:00.000Z'),
      },
    });

    const appClock = jest.spyOn(Date, 'now').mockReturnValue(0);

    try {
      expect(
        await repository.cleanupSyncRecords({
          completedOperationRetentionDays: 30,
          tombstoneRetentionDays: 90,
          batchSize: 100,
        }),
      ).toEqual({
        ordinaryTombstones: 0,
        completedOperations: 1,
        expiredOAuthRequests: 0,
        expiredMutationReceipts: 0,
      });
    } finally {
      appClock.mockRestore();
    }

    expect(
      await prisma.calendarSyncOperation.findUnique({ where: { id: old.id } }),
    ).toBeNull();
    expect(
      await prisma.calendarSyncOperation.findMany({
        where: { bindingId },
        select: { id: true },
      }),
    ).toEqual(
      expect.arrayContaining([
        { id: fresh.id },
        { id: failed.id },
        { id: protectedOperation.id },
      ]),
    );
  });

  test('retention removes at most one configured batch per table and resumes on the next sweep', async () => {
    const { userId, bindingId } = await createBinding();
    await retentionOperation(bindingId, 'completed');
    await retentionOperation(bindingId, 'completed');
    await expiredRetentionRecords(userId);
    await expiredRetentionRecords(userId);

    expect(
      await repository.cleanupSyncRecords({
        completedOperationRetentionDays: 30,
        tombstoneRetentionDays: 90,
        batchSize: 1,
      }),
    ).toEqual({
      ordinaryTombstones: 0,
      completedOperations: 1,
      expiredOAuthRequests: 1,
      expiredMutationReceipts: 1,
    });
    expect(
      await prisma.calendarSyncOperation.count({ where: { bindingId } }),
    ).toBe(1);
    expect(await prisma.calendarOAuthRequest.count({ where: { userId } })).toBe(
      1,
    );
    expect(
      await prisma.calendarMutationReceipt.count({ where: { userId } }),
    ).toBe(1);
    expect(
      await repository.cleanupSyncRecords({
        completedOperationRetentionDays: 30,
        tombstoneRetentionDays: 90,
        batchSize: 1,
      }),
    ).toEqual({
      ordinaryTombstones: 0,
      completedOperations: 1,
      expiredOAuthRequests: 1,
      expiredMutationReceipts: 1,
    });
  });

  test('concurrent retention sweeps remove disjoint batches across independent clients', async () => {
    const { bindingId } = await createBinding();
    await retentionOperation(bindingId, 'completed');
    await retentionOperation(bindingId, 'completed');
    const second = createIndependentRepositoryClient(tokenCipher);

    try {
      const results = await Promise.all([
        repository.cleanupSyncRecords({
          completedOperationRetentionDays: 30,
          tombstoneRetentionDays: 90,
          batchSize: 1,
        }),
        second.repository.cleanupSyncRecords({
          completedOperationRetentionDays: 30,
          tombstoneRetentionDays: 90,
          batchSize: 1,
        }),
      ]);

      expect(results).toEqual([
        {
          ordinaryTombstones: 0,
          completedOperations: 1,
          expiredOAuthRequests: 0,
          expiredMutationReceipts: 0,
        },
        {
          ordinaryTombstones: 0,
          completedOperations: 1,
          expiredOAuthRequests: 0,
          expiredMutationReceipts: 0,
        },
      ]);
      expect(
        await prisma.calendarSyncOperation.count({ where: { bindingId } }),
      ).toBe(0);
    } finally {
      await second.client.$disconnect();
    }
  });

  test('failed retention statement rolls back operation and OAuth deletions before a receipt error', async () => {
    const { userId, bindingId } = await createBinding();
    const tombstone = await retentionTombstone(bindingId);
    const operation = await retentionOperation(bindingId, 'completed');
    const { oauth, receipt } = await expiredRetentionRecords(userId);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION calendar_contract_retention_failure() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic retention receipt failure'; END; $$`);

    try {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER calendar_contract_retention_failure
        BEFORE DELETE ON calendar_mutation_receipt FOR EACH ROW EXECUTE FUNCTION calendar_contract_retention_failure()`);
      await expect(
        repository.cleanupSyncRecords({
          completedOperationRetentionDays: 30,
          tombstoneRetentionDays: 90,
          batchSize: 100,
        }),
      ).rejects.toThrow('synthetic retention receipt failure');
      expect(
        await prisma.calendarEventLink.findUnique({
          where: { id: tombstone.id },
        }),
      ).not.toBeNull();
      expect(
        await prisma.calendarSyncOperation.count({
          where: { id: operation.id },
        }),
      ).toBe(1);
      expect(
        await prisma.calendarOAuthRequest.count({ where: { id: oauth.id } }),
      ).toBe(1);
      expect(
        await prisma.calendarMutationReceipt.count({
          where: { id: receipt.id },
        }),
      ).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS calendar_contract_retention_failure ON calendar_mutation_receipt',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION calendar_contract_retention_failure()',
      );
    }
  });

  test('persists OAuth request expiry relative to PostgreSQL time', async () => {
    const { userId } = await createBinding();
    const timeRows = await prisma.$queryRaw<Array<{ now: Date }>>`
      SELECT clock_timestamp() AS "now"
    `;

    const databaseNow = timeRows[0]?.now;
    if (!(databaseNow instanceof Date))
      throw new Error('PostgreSQL clock query returned no timestamp.');

    const stateHash = `state-${randomUUID()}`;

    await repository.createOAuthRequest({
      userId,
      sessionId: `session-${randomUUID()}`,
      stateHash,
      browserNonceHash: `browser-${randomUUID()}`,
      idTokenNonceHash: `id-token-${randomUUID()}`,
      returnTo: 'https://app.sydia.test/settings?tab=integrations',
      expiresInMs: 600_000,
    });

    const request = await prisma.calendarOAuthRequest.findUniqueOrThrow({
      where: { stateHash },
      select: { expiresAt: true },
    });

    expect(request.expiresAt.getTime()).toBeGreaterThan(
      databaseNow.getTime() + 590_000,
    );
    expect(request.expiresAt.getTime()).toBeLessThanOrEqual(
      databaseNow.getTime() + 610_000,
    );
  });

  test('serializes concurrent workers and commits a claimed import page with its cursor', async () => {
    const { userId, bindingId } = await createBinding();
    const claims = await Promise.all([
      repository.claimBindingSync(bindingId, 1, 'worker-a', 30_000),
      repository.claimBindingSync(bindingId, 1, 'worker-b', 30_000),
    ]);

    const claim = claims.find((candidate) => candidate !== null);

    expect(claims.filter((candidate) => candidate !== null)).toHaveLength(1);
    expect(claim?.credentials).toMatchObject({
      accessToken: 'synthetic-access-token',
      refreshToken: 'synthetic-refresh-token',
      credentialGeneration: 1,
    });
    if (!claim) throw new Error('No worker acquired the database lease.');

    const committed = await repository.saveCalendarSyncPage({
      bindingId,
      connectionGeneration: 1,
      owner: claim.leaseOwner,
      leaseEpoch: claim.leaseEpoch,
      capturedDirtyRevision: claim.capturedDirtyRevision,
      fullImportGeneration: claim.fullImportGeneration,
      fullImport: true,
      nextPageToken: null,
      nextSyncToken: 'contract-sync-cursor',
      events: [inboundEvent('contract-google-event', 'Imported event')],
    });

    expect(committed).toBe(true);
    const persistedBinding = await prisma.calendarBinding.findUniqueOrThrow({
      where: { id: bindingId },
    });

    const persistedEvent = await prisma.calendarEvent.findFirst({
      where: { userId, providerEventId: 'contract-google-event' },
    });

    const persistedLink = await prisma.calendarEventLink.findUnique({
      where: {
        bindingId_googleEventId: {
          bindingId,
          googleEventId: 'contract-google-event',
        },
      },
    });

    expect(persistedBinding).toMatchObject({
      state: 'active',
      syncToken: 'contract-sync-cursor',
      nextPageToken: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    expect(persistedEvent).toMatchObject({
      userId,
      title: 'Imported event',
      syncState: 'synced',
    });
    expect(persistedLink).toMatchObject({
      googleEventId: 'contract-google-event',
      etag: 'etag-contract-google-event',
      syncedRevision: 1,
    });
  });

  test('links one exact legacy event match without replacing its Sydia ID', async () => {
    const { userId, bindingId } = await createBinding();
    const legacy = await createLegacyCandidate(
      userId,
      'legacy-exact-match',
      'Exact legacy event',
    );

    await expect(
      commitInboundPage(bindingId, [
        inboundEvent('legacy-exact-match', 'Exact legacy event'),
      ]),
    ).resolves.toBe(true);

    const event = await prisma.calendarEvent.findUniqueOrThrow({
      where: { id: legacy.id },
    });

    const link = await prisma.calendarEventLink.findUniqueOrThrow({
      where: {
        bindingId_googleEventId: {
          bindingId,
          googleEventId: 'legacy-exact-match',
        },
      },
    });

    expect(event).toMatchObject({
      id: legacy.id,
      syncState: 'synced',
      syncErrorCode: null,
    });
    expect(link).toMatchObject({
      calendarEventId: legacy.id,
      syncedRevision: event.revision,
    });
    await expect(
      prisma.calendarEvent.count({
        where: { userId, providerEventId: 'legacy-exact-match' },
      }),
    ).resolves.toBe(1);
  });

  test('preserves a changed legacy event and imports the Google version separately', async () => {
    const { userId, bindingId } = await createBinding();
    const legacy = await createLegacyCandidate(
      userId,
      'legacy-changed-match',
      'Old local title',
    );

    await expect(
      commitInboundPage(bindingId, [
        inboundEvent('legacy-changed-match', 'Updated Google title'),
      ]),
    ).resolves.toBe(true);

    const preservedLegacy = await prisma.calendarEvent.findUniqueOrThrow({
      where: { id: legacy.id },
    });

    const link = await prisma.calendarEventLink.findUniqueOrThrow({
      where: {
        bindingId_googleEventId: {
          bindingId,
          googleEventId: 'legacy-changed-match',
        },
      },
    });

    expect(preservedLegacy).toMatchObject({
      id: legacy.id,
      title: 'Old local title',
      syncState: 'reconnect_required',
      syncErrorCode: 'legacy_link_unverified',
    });
    expect(link.calendarEventId).not.toBe(legacy.id);
    await expect(
      prisma.calendarEvent.count({
        where: { userId, providerEventId: 'legacy-changed-match' },
      }),
    ).resolves.toBe(2);
  });

  test('leaves ambiguous legacy event candidates unlinked', async () => {
    const { userId, bindingId } = await createBinding();
    const firstLegacy = await createLegacyCandidate(
      userId,
      'legacy-ambiguous-match',
      'Same event',
    );

    const secondLegacy = await createLegacyCandidate(
      userId,
      'legacy-ambiguous-match',
      'Same event',
    );

    await expect(
      commitInboundPage(bindingId, [
        inboundEvent('legacy-ambiguous-match', 'Same event'),
      ]),
    ).resolves.toBe(true);

    const legacyRows = await prisma.calendarEvent.findMany({
      where: { id: { in: [firstLegacy.id, secondLegacy.id] } },
    });

    const link = await prisma.calendarEventLink.findUniqueOrThrow({
      where: {
        bindingId_googleEventId: {
          bindingId,
          googleEventId: 'legacy-ambiguous-match',
        },
      },
    });

    expect(legacyRows).toHaveLength(2);
    expect(legacyRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstLegacy.id,
          syncState: 'reconnect_required',
          syncErrorCode: 'legacy_link_unverified',
        }),
        expect.objectContaining({
          id: secondLegacy.id,
          syncState: 'reconnect_required',
          syncErrorCode: 'legacy_link_unverified',
        }),
      ]),
    );
    expect([firstLegacy.id, secondLegacy.id]).not.toContain(
      link.calendarEventId,
    );
  });

  test('rolls back every event in a page when a later event is malformed', async () => {
    const { userId, bindingId } = await createBinding();
    const claim = await repository.claimBindingSync(
      bindingId,
      1,
      'worker-atomic-page',
      30_000,
    );

    if (!claim) throw new Error('The import worker did not acquire its lease.');

    await expect(
      repository.saveCalendarSyncPage({
        bindingId,
        connectionGeneration: 1,
        owner: claim.leaseOwner,
        leaseEpoch: claim.leaseEpoch,
        capturedDirtyRevision: claim.capturedDirtyRevision,
        fullImportGeneration: claim.fullImportGeneration,
        fullImport: true,
        nextPageToken: null,
        nextSyncToken: 'must-not-commit',
        events: [
          inboundEvent('valid-before-invalid', 'Should roll back'),
          {
            ...inboundEvent('active-without-data', 'Unused'),
            event: null,
          },
        ],
      }),
    ).rejects.toThrow(
      'Google Calendar returned an active event without event data.',
    );

    await expect(
      prisma.calendarEvent.count({ where: { userId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.calendarEventLink.count({ where: { bindingId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.calendarBinding.findUniqueOrThrow({ where: { id: bindingId } }),
    ).resolves.toMatchObject({ syncToken: null, nextPageToken: null });
  });

  test('lets a replacement worker take an expired lease and fences the crashed worker page', async () => {
    const { bindingId } = await createBinding();
    const crashedWorker = await repository.claimBindingSync(
      bindingId,
      1,
      'worker-crashed',
      30_000,
    );

    if (!crashedWorker)
      throw new Error('The first worker did not acquire its lease.');

    await prisma.calendarBinding.update({
      where: { id: bindingId },
      data: { leaseExpiresAt: new Date(0) },
    });
    const replacementWorker = await repository.claimBindingSync(
      bindingId,
      1,
      'worker-replacement',
      30_000,
    );

    if (!replacementWorker)
      throw new Error('The replacement worker did not recover the lease.');
    expect(replacementWorker.leaseEpoch).toBeGreaterThan(
      crashedWorker.leaseEpoch,
    );

    await expect(
      repository.saveCalendarSyncPage({
        bindingId,
        connectionGeneration: 1,
        owner: crashedWorker.leaseOwner,
        leaseEpoch: crashedWorker.leaseEpoch,
        capturedDirtyRevision: crashedWorker.capturedDirtyRevision,
        fullImportGeneration: crashedWorker.fullImportGeneration,
        fullImport: true,
        nextPageToken: null,
        nextSyncToken: 'stale-worker-cursor',
        events: [inboundEvent('stale-worker-event', 'Must not commit')],
      }),
    ).resolves.toBe(false);

    await expect(
      prisma.calendarEvent.count({
        where: { providerEventId: 'stale-worker-event' },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.calendarBinding.findUniqueOrThrow({ where: { id: bindingId } }),
    ).resolves.toMatchObject({
      syncToken: null,
      leaseOwner: 'worker-replacement',
    });
  });

  test('accepts a registering notification once and rejects invalid or stale receipts', async () => {
    const { bindingId } = await createBinding();
    await prisma.calendarBinding.update({
      where: { id: bindingId },
      data: { state: 'active' },
    });

    const channelId = `calendar-watch-${randomUUID()}`;
    const channelToken = `calendar-watch-token-${randomUUID()}`;
    const tokenHash = createHash('sha256').update(channelToken).digest('hex');
    const created = await repository.createWatchChannel({
      bindingId,
      connectionGeneration: 1,
      channelId,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    expect(created).toBe(true);

    const initial = await repository.markWatchDirtyNotification({
      channelId,
      tokenHash,
      resourceId: 'contract-resource',
      messageNumber: '1',
    });

    expect(initial).toEqual({
      accepted: true,
      bindingId,
      connectionGeneration: 1,
    });
    await expect(
      prisma.calendarWatchChannel.findUniqueOrThrow({
        where: { channelId },
      }),
    ).resolves.toMatchObject({
      state: 'registering',
      resourceId: 'contract-resource',
      lastMessageNumber: 1n,
    });

    await expect(
      repository.activateWatchChannel({
        bindingId,
        channelId,
        connectionGeneration: 1,
        resourceId: 'contract-resource',
        resourceUri: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    ).resolves.toBe(true);

    const duplicateReceipts = await Promise.all([
      repository.markWatchDirtyNotification({
        channelId,
        tokenHash,
        resourceId: 'contract-resource',
        messageNumber: '2',
      }),
      repository.markWatchDirtyNotification({
        channelId,
        tokenHash,
        resourceId: 'contract-resource',
        messageNumber: '2',
      }),
    ]);

    expect(
      duplicateReceipts.filter((receipt) => receipt.accepted),
    ).toHaveLength(1);
    expect(
      duplicateReceipts.filter((receipt) => !receipt.accepted),
    ).toHaveLength(1);

    const rejectedReceipts = await Promise.all([
      repository.markWatchDirtyNotification({
        channelId,
        tokenHash: createHash('sha256').update('wrong-token').digest('hex'),
        resourceId: 'contract-resource',
        messageNumber: '3',
      }),
      repository.markWatchDirtyNotification({
        channelId,
        tokenHash,
        resourceId: 'wrong-resource',
        messageNumber: '3',
      }),
      repository.markWatchDirtyNotification({
        channelId,
        tokenHash,
        resourceId: 'contract-resource',
        messageNumber: '1',
      }),
      repository.markWatchDirtyNotification({
        channelId,
        tokenHash,
        resourceId: 'contract-resource',
        messageNumber: 'not-a-number',
      }),
    ]);

    expect(rejectedReceipts.every((receipt) => !receipt.accepted)).toBe(true);

    await expect(
      prisma.calendarWatchChannel.findUniqueOrThrow({
        where: { channelId },
      }),
    ).resolves.toMatchObject({
      state: 'active',
      lastMessageNumber: 2n,
    });
    await expect(
      prisma.calendarBinding.findUniqueOrThrow({ where: { id: bindingId } }),
    ).resolves.toMatchObject({ dirtyRevision: 3 });

    await repository.markWatchChannelStopped(channelId);
    await expect(
      repository.markWatchDirtyNotification({
        channelId,
        tokenHash,
        resourceId: 'contract-resource',
        messageNumber: '3',
      }),
    ).resolves.toEqual({ accepted: false });
  });

  test('allows a notification racing watch activation across independent database clients', async () => {
    const { bindingId } = await createBinding();
    await prisma.calendarBinding.update({
      where: { id: bindingId },
      data: { state: 'active' },
    });

    const channelId = `calendar-watch-activation-race-${randomUUID()}`;
    const channelToken = `calendar-watch-token-${randomUUID()}`;
    const tokenHash = createHash('sha256').update(channelToken).digest('hex');
    await expect(
      repository.createWatchChannel({
        bindingId,
        connectionGeneration: 1,
        channelId,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    ).resolves.toBe(true);

    const other = createIndependentRepositoryClient(tokenCipher);

    try {
      await other.client.$connect();
      const [notification, activated] = await Promise.all([
        repository.markWatchDirtyNotification({
          channelId,
          tokenHash,
          resourceId: 'activation-race-resource',
          messageNumber: '1',
        }),
        other.repository.activateWatchChannel({
          bindingId,
          channelId,
          connectionGeneration: 1,
          resourceId: 'activation-race-resource',
          resourceUri: null,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }),
      ]);

      expect(notification).toEqual({
        accepted: true,
        bindingId,
        connectionGeneration: 1,
      });
      expect(activated).toBe(true);
      await expect(
        prisma.calendarWatchChannel.findUniqueOrThrow({
          where: { channelId },
        }),
      ).resolves.toMatchObject({
        state: 'active',
        resourceId: 'activation-race-resource',
        lastMessageNumber: 1n,
      });
      await expect(
        prisma.calendarBinding.findUniqueOrThrow({ where: { id: bindingId } }),
      ).resolves.toMatchObject({ dirtyRevision: 2 });
    } finally {
      await other.client.$disconnect();
    }
  });

  test('does not acknowledge a receipt when the dirty revision transaction fails', async () => {
    const { bindingId } = await createBinding();
    await prisma.calendarBinding.update({
      where: { id: bindingId },
      data: { state: 'active' },
    });

    const channelId = `calendar-watch-${randomUUID()}`;
    const channelToken = `calendar-watch-token-${randomUUID()}`;
    const tokenHash = createHash('sha256').update(channelToken).digest('hex');
    await expect(
      repository.createWatchChannel({
        bindingId,
        connectionGeneration: 1,
        channelId,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    ).resolves.toBe(true);
    await expect(
      repository.activateWatchChannel({
        bindingId,
        channelId,
        connectionGeneration: 1,
        resourceId: 'failure-contract-resource',
        resourceUri: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    ).resolves.toBe(true);

    try {
      await prisma.$executeRaw`
        CREATE FUNCTION calendar_contract_reject_dirty_revision()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $function$
        BEGIN
          IF NEW."dirtyRevision" > OLD."dirtyRevision" THEN
            RAISE EXCEPTION 'calendar contract dirty revision failure';
          END IF;
          RETURN NEW;
        END;
        $function$
      `;
      await prisma.$executeRaw`
        CREATE TRIGGER calendar_contract_reject_dirty_revision
        BEFORE UPDATE ON "calendar_binding"
        FOR EACH ROW
        EXECUTE FUNCTION calendar_contract_reject_dirty_revision()
      `;

      await expect(
        repository.markWatchDirtyNotification({
          channelId,
          tokenHash,
          resourceId: 'failure-contract-resource',
          messageNumber: '1',
        }),
      ).rejects.toThrow('calendar contract dirty revision failure');
      await expect(
        prisma.calendarWatchChannel.findUniqueOrThrow({
          where: { channelId },
        }),
      ).resolves.toMatchObject({
        state: 'active',
        lastMessageNumber: null,
      });
      await expect(
        prisma.calendarBinding.findUniqueOrThrow({ where: { id: bindingId } }),
      ).resolves.toMatchObject({ dirtyRevision: 1 });
    } finally {
      await prisma.$executeRaw`
        DROP TRIGGER IF EXISTS calendar_contract_reject_dirty_revision
        ON "calendar_binding"
      `;
      await prisma.$executeRaw`
        DROP FUNCTION IF EXISTS calendar_contract_reject_dirty_revision()
      `;
    }
  });

  test('rejects a prior connection generation and schedules a replacement watch', async () => {
    const { bindingId } = await createBinding();
    await prisma.calendarBinding.update({
      where: { id: bindingId },
      data: { state: 'active' },
    });
    const binding = await prisma.calendarBinding.findUniqueOrThrow({
      where: { id: bindingId },
      select: { integrationId: true },
    });

    const channelId = `calendar-watch-${randomUUID()}`;
    const channelToken = `calendar-watch-token-${randomUUID()}`;
    const tokenHash = createHash('sha256').update(channelToken).digest('hex');
    await expect(
      repository.createWatchChannel({
        bindingId,
        connectionGeneration: 1,
        channelId,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    ).resolves.toBe(true);
    await expect(
      repository.activateWatchChannel({
        bindingId,
        channelId,
        connectionGeneration: 1,
        resourceId: 'old-generation-resource',
        resourceUri: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    ).resolves.toBe(true);

    await prisma.calendarIntegration.update({
      where: { id: binding.integrationId },
      data: { connectionGeneration: 2 },
    });

    await expect(
      repository.markWatchDirtyNotification({
        channelId,
        tokenHash,
        resourceId: 'old-generation-resource',
        messageNumber: '1',
      }),
    ).resolves.toEqual({ accepted: false });
    await expect(repository.dueWatchBindingIds(100)).resolves.toContainEqual({
      id: bindingId,
      connectionGeneration: 2,
    });

    const registeringChannelId = `calendar-watch-${randomUUID()}`;
    const registeringTokenHash = createHash('sha256')
      .update(`calendar-watch-token-${randomUUID()}`)
      .digest('hex');

    await expect(
      repository.createWatchChannel({
        bindingId,
        connectionGeneration: 2,
        channelId: registeringChannelId,
        tokenHash: registeringTokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    ).resolves.toBe(true);
    await prisma.calendarIntegration.update({
      where: { id: binding.integrationId },
      data: { connectionGeneration: 3 },
    });

    await expect(
      repository.activateWatchChannel({
        bindingId,
        channelId: registeringChannelId,
        connectionGeneration: 2,
        resourceId: 'superseded-generation-resource',
        resourceUri: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    ).resolves.toBe(false);
    await expect(
      repository.markWatchDirtyNotification({
        channelId: registeringChannelId,
        tokenHash: registeringTokenHash,
        resourceId: 'superseded-generation-resource',
        messageNumber: '1',
      }),
    ).resolves.toEqual({ accepted: false });
    await expect(repository.dueWatchBindingIds(100)).resolves.toContainEqual({
      id: bindingId,
      connectionGeneration: 3,
    });
  });

  test('serializes watch registration and disconnect across independent database clients', async () => {
    const { userId, bindingId } = await createBinding();
    await prisma.calendarBinding.update({
      where: { id: bindingId },
      data: { state: 'active' },
    });

    const other = createIndependentRepositoryClient(tokenCipher);
    const channelId = `calendar-watch-race-${randomUUID()}`;

    try {
      await other.client.$connect();
      const [created, preparation] = await Promise.all([
        repository.createWatchChannel({
          bindingId,
          connectionGeneration: 1,
          channelId,
          tokenHash: createHash('sha256')
            .update(`calendar-watch-token-${randomUUID()}`)
            .digest('hex'),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }),
        other.repository.beginDisconnect(userId),
      ]);

      const wasIncludedInDisconnectPreparation = preparation.channels.some(
        (channel) => channel.channelId === channelId,
      );

      const persistedChannel = await prisma.calendarWatchChannel.findUnique({
        where: { channelId },
      });

      expect(preparation.connectionStatus).toBe('disconnecting');
      expect(created).toBe(wasIncludedInDisconnectPreparation);
      expect(persistedChannel !== null).toBe(created);
      await expect(
        prisma.calendarIntegration.findUniqueOrThrow({
          where: { userId_provider: { userId, provider: 'google' } },
        }),
      ).resolves.toMatchObject({
        status: 'disconnecting',
        connectionGeneration: 2,
      });
    } finally {
      await other.client.$disconnect();
    }
  });

  test('recovers a persisted webhook pull after queue dispatch fails across clients', async () => {
    const { bindingId } = await createBinding();
    await prisma.calendarBinding.update({
      where: { id: bindingId },
      data: { state: 'active' },
    });

    const channelId = `calendar-watch-recovery-${randomUUID()}`;
    const channelToken = `calendar-watch-token-${randomUUID()}`;
    const tokenHash = createHash('sha256').update(channelToken).digest('hex');
    await expect(
      repository.createWatchChannel({
        bindingId,
        connectionGeneration: 1,
        channelId,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    ).resolves.toBe(true);

    const other = createIndependentRepositoryClient(tokenCipher);
    const google = {
      available: () => true,
    } as unknown as GoogleCalendarService;

    const failedDispatch = jest
      .fn<(name: string, data: CalendarSyncJob) => Promise<unknown>>()
      .mockRejectedValue(new Error('synthetic Redis dispatch interruption'));

    const unavailableQueue = {
      calendarSync: { add: failedDispatch },
    } as unknown as QueueService;

    try {
      await other.client.$connect();
      const webhookSync = new CalendarSyncService(
        repository,
        google,
        unavailableQueue,
        new ConfigService({}),
      );

      await webhookSync.webhook({
        channelId,
        channelToken,
        resourceId: 'calendar-watch-recovery-resource',
        messageNumber: '1',
      });

      await expect(
        prisma.calendarBinding.findUniqueOrThrow({ where: { id: bindingId } }),
      ).resolves.toMatchObject({ dirtyRevision: 2 });
      expect(failedDispatch).toHaveBeenCalledWith(
        'calendar-watch-notification',
        { kind: 'pull', bindingId, connectionGeneration: 1 },
      );

      const recoveredDispatch = jest
        .fn<(name: string, data: CalendarSyncJob) => Promise<unknown>>()
        .mockResolvedValue(undefined);

      const recoveryQueue = {
        calendarSync: { add: recoveredDispatch },
      } as unknown as QueueService;

      const recoverySync = new CalendarSyncService(
        other.repository,
        google,
        recoveryQueue,
        new ConfigService({}),
      );

      await recoverySync.recover();

      expect(recoveredDispatch).toHaveBeenCalledWith('calendar-pull-recovery', {
        kind: 'pull',
        bindingId,
        connectionGeneration: 1,
      });
    } finally {
      await other.client.$disconnect();
    }
  });

  test('keeps failed remote watch cleanup visible until the channel is stopped', async () => {
    const { userId, bindingId } = await createBinding();
    const channelId = `calendar-cleanup-${randomUUID()}`;

    await prisma.calendarWatchChannel.create({
      data: {
        bindingId,
        connectionGeneration: 1,
        channelId,
        tokenHash: createHash('sha256')
          .update(`cleanup-token-${randomUUID()}`)
          .digest('hex'),
        resourceId: `cleanup-resource-${randomUUID()}`,
        state: 'active',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await repository.markWatchCleanupPending(channelId);

    await expect(
      repository.operationalMetricsSnapshot(),
    ).resolves.toMatchObject({ pendingWatchCleanupCount: 1 });
    await repository.disconnect(userId);
    await expect(
      repository.operationalMetricsSnapshot(),
    ).resolves.toMatchObject({
      activeBindingCount: 0,
      pendingWatchCleanupCount: 1,
    });

    await repository.markWatchChannelStopped(channelId);

    await expect(
      repository.operationalMetricsSnapshot(),
    ).resolves.toMatchObject({ pendingWatchCleanupCount: 0 });
  });

  test('fences sync before revocation and keeps disconnect preparation retryable', async () => {
    const { userId, bindingId } = await createBinding();
    await prisma.calendarBinding.update({
      where: { id: bindingId },
      data: { state: 'active' },
    });
    const integration = await prisma.calendarIntegration.findUniqueOrThrow({
      where: { userId_provider: { userId, provider: 'google' } },
      select: { id: true },
    });

    const channelId = `calendar-disconnect-${randomUUID()}`;
    await prisma.calendarWatchChannel.create({
      data: {
        bindingId,
        connectionGeneration: 1,
        channelId,
        tokenHash: createHash('sha256')
          .update(`disconnect-token-${randomUUID()}`)
          .digest('hex'),
        resourceId: `disconnect-resource-${randomUUID()}`,
        state: 'active',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const operation = await prisma.calendarSyncOperation.create({
      data: {
        bindingId,
        operationKey: `calendar-disconnect-${randomUUID()}`,
        kind: 'update',
        connectionGeneration: 1,
        eventRevision: 1,
        payload: {},
      },
    });

    const stateHash = createHash('sha256')
      .update(`oauth-state-${randomUUID()}`)
      .digest('hex');

    await repository.createOAuthRequest({
      userId,
      sessionId: `session-${randomUUID()}`,
      stateHash,
      browserNonceHash: createHash('sha256')
        .update(`oauth-browser-${randomUUID()}`)
        .digest('hex'),
      idTokenNonceHash: createHash('sha256')
        .update(`oauth-id-${randomUUID()}`)
        .digest('hex'),
      returnTo: 'https://app.sydia.test/settings',
      expiresInMs: 10 * 60_000,
    });

    const preparation = await repository.beginDisconnect(userId);

    expect(preparation).toEqual({
      connectionStatus: 'disconnecting',
      channels: [
        {
          channelId,
          resourceId: expect.stringContaining('disconnect-resource-'),
        },
      ],
    });
    await expect(
      prisma.calendarIntegration.findUniqueOrThrow({
        where: { id: integration.id },
      }),
    ).resolves.toMatchObject({
      status: 'disconnecting',
      connectionGeneration: 2,
      activeBindingId: bindingId,
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    await expect(
      prisma.calendarBinding.findUniqueOrThrow({ where: { id: bindingId } }),
    ).resolves.toMatchObject({ state: 'disconnected', leaseEpoch: 1 });
    await expect(
      prisma.calendarSyncOperation.findUniqueOrThrow({
        where: { id: operation.id },
      }),
    ).resolves.toMatchObject({ state: 'paused' });
    await expect(
      prisma.calendarWatchChannel.findUniqueOrThrow({
        where: { channelId },
      }),
    ).resolves.toMatchObject({ state: 'cleanup_pending' });
    await expect(
      prisma.calendarOAuthRequest.findUniqueOrThrow({ where: { stateHash } }),
    ).resolves.toMatchObject({ consumedAt: expect.any(Date) });

    await expect(repository.beginDisconnect(userId)).resolves.toEqual(
      preparation,
    );
    await expect(
      prisma.calendarBinding.findUniqueOrThrow({ where: { id: bindingId } }),
    ).resolves.toMatchObject({ leaseEpoch: 1 });
    await expect(
      repository.createWatchChannel({
        bindingId,
        connectionGeneration: 1,
        channelId: `calendar-late-disconnect-${randomUUID()}`,
        tokenHash: createHash('sha256')
          .update(`late-disconnect-token-${randomUUID()}`)
          .digest('hex'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    ).resolves.toBe(false);

    await repository.disconnect(userId);
    await expect(
      prisma.calendarIntegration.findUniqueOrThrow({
        where: { id: integration.id },
      }),
    ).resolves.toMatchObject({
      status: 'disconnected',
      connectionGeneration: 2,
      activeBindingId: null,
      accessToken: null,
      refreshToken: null,
    });
  });

  test('reports how long an active binding has waited for its first successful pull', async () => {
    const { bindingId } = await createBinding();

    await prisma.$executeRaw`
      UPDATE "calendar_binding"
      SET "createdAt" = clock_timestamp() - INTERVAL '2 hours'
      WHERE "id" = ${bindingId}
    `;

    const neverSynced = await repository.operationalMetricsSnapshot();

    expect(neverSynced.neverSyncedBindingCount).toBe(1);
    expect(neverSynced.oldestNeverSyncedBindingAgeMs).toBeGreaterThanOrEqual(
      7_200_000,
    );

    await prisma.calendarBinding.update({
      where: { id: bindingId },
      data: { state: 'active', lastSyncedAt: new Date() },
    });

    const imported = await repository.operationalMetricsSnapshot();

    expect(imported.neverSyncedBindingCount).toBe(0);
    expect(imported.oldestNeverSyncedBindingAgeMs).toBe(0);
  });

  const queueRecoveryContract = async () => {
    if (!databaseUrl || !redisUrl)
      throw new Error('Both isolated contract stores are required.');

    const { userId } = await createBinding();
    const input = {
      title: 'Queue recovery contract event',
      startAt: new Date('2026-10-11T12:00:00.000Z'),
      endAt: new Date('2026-10-11T13:00:00.000Z'),
      timezone: 'UTC',
    };

    const unavailableQueue = {
      calendarSync: {
        add: () =>
          Promise.reject(new Error('synthetic Redis dispatch interruption')),
      },
    } as unknown as QueueService;

    const calendar = new CalendarService(repository, unavailableQueue);
    const savedEvent = await calendar.create(
      userId,
      input,
      'google',
      'queue-recovery-contract-create',
    );

    const persistedOperation =
      await prisma.calendarSyncOperation.findFirstOrThrow({
        where: { calendarEventId: savedEvent.id },
      });

    expect(savedEvent.syncState).toBe('pending');
    expect(persistedOperation.state).toBe('pending');
    expect(
      await prisma.calendarEvent.count({
        where: { id: savedEvent.id, userId },
      }),
    ).toBe(1);

    const queueConfig = new ConfigService({
      BACKEND_REDIS_URL: redisUrl,
    });

    const queues = new QueueService(queueConfig);
    let worker: Worker<CalendarSyncJob> | null = null;
    let queueEvents: QueueEvents | null = null;
    const remoteEvents = new Map<string, GoogleEventResource>();
    let providerCreateAttempts = 0;

    const createEvent = (
      ...args: Parameters<GoogleCalendarService['createEvent']>
    ): Promise<GoogleEventResource> => {
      const [, , eventId, operationId] = args;
      providerCreateAttempts += 1;
      const existing = remoteEvents.get(eventId);
      if (existing) throw new GoogleCalendarApiError(409, 'duplicate', null);

      const created: GoogleEventResource = {
        id: eventId,
        etag: `etag-${operationId}`,
        extendedProperties: {
          private: { sydiaOperationId: operationId },
        },
      };

      remoteEvents.set(eventId, created);

      return Promise.resolve(created);
    };

    const getEvent = (
      ...args: Parameters<GoogleCalendarService['getEvent']>
    ): Promise<GoogleEventResource> => {
      const [, , eventId] = args;
      const found = remoteEvents.get(eventId);
      if (!found) throw new Error('Synthetic remote event was not found.');

      return Promise.resolve(found);
    };

    const google = {
      available: () => true,
      createEvent,
      getEvent,
    } as unknown as GoogleCalendarService;

    const sync = new CalendarSyncService(
      repository,
      google,
      queues,
      new ConfigService({}),
    );

    const completeOperation = jest
      .spyOn(repository, 'completeOperation')
      .mockRejectedValueOnce(
        new Error('synthetic database failure after provider success'),
      );

    try {
      await queues.calendarSync.waitUntilReady();
      queueEvents = new QueueEvents('calendar-sync', {
        connection: { url: redisUrl },
      });
      await queueEvents.waitUntilReady();

      await sync.recoverOperations();
      const firstRecoveryJob = (
        await queues.calendarSync.getJobs(['waiting'])
      ).find(
        (job) =>
          job.data.kind === 'operation' &&
          job.data.operationId === persistedOperation.id,
      );

      if (!firstRecoveryJob)
        throw new Error(
          'Outbox recovery did not enqueue the pending operation.',
        );

      const firstAttempt = firstRecoveryJob.waitUntilFinished(
        queueEvents,
        10_000,
      );

      worker = new Worker<CalendarSyncJob>(
        'calendar-sync',
        async (job) => sync.process(job.data),
        { connection: { url: redisUrl }, concurrency: 1 },
      );
      await worker.waitUntilReady();
      await expect(firstAttempt).rejects.toThrow(
        'synthetic database failure after provider success',
      );

      const operationAfterCrash =
        await prisma.calendarSyncOperation.findUniqueOrThrow({
          where: { id: persistedOperation.id },
        });

      expect(operationAfterCrash.state).toBe('processing');
      expect(remoteEvents.size).toBe(1);
      expect(providerCreateAttempts).toBe(1);

      await worker.close();
      worker = null;
      await prisma.calendarSyncOperation.update({
        where: { id: persistedOperation.id },
        data: { claimedUntil: new Date(0) },
      });

      await sync.recoverOperations();
      const replacementJob = (
        await queues.calendarSync.getJobs(['waiting'])
      ).find(
        (job) =>
          job.data.kind === 'operation' &&
          job.data.operationId === persistedOperation.id,
      );

      if (!replacementJob)
        throw new Error(
          'Recovery did not redispatch the expired operation claim.',
        );

      const recoveredAttempt = replacementJob.waitUntilFinished(
        queueEvents,
        10_000,
      );

      worker = new Worker<CalendarSyncJob>(
        'calendar-sync',
        async (job) => sync.process(job.data),
        { connection: { url: redisUrl }, concurrency: 1 },
      );
      await worker.waitUntilReady();
      await recoveredAttempt;

      const completedOperation =
        await prisma.calendarSyncOperation.findUniqueOrThrow({
          where: { id: persistedOperation.id },
        });

      const completedEvent = await prisma.calendarEvent.findUniqueOrThrow({
        where: { id: savedEvent.id },
      });

      const link = await prisma.calendarEventLink.findFirstOrThrow({
        where: { calendarEventId: savedEvent.id },
      });

      expect(providerCreateAttempts).toBe(2);
      expect(remoteEvents.size).toBe(1);
      expect(completeOperation).toHaveBeenCalledTimes(2);
      expect(completedOperation).toMatchObject({
        state: 'completed',
        claimToken: null,
        claimedUntil: null,
      });
      expect(completedEvent).toMatchObject({
        syncState: 'synced',
        providerEventId: completedOperation.stableGoogleEventId,
      });
      expect(link).toMatchObject({
        googleEventId: completedOperation.stableGoogleEventId,
        etag: `etag-${completedOperation.id}`,
      });
    } finally {
      completeOperation.mockRestore();
      await Promise.all([
        ...(worker ? [worker.close()] : []),
        ...(queueEvents ? [queueEvents.close()] : []),
      ]);
      const jobs = await queues.calendarSync.getJobs([
        'waiting',
        'active',
        'delayed',
        'completed',
        'failed',
      ]);

      await Promise.all(
        jobs
          .filter(
            (job) =>
              job.data.kind === 'operation' &&
              job.data.operationId === persistedOperation.id,
          )
          .map((job) => job.remove()),
      );
      await queues.onModuleDestroy();
    }
  };

  if (databaseUrl && redisUrl)
    test(
      'recovers a durable create after dispatch and post-provider commit failures',
      queueRecoveryContract,
      30_000,
    );
  else
    test.skip(
      'recovers a durable create after dispatch and post-provider commit failures',
      queueRecoveryContract,
      30_000,
    );
});
