import { describe, expect, jest, test } from '@jest/globals';
import type {
  CalendarEvent,
  CalendarEventForRead,
} from '../../database/entities';
import type { CalendarReadRepository } from './calendar-read.service.js';
import {
  CalendarReadLimitError,
  CalendarReadService,
} from './calendar-read.service.js';

const NOW = new Date('2026-01-01T12:00:00.000Z');

function calendarEvent(
  id: string,
  overrides: Partial<CalendarEventForRead> = {},
): CalendarEventForRead {
  return {
    id,
    provider: 'google',
    providerEventId: null,
    providerBindingId: 'binding-1',
    title: id,
    description: null,
    location: null,
    startAt: new Date('2026-01-05T14:00:00.000Z'),
    endAt: new Date('2026-01-05T15:00:00.000Z'),
    timezone: 'America/New_York',
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
    syncState: 'synced',
    revision: 1,
    lastSyncedAt: NOW,
    syncErrorCode: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function serviceWith(
  events: CalendarEventForRead[],
  cancelledOccurrences: Awaited<
    ReturnType<CalendarReadRepository['listCancelledRecurringInstances']>
  > = [],
  materializedException: CalendarEvent | null = null,
) {
  const repository: CalendarReadRepository = {
    list: jest.fn<CalendarReadRepository['list']>().mockResolvedValue(events),
    listCancelledRecurringInstances: jest
      .fn<CalendarReadRepository['listCancelledRecurringInstances']>()
      .mockResolvedValue(cancelledOccurrences),
    findById: jest
      .fn<CalendarReadRepository['findById']>()
      .mockImplementation((_userId, id) =>
        Promise.resolve(events.find((event) => event.id === id) ?? null),
      ),
    materializeLocalOccurrence: jest
      .fn<CalendarReadRepository['materializeLocalOccurrence']>()
      .mockResolvedValue(materializedException),
  };

  return new CalendarReadService(repository);
}

describe('CalendarReadService', () => {
  test('keeps moved occurrences within their binding when Google series IDs collide', async () => {
    const oldSeries = calendarEvent('old-series', {
      providerEventId: 'shared-series',
      providerBindingId: 'old-binding',
      recurrence: ['RRULE:FREQ=DAILY;COUNT=1'],
    });

    const activeSeries = calendarEvent('active-series', {
      providerEventId: 'shared-series',
      providerBindingId: 'active-binding',
      recurrence: ['RRULE:FREQ=DAILY;COUNT=1'],
    });

    const moved = calendarEvent('old-instance', {
      providerBindingId: 'old-binding',
      providerEventId: 'shared-instance',
      recurringParentProviderEventId: 'shared-series',
      originalStartAt: new Date('2026-01-05T14:00:00.000Z'),
      startAt: new Date('2026-01-05T16:00:00.000Z'),
      endAt: new Date('2026-01-05T17:00:00.000Z'),
    });

    const events = await serviceWith([oldSeries, activeSeries, moved]).list(
      'user-1',
      new Date('2026-01-05T00:00:00.000Z'),
      new Date('2026-01-06T00:00:00.000Z'),
    );

    expect(
      events.map((event) => [
        event.seriesEventId,
        event.startAt?.toISOString(),
      ]),
    ).toEqual([
      ['active-series', '2026-01-05T14:00:00.000Z'],
      ['old-series', '2026-01-05T16:00:00.000Z'],
    ]);
  });

  test('cancellation in an old binding leaves an identical series in the active binding visible', async () => {
    const oldSeries = calendarEvent('old-series', {
      providerEventId: 'shared-series',
      providerBindingId: 'old-binding',
      recurrence: ['RRULE:FREQ=DAILY;COUNT=1'],
    });

    const activeSeries = calendarEvent('active-series', {
      providerEventId: 'shared-series',
      providerBindingId: 'active-binding',
      recurrence: ['RRULE:FREQ=DAILY;COUNT=1'],
    });

    const events = await serviceWith(
      [oldSeries, activeSeries],
      [
        {
          bindingId: 'old-binding',
          recurringParentProviderEventId: 'shared-series',
          originalStartAt: new Date('2026-01-05T14:00:00.000Z'),
          originalStartDate: null,
        },
      ],
    ).list(
      'user-1',
      new Date('2026-01-05T00:00:00.000Z'),
      new Date('2026-01-06T00:00:00.000Z'),
    );

    expect(events.map((event) => event.seriesEventId)).toEqual([
      'active-series',
    ]);
  });

  test('unverified legacy exceptions never overlay a verified series with the same provider ID', async () => {
    const master = calendarEvent('verified-series', {
      providerEventId: 'shared-series',
      recurrence: ['RRULE:FREQ=DAILY;COUNT=1'],
    });

    const legacy = calendarEvent('legacy-instance', {
      providerBindingId: null,
      providerEventId: 'legacy-instance',
      recurringParentProviderEventId: 'shared-series',
      originalStartAt: new Date('2026-01-05T14:00:00.000Z'),
      startAt: new Date('2026-01-05T16:00:00.000Z'),
      endAt: new Date('2026-01-05T17:00:00.000Z'),
      syncState: 'reconnect_required',
      syncErrorCode: 'legacy_link_unverified',
    });

    const events = await serviceWith([master, legacy]).list(
      'user-1',
      new Date('2026-01-05T00:00:00.000Z'),
      new Date('2026-01-06T00:00:00.000Z'),
    );

    expect(
      events.map((event) => [
        event.sourceEventId,
        event.startAt?.toISOString(),
      ]),
    ).toEqual([
      ['verified-series', '2026-01-05T14:00:00.000Z'],
      ['legacy-instance', '2026-01-05T16:00:00.000Z'],
    ]);
  });

  test('projects series changes onto inherited local exception fields and keeps overrides', async () => {
    const series = calendarEvent('series-1', {
      provider: 'local',
      providerEventId: null,
      title: 'Updated series title',
      description: 'Updated series description',
      location: 'Updated room',
      attendees: ['person@example.com'],
      recurrence: ['RRULE:FREQ=DAILY;COUNT=3'],
      startAt: new Date('2026-01-05T14:00:00.000Z'),
      endAt: new Date('2026-01-05T15:00:00.000Z'),
      syncState: 'local',
    });

    const occurrenceKey = '2026-01-06T14:00:00.000Z';
    const exception = calendarEvent('exception-1', {
      provider: 'local',
      providerEventId: null,
      title: 'Occurrence title',
      description: 'Old series description',
      location: 'Old room',
      attendees: [],
      startAt: new Date(occurrenceKey),
      endAt: new Date('2026-01-06T15:00:00.000Z'),
      recurrence: [],
      recurringParentEventId: series.id,
      recurrenceExceptionKey: occurrenceKey,
      originalStartAt: new Date(occurrenceKey),
      recurrenceOverrideFields: ['title'],
      syncState: 'local',
    });

    const service = serviceWith([series, exception]);

    const events = await service.list(
      'user-1',
      new Date('2026-01-05T00:00:00.000Z'),
      new Date('2026-01-08T00:00:00.000Z'),
    );

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instanceEventId: null,
          seriesEventId: series.id,
          occurrenceKey,
          title: 'Occurrence title',
          description: 'Updated series description',
          location: 'Updated room',
          attendees: ['person@example.com'],
          startAt: new Date(occurrenceKey),
          endAt: new Date('2026-01-06T15:00:00.000Z'),
        }),
      ]),
    );
  });

  test('projects weekly wall-clock occurrences across the requested range', async () => {
    const master = calendarEvent('series', {
      providerEventId: 'google-series',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5'],
    });

    const service = serviceWith([master]);

    const events = await service.list(
      'user-1',
      new Date('2026-01-05T00:00:00.000Z'),
      new Date('2026-01-16T00:00:00.000Z'),
    );

    expect(events.map((event) => event.startAt?.toISOString())).toEqual([
      '2026-01-05T14:00:00.000Z',
      '2026-01-07T14:00:00.000Z',
      '2026-01-12T14:00:00.000Z',
      '2026-01-14T14:00:00.000Z',
    ]);
    expect(events.every((event) => event.isOccurrence)).toBe(true);
    expect(new Set(events.map((event) => event.id)).size).toBe(4);
  });

  test('keeps the series wall time while the IANA timezone changes offset', async () => {
    const master = calendarEvent('dst-series', {
      startAt: new Date('2026-03-01T17:00:00.000Z'),
      endAt: new Date('2026-03-01T18:00:00.000Z'),
      timezone: 'America/Los_Angeles',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=SU;COUNT=4'],
    });

    const events = await serviceWith([master]).list(
      'user-1',
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-04-01T00:00:00.000Z'),
    );

    expect(events.map((event) => event.startAt?.toISOString())).toEqual([
      '2026-03-01T17:00:00.000Z',
      '2026-03-08T16:00:00.000Z',
      '2026-03-15T16:00:00.000Z',
      '2026-03-22T16:00:00.000Z',
    ]);
  });

  test('moves a nonexistent recurring wall time forward through the DST gap', async () => {
    const master = calendarEvent('dst-gap-series', {
      startAt: new Date('2026-03-01T10:30:00.000Z'),
      endAt: new Date('2026-03-01T11:30:00.000Z'),
      timezone: 'America/Los_Angeles',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=SU;COUNT=3'],
    });

    const events = await serviceWith([master]).list(
      'user-1',
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-16T00:00:00.000Z'),
    );

    expect(events.map((event) => event.startAt?.toISOString())).toEqual([
      '2026-03-01T10:30:00.000Z',
      '2026-03-08T10:30:00.000Z',
      '2026-03-15T09:30:00.000Z',
    ]);
  });

  test('uses exclusive all-day ends and honors RDATE and EXDATE', async () => {
    const master = calendarEvent('all-day-series', {
      startAt: null,
      endAt: null,
      timezone: null,
      allDayStartDate: new Date('2026-01-01T00:00:00.000Z'),
      allDayEndDate: new Date('2026-01-02T00:00:00.000Z'),
      recurrence: [
        'RRULE:FREQ=DAILY;COUNT=3',
        'EXDATE;VALUE=DATE:20260102',
        'RDATE;VALUE=DATE:20260105',
      ],
    });

    const events = await serviceWith([master]).list(
      'user-1',
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-07T00:00:00.000Z'),
    );

    expect(
      events.map((event) => [
        event.allDayStartDate?.toISOString().slice(0, 10),
        event.allDayEndDate?.toISOString().slice(0, 10),
      ]),
    ).toEqual([
      ['2026-01-01', '2026-01-02'],
      ['2026-01-03', '2026-01-04'],
      ['2026-01-05', '2026-01-06'],
    ]);
  });

  test('UTC EXDATE suppresses the matching occurrence in the series timezone', async () => {
    const master = calendarEvent('utc-exdate-series', {
      providerEventId: 'google-series',
      recurrence: ['RRULE:FREQ=DAILY;COUNT=2', 'EXDATE:20260106T140000Z'],
    });

    const events = await serviceWith([master]).list(
      'user-1',
      new Date('2026-01-05T00:00:00.000Z'),
      new Date('2026-01-08T00:00:00.000Z'),
    );

    expect(events.map((event) => event.startAt?.toISOString())).toEqual([
      '2026-01-05T14:00:00.000Z',
    ]);
  });

  test('UTC RDATE preserves its actual instant when the series timezone is not UTC', async () => {
    const master = calendarEvent('utc-rdate-series', {
      recurrence: ['RRULE:FREQ=DAILY;COUNT=1', 'RDATE:20260106T160000Z'],
    });

    const events = await serviceWith([master]).list(
      'user-1',
      new Date('2026-01-05T00:00:00.000Z'),
      new Date('2026-01-08T00:00:00.000Z'),
    );

    expect(events.map((event) => event.startAt?.toISOString())).toEqual([
      '2026-01-05T14:00:00.000Z',
      '2026-01-06T16:00:00.000Z',
    ]);
  });

  test('UTC UNTIL excludes a local occurrence after the cutoff instant', async () => {
    const master = calendarEvent('utc-until-series', {
      recurrence: ['RRULE:FREQ=DAILY;UNTIL=20260106T120000Z'],
    });

    const events = await serviceWith([master]).list(
      'user-1',
      new Date('2026-01-05T00:00:00.000Z'),
      new Date('2026-01-08T00:00:00.000Z'),
    );

    expect(events.map((event) => event.startAt?.toISOString())).toEqual([
      '2026-01-05T14:00:00.000Z',
    ]);
  });

  test('UTC UNTIL includes an occurrence before the cutoff across a DST overlap', async () => {
    const master = calendarEvent('overlap-until-series', {
      startAt: new Date('2026-10-25T05:30:00.000Z'),
      endAt: new Date('2026-10-25T06:00:00.000Z'),
      recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20261101T060000Z'],
    });

    const events = await serviceWith([master]).list(
      'user-1',
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-02T00:00:00.000Z'),
    );

    // 01:30 EDT (05:30Z) precedes the cutoff at 01:00 EST (06:00Z).
    expect(events.map((event) => event.startAt?.toISOString())).toEqual([
      '2026-11-01T05:30:00.000Z',
    ]);
  });

  test('timezone-qualified EXDATE suppresses the matching instant in another series timezone', async () => {
    const master = calendarEvent('zoned-exdate-series', {
      recurrence: [
        'RRULE:FREQ=DAILY;COUNT=2',
        'EXDATE;TZID=Europe/London:20260106T140000',
      ],
    });

    const events = await serviceWith([master]).list(
      'user-1',
      new Date('2026-01-05T00:00:00.000Z'),
      new Date('2026-01-08T00:00:00.000Z'),
    );

    expect(events.map((event) => event.startAt?.toISOString())).toEqual([
      '2026-01-05T14:00:00.000Z',
    ]);
  });

  test('UTC RDATE retains both instants of a repeated wall time during the DST overlap', async () => {
    const master = calendarEvent('overlap-rdate-series', {
      startAt: new Date('2026-10-25T05:30:00.000Z'),
      endAt: new Date('2026-10-25T06:00:00.000Z'),
      recurrence: ['RRULE:FREQ=WEEKLY;COUNT=2', 'RDATE:20261101T063000Z'],
    });

    const events = await serviceWith([master]).list(
      'user-1',
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-02T00:00:00.000Z'),
    );

    // New York repeats 01:30 once in EDT (05:30Z) and once in EST (06:30Z).
    expect(events.map((event) => event.startAt?.toISOString())).toEqual([
      '2026-11-01T05:30:00.000Z',
      '2026-11-01T06:30:00.000Z',
    ]);
  });

  test('UTC EXDATE removes only its exact instant during the DST overlap', async () => {
    const master = calendarEvent('overlap-exdate-series', {
      startAt: new Date('2026-10-25T05:30:00.000Z'),
      endAt: new Date('2026-10-25T06:00:00.000Z'),
      recurrence: [
        'RRULE:FREQ=WEEKLY;COUNT=2',
        'RDATE:20261101T063000Z',
        'EXDATE:20261101T063000Z',
      ],
    });

    const events = await serviceWith([master]).list(
      'user-1',
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-02T00:00:00.000Z'),
    );

    expect(events.map((event) => event.startAt?.toISOString())).toEqual([
      '2026-11-01T05:30:00.000Z',
    ]);
  });

  test('invalid recurrence clock fields fail rather than normalizing to another time', async () => {
    const master = calendarEvent('invalid-clock-series', {
      recurrence: ['RRULE:FREQ=DAILY;COUNT=1', 'RDATE:20260106T146000Z'],
    });

    await expect(
      serviceWith([master]).list(
        'user-1',
        new Date('2026-01-05T00:00:00.000Z'),
        new Date('2026-01-08T00:00:00.000Z'),
      ),
    ).rejects.toThrow('Invalid Google recurrence date');
  });

  test('overlays a moved instance without duplicating its original occurrence', async () => {
    const master = calendarEvent('series', {
      providerEventId: 'google-series',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3'],
    });

    const moved = calendarEvent('moved-instance', {
      providerEventId: 'google-instance',
      recurringParentProviderEventId: 'google-series',
      originalStartAt: new Date('2026-01-05T14:00:00.000Z'),
      startAt: new Date('2026-01-09T16:00:00.000Z'),
      endAt: new Date('2026-01-09T17:00:00.000Z'),
    });

    const events = await serviceWith([master, moved]).list(
      'user-1',
      new Date('2026-01-05T00:00:00.000Z'),
      new Date('2026-01-13T00:00:00.000Z'),
    );

    expect(events.map((event) => event.startAt?.toISOString())).toEqual([
      '2026-01-09T16:00:00.000Z',
      '2026-01-12T14:00:00.000Z',
    ]);
    expect(events[0]?.occurrenceKey).toBe('2026-01-05T14:00:00.000Z');
    expect(events[0]?.instanceEventId).toBe('google-instance');
  });

  test('suppresses a cancelled recurring instance by its original identity', async () => {
    const master = calendarEvent('series', {
      providerEventId: 'google-series',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3'],
    });

    const events = await serviceWith(
      [master],
      [
        {
          bindingId: 'binding-1',
          recurringParentProviderEventId: 'google-series',
          originalStartAt: new Date('2026-01-12T14:00:00.000Z'),
          originalStartDate: null,
        },
      ],
    ).list(
      'user-1',
      new Date('2026-01-05T00:00:00.000Z'),
      new Date('2026-01-20T00:00:00.000Z'),
    );

    expect(events.map((event) => event.startAt?.toISOString())).toEqual([
      '2026-01-05T14:00:00.000Z',
      '2026-01-19T14:00:00.000Z',
    ]);
  });

  test('projects a moved-in exception even when its original occurrence is outside the range', async () => {
    const master = calendarEvent('series', {
      startAt: new Date('2026-01-05T14:00:00.000Z'),
      endAt: new Date('2026-01-05T15:00:00.000Z'),
      providerEventId: 'google-series',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=1'],
    });

    const moved = calendarEvent('moved-instance', {
      providerEventId: 'google-instance',
      recurringParentProviderEventId: 'google-series',
      originalStartAt: new Date('2026-01-05T14:00:00.000Z'),
      startAt: new Date('2026-01-12T16:00:00.000Z'),
      endAt: new Date('2026-01-12T17:00:00.000Z'),
    });

    const events = await serviceWith([master, moved]).list(
      'user-1',
      new Date('2026-01-12T00:00:00.000Z'),
      new Date('2026-01-13T00:00:00.000Z'),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.startAt?.toISOString()).toBe('2026-01-12T16:00:00.000Z');
    expect(events[0]?.occurrenceKey).toBe('2026-01-05T14:00:00.000Z');
  });

  test('projects a moved local exception without duplicating its original slot', async () => {
    const master = calendarEvent('local-series', {
      provider: 'local',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3'],
    });

    const moved = calendarEvent('local-exception', {
      provider: 'local',
      startAt: new Date('2026-01-09T16:00:00.000Z'),
      endAt: new Date('2026-01-09T17:00:00.000Z'),
      recurringParentEventId: master.id,
      recurrenceExceptionKey: '2026-01-05T14:00:00.000Z',
      originalStartAt: new Date('2026-01-05T14:00:00.000Z'),
      recurrenceOverrideFields: ['time'],
    });

    const events = await serviceWith([master, moved]).list(
      'user-1',
      new Date('2026-01-05T00:00:00.000Z'),
      new Date('2026-01-20T00:00:00.000Z'),
    );

    expect(events.map((event) => event.startAt?.toISOString())).toEqual([
      '2026-01-09T16:00:00.000Z',
      '2026-01-12T14:00:00.000Z',
      '2026-01-19T14:00:00.000Z',
    ]);
    expect(events[0]?.seriesEventId).toBe(master.id);
    expect(events[0]?.occurrenceKey).toBe('2026-01-05T14:00:00.000Z');
    expect(events[0]?.instanceEventId).toBeNull();
  });

  test('suppresses a cancelled local exception while keeping the rest of the series', async () => {
    const master = calendarEvent('local-series', {
      provider: 'local',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3'],
    });

    const cancelled = calendarEvent('cancelled-local-exception', {
      provider: 'local',
      status: 'cancelled',
      recurringParentEventId: master.id,
      recurrenceExceptionKey: '2026-01-12T14:00:00.000Z',
      originalStartAt: new Date('2026-01-12T14:00:00.000Z'),
    });

    const events = await serviceWith([master, cancelled]).list(
      'user-1',
      new Date('2026-01-05T00:00:00.000Z'),
      new Date('2026-01-20T00:00:00.000Z'),
    );

    expect(events.map((event) => event.occurrenceKey)).toEqual([
      '2026-01-05T14:00:00.000Z',
      '2026-01-19T14:00:00.000Z',
    ]);
  });

  test('projects a moved all-day local exception by its date-only identity', async () => {
    const master = calendarEvent('local-all-day-series', {
      provider: 'local',
      startAt: null,
      endAt: null,
      timezone: null,
      allDayStartDate: new Date('2026-01-05T00:00:00.000Z'),
      allDayEndDate: new Date('2026-01-06T00:00:00.000Z'),
      recurrence: ['RRULE:FREQ=WEEKLY;COUNT=2'],
    });

    const moved = calendarEvent('local-all-day-exception', {
      provider: 'local',
      startAt: null,
      endAt: null,
      timezone: null,
      allDayStartDate: new Date('2026-01-07T00:00:00.000Z'),
      allDayEndDate: new Date('2026-01-08T00:00:00.000Z'),
      recurringParentEventId: master.id,
      recurrenceExceptionKey: '2026-01-05',
      originalStartDate: new Date('2026-01-05T00:00:00.000Z'),
      recurrenceOverrideFields: ['time'],
    });

    const events = await serviceWith([master, moved]).list(
      'user-1',
      new Date('2026-01-05T00:00:00.000Z'),
      new Date('2026-01-13T00:00:00.000Z'),
    );

    expect(
      events.map((event) => [
        event.occurrenceKey,
        event.allDayStartDate?.toISOString().slice(0, 10),
      ]),
    ).toEqual([
      ['2026-01-05', '2026-01-07'],
      ['2026-01-12', '2026-01-12'],
    ]);
  });

  test('materializes only an existing local occurrence for a single-instance edit', async () => {
    const master = calendarEvent('local-series', {
      provider: 'local',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3'],
    });

    const exception = calendarEvent('local-exception', {
      provider: 'local',
      recurringParentEventId: master.id,
      recurrenceExceptionKey: '2026-01-05T14:00:00.000Z',
      originalStartAt: new Date('2026-01-05T14:00:00.000Z'),
    });

    const service = serviceWith([master], [], exception);

    await expect(
      service.resolveLocalOccurrenceForMutation(
        'user-1',
        master.id,
        '2026-01-05T14:00:00.000Z',
        NOW,
      ),
    ).resolves.toEqual(exception);
  });

  test('does not materialize a local exception for a date outside the recurrence', async () => {
    const master = calendarEvent('local-series', {
      provider: 'local',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3'],
    });

    const exception = calendarEvent('local-exception', {
      provider: 'local',
      recurringParentEventId: master.id,
      recurrenceExceptionKey: '2026-01-06T14:00:00.000Z',
      originalStartAt: new Date('2026-01-06T14:00:00.000Z'),
    });

    const service = serviceWith([master], [], exception);

    await expect(
      service.resolveLocalOccurrenceForMutation(
        'user-1',
        master.id,
        '2026-01-06T14:00:00.000Z',
        NOW,
      ),
    ).resolves.toBeNull();
  });

  test('returns an actionable limit error for an oversized recurrence range', async () => {
    const master = calendarEvent('hourly-series', {
      recurrence: ['RRULE:FREQ=HOURLY;COUNT=20000'],
    });

    const service = serviceWith([master]);

    await expect(
      service.list(
        'user-1',
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-12-31T00:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(CalendarReadLimitError);
  });
});
