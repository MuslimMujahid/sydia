import { CalendarReminderService } from '../calendar/calendar-reminder.service';
import { CalendarReadService } from '../calendar/calendar-read.service';
import type { ICalendarRepository } from '../../database/interfaces';
import { describe, expect, jest, test } from '@jest/globals';
import type {
  NotificationDelivery,
  UserPreference,
} from '../../database/entities';
import type { INotificationRepository } from '../../database/interfaces';
import type { QueueService } from '../../infra/queue';
import { NotificationService } from './notification.service';

const delivery = (channel: 'telegram' | 'whatsapp'): NotificationDelivery => ({
  id: `delivery-${channel}`,
  userId: 'user-1',
  kind: 'reminder',
  content: 'Reminder: pay invoice',
  idempotencyKey: 'reminder-1:2026-09-12T12:00:00.000Z',
  channel,
  proactive: false,
  sourceId: 'reminder-1',
  providerMessageId: null,
  status: 'pending',
  policyOutcome: null,
  attemptedAt: null,
  deliveredAt: null,
  failedAt: null,
  lastError: null,
  reminderOccurrenceId: 'occurrence-1',
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

function preferences(input: Partial<UserPreference> = {}): UserPreference {
  return {
    userId: 'user-1',
    briefingEnabled: true,
    briefingTime: '08:00',
    followUpIntervalMinutes: 60,
    webNotificationsEnabled: true,
    telegramNotificationsEnabled: true,
    whatsappNotificationsEnabled: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...input,
  };
}

function setup(storedPreferences: UserPreference | null) {
  const findDeliveryByIdempotencyKey = jest
    .fn<INotificationRepository['findDeliveryByIdempotencyKey']>()
    .mockResolvedValue(null);

  const createDelivery = jest
    .fn<INotificationRepository['createDelivery']>()
    .mockImplementation((input) =>
      Promise.resolve(delivery(input.channel as 'telegram' | 'whatsapp')),
    );

  const rearmEventReminder = jest
    .fn<INotificationRepository['rearmEventReminder']>()
    .mockResolvedValue({ ...delivery('telegram'), status: 'pending' });

  const getJob = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const repository = {
    getPreferences: jest.fn(() => Promise.resolve(storedPreferences)),
    findDeliveryByIdempotencyKey,
    createDelivery,
    rearmEventReminder,
  } as unknown as INotificationRepository;

  type AddNotificationJob = (
    name: string,
    data: unknown,
    options: { jobId: string },
  ) => Promise<void>;
  const whatsappAdd = jest.fn<AddNotificationJob>().mockResolvedValue();
  const telegramAdd = jest.fn<AddNotificationJob>().mockResolvedValue();
  const queues = {
    whatsappNotifications: { add: whatsappAdd, getJob },
    telegramNotifications: { add: telegramAdd, getJob },
  } as unknown as QueueService;

  return {
    service: new NotificationService(
      repository,
      queues,
      new CalendarReminderService(
        {} as ICalendarRepository,
        new CalendarReadService({} as ICalendarRepository),
        queues,
      ),
    ),
    createDelivery,
    rearmEventReminder,
    getJob,
    findDeliveryByIdempotencyKey,
    whatsappAdd,
    telegramAdd,
  };
}

const intent = {
  userId: 'user-1',
  kind: 'reminder',
  content: 'Reminder: pay invoice',
  idempotencyKey: 'reminder-1:2026-09-12T12:00:00.000Z',
  proactive: false,
  sourceId: 'reminder-1',
  reminderOccurrenceId: 'occurrence-1',
  reminderOccurrenceKey: 'reminder-1:2026-09-12T12:00:00.000Z',
};

describe('NotificationService channel routing', () => {
  test('persists and queues each channel layout', async () => {
    const { service, createDelivery, whatsappAdd, telegramAdd } =
      setup(preferences());

    const formattedIntent = {
      ...intent,
      content: '- **Invoice**',
      contentByChannel: { telegram: '- **Invoice**', whatsapp: '- Invoice' },
    };

    await service.enqueue(formattedIntent);

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'telegram',
        content: '- **Invoice**',
      }),
    );
    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'whatsapp', content: '- Invoice' }),
    );
    expect(telegramAdd).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({ content: '- **Invoice**' }),
      expect.any(Object),
    );
    expect(whatsappAdd).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({ content: '- Invoice' }),
      expect.any(Object),
    );
  });

  test('retry retains persisted content when a new enqueue has different text', async () => {
    const { service, telegramAdd, findDeliveryByIdempotencyKey } = setup(
      preferences({ whatsappNotificationsEnabled: false }),
    );

    findDeliveryByIdempotencyKey.mockResolvedValue({
      ...delivery('telegram'),
      content: 'Previously composed text',
    });

    await service.enqueue({ ...intent, content: 'Newly composed text' });

    expect(telegramAdd).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({ content: 'Previously composed text' }),
      expect.any(Object),
    );
  });

  test('queues separate daily briefings for different users on the same channel', async () => {
    const { service, telegramAdd } = setup(preferences());

    await service.enqueue({
      ...intent,
      userId: 'user-1',
      kind: 'daily_briefing',
      idempotencyKey: 'briefing:2026-10-08',
    });
    await service.enqueue({
      ...intent,
      userId: 'user-2',
      kind: 'daily_briefing',
      idempotencyKey: 'briefing:2026-10-08',
    });

    const firstJobId = telegramAdd.mock.calls[0]?.[2]?.jobId;
    const secondJobId = telegramAdd.mock.calls[1]?.[2]?.jobId;
    expect(firstJobId).toBeDefined();
    expect(secondJobId).toBeDefined();
    expect(firstJobId).not.toBe(secondJobId);
  });

  test('repeated enqueue for the same user and intent keeps the same delivery job ID', async () => {
    const { service, telegramAdd } = setup(preferences());

    await service.enqueue(intent);
    await service.enqueue(intent);

    expect(telegramAdd.mock.calls[0]?.[2]?.jobId).toBeDefined();
    expect(telegramAdd.mock.calls[0]?.[2]?.jobId).toBe(
      telegramAdd.mock.calls[1]?.[2]?.jobId,
    );
  });

  test('creates and queues one delivery per enabled external channel', async () => {
    const { service, createDelivery, whatsappAdd, telegramAdd } =
      setup(preferences());

    const result = await service.enqueue(intent);

    expect(result.deliveries).toHaveLength(2);
    expect(createDelivery).toHaveBeenCalledTimes(2);
    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'whatsapp' }),
    );
    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'telegram' }),
    );
    expect(createDelivery.mock.calls[0]?.[0]).not.toHaveProperty(
      'reminderOccurrenceKey',
    );
    expect(whatsappAdd).toHaveBeenCalledTimes(1);
    expect(telegramAdd).toHaveBeenCalledTimes(1);
  });

  test('does not create or queue a disabled Telegram delivery', async () => {
    const { service, createDelivery, whatsappAdd, telegramAdd } = setup(
      preferences({ telegramNotificationsEnabled: false }),
    );

    const result = await service.enqueue(intent);

    expect(result.deliveries.map((item) => item.channel)).toEqual(['whatsapp']);
    expect(createDelivery).toHaveBeenCalledTimes(1);
    expect(whatsappAdd).toHaveBeenCalledTimes(1);
    expect(telegramAdd).not.toHaveBeenCalled();
  });
});

test('an already delivered event reminder is not queued again after its lead time changes', async () => {
  const { service, telegramAdd, whatsappAdd, findDeliveryByIdempotencyKey } =
    setup(preferences());

  findDeliveryByIdempotencyKey.mockResolvedValue({
    ...delivery('telegram'),
    status: 'delivered',
  });
  await service.enqueue({
    ...intent,
    kind: 'event_reminder',
    eventReminder: {
      kind: 'dispatch',
      userId: 'user-1',
      eventId: 'event-1',
      timezone: 'UTC',
      startAt: '2026-10-14T09:00:00.000Z',
      scheduledAt: '2026-10-14T08:30:00.000Z',
    },
  });
  expect(telegramAdd).not.toHaveBeenCalled();
  expect(whatsappAdd).not.toHaveBeenCalled();
});

test('an obsolete event alert is rearmed and replaces the completed channel job', async () => {
  const {
    service,
    rearmEventReminder,
    getJob,
    telegramAdd,
    findDeliveryByIdempotencyKey,
  } = setup(preferences({ whatsappNotificationsEnabled: false }));

  findDeliveryByIdempotencyKey.mockResolvedValue({
    ...delivery('telegram'),
    status: 'skipped_obsolete',
  });
  const remove = jest.fn<() => Promise<void>>().mockResolvedValue();
  getJob.mockResolvedValue({
    getState: () => Promise.resolve('completed'),
    remove,
  });
  await service.enqueue({
    ...intent,
    kind: 'event_reminder',
    eventReminder: {
      kind: 'dispatch',
      userId: 'user-1',
      eventId: 'event-1',
      timezone: 'UTC',
      startAt: '2026-10-14T09:00:00.000Z',
      scheduledAt: '2026-10-14T08:30:00.000Z',
    },
  });
  expect(rearmEventReminder).toHaveBeenCalledWith(
    'user-1',
    'delivery-telegram',
    'Reminder: pay invoice',
  );
  expect(remove).toHaveBeenCalledTimes(1);
  expect(telegramAdd).toHaveBeenCalledWith(
    'deliver',
    expect.objectContaining({
      eventReminder: expect.objectContaining({
        scheduledAt: '2026-10-14T08:30:00.000Z',
      }),
    }),
    expect.any(Object),
  );
});

test('an active channel job makes event dispatch retry instead of losing the updated alert', async () => {
  const { Logger } = await import('@nestjs/common');
  const { service, getJob, telegramAdd, findDeliveryByIdempotencyKey } = setup(
    preferences({ whatsappNotificationsEnabled: false }),
  );

  findDeliveryByIdempotencyKey.mockResolvedValue(delivery('telegram'));
  getJob.mockResolvedValue({ getState: () => Promise.resolve('active') });
  const log = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);

  try {
    await expect(
      service.enqueue({
        ...intent,
        kind: 'event_reminder',
        eventReminder: {
          kind: 'dispatch',
          userId: 'user-1',
          eventId: 'event-1',
          timezone: 'UTC',
          startAt: '2026-10-14T09:00:00.000Z',
          scheduledAt: '2026-10-14T08:30:00.000Z',
        },
      }),
    ).rejects.toThrow('Event reminder channel job is active');
    expect(telegramAdd).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('dispatch will retry'),
      'NotificationService',
    );
  } finally {
    log.mockRestore();
  }
});
