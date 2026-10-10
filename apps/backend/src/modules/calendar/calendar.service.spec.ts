import { describe, expect, jest, test } from '@jest/globals';
import type {
  CalendarEvent,
  CalendarEventWrite,
} from '../../database/entities';
import type {
  CalendarConflictResolutionResult,
  CalendarMutationRequest,
  CalendarMutationResult,
  ICalendarRepository,
} from '../../database/interfaces';
import type { QueueService } from '../../infra/queue';
import { ApiException } from '../../shared/errors';
import { CalendarService } from './calendar.service.js';

const USER_ID = 'user-1';
const NOW = new Date('2026-01-01T12:00:00.000Z');

function meeting(): CalendarEventWrite {
  return {
    title: 'Project review',
    startAt: new Date('2026-01-02T09:00:00.000Z'),
    endAt: new Date('2026-01-02T10:00:00.000Z'),
    timezone: 'UTC',
  };
}

function savedEvent(): CalendarEvent {
  return {
    id: 'event-1',
    provider: 'google',
    providerEventId: null,
    title: 'Project review',
    description: null,
    location: null,
    startAt: new Date('2026-01-02T09:00:00.000Z'),
    endAt: new Date('2026-01-02T10:00:00.000Z'),
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
    syncState: 'pending',
    revision: 1,
    lastSyncedAt: null,
    syncErrorCode: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function serviceWith(
  result: CalendarMutationResult,
  conflictResult: CalendarConflictResolutionResult = { status: 'missing' },
) {
  const findById = jest
    .fn<(userId: string, eventId: string) => Promise<CalendarEvent | null>>()
    .mockResolvedValue(null);

  const createMutation = jest
    .fn<
      (
        userId: string,
        input: CalendarEventWrite,
        destination: 'auto' | 'local' | 'google',
        request: CalendarMutationRequest,
      ) => Promise<CalendarMutationResult>
    >()
    .mockResolvedValue(result);

  const exportMutation = jest
    .fn<
      (
        userId: string,
        eventId: string,
        request: CalendarMutationRequest,
      ) => Promise<CalendarMutationResult>
    >()
    .mockResolvedValue(result);

  const updateMutation = jest
    .fn<
      (
        userId: string,
        eventId: string,
        input: Partial<CalendarEventWrite>,
        request: CalendarMutationRequest,
      ) => Promise<CalendarMutationResult>
    >()
    .mockResolvedValue(result);

  const cancelMutation = jest
    .fn<
      (
        userId: string,
        eventId: string,
        request: CalendarMutationRequest,
      ) => Promise<CalendarMutationResult>
    >()
    .mockResolvedValue(result);

  const resolveConflict = jest
    .fn<
      (
        userId: string,
        conflictId: string,
        resolution: 'keep_sydia' | 'use_google',
        expectedLocalRevision: number,
        expectedRemoteEtag: string | null,
        request: CalendarMutationRequest,
      ) => Promise<CalendarConflictResolutionResult>
    >()
    .mockResolvedValue(conflictResult);

  const selectGoogleCalendar = jest
    .fn<
      (
        userId: string,
        calendar: { id: string; name: string; timezone: string },
      ) => Promise<
        | {
            status: 'selected';
            bindingId: string;
            connectionGeneration: number;
          }
        | { status: 'unchanged' }
        | { status: 'missing' }
      >
    >()
    .mockResolvedValue({ status: 'unchanged' });

  const repository = {
    findById,
    createMutation,
    exportMutation,
    updateMutation,
    cancelMutation,
    resolveConflict,
    selectGoogleCalendar,
  } as unknown as ICalendarRepository;

  const add = jest
    .fn<(...args: unknown[]) => Promise<void>>()
    .mockResolvedValue(undefined);

  const queues = { calendarSync: { add } } as unknown as QueueService;

  return {
    service: new CalendarService(repository, queues),
    findById,
    createMutation,
    exportMutation,
    updateMutation,
    cancelMutation,
    resolveConflict,
    selectGoogleCalendar,
    add,
  };
}

describe('CalendarService durable mutations', () => {
  test('dispatches the initial pull for a newly selected Google calendar', async () => {
    const { service, selectGoogleCalendar, add } = serviceWith({
      status: 'missing',
    });

    selectGoogleCalendar.mockResolvedValue({
      status: 'selected',
      bindingId: 'binding-4',
      connectionGeneration: 9,
    });

    await expect(
      service.selectGoogleCalendar(USER_ID, {
        id: 'team-calendar@example.com',
        name: 'Team calendar',
        timezone: 'Asia/Makassar',
      }),
    ).resolves.toEqual({
      calendarId: 'team-calendar@example.com',
      calendarName: 'Team calendar',
      changed: true,
    });

    expect(add).toHaveBeenCalledWith('calendar-initial-sync', {
      kind: 'pull',
      bindingId: 'binding-4',
      connectionGeneration: 9,
    });
  });

  test('returns the locally saved event and dispatches only an operation pointer', async () => {
    const event = savedEvent();
    const { service, createMutation, add } = serviceWith({
      status: 'saved',
      event,
      operationId: 'operation-1',
      replayed: false,
    });

    await expect(
      service.create(USER_ID, meeting(), 'google', 'client-request-1'),
    ).resolves.toEqual(event);

    expect(createMutation).toHaveBeenCalledWith(
      USER_ID,
      meeting(),
      'google',
      expect.objectContaining({ key: 'client-request-1' }),
    );
    expect(add).toHaveBeenCalledWith('calendar-operation', {
      kind: 'operation',
      operationId: 'operation-1',
    });
  });

  test('accepts a repository replay without changing the event result', async () => {
    const event = savedEvent();
    const { service, add } = serviceWith({
      status: 'saved',
      event,
      operationId: 'operation-1',
      replayed: true,
    });

    await expect(
      service.create(USER_ID, meeting(), 'google', 'client-request-1'),
    ).resolves.toEqual(event);
    expect(add).toHaveBeenCalledTimes(1);
  });

  test('keeps a Google-bound event pending when reconnect is required', async () => {
    const { service, add } = serviceWith({ status: 'reconnect_required' });

    await expect(
      service.create(USER_ID, meeting(), 'google', 'client-request-2'),
    ).rejects.toBeInstanceOf(ApiException);
    expect(add).not.toHaveBeenCalled();
  });

  test('copies a cached Google event into a separate local event', async () => {
    const source = {
      ...savedEvent(),
      syncState: 'reconnect_required' as const,
    };

    const localEvent = {
      ...savedEvent(),
      provider: 'local',
      providerEventId: null,
      syncState: 'local' as const,
    };

    const { service, findById, createMutation } = serviceWith({
      status: 'saved',
      event: localEvent,
      operationId: null,
      replayed: false,
    });

    findById.mockResolvedValue(source);

    await expect(
      service.copyToLocal(USER_ID, source.id, 'copy-1'),
    ).resolves.toEqual(localEvent);

    expect(createMutation).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        title: source.title,
        startAt: source.startAt,
        endAt: source.endAt,
        timezone: source.timezone,
        status: source.status,
      }),
      'local',
      expect.objectContaining({ key: 'copy-1' }),
    );
  });

  test('exports an existing Sydia event through a durable Google operation', async () => {
    const event = savedEvent();
    const { service, exportMutation, add } = serviceWith({
      status: 'saved',
      event,
      operationId: 'operation-export-1',
      replayed: false,
    });

    await expect(
      service.exportToGoogle(USER_ID, event.id, 'export-1'),
    ).resolves.toEqual(event);

    expect(exportMutation).toHaveBeenCalledWith(
      USER_ID,
      event.id,
      expect.objectContaining({ key: 'export-1' }),
    );
    expect(add).toHaveBeenCalledWith('calendar-operation', {
      kind: 'operation',
      operationId: 'operation-export-1',
    });
  });

  test('resolves a conflict and dispatches its queued Google write', async () => {
    const event = savedEvent();
    const { service, resolveConflict, add } = serviceWith(
      { status: 'missing' },
      { status: 'saved', event, operationId: 'operation-conflict-1' },
    );

    await expect(
      service.resolveConflict(
        USER_ID,
        'conflict-1',
        'keep_sydia',
        7,
        'etag-7',
        'resolve-1',
      ),
    ).resolves.toEqual(event);

    expect(resolveConflict).toHaveBeenCalledWith(
      USER_ID,
      'conflict-1',
      'keep_sydia',
      7,
      'etag-7',
      expect.objectContaining({ key: 'resolve-1' }),
    );
    expect(add).toHaveBeenCalledWith('calendar-operation', {
      kind: 'operation',
      operationId: 'operation-conflict-1',
    });
  });

  test('passes update and cancellation mutations through the same durable contract', async () => {
    const event = savedEvent();
    const { service, updateMutation, cancelMutation } = serviceWith({
      status: 'saved',
      event,
      operationId: null,
      replayed: false,
    });

    await service.update(
      USER_ID,
      event.id,
      { title: 'Updated review' },
      'update-1',
    );
    await service.cancel(USER_ID, event.id, 'cancel-1');

    expect(updateMutation).toHaveBeenCalledWith(
      USER_ID,
      event.id,
      { title: 'Updated review' },
      expect.objectContaining({ key: 'update-1' }),
    );
    expect(cancelMutation).toHaveBeenCalledWith(
      USER_ID,
      event.id,
      expect.objectContaining({ key: 'cancel-1' }),
    );
  });
});
