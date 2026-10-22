import { describe, expect, jest, test } from '@jest/globals';
import type { CalendarEventForRead } from '../../database/entities';
import type { ICalendarRepository } from '../../database/interfaces';
import type {
  QueueService,
  CalendarReminderDispatch,
  CalendarReminderJob,
} from '../../infra/queue';
import { CalendarReadService } from './calendar-read.service';
import {
  CalendarReminderService,
  calendarReminderKey,
} from './calendar-reminder.service';

const NOW = new Date('2026-10-14T08:49:00.000Z');

function event(
  overrides: Partial<CalendarEventForRead> = {},
): CalendarEventForRead {
  return {
    id: 'event-1',
    provider: 'local',
    providerEventId: null,
    providerBindingId: null,
    title: 'Meeting',
    description: null,
    location: null,
    reminderMinutes: 10,
    startAt: new Date('2026-10-14T09:00:00.000Z'),
    endAt: new Date('2026-10-14T10:00:00.000Z'),
    timezone: 'UTC',
    allDayStartDate: null,
    allDayEndDate: null,
    recurrence: [],
    recurrenceOverrideFields: [],
    recurringParentEventId: null,
    recurringParentProviderEventId: null,
    recurrenceExceptionKey: null,
    originalStartAt: null,
    originalStartDate: null,
    attendees: [],
    status: 'confirmed',
    syncState: 'local',
    revision: 1,
    lastSyncedAt: null,
    syncErrorCode: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const dispatch: CalendarReminderDispatch = {
  kind: 'dispatch',
  userId: 'user-1',
  eventId: 'event-1',
  startAt: '2026-10-14T09:00:00.000Z',
  scheduledAt: '2026-10-14T08:50:00.000Z',
  timezone: 'UTC',
};

function setup(events: CalendarEventForRead[]) {
  const repository = {
    listReminderUsers: jest
      .fn<ICalendarRepository['listReminderUsers']>()
      .mockResolvedValue([{ id: 'user-1', timezone: 'Asia/Makassar' }]),
    list: jest.fn<ICalendarRepository['list']>().mockResolvedValue(events),
    listCancelledRecurringInstances: jest
      .fn<ICalendarRepository['listCancelledRecurringInstances']>()
      .mockResolvedValue([]),
  } as unknown as ICalendarRepository;

  const add = jest
    .fn<
      (
        name: string,
        data: CalendarReminderJob,
        options: unknown,
      ) => Promise<void>
    >()
    .mockResolvedValue();

  const getJob = jest
    .fn<() => Promise<undefined>>()
    .mockResolvedValue(undefined);

  const queues = {
    calendarReminders: { add, getJob },
  } as unknown as QueueService;

  const service = new CalendarReminderService(
    repository,
    new CalendarReadService(repository),
    queues,
  );

  return { service, add, repository };
}

describe('Calendar event reminders', () => {
  test.each([
    [10, '2026-10-14T08:50:00.000Z'],
    [15, '2026-10-14T08:45:00.000Z'],
    [30, '2026-10-14T08:30:00.000Z'],
    [60, '2026-10-14T08:00:00.000Z'],
  ])(
    'schedules the selected %i minute lead time',
    async (minutes, scheduledAt) => {
      const { service, add } = setup([event({ reminderMinutes: minutes })]);
      await service.sweep(new Date(scheduledAt));
      expect(add).toHaveBeenCalledWith(
        'dispatch',
        expect.objectContaining({ scheduledAt }),
        expect.objectContaining({ delay: 0 }),
      );
    },
  );
  test('queues a future reminder with its exact delay', async () => {
    const { service, add } = setup([event()]);
    await service.sweep(NOW);
    expect(add).toHaveBeenCalledWith(
      'dispatch',
      expect.objectContaining({ scheduledAt: '2026-10-14T08:50:00.000Z' }),
      expect.objectContaining({ delay: 60_000 }),
    );
  });
  test('leaves events without a reminder out of the delivery queue', async () => {
    const { service, add } = setup([event({ reminderMinutes: null })]);
    await service.sweep(NOW);
    expect(add).not.toHaveBeenCalled();
  });
  test('does not send after the event has started', async () => {
    const { service } = setup([event()]);
    expect(
      await service.resolve(dispatch, new Date('2026-10-14T09:00:00.000Z')),
    ).toBeNull();
  });
  test('a valid past occurrence remains eligible for a missed-reminder summary', async () => {
    const { service } = setup([event()]);
    expect(
      await service.resolveMissed(
        dispatch,
        new Date('2026-10-14T10:30:00.000Z'),
      ),
    ).toMatchObject({ title: 'Meeting' });
  });
  test('a changed lead time invalidates a past missed-reminder occurrence', async () => {
    const { service } = setup([event({ reminderMinutes: 30 })]);
    expect(
      await service.resolveMissed(
        dispatch,
        new Date('2026-10-14T10:30:00.000Z'),
      ),
    ).toBeNull();
  });
  test('a deleted past event cannot appear in a missed-reminder summary', async () => {
    const { service } = setup([]);
    expect(
      await service.resolveMissed(
        dispatch,
        new Date('2026-10-14T10:30:00.000Z'),
      ),
    ).toBeNull();
  });
  test('a future due time cannot be classified as a missed reminder', async () => {
    const { service } = setup([event()]);
    expect(await service.resolveMissed(dispatch, NOW)).toBeNull();
  });
  test('past recurring occurrences are resolved by their original occurrence identity', async () => {
    const { service } = setup([
      event({
        startAt: new Date('2026-10-13T09:00:00.000Z'),
        endAt: new Date('2026-10-13T10:00:00.000Z'),
        recurrence: ['RRULE:FREQ=DAILY'],
      }),
    ]);

    expect(
      await service.resolveMissed(
        {
          ...dispatch,
          eventId: 'occurrence:event-1:2026-10-14T09%3A00%3A00.000Z',
        },
        new Date('2026-10-14T10:30:00.000Z'),
      ),
    ).toMatchObject({
      title: 'Meeting',
      occurrenceKey: '2026-10-14T09:00:00.000Z',
    });
  });
  test('a malformed historical occurrence cannot query the calendar', async () => {
    const { service, repository } = setup([event()]);
    expect(
      await service.resolveMissed({ ...dispatch, startAt: 'invalid' }, NOW),
    ).toBeNull();
    expect(repository.list).not.toHaveBeenCalled();
  });
  test('suppresses a cancelled event reminder', async () => {
    const { service } = setup([event({ status: 'cancelled' })]);
    expect(
      await service.resolve(dispatch, new Date('2026-10-14T08:50:00.000Z')),
    ).toBeNull();
  });
  test('suppresses the old reminder when the event moves', async () => {
    const { service } = setup([
      event({ startAt: new Date('2026-10-14T09:30:00.000Z') }),
    ]);

    expect(
      await service.resolve(dispatch, new Date('2026-10-14T08:50:00.000Z')),
    ).toBeNull();
  });
  test('suppresses the old job when the lead time changes', async () => {
    const { service } = setup([event({ reminderMinutes: 30 })]);
    expect(
      await service.resolve(dispatch, new Date('2026-10-14T08:50:00.000Z')),
    ).toBeNull();
  });
  test('resolves a due reminder from the current event', async () => {
    const { service } = setup([event({ title: 'Updated meeting' })]);
    expect(
      await service.resolve(dispatch, new Date('2026-10-14T08:50:00.000Z')),
    ).toMatchObject({ title: 'Updated meeting' });
  });
  test('does not dispatch an event reminder early', async () => {
    const { service } = setup([event()]);
    expect(await service.resolve(dispatch, NOW)).toBeNull();
  });
  test('expands recurring events into separate reminder occurrences', async () => {
    const { service, add } = setup([
      event({
        startAt: new Date('2026-10-13T09:00:00.000Z'),
        endAt: new Date('2026-10-13T10:00:00.000Z'),
        recurrence: ['RRULE:FREQ=DAILY'],
      }),
    ]);

    await service.sweep(NOW);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'dispatch',
      expect.objectContaining({
        startAt: '2026-10-14T09:00:00.000Z',
        scheduledAt: '2026-10-14T08:50:00.000Z',
      }),
      expect.any(Object),
    );
  });
  test('all-day reminders use midnight in the account timezone', async () => {
    const { service, add } = setup([
      event({
        startAt: null,
        endAt: null,
        timezone: null,
        allDayStartDate: new Date('2026-10-15T00:00:00.000Z'),
        allDayEndDate: new Date('2026-10-16T00:00:00.000Z'),
      }),
    ]);

    await service.sweep(new Date('2026-10-14T15:49:00.000Z'));
    expect(add).toHaveBeenCalledWith(
      'dispatch',
      expect.objectContaining({
        startAt: '2026-10-14T16:00:00.000Z',
        scheduledAt: '2026-10-14T15:50:00.000Z',
      }),
      expect.any(Object),
    );
  });
  test('changing lead time keeps one delivery identity for the occurrence', () => {
    expect(
      calendarReminderKey({
        ...dispatch,
        scheduledAt: '2026-10-14T08:30:00.000Z',
      }),
    ).toBe(calendarReminderKey(dispatch));
  });
  test('a scheduling failure is logged and retried rather than hidden', async () => {
    const { service, add } = setup([event()]);
    add.mockRejectedValue(new Error('Redis unavailable'));
    const log = jest
      .spyOn((await import('@nestjs/common')).Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(service.sweep(NOW)).rejects.toThrow(
      'Event reminder scheduling failed',
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('sweep will retry'),
      expect.stringContaining('Redis unavailable'),
    );
    log.mockRestore();
  });
});

test('event reminders use the normal notification pipeline without creating reminder records', async () => {
  const { NotificationService } =
    await import('../notifications/notification.service.js');

  const { NotificationComposerService } =
    await import('../notifications/notification-composer.service.js');

  const { processCalendarReminderJob } =
    await import('../notifications/calendar-reminder-job.processor.js');

  const { service } = setup([event()]);
  const createDelivery = jest
    .fn<(input: unknown) => Promise<unknown>>()
    .mockImplementation((input) => Promise.resolve(input));

  const notificationRepository = {
    getPreferences: () => Promise.resolve(null),
    findDeliveryByIdempotencyKey: () => Promise.resolve(null),
    createDelivery,
  } as unknown as import('../../database/interfaces').INotificationRepository;

  const add = jest
    .fn<(...args: unknown[]) => Promise<void>>()
    .mockResolvedValue();

  const notificationQueues = {
    telegramNotifications: { add, getJob: () => Promise.resolve(undefined) },
    whatsappNotifications: { add, getJob: () => Promise.resolve(undefined) },
  } as unknown as QueueService;

  const notifications = new NotificationService(
    notificationRepository,
    notificationQueues,
    service,
  );

  const composer = new NotificationComposerService({
    findById: () => Promise.resolve({ locale: 'en', timezone: 'UTC' }),
  } as unknown as import('../../database/interfaces').IUserRepository);

  jest.useFakeTimers().setSystemTime(new Date('2026-10-14T08:50:00.000Z'));

  try {
    await processCalendarReminderJob(
      { calendarReminders: service, notifications, composer },
      dispatch,
    );
    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'event_reminder',
        proactive: false,
        channel: 'whatsapp',
        content: expect.stringContaining('Meeting'),
      }),
    );
    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'event_reminder',
        channel: 'telegram',
      }),
    );
    expect(add).toHaveBeenCalledTimes(2);
    expect(createDelivery.mock.calls[0]![0]).toMatchObject({
      sourceId: 'event-1',
    });
    expect(createDelivery.mock.calls[0]![0]).toHaveProperty(
      'reminderOccurrenceId',
      undefined,
    );
  } finally {
    jest.useRealTimers();
  }
});

test('recurring all-day reminders retain the account timezone after expansion', async () => {
  const { service, add } = setup([
    event({
      startAt: null,
      endAt: null,
      timezone: null,
      allDayStartDate: new Date('2026-10-13T00:00:00.000Z'),
      allDayEndDate: new Date('2026-10-14T00:00:00.000Z'),
      recurrence: ['RRULE:FREQ=DAILY'],
    }),
  ]);

  await service.sweep(new Date('2026-10-14T15:49:00.000Z'));
  expect(add).toHaveBeenCalledWith(
    'dispatch',
    expect.objectContaining({
      startAt: '2026-10-14T16:00:00.000Z',
      scheduledAt: '2026-10-14T15:50:00.000Z',
    }),
    expect.any(Object),
  );
});
