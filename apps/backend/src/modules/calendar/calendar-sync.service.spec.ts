import { createHash } from 'node:crypto';
import { describe, expect, jest, test } from '@jest/globals';
import { HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CalendarBindingSyncClaim,
  CalendarSyncOperationClaim,
  ICalendarRepository,
} from '../../database/interfaces';
import {
  GoogleCalendarApiError,
  type GoogleCalendarService,
  type GoogleEventPage,
} from '../../infra/calendar';
import type { QueueService } from '../../infra/queue';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { calendarSyncMetrics } from '../../infra/calendar/calendar-sync.metrics';
import { CalendarSyncService } from './calendar-sync.service.js';

type FullResyncResult = Awaited<
  ReturnType<ICalendarRepository['requestFullResync']>
>;

function outboundOperationHarness(kind: 'create' | 'update' = 'create') {
  const payload = {
    title: 'Dentist appointment',
    description: null,
    location: 'Clinic',
    startAt: '2026-10-11T09:00:00.000Z',
    endAt: '2026-10-11T10:00:00.000Z',
    timezone: 'Asia/Makassar',
    attendees: [],
    recurrence: [],
  };

  const claim: CalendarSyncOperationClaim = {
    claimedAt: new Date('2026-10-10T12:00:00.000Z'),
    operation: {
      id: 'operation-1',
      kind,
      attempts: 1,
      retryBudgetAttempts: 1,
      firstAttemptAt: null,
      connectionGeneration: 3,
      eventRevision: 1,
      payload,
      baseSnapshot:
        kind === 'update' ? { ...payload, title: 'Original title' } : null,
      stableGoogleEventId: 'stable-google-event-id',
      claimToken: 'claim-token-1',
      claimEpoch: 8,
    },
    binding: {
      id: 'binding-1',
      userId: 'user-1',
      googleSubject: 'google-subject-1',
      calendarId: 'calendar-1',
      timezone: 'Asia/Makassar',
    },
    credentials: {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessTokenExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
      credentialGeneration: 2,
    },
    eventLink:
      kind === 'update'
        ? {
            id: 'link-1',
            googleEventId: 'stable-google-event-id',
            etag: 'etag-0',
            remoteSnapshot: {},
            commonSnapshot: { ...payload, title: 'Original title' },
          }
        : null,
  };

  const resource = {
    id: 'stable-google-event-id',
    etag: 'etag-1',
    summary: 'Dentist appointment',
    location: 'Clinic',
    status: 'confirmed',
    start: { dateTime: payload.startAt, timeZone: payload.timezone },
    end: { dateTime: payload.endAt, timeZone: payload.timezone },
  };

  const claimOperation = jest
    .fn<ICalendarRepository['claimOperation']>()
    .mockResolvedValue(claim);

  const completeOperation = jest
    .fn<ICalendarRepository['completeOperation']>()
    .mockResolvedValue(true);

  const failOperation = jest
    .fn<ICalendarRepository['failOperation']>()
    .mockResolvedValue(true);

  const createEvent = jest
    .fn<GoogleCalendarService['createEvent']>()
    .mockResolvedValue(resource);

  const getEvent = jest
    .fn<GoogleCalendarService['getEvent']>()
    .mockResolvedValue({
      ...resource,
      summary: 'Original title',
      etag: 'etag-0',
    });

  const updateEvent = jest
    .fn<GoogleCalendarService['updateEvent']>()
    .mockResolvedValue(resource);

  const calendars = { claimOperation, completeOperation, failOperation };
  const google = {
    available: jest.fn<() => boolean>().mockReturnValue(true),
    createEvent,
    getEvent,
    updateEvent,
  };

  const queues = { calendarSync: { add: jest.fn() } };
  const service = new CalendarSyncService(
    calendars as unknown as ICalendarRepository,
    google as unknown as GoogleCalendarService,
    queues as unknown as QueueService,
    { get: () => undefined } as unknown as ConfigService,
  );

  return {
    service,
    claim,
    payload,
    resource,
    getEvent,
    updateEvent,
    claimOperation,
    completeOperation,
    failOperation,
    createEvent,
  };
}

function inboundPullHarness(input?: {
  syncToken?: string | null;
  nextPageToken?: string | null;
  dirtyRevision?: number;
  capturedDirtyRevision?: number;
  page?: GoogleEventPage;
  listError?: unknown;
}) {
  const claim: CalendarBindingSyncClaim = {
    id: 'binding-1',
    userId: 'user-1',
    integrationId: 'integration-1',
    googleSubject: 'google-subject-1',
    calendarId: 'calendar-1',
    timezone: 'Asia/Makassar',
    state: 'active',
    syncToken: input?.syncToken ?? null,
    nextPageToken: input?.nextPageToken ?? null,
    dirtyRevision: input?.dirtyRevision ?? 4,
    capturedDirtyRevision: input?.capturedDirtyRevision ?? 4,
    fullImportGeneration: 2,
    leaseOwner: 'binding-owner-1',
    leaseEpoch: 11,
    connectionGeneration: 3,
    credentials: {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessTokenExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
      credentialGeneration: 2,
    },
  };

  const page: GoogleEventPage = input?.page ?? {
    items: [],
    nextPageToken: null,
    nextSyncToken: 'sync-token-2',
  };

  const claimBindingSync = jest
    .fn<ICalendarRepository['claimBindingSync']>()
    .mockResolvedValue(claim);

  const saveCalendarSyncPage = jest
    .fn<ICalendarRepository['saveCalendarSyncPage']>()
    .mockResolvedValue(true);

  const resetExpiredSyncToken = jest
    .fn<ICalendarRepository['resetExpiredSyncToken']>()
    .mockResolvedValue(true);

  const failBindingSync = jest
    .fn<ICalendarRepository['failBindingSync']>()
    .mockResolvedValue(true);

  const listEvents = jest
    .fn<GoogleCalendarService['listEvents']>()
    .mockResolvedValue(page);

  if (input?.listError !== undefined)
    listEvents.mockRejectedValue(input.listError);

  const add = jest
    .fn<(...args: unknown[]) => Promise<void>>()
    .mockResolvedValue();

  const calendars = {
    claimBindingSync,
    saveCalendarSyncPage,
    resetExpiredSyncToken,
    failBindingSync,
  };

  const google = {
    available: jest.fn<() => boolean>().mockReturnValue(true),
    listEvents,
  };

  const service = new CalendarSyncService(
    calendars as unknown as ICalendarRepository,
    google as unknown as GoogleCalendarService,
    { calendarSync: { add } } as unknown as QueueService,
    { get: () => undefined } as unknown as ConfigService,
  );

  return {
    service,
    claim,
    claimBindingSync,
    saveCalendarSyncPage,
    resetExpiredSyncToken,
    failBindingSync,
    listEvents,
    add,
  };
}

function watchRenewalHarness(input?: {
  watchError?: unknown;
  activation?: boolean;
  stopError?: unknown;
}) {
  const claim: CalendarBindingSyncClaim = {
    id: 'binding-1',
    userId: 'user-1',
    integrationId: 'integration-1',
    googleSubject: 'google-subject-1',
    calendarId: 'calendar-1',
    timezone: 'UTC',
    state: 'active',
    lastSyncedAt: null,
    syncToken: 'sync-token-1',
    nextPageToken: null,
    dirtyRevision: 3,
    capturedDirtyRevision: 3,
    fullImportGeneration: 1,
    leaseOwner: 'watch-owner-1',
    leaseEpoch: 4,
    connectionGeneration: 3,
    credentials: {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessTokenExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
      credentialGeneration: 2,
    },
  };

  const claimBindingSync = jest
    .fn<ICalendarRepository['claimBindingSync']>()
    .mockResolvedValue(claim);

  const createWatchChannel = jest
    .fn<ICalendarRepository['createWatchChannel']>()
    .mockResolvedValue(true);

  const activateWatchChannel = jest
    .fn<ICalendarRepository['activateWatchChannel']>()
    .mockResolvedValue(input?.activation ?? false);

  const failWatchChannel = jest
    .fn<ICalendarRepository['failWatchChannel']>()
    .mockResolvedValue();

  const markWatchCleanupPending = jest
    .fn<ICalendarRepository['markWatchCleanupPending']>()
    .mockResolvedValue();

  const markWatchChannelStopped = jest
    .fn<ICalendarRepository['markWatchChannelStopped']>()
    .mockResolvedValue();

  const activeWatchChannels = jest
    .fn<ICalendarRepository['activeWatchChannels']>()
    .mockResolvedValue([]);

  const failBindingSync = jest
    .fn<ICalendarRepository['failBindingSync']>()
    .mockResolvedValue(true);

  const releaseBindingSyncLease = jest
    .fn<ICalendarRepository['releaseBindingSyncLease']>()
    .mockResolvedValue(true);

  const watchEvents = jest
    .fn<GoogleCalendarService['watchEvents']>()
    .mockResolvedValue({
      resourceId: 'google-resource-1',
      resourceUri: null,
      expiration: new Date('2026-10-17T12:00:00.000Z'),
    });

  const stopWatch = jest
    .fn<GoogleCalendarService['stopWatch']>()
    .mockResolvedValue();

  if (input?.watchError !== undefined)
    watchEvents.mockRejectedValue(input.watchError);
  if (input?.stopError !== undefined)
    stopWatch.mockRejectedValue(input.stopError);

  const calendars = {
    claimBindingSync,
    createWatchChannel,
    activateWatchChannel,
    failWatchChannel,
    markWatchCleanupPending,
    markWatchChannelStopped,
    activeWatchChannels,
    failBindingSync,
    releaseBindingSyncLease,
    operationalMetricsSnapshot: () =>
      Promise.resolve({
        pendingOperationCount: 0,
        processingOperationCount: 0,
        oldestOperationAgeMs: 0,
        activeBindingCount: 0,
        neverSyncedBindingCount: 0,
        oldestNeverSyncedBindingAgeMs: 0,
        oldestPullAgeMs: 0,
        expiringWatchCount: 0,
        pendingWatchCleanupCount: 0,
        oldestWatchCleanupAgeMs: 0,
      }),
  };

  const google = {
    available: jest.fn<() => boolean>().mockReturnValue(true),
    watchEvents,
    stopWatch,
  };

  const service = new CalendarSyncService(
    calendars as unknown as ICalendarRepository,
    google as unknown as GoogleCalendarService,
    {
      calendarSync: {
        add: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    } as unknown as QueueService,
    {
      get: (key: string) =>
        key === 'BACKEND_GOOGLE_WEBHOOK_URL'
          ? 'https://calendar.example.test/webhook'
          : undefined,
    } as unknown as ConfigService,
  );

  return {
    service,
    calendars,
    google,
    watchEvents,
    stopWatch,
  };
}

function disabledCalendarSyncHarness() {
  const calendars = {
    claimOperation: jest.fn(),
    cleanupSyncRecords: jest.fn(),
    dueOperationIds: jest.fn(),
    dueBindingIds: jest.fn(),
    dueWatchBindingIds: jest.fn(),
    markWatchDirtyNotification: jest.fn(),
    requestFullResync: jest.fn(),
    status: jest.fn(),
    integrationCredentials: jest.fn(),
  };

  const calendarQueue = { add: jest.fn() };
  const google = {
    available: jest.fn<() => boolean>().mockReturnValue(false),
  };

  const config = { get: () => undefined };
  const service = new CalendarSyncService(
    calendars as unknown as ICalendarRepository,
    google as unknown as GoogleCalendarService,
    { calendarSync: calendarQueue } as unknown as QueueService,
    config as unknown as ConfigService,
  );

  return { service, calendars, calendarQueue, google };
}

describe('CalendarSyncService when Google sync is disabled', () => {
  test('stops jobs, recovery, webhook receipt, and token access before database or queue work', async () => {
    const { service, calendars, calendarQueue } = disabledCalendarSyncHarness();

    await service.process({ kind: 'operation', operationId: 'operation-1' });
    await service.process({
      kind: 'pull',
      bindingId: 'binding-1',
      connectionGeneration: 3,
    });
    await service.process({
      kind: 'renew-watch',
      bindingId: 'binding-1',
      connectionGeneration: 3,
    });
    await service.process({ kind: 'recover' });
    await service.recover();
    await service.webhook({
      channelId: 'channel-1',
      channelToken: 'secret-token',
      resourceId: 'resource-1',
      messageNumber: '1',
    });

    await expect(service.accessTokenForUser('user-1')).resolves.toBeNull();
    expect(calendars.claimOperation).not.toHaveBeenCalled();
    expect(calendars.cleanupSyncRecords).not.toHaveBeenCalled();
    expect(calendars.dueOperationIds).not.toHaveBeenCalled();
    expect(calendars.dueBindingIds).not.toHaveBeenCalled();
    expect(calendars.dueWatchBindingIds).not.toHaveBeenCalled();
    expect(calendars.markWatchDirtyNotification).not.toHaveBeenCalled();
    expect(calendars.status).not.toHaveBeenCalled();
    expect(calendars.integrationCredentials).not.toHaveBeenCalled();
    expect(calendarQueue.add).not.toHaveBeenCalled();
  });

  test('rejects an operator full resync before persisting work', async () => {
    const { service, calendars, calendarQueue } = disabledCalendarSyncHarness();

    const error = await service.requestFullResync('user-1').then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiException);
    if (!(error instanceof ApiException))
      throw new Error('Expected disabled Google sync to reject the request.');
    expect(error.code).toBe(ErrorCodes.SERVICE_UNAVAILABLE);
    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);

    expect(calendars.requestFullResync).not.toHaveBeenCalled();
    expect(calendarQueue.add).not.toHaveBeenCalled();
  });
});

describe('CalendarSyncService outbound operations', () => {
  test('writes one stable Google event and records the provider result', async () => {
    const {
      service,
      payload,
      resource,
      claimOperation,
      completeOperation,
      failOperation,
      createEvent,
    } = outboundOperationHarness();

    await service.process({ kind: 'operation', operationId: 'operation-1' });

    expect(claimOperation).toHaveBeenCalledWith(
      'operation-1',
      expect.any(String),
      90_000,
    );
    expect(createEvent).toHaveBeenCalledWith(
      'access-token',
      'calendar-1',
      'stable-google-event-id',
      'operation-1',
      expect.objectContaining({
        title: payload.title,
        startAt: new Date(payload.startAt),
        endAt: new Date(payload.endAt),
        timezone: payload.timezone,
      }),
      {
        googleSubject: 'google-subject-1',
        calendarId: 'calendar-1',
        lane: 'outbound',
        beforeRequest: expect.any(Function),
      },
    );
    expect(completeOperation).toHaveBeenCalledWith({
      operationId: 'operation-1',
      claimToken: 'claim-token-1',
      claimEpoch: 8,
      remoteEventId: resource.id,
      remoteEtag: resource.etag,
      remoteSnapshot: resource,
    });
    expect(failOperation).not.toHaveBeenCalled();
  });

  test('updates send only the remaining local field delta with the current ETag and operation marker', async () => {
    const { service, updateEvent } = outboundOperationHarness('update');
    await service.processOperation('operation-1');
    expect(updateEvent).toHaveBeenCalledWith(
      'access-token',
      'calendar-1',
      'stable-google-event-id',
      'operation-1',
      { title: 'Dentist appointment' },
      'etag-0',
      expect.objectContaining({ lane: 'outbound' }),
    );
  });

  test('an already accepted update completes without replaying attendee notifications', async () => {
    const {
      service,
      getEvent,
      resource,
      updateEvent,
      completeOperation,
      failOperation,
    } = outboundOperationHarness('update');

    getEvent.mockResolvedValue({
      ...resource,
      extendedProperties: { private: { sydiaOperationId: 'operation-1' } },
    });
    await service.processOperation('operation-1');
    expect(updateEvent).not.toHaveBeenCalled();
    expect(failOperation).not.toHaveBeenCalled();
    expect(completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciledEvent: expect.objectContaining({
          commonSnapshot: expect.objectContaining({
            title: 'Dentist appointment',
          }),
        }),
      }),
    );
  });

  test('updates merge an independent remote location without sending that field back', async () => {
    const { service, getEvent, resource, updateEvent, completeOperation } =
      outboundOperationHarness('update');

    getEvent.mockResolvedValue({
      ...resource,
      summary: 'Original title',
      location: 'Google location',
      etag: 'google-etag',
    });
    updateEvent.mockResolvedValue({ ...resource, location: 'Google location' });
    await service.processOperation('operation-1');
    expect(updateEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'operation-1',
      { title: 'Dentist appointment' },
      'google-etag',
      expect.any(Object),
    );
    expect(completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciledEvent: expect.objectContaining({
          commonSnapshot: expect.objectContaining({
            location: 'Google location',
          }),
        }),
      }),
    );
  });

  test('a later provider title edit conflicts even when the old operation marker remains', async () => {
    const { service, getEvent, resource, updateEvent, failOperation } =
      outboundOperationHarness('update');

    getEvent.mockResolvedValue({
      ...resource,
      summary: 'Later Google title',
      extendedProperties: { private: { sydiaOperationId: 'operation-1' } },
    });
    await service.processOperation('operation-1');
    expect(updateEvent).not.toHaveBeenCalled();
    expect(failOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'conflict',
        conflict: expect.objectContaining({ conflictingFields: ['title'] }),
      }),
    );
  });

  test('an ETag race that already applied the desired update completes after a fresh read', async () => {
    const {
      service,
      getEvent,
      resource,
      updateEvent,
      completeOperation,
      failOperation,
    } = outboundOperationHarness('update');

    getEvent
      .mockResolvedValueOnce({
        ...resource,
        summary: 'Original title',
        etag: 'etag-0',
      })
      .mockResolvedValueOnce(resource);
    updateEvent.mockRejectedValueOnce(
      new GoogleCalendarApiError(412, 'conditionNotMet', null),
    );
    await service.processOperation('operation-1');
    expect(updateEvent).toHaveBeenCalledTimes(1);
    expect(failOperation).not.toHaveBeenCalled();
    expect(completeOperation).toHaveBeenCalled();
  });

  test('an ETag race with independent changes retries without a second write in the claim', async () => {
    const { service, getEvent, resource, updateEvent, failOperation } =
      outboundOperationHarness('update');

    getEvent
      .mockResolvedValueOnce({
        ...resource,
        summary: 'Original title',
        etag: 'etag-0',
      })
      .mockResolvedValueOnce({
        ...resource,
        summary: 'Original title',
        location: 'Google location',
        etag: 'etag-2',
      });
    updateEvent.mockRejectedValueOnce(
      new GoogleCalendarApiError(412, 'conditionNotMet', null),
    );
    await service.processOperation('operation-1');
    expect(updateEvent).toHaveBeenCalledTimes(1);
    expect(failOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'retry',
        errorCode: 'calendar_version_changed',
      }),
    );
  });

  test('an update without a current provider ETag fails visibly without an unconditional write', async () => {
    const { service, getEvent, resource, updateEvent, failOperation } =
      outboundOperationHarness('update');

    getEvent.mockResolvedValue({
      ...resource,
      summary: 'Original title',
      etag: undefined,
    });
    await service.processOperation('operation-1');
    expect(updateEvent).not.toHaveBeenCalled();
    expect(failOperation).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed' }),
    );
  });

  test('a failed preflight read retries without issuing an update', async () => {
    const { service, getEvent, updateEvent, failOperation } =
      outboundOperationHarness('update');

    getEvent.mockRejectedValue(
      new GoogleCalendarApiError(503, 'backendError', null),
    );
    await service.processOperation('operation-1');
    expect(updateEvent).not.toHaveBeenCalled();
    expect(failOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'retry',
        errorCode: 'google_503_backendError',
      }),
    );
  });

  test('a mismatched provider response cannot confirm the operation', async () => {
    const { service, resource, updateEvent, completeOperation, failOperation } =
      outboundOperationHarness('update');

    updateEvent.mockResolvedValue({ ...resource, id: 'different-event' });
    await service.processOperation('operation-1');
    expect(completeOperation).not.toHaveBeenCalled();
    expect(failOperation).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed' }),
    );
  });

  test('a provider response that did not apply the requested field cannot confirm delivery', async () => {
    const { service, resource, updateEvent, completeOperation, failOperation } =
      outboundOperationHarness('update');

    updateEvent.mockResolvedValue({ ...resource, summary: 'Original title' });
    await service.processOperation('operation-1');
    expect(completeOperation).not.toHaveBeenCalled();
    expect(failOperation).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed' }),
    );
  });

  test('a tentative provider status survives update reconciliation', async () => {
    const {
      service,
      claim,
      resource,
      getEvent,
      updateEvent,
      completeOperation,
    } = outboundOperationHarness('update');

    claim.operation.baseSnapshot = {
      ...(claim.operation.baseSnapshot as object),
      status: 'tentative',
    };
    claim.operation.payload = {
      ...(claim.operation.payload as object),
      status: 'tentative',
    };
    getEvent.mockResolvedValue({
      ...resource,
      summary: 'Original title',
      status: 'tentative',
    });
    updateEvent.mockResolvedValue({ ...resource, status: 'tentative' });
    await service.processOperation('operation-1');
    expect(updateEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'operation-1',
      { title: 'Dentist appointment' },
      expect.any(String),
      expect.any(Object),
    );
    expect(completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciledEvent: expect.objectContaining({
          event: expect.objectContaining({ status: 'tentative' }),
        }),
      }),
    );
  });

  test('provider success followed by a database completion error is logged and propagated for reconciliation', async () => {
    const { service, completeOperation, failOperation } =
      outboundOperationHarness();

    const failure = new Error('synthetic completion database outage');
    completeOperation.mockRejectedValueOnce(failure);
    const logger = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const recordWork = jest.spyOn(calendarSyncMetrics, 'recordSyncWork');

    try {
      await expect(
        service.process({ kind: 'operation', operationId: 'operation-1' }),
      ).rejects.toBe(failure);
      expect(logger).toHaveBeenCalledWith(
        'Calendar operation operation-1 succeeded at Google but its completion could not be persisted; recovery will reconcile the same durable operation.',
        { errorCode: 'Error' },
      );
      expect(recordWork).toHaveBeenCalledWith(
        'operation',
        'failed',
        expect.any(Number),
      );
      expect(JSON.stringify(logger.mock.calls)).not.toContain(failure.message);
      expect(failOperation).not.toHaveBeenCalled();
    } finally {
      logger.mockRestore();
      recordWork.mockRestore();
    }
  });

  test('persists a bounded retry deadline after a transient Google write failure', async () => {
    const { service, completeOperation, failOperation, createEvent } =
      outboundOperationHarness();

    const providerFailure = new GoogleCalendarApiError(
      503,
      'backend_error',
      null,
    );

    createEvent.mockRejectedValue(providerFailure);
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    try {
      await service.process({ kind: 'operation', operationId: 'operation-1' });

      expect(createEvent).toHaveBeenCalledTimes(1);
      expect(failOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'operation-1',
          claimToken: 'claim-token-1',
          claimEpoch: 8,
          errorCode: 'google_503_backend_error',
          outcome: 'retry',
          retryDelayMs: 500,
        }),
      );
      expect(completeOperation).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});

describe('CalendarSyncService inbound pulls', () => {
  test('saves an initial import page with normalized event data and its cursor', async () => {
    const remoteEvent = {
      id: 'google-event-1',
      etag: 'etag-1',
      summary: 'Planning',
      start: {
        dateTime: '2026-10-11T09:00:00+08:00',
        timeZone: 'Asia/Makassar',
      },
      end: {
        dateTime: '2026-10-11T10:00:00+08:00',
        timeZone: 'Asia/Makassar',
      },
    };

    const { service, listEvents, saveCalendarSyncPage, add } =
      inboundPullHarness({
        page: {
          items: [remoteEvent],
          nextPageToken: null,
          nextSyncToken: 'sync-token-2',
        },
      });

    await service.process({
      kind: 'pull',
      bindingId: 'binding-1',
      connectionGeneration: 3,
    });

    expect(listEvents).toHaveBeenCalledWith(
      'access-token',
      'calendar-1',
      { pageToken: null, syncToken: null },
      {
        googleSubject: 'google-subject-1',
        calendarId: 'calendar-1',
        lane: 'import',
        beforeRequest: expect.any(Function),
      },
    );
    expect(saveCalendarSyncPage).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingId: 'binding-1',
        connectionGeneration: 3,
        leaseEpoch: 11,
        capturedDirtyRevision: 4,
        fullImportGeneration: 2,
        fullImport: true,
        nextPageToken: null,
        nextSyncToken: 'sync-token-2',
        events: [
          expect.objectContaining({
            googleEventId: 'google-event-1',
            etag: 'etag-1',
            status: 'confirmed',
            event: expect.objectContaining({
              title: 'Planning',
              startAt: new Date('2026-10-11T01:00:00.000Z'),
              endAt: new Date('2026-10-11T02:00:00.000Z'),
              timezone: 'Asia/Makassar',
            }),
          }),
        ],
      }),
    );
    expect(add).not.toHaveBeenCalled();
  });

  test('resumed incremental pagination retains its original sync token while recovering newer notifications', async () => {
    const { service, claim, listEvents, saveCalendarSyncPage, add } =
      inboundPullHarness({
        syncToken: 'sync-token-1',
        nextPageToken: 'page-2',
        dirtyRevision: 8,
        capturedDirtyRevision: 7,
        page: {
          items: [{ id: 'deleted-event-1', status: 'cancelled' }],
          nextPageToken: null,
          nextSyncToken: 'sync-token-2',
        },
      });

    await service.process({
      kind: 'pull',
      bindingId: 'binding-1',
      connectionGeneration: 3,
    });

    expect(listEvents).toHaveBeenCalledWith(
      'access-token',
      'calendar-1',
      { pageToken: 'page-2', syncToken: 'sync-token-1' },
      {
        googleSubject: 'google-subject-1',
        calendarId: 'calendar-1',
        lane: 'pull',
        beforeRequest: expect.any(Function),
      },
    );
    expect(saveCalendarSyncPage).toHaveBeenCalledWith(
      expect.objectContaining({
        fullImport: false,
        nextPageToken: null,
        nextSyncToken: 'sync-token-2',
        events: [
          expect.objectContaining({
            googleEventId: 'deleted-event-1',
            event: null,
            status: 'cancelled',
          }),
        ],
      }),
    );
    expect(add).toHaveBeenCalledWith('calendar-pull-continuation', {
      kind: 'pull',
      bindingId: claim.id,
      connectionGeneration: claim.connectionGeneration,
    });
  });

  test('finalization resumes its stored token without reading another Google page', async () => {
    const { service, claim, listEvents, saveCalendarSyncPage, add } =
      inboundPullHarness();

    claim.pendingFullImportSyncToken = 'stored-final-token';
    saveCalendarSyncPage.mockResolvedValue('continue');

    await service.process({
      kind: 'pull',
      bindingId: 'binding-1',
      connectionGeneration: 3,
    });

    expect(listEvents).not.toHaveBeenCalled();
    expect(saveCalendarSyncPage).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [],
        nextPageToken: null,
        nextSyncToken: 'stored-final-token',
        fullImport: true,
      }),
    );
    expect(add).toHaveBeenCalledWith('calendar-pull-continuation', {
      kind: 'pull',
      bindingId: 'binding-1',
      connectionGeneration: 3,
    });
  });

  test('resumed full-import pagination uses its page token without a sync token', async () => {
    const { service, listEvents } = inboundPullHarness({
      nextPageToken: 'full-import-page-2',
    });

    await service.process({
      kind: 'pull',
      bindingId: 'binding-1',
      connectionGeneration: 3,
    });

    expect(listEvents).toHaveBeenCalledWith(
      'access-token',
      'calendar-1',
      { pageToken: 'full-import-page-2', syncToken: null },
      expect.objectContaining({ lane: 'import' }),
    );
  });

  test('restarts a scoped full import after Google invalidates the sync token', async () => {
    const {
      service,
      claim,
      listEvents,
      resetExpiredSyncToken,
      add,
      saveCalendarSyncPage,
      failBindingSync,
    } = inboundPullHarness({
      syncToken: 'expired-sync-token',
      listError: new GoogleCalendarApiError(410, 'fullSyncRequired', null),
    });

    await service.process({
      kind: 'pull',
      bindingId: 'binding-1',
      connectionGeneration: 3,
    });

    expect(listEvents).toHaveBeenCalledTimes(1);
    expect(resetExpiredSyncToken).toHaveBeenCalledWith({
      bindingId: claim.id,
      connectionGeneration: claim.connectionGeneration,
      owner: expect.any(String),
      leaseEpoch: claim.leaseEpoch,
    });
    expect(add).toHaveBeenCalledWith('calendar-full-resync', {
      kind: 'pull',
      bindingId: claim.id,
      connectionGeneration: claim.connectionGeneration,
    });
    expect(saveCalendarSyncPage).not.toHaveBeenCalled();
    expect(failBindingSync).not.toHaveBeenCalled();
  });
});

describe('CalendarSyncService operator full resync', () => {
  test('keeps the durable request accepted when queue dispatch fails', async () => {
    const requestFullResync = jest
      .fn<(userId: string) => Promise<FullResyncResult>>()
      .mockResolvedValue({
        status: 'queued',
        bindingId: 'binding-1',
        connectionGeneration: 7,
        fullImportGeneration: 5,
      });

    const calendars = { requestFullResync };
    const add = jest
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockRejectedValue(new Error('Redis is unavailable.'));

    const errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const service = new CalendarSyncService(
      calendars as unknown as ICalendarRepository,
      { available: () => true } as unknown as GoogleCalendarService,
      { calendarSync: { add } } as unknown as QueueService,
      { get: () => undefined } as unknown as ConfigService,
    );

    try {
      await expect(service.requestFullResync('user-1')).resolves.toEqual({
        status: 'queued',
        fullImportGeneration: 5,
      });
      expect(requestFullResync).toHaveBeenCalledWith('user-1');
      expect(add).toHaveBeenCalledWith('calendar-operator-full-resync', {
        kind: 'pull',
        bindingId: 'binding-1',
        connectionGeneration: 7,
      });
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining('is durable but queue dispatch failed'),
        expect.any(String),
      );
    } finally {
      errorLog.mockRestore();
    }
  });
});

describe('CalendarSyncService watch cleanup', () => {
  test('keeps an uncertain watch-creation result pending until remote expiry', async () => {
    const { service, calendars } = watchRenewalHarness({
      watchError: new TypeError('connection ended after the provider request'),
    });

    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    try {
      await expect(
        service.processRenewWatch('binding-1', 3),
      ).resolves.toBeUndefined();

      expect(calendars.markWatchCleanupPending).toHaveBeenCalledWith(
        expect.any(String),
      );
      expect(calendars.failWatchChannel).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('uncertain provider result'),
        { errorCode: 'TypeError' },
      );
    } finally {
      warn.mockRestore();
    }
  });

  test('does not queue cleanup when Google definitively rejects watch creation', async () => {
    const { service, calendars } = watchRenewalHarness({
      watchError: new GoogleCalendarApiError(400, 'invalid_request', null),
    });

    await expect(
      service.processRenewWatch('binding-1', 3),
    ).resolves.toBeUndefined();

    expect(calendars.failWatchChannel).toHaveBeenCalledWith(
      expect.any(String),
      'google_400_invalid_request',
    );
    expect(calendars.markWatchCleanupPending).not.toHaveBeenCalled();
  });

  test('persists cleanup after a late channel cannot be stopped', async () => {
    const { service, calendars, stopWatch } = watchRenewalHarness({
      activation: false,
      stopError: new Error('synthetic channel-stop timeout'),
    });

    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    try {
      await expect(
        service.processRenewWatch('binding-1', 3),
      ).resolves.toBeUndefined();

      expect(stopWatch).toHaveBeenCalledWith(
        'access-token',
        expect.any(String),
        'google-resource-1',
        expect.objectContaining({ lane: 'watch' }),
      );
      expect(calendars.markWatchCleanupPending).toHaveBeenCalledWith(
        expect.any(String),
      );
      expect(calendars.markWatchChannelStopped).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('will expire automatically'),
        { errorCode: 'Error' },
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        'synthetic channel-stop timeout',
      );
    } finally {
      warn.mockRestore();
    }
  });
});

describe('CalendarSyncService webhook notifications', () => {
  test('propagates persistence failure before queueing a receipt', async () => {
    const persistenceError = new Error('Postgres is unavailable.');
    const markWatchDirtyNotification = jest
      .fn<ICalendarRepository['markWatchDirtyNotification']>()
      .mockRejectedValue(persistenceError);

    const add = jest.fn();
    const service = new CalendarSyncService(
      { markWatchDirtyNotification } as unknown as ICalendarRepository,
      { available: () => true } as unknown as GoogleCalendarService,
      { calendarSync: { add } } as unknown as QueueService,
      { get: () => undefined } as unknown as ConfigService,
    );

    await expect(
      service.webhook({
        channelId: 'channel-1',
        channelToken: 'synthetic-google-channel-token',
        resourceId: 'resource-1',
        messageNumber: '20',
      }),
    ).rejects.toBe(persistenceError);
    expect(add).not.toHaveBeenCalled();
  });

  test('commits the receipt before queueing and logs a failed dispatch', async () => {
    const channelToken = 'synthetic-google-channel-token';
    const markWatchDirtyNotification = jest
      .fn<ICalendarRepository['markWatchDirtyNotification']>()
      .mockResolvedValue({
        accepted: true,
        bindingId: 'binding-1',
        connectionGeneration: 7,
      });

    const add = jest
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockRejectedValue(new Error('Redis is unavailable.'));

    const errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const service = new CalendarSyncService(
      { markWatchDirtyNotification } as unknown as ICalendarRepository,
      { available: () => true } as unknown as GoogleCalendarService,
      { calendarSync: { add } } as unknown as QueueService,
      { get: () => undefined } as unknown as ConfigService,
    );

    try {
      await expect(
        service.webhook({
          channelId: 'channel-1',
          channelToken,
          resourceId: 'resource-1',
          messageNumber: '19',
        }),
      ).resolves.toBeUndefined();

      expect(markWatchDirtyNotification).toHaveBeenCalledWith({
        channelId: 'channel-1',
        tokenHash: createHash('sha256').update(channelToken).digest('hex'),
        resourceId: 'resource-1',
        messageNumber: '19',
      });
      expect(add).toHaveBeenCalledWith('calendar-watch-notification', {
        kind: 'pull',
        bindingId: 'binding-1',
        connectionGeneration: 7,
      });
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining('was persisted, but its queue dispatch failed'),
        expect.stringContaining('Redis is unavailable.'),
      );
    } finally {
      errorLog.mockRestore();
    }
  });
});

function retentionRecoveryHarness(
  settings: Record<string, number | string> = {},
) {
  const cleanupSyncRecords = jest
    .fn<ICalendarRepository['cleanupSyncRecords']>()
    .mockResolvedValue({
      ordinaryTombstones: 5,
      completedOperations: 2,
      expiredOAuthRequests: 3,
      expiredMutationReceipts: 4,
    });

  const calendars = {
    cleanupSyncRecords,
    dueOperationIds: jest
      .fn<ICalendarRepository['dueOperationIds']>()
      .mockResolvedValue([]),
    dueBindingIds: jest
      .fn<ICalendarRepository['dueBindingIds']>()
      .mockResolvedValue([]),
  };

  const config = new ConfigService(settings);
  const service = new CalendarSyncService(
    calendars as unknown as ICalendarRepository,
    { available: () => true } as GoogleCalendarService,
    { calendarSync: { add: jest.fn() } } as unknown as QueueService,
    config,
  );

  return { service, cleanupSyncRecords };
}

describe('Calendar retention recovery', () => {
  test('recovery sweeps one bounded batch after dispatching due work', async () => {
    const { service, cleanupSyncRecords } = retentionRecoveryHarness();
    await service.recover();
    expect(cleanupSyncRecords).toHaveBeenCalledWith({
      completedOperationRetentionDays: 30,
      tombstoneRetentionDays: 90,
      batchSize: 100,
    });
  });

  test('recovery respects configured operation retention and batch size', async () => {
    const { service, cleanupSyncRecords } = retentionRecoveryHarness({
      BACKEND_GOOGLE_CALENDAR_COMPLETED_OPERATION_RETENTION_DAYS: '60',
      BACKEND_GOOGLE_CALENDAR_TOMBSTONE_RETENTION_DAYS: '120',
      BACKEND_GOOGLE_CALENDAR_RETENTION_BATCH_SIZE: '50',
    });

    await service.recover();
    expect(cleanupSyncRecords).toHaveBeenCalledWith({
      completedOperationRetentionDays: 60,
      tombstoneRetentionDays: 120,
      batchSize: 50,
    });
  });

  test('retention persistence errors are logged and propagate to the worker', async () => {
    const { service, cleanupSyncRecords } = retentionRecoveryHarness();
    const failure = new Error(
      'synthetic calendar retention transaction failure',
    );

    cleanupSyncRecords.mockRejectedValueOnce(failure);
    const logger = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const recordWork = jest.spyOn(calendarSyncMetrics, 'recordSyncWork');

    try {
      await expect(service.recover()).rejects.toBe(failure);
      expect(recordWork).toHaveBeenCalledWith(
        'retention',
        'failed',
        expect.any(Number),
      );
      expect(logger).toHaveBeenCalledWith(
        'Calendar retention cleanup failed; expired records remain for the next recovery pass.',
        failure.stack,
      );
    } finally {
      logger.mockRestore();
      recordWork.mockRestore();
    }
  });

  test.each([
    ['BACKEND_GOOGLE_CALENDAR_COMPLETED_OPERATION_RETENTION_DAYS', 0],
    ['BACKEND_GOOGLE_CALENDAR_COMPLETED_OPERATION_RETENTION_DAYS', 3651],
    ['BACKEND_GOOGLE_CALENDAR_TOMBSTONE_RETENTION_DAYS', 0],
    ['BACKEND_GOOGLE_CALENDAR_TOMBSTONE_RETENTION_DAYS', 3651],
    ['BACKEND_GOOGLE_CALENDAR_RETENTION_BATCH_SIZE', 0],
    ['BACKEND_GOOGLE_CALENDAR_RETENTION_BATCH_SIZE', 1001],
    ['BACKEND_GOOGLE_CALENDAR_RETENTION_BATCH_SIZE', 1.5],
  ])('invalid %s=%s fails configuration validation', (key, value) => {
    expect(() => retentionRecoveryHarness({ [key]: value })).toThrow(key);
  });
});
