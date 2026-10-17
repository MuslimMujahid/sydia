import { CalendarReminderService } from '../calendar/calendar-reminder.service';
import type { ICalendarRepository } from '../../database/interfaces';
import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { validate } from 'class-validator';
import type {
  Task,
  User,
  Reminder,
  CalendarEventForRead,
} from '../../database/entities';
import type {
  INotificationRepository,
  IReminderRepository,
  ITaskRepository,
  IUserRepository,
} from '../../database/interfaces';
import type { CalendarReadRepository } from '../calendar/calendar-read.service.js';
import { CalendarReadService } from '../calendar/calendar-read.service.js';
import type { QueueService } from '../../infra/queue';
import {
  DevNotificationDto,
  DevNotificationsController,
} from './dev-notifications.controller';
import { DailyBriefingService, FollowUpService } from './proactive.service';
import { NotificationService } from './notification.service';
import { NotificationComposerService } from './notification-composer.service';

const requestId = 'ce16784d-342b-4dbf-9a88-21a792543645';
const session = { user: { id: 'owner' } } as UserSession;
const now = new Date('2026-10-09T02:00:00Z');

function setup(
  environment: string,
  briefingEnabled = true,
  channelsEnabled = true,
  followUpIntervalMinutes = 60,
  weeklyPreferences = { weeklyBriefingEnabled: false, weeklyBriefingDay: 1 },
) {
  const owner: User = {
    id: 'owner',
    name: 'Owner',
    email: 'owner@example.test',
    emailVerified: true,
    image: null,
    role: 'user',
    timezone: 'Asia/Makassar',
    locale: 'en',
    onboardingCompleted: true,
    automaticMemoryEnabled: false,
    persona: 'professional',
    preferredAddress: 'Owner',
    createdAt: now,
    updatedAt: now,
  };

  const findById = jest
    .fn<IUserRepository['findById']>()
    .mockResolvedValue(owner);

  const users = { findById } as unknown as IUserRepository;
  const createDelivery = jest
    .fn<INotificationRepository['createDelivery']>()
    .mockImplementation((input) =>
      Promise.resolve({
        ...input,
        id: `delivery-${input.channel}`,
        sourceId: input.sourceId ?? null,
        reminderOccurrenceId: null,
        status: 'pending',
        policyOutcome: null,
        providerMessageId: null,
        attemptedAt: null,
        deliveredAt: null,
        failedAt: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      }),
    );

  const notificationRepository = {
    getPreferences: jest
      .fn<INotificationRepository['getPreferences']>()
      .mockResolvedValue({
        userId: 'owner',
        briefingEnabled,
        ...weeklyPreferences,
        briefingTime: '08:00',
        followUpIntervalMinutes,
        webNotificationsEnabled: true,
        telegramNotificationsEnabled: channelsEnabled,
        whatsappNotificationsEnabled: channelsEnabled,
        createdAt: now,
        updatedAt: now,
      }),
    findDeliveryByIdempotencyKey: jest
      .fn<INotificationRepository['findDeliveryByIdempotencyKey']>()
      .mockResolvedValue(null),
    createDelivery,
  } as unknown as INotificationRepository;

  const add = jest.fn<() => Promise<void>>().mockResolvedValue();
  const queues = {
    telegramNotifications: { add },
    whatsappNotifications: { add },
  } as unknown as QueueService;

  const notifications = new NotificationService(
    notificationRepository,
    queues,
    new CalendarReminderService(
      {} as ICalendarRepository,
      new CalendarReadService({} as ICalendarRepository),
      queues,
    ),
  );

  const listTasks = jest.fn<ITaskRepository['list']>().mockResolvedValue([]);
  const tasks = { list: listTasks } as unknown as ITaskRepository;

  const listReminders = jest
    .fn<IReminderRepository['list']>()
    .mockResolvedValue([]);

  const reminders = { list: listReminders } as unknown as IReminderRepository;

  const calendarRepository: CalendarReadRepository = {
    list: jest.fn<CalendarReadRepository['list']>().mockResolvedValue([]),
    listCancelledRecurringInstances: jest
      .fn<CalendarReadRepository['listCancelledRecurringInstances']>()
      .mockResolvedValue([]),
    findById: jest
      .fn<CalendarReadRepository['findById']>()
      .mockResolvedValue(null),
    materializeLocalOccurrence: jest
      .fn<CalendarReadRepository['materializeLocalOccurrence']>()
      .mockResolvedValue(null),
  };

  const calendar = new CalendarReadService(calendarRepository);

  const briefings = new DailyBriefingService(
    users,
    notificationRepository,
    tasks,
    reminders,
    calendar,
    notifications,
  );

  const followUps = new FollowUpService(
    users,
    tasks,
    notifications,
    new NotificationComposerService(users),
  );

  const controller = new DevNotificationsController(
    new ConfigService({ NODE_ENV: environment }),
    briefings,
    followUps,
  );

  return {
    controller,
    briefings,
    followUps,
    findById,
    createDelivery,
    add,
    listTasks,
    listReminders,
    calendarRepository,
    notificationRepository,
  };
}

describe('manual development notifications', () => {
  test.each(['production', 'test', undefined])(
    'rejects daily brief outside development (%s)',
    async (environment) => {
      const { controller, findById } = setup(environment as string);
      const warning = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      try {
        await expect(
          controller.dailyBrief(session, { requestId }),
        ).rejects.toMatchObject({ status: 404 });
        expect(findById).not.toHaveBeenCalled();
        expect(warning).toHaveBeenCalledWith(
          'Rejected manual notification outside development',
        );
      } finally {
        warning.mockRestore();
      }
    },
  );

  test('rejects follow-up outside development', async () => {
    const { controller, findById } = setup('production');
    await expect(
      controller.followUp(session, { requestId }),
    ).rejects.toMatchObject({ status: 404 });
    expect(findById).not.toHaveBeenCalled();
  });

  test('queues a brief only for the authenticated account with a manual request key', async () => {
    const { controller, createDelivery } = setup('development');
    await expect(
      controller.dailyBrief(session, { requestId }),
    ).resolves.toEqual({ status: 'queued', deliveryCount: 2, replayed: false });
    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner',
        idempotencyKey: `dev-briefing:${requestId}`,
        kind: 'daily_briefing',
      }),
    );
  });

  test('retains the scheduled brief daily idempotency key', async () => {
    const { briefings, createDelivery } = setup('development');
    await briefings.run('owner', now);
    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'briefing:2026-10-09' }),
    );
  });

  test('respects disabled briefing preferences', async () => {
    const { controller, add } = setup('development', false);
    await expect(
      controller.dailyBrief(session, { requestId }),
    ).resolves.toEqual({
      status: 'skipped_disabled',
      deliveryCount: 0,
      replayed: false,
    });
    expect(add).not.toHaveBeenCalled();
  });

  test('reports nothing due when no tasks need a follow-up', async () => {
    const { controller, add } = setup('development');
    await expect(controller.followUp(session, { requestId })).resolves.toEqual({
      status: 'nothing_due',
      deliveryCount: 0,
      replayed: false,
    });
    expect(add).not.toHaveBeenCalled();
  });

  test('rejects malformed manual request IDs', async () => {
    const dto = new DevNotificationDto();
    dto.requestId = 'not-a-uuid';
    expect(await validate(dto)).toEqual([
      expect.objectContaining({ property: 'requestId' }),
    ]);
  });

  test('queues a manual follow-up for due tasks with its own request key', async () => {
    const { followUps, createDelivery, listTasks } = setup('development');
    const task: Task = {
      id: 'task-1',
      title: 'Pay invoice',
      description: null,
      dueAt: new Date('2026-10-08T02:00:00Z'),
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      status: 'inbox',
      priority: 'high',
      categories: [],
      source: { type: 'dashboard', label: null, messageId: null },
    };

    listTasks.mockResolvedValue([task]);
    await followUps.run('owner', now, requestId);
    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'follow_up',
        idempotencyKey: `dev-follow-up:${requestId}`,
        content: expect.stringContaining('Pay invoice'),
      }),
    );
  });

  test.each([
    ['telegram', '- **Pay invoice** — Due 8 Oct 2026, 10:00 · Priority high'],
    ['whatsapp', '- Pay invoice — Due 8 Oct 2026, 10:00 · Priority high'],
  ])('daily brief persists compact %s task rows', async (channel, row) => {
    const { briefings, createDelivery, listTasks } = setup('development');
    listTasks.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'task-1',
        title: 'Pay invoice',
        description: null,
        dueAt: new Date('2026-10-08T02:00:00Z'),
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        status: 'inbox',
        priority: 'high',
        categories: [],
        source: { type: 'dashboard', label: null, messageId: null },
      },
    ]);

    await briefings.run('owner', now);

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        channel,
        content: expect.stringContaining(row),
      }),
    );
  });

  test.each([
    ['telegram', '- **Pay invoice** — Due 8 Oct 2026, 10:00 · Priority high'],
    ['whatsapp', '- Pay invoice — Due 8 Oct 2026, 10:00 · Priority high'],
  ])('follow-up persists compact %s task rows', async (channel, row) => {
    const { followUps, createDelivery, listTasks } = setup('development');
    listTasks.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Pay invoice',
        description: null,
        dueAt: new Date('2026-10-08T02:00:00Z'),
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        status: 'inbox',
        priority: 'high',
        categories: [],
        source: { type: 'dashboard', label: null, messageId: null },
      },
    ]);

    await followUps.run('owner', now);

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        channel,
        content: expect.stringContaining(row),
      }),
    );
  });

  test('propagates queue failures instead of reporting success', async () => {
    const { controller, add } = setup('development');
    add.mockRejectedValue(new Error('Redis unavailable'));
    await expect(controller.dailyBrief(session, { requestId })).rejects.toThrow(
      'Redis unavailable',
    );
  });

  test('reports disabled channels without claiming a brief was queued', async () => {
    const { controller, add } = setup('development', true, false);
    await expect(
      controller.dailyBrief(session, { requestId }),
    ).resolves.toEqual({
      status: 'skipped_disabled',
      deliveryCount: 0,
      replayed: false,
    });
    expect(add).not.toHaveBeenCalled();
  });

  test('reports disabled channels when due tasks cannot receive a follow-up', async () => {
    const { followUps, listTasks, add } = setup('development', true, false);
    listTasks.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Pay invoice',
        description: null,
        dueAt: new Date('2026-10-08T02:00:00Z'),
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        status: 'inbox',
        priority: 'high',
        categories: [],
        source: { type: 'dashboard', label: null, messageId: null },
      },
    ]);
    await expect(followUps.run('owner', now, requestId)).resolves.toMatchObject(
      { status: 'skipped_disabled', deliveries: [] },
    );
    expect(add).not.toHaveBeenCalled();
  });
});

function briefingTask(
  title: string,
  dueAt: string,
  priority: Task['priority'] = 'medium',
): Task {
  return {
    id: title,
    title,
    description: null,
    dueAt: new Date(dueAt),
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    status: 'inbox',
    priority,
    categories: [],
    source: { type: 'dashboard', label: null, messageId: null },
  };
}

function briefingEvent(
  overrides: Partial<CalendarEventForRead> = {},
): CalendarEventForRead {
  return {
    id: 'conference',
    provider: 'local',
    providerEventId: null,
    providerBindingId: null,
    title: 'Conference',
    description: null,
    location: null,
    reminderMinutes: null,
    startAt: null,
    endAt: null,
    timezone: 'Asia/Makassar',
    allDayStartDate: new Date('2026-10-19T00:00:00Z'),
    allDayEndDate: new Date('2026-10-22T00:00:00Z'),
    recurrence: [],
    recurrenceOverrideFields: [],
    recurringParentEventId: null,
    recurrenceExceptionKey: null,
    recurringParentProviderEventId: null,
    originalStartAt: null,
    originalStartDate: null,
    attendees: [],
    status: 'confirmed',
    syncState: 'local',
    revision: 1,
    lastSyncedAt: null,
    syncErrorCode: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function briefingReminder(title: string, scheduledAt: string): Reminder {
  return {
    id: title,
    title,
    notes: null,
    scheduledAt: new Date(scheduledAt),
    timezone: 'Asia/Makassar',
    recurrence: null,
    createdAt: now,
    updatedAt: now,
    source: { type: 'dashboard', label: null, messageId: null },
  };
}

test.each([
  ['weeklyBrief', 'production'],
  ['weeklyBrief', 'test'],
  ['weeklyBrief', undefined],
  ['dailyWeeklyBrief', 'production'],
  ['dailyWeeklyBrief', 'test'],
  ['dailyWeeklyBrief', undefined],
] as const)(
  'rejects %s outside development (%s) before reading account data',
  async (action, environment) => {
    const { controller, findById } = setup(environment as string);
    await expect(
      controller[action](session, { requestId }),
    ).rejects.toMatchObject({ status: 404 });
    expect(findById).not.toHaveBeenCalled();
  },
);

test('manual weekly endpoint queues for the signed-in account even on another weekday', async () => {
  const { controller, createDelivery } = setup('development', false, true, 60, {
    weeklyBriefingEnabled: true,
    weeklyBriefingDay: 1,
  });

  await expect(controller.weeklyBrief(session, { requestId })).resolves.toEqual(
    { status: 'queued', deliveryCount: 2, replayed: false },
  );
  expect(createDelivery).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: 'owner',
      kind: 'weekly_briefing',
      idempotencyKey: `dev-weekly-briefing:${requestId}`,
    }),
  );
});

test('manual combined endpoint queues one combined message per enabled channel', async () => {
  const { controller, createDelivery } = setup('development', true, true, 60, {
    weeklyBriefingEnabled: true,
    weeklyBriefingDay: 1,
  });

  await controller.dailyWeeklyBrief(session, { requestId });
  expect(createDelivery).toHaveBeenCalledTimes(2);
  expect(createDelivery).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: 'owner',
      idempotencyKey: `dev-combined-briefing:${requestId}`,
      content: expect.stringContaining('Coming six days'),
    }),
  );
});

test('manual weekly-only mode groups seven days by date without a separate daily section', async () => {
  const { briefings, createDelivery, listTasks } = setup(
    'development',
    true,
    true,
    60,
    { weeklyBriefingEnabled: true, weeklyBriefingDay: 1 },
  );

  listTasks
    .mockResolvedValueOnce([
      briefingTask('Today invoice', '2026-10-09T03:00:00Z'),
      briefingTask('Future invoice', '2026-10-10T03:00:00Z'),
    ])
    .mockResolvedValueOnce([]);
  await briefings.run('owner', now, requestId, 'weekly');
  const content = createDelivery.mock.calls.find(
    ([input]) => input.channel === 'telegram',
  )![0].content;

  expect(content).toContain('**9 Oct 2026**\n\n**Tasks (1)**');
  expect(content).toContain('**10 Oct 2026**\n\n**Tasks (1)**');
  expect(content).toContain('Today invoice');
  expect(content).toContain('Future invoice');
  expect(content).not.toContain('**Today**');
  expect(content).not.toContain('Coming six days');
});

test('manual combined mode includes today and the coming six days outside the weekly send day', async () => {
  const { briefings, createDelivery, listTasks } = setup(
    'development',
    true,
    true,
    60,
    { weeklyBriefingEnabled: true, weeklyBriefingDay: 1 },
  );

  listTasks
    .mockResolvedValueOnce([
      briefingTask('Today invoice', '2026-10-09T03:00:00Z'),
      briefingTask('Future invoice', '2026-10-10T03:00:00Z'),
    ])
    .mockResolvedValueOnce([]);
  await briefings.run('owner', now, requestId, 'daily_weekly');
  const content = createDelivery.mock.calls.find(
    ([input]) => input.channel === 'telegram',
  )![0].content;

  expect(content).toContain('**Today**');
  expect(content).toContain('**Coming six days**');
  expect(content).toContain('Future invoice');
  expect(content.match(/Today invoice/g)).toHaveLength(1);
});

test('manual daily mode does not include weekly content even on the selected weekday', async () => {
  const { briefings, createDelivery } = setup('development', true, true, 60, {
    weeklyBriefingEnabled: true,
    weeklyBriefingDay: 5,
  });

  await briefings.run('owner', now, requestId, 'daily');
  expect(createDelivery).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'daily_briefing',
      content: 'No agenda, tasks due, or reminders today.',
    }),
  );
});

test.each([
  ['weekly', true, false],
  ['daily_weekly', false, true],
  ['daily_weekly', true, false],
] as const)(
  'manual %s mode respects disabled briefing switches (%s, %s)',
  async (mode, daily, weekly) => {
    const { briefings, createDelivery } = setup(
      'development',
      daily,
      true,
      60,
      { weeklyBriefingEnabled: weekly, weeklyBriefingDay: 1 },
    );

    await expect(briefings.run('owner', now, requestId, mode)).resolves.toEqual(
      { status: 'skipped_disabled' },
    );
    expect(createDelivery).not.toHaveBeenCalled();
  },
);

test('manual brief variants have separate keys when given the same request ID', async () => {
  const { briefings, createDelivery } = setup('development', true, true, 60, {
    weeklyBriefingEnabled: true,
    weeklyBriefingDay: 1,
  });

  await briefings.run('owner', now, requestId, 'weekly');
  await briefings.run('owner', now, requestId, 'daily_weekly');
  expect(
    createDelivery.mock.calls
      .filter(([input]) => input.channel === 'telegram')
      .map(([input]) => input.idempotencyKey),
  ).toEqual([
    `dev-weekly-briefing:${requestId}`,
    `dev-combined-briefing:${requestId}`,
  ]);
});

test('weekly send persists a single combined message per channel with no duplicate today items', async () => {
  const { briefings, createDelivery, listTasks } = setup(
    'development',
    true,
    true,
    60,
    { weeklyBriefingEnabled: true, weeklyBriefingDay: 1 },
  );

  listTasks
    .mockResolvedValueOnce([
      briefingTask('Today invoice', '2026-10-19T02:00:00Z'),
      briefingTask('Tomorrow invoice', '2026-10-20T02:00:00Z'),
      briefingTask('Last day invoice', '2026-10-25T15:59:00Z'),
      briefingTask('Outside week', '2026-10-25T16:00:00Z'),
    ])
    .mockResolvedValueOnce([
      briefingTask('Overdue invoice', '2026-10-18T01:00:00Z'),
    ]);

  await briefings.run('owner', new Date('2026-10-19T00:00:00Z'));

  expect(createDelivery).toHaveBeenCalledTimes(2);
  expect(createDelivery).toHaveBeenCalledWith(
    expect.objectContaining({
      channel: 'telegram',
      kind: 'weekly_briefing',
      idempotencyKey: 'briefing:2026-10-19',
      content: expect.stringContaining('**Coming six days**'),
    }),
  );
  const content = createDelivery.mock.calls[0]![0].content;
  expect(content).toContain('Overdue invoice');
  expect(content).toContain('Tomorrow invoice');
  expect(content).toContain('Last day invoice');
  expect(content).not.toContain('Outside week');
  expect(content.match(/Today invoice/g)).toHaveLength(1);
});

test('weekly-only delivery includes all seven days even when daily briefs are off', async () => {
  const { briefings, createDelivery, listTasks } = setup(
    'development',
    false,
    true,
    60,
    { weeklyBriefingEnabled: true, weeklyBriefingDay: 1 },
  );

  listTasks
    .mockResolvedValueOnce([briefingTask('Today task', '2026-10-19T02:00:00Z')])
    .mockResolvedValueOnce([]);
  await briefings.run('owner', new Date('2026-10-19T00:00:00Z'));
  expect(createDelivery).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'weekly_briefing',
      content: expect.stringContaining('Today task'),
    }),
  );
});

test('weekly-only delivery does no data reads on other weekdays', async () => {
  const { briefings, createDelivery, listTasks } = setup(
    'development',
    false,
    true,
    60,
    { weeklyBriefingEnabled: true, weeklyBriefingDay: 1 },
  );

  expect(
    await briefings.run('owner', new Date('2026-10-20T00:00:00Z')),
  ).toEqual({ status: 'skipped_disabled' });
  expect(listTasks).not.toHaveBeenCalled();
  expect(createDelivery).not.toHaveBeenCalled();
});

test('disabling weekly briefs retains the daily format on the weekly day', async () => {
  const { briefings, createDelivery } = setup('development');
  await briefings.run('owner', new Date('2026-10-19T00:00:00Z'));
  expect(createDelivery).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'daily_briefing',
      content: 'No agenda, tasks due, or reminders today.',
    }),
  );
});

test('weekly read uses seven local days rather than an unbounded upcoming query', async () => {
  const { briefings, listTasks, listReminders, calendarRepository } = setup(
    'development',
    true,
    true,
    60,
    { weeklyBriefingEnabled: true, weeklyBriefingDay: 1 },
  );

  await briefings.run('owner', new Date('2026-10-19T00:00:00Z'));
  expect(listTasks).toHaveBeenCalledWith(
    'owner',
    expect.objectContaining({
      status: ['inbox'],
      dueRange: {
        from: new Date('2026-10-18T16:00:00Z'),
        to: new Date('2026-10-25T16:00:00Z'),
      },
    }),
  );
  expect(listReminders).toHaveBeenCalledWith(
    'owner',
    expect.objectContaining({
      scheduleRange: {
        from: new Date('2026-10-19T00:00:00Z'),
        to: new Date('2026-10-25T16:00:00Z'),
      },
    }),
  );
  expect(calendarRepository.list).toHaveBeenCalledWith(
    'owner',
    new Date('2026-10-18T16:00:00Z'),
    new Date('2026-10-25T16:00:00Z'),
  );
});

test('multi-day events appear once with their complete original date range', async () => {
  const { briefings, createDelivery, calendarRepository } = setup(
    'development',
    true,
    true,
    60,
    { weeklyBriefingEnabled: true, weeklyBriefingDay: 1 },
  );

  jest.mocked(calendarRepository.list).mockResolvedValue([briefingEvent()]);
  await briefings.run('owner', new Date('2026-10-19T00:00:00Z'));
  const content = createDelivery.mock.calls[0]![0].content;
  expect(content).toContain('Conference — 19 Oct 2026–21 Oct 2026');
  expect(content.match(/Conference/g)).toHaveLength(1);
});

test('recurring calendar occurrences appear on each of their upcoming dates', async () => {
  const { briefings, createDelivery, calendarRepository } = setup(
    'development',
    true,
    true,
    60,
    { weeklyBriefingEnabled: true, weeklyBriefingDay: 1 },
  );

  jest.mocked(calendarRepository.list).mockResolvedValue([
    briefingEvent({
      id: 'standup',
      title: 'Standup',
      allDayStartDate: null,
      allDayEndDate: null,
      startAt: new Date('2026-10-19T02:00:00Z'),
      endAt: new Date('2026-10-19T03:00:00Z'),
      recurrence: ['RRULE:FREQ=DAILY;COUNT=3'],
    }),
  ]);
  await briefings.run('owner', new Date('2026-10-19T00:00:00Z'));
  const content = createDelivery.mock.calls[0]![0].content;
  expect(content.match(/Standup/g)).toHaveLength(3);
  expect(content).toContain('21 Oct 2026, 10:00–11:00');
});

test('weekly reminders exclude elapsed times and stop at the next week boundary', async () => {
  const { briefings, createDelivery, listReminders } = setup(
    'development',
    true,
    true,
    60,
    { weeklyBriefingEnabled: true, weeklyBriefingDay: 1 },
  );

  listReminders.mockResolvedValue([
    briefingReminder('Elapsed reminder', '2026-10-18T23:59:00Z'),
    briefingReminder('Today reminder', '2026-10-19T01:00:00Z'),
    briefingReminder('Future reminder', '2026-10-24T01:00:00Z'),
    briefingReminder('Outside reminder', '2026-10-25T16:00:00Z'),
  ]);
  await briefings.run('owner', new Date('2026-10-19T00:00:00Z'));
  const content = createDelivery.mock.calls[0]![0].content;
  expect(content).toContain('Today reminder');
  expect(content).toContain('Future reminder');
  expect(content).not.toContain('Elapsed reminder');
  expect(content).not.toContain('Outside reminder');
});

test('weekly reminders include recurring occurrences on all seven dates', async () => {
  const { briefings, createDelivery, listReminders } = setup(
    'development',
    true,
    true,
    60,
    { weeklyBriefingEnabled: true, weeklyBriefingDay: 1 },
  );

  listReminders.mockResolvedValue([
    {
      ...briefingReminder('Daily medicine', '2026-10-19T01:00:00Z'),
      recurrence: { frequency: 'daily', interval: 1 },
    },
  ]);
  await briefings.run('owner', new Date('2026-10-19T00:00:00Z'));
  const content = createDelivery.mock.calls[0]![0].content;
  expect(content.match(/Daily medicine/g)).toHaveLength(7);
  expect(content).toContain('At 25 Oct 2026, 09:00');
});

test('recurring reminders stop at their recurrence end date', async () => {
  const { briefings, createDelivery, listReminders } = setup(
    'development',
    true,
    true,
    60,
    { weeklyBriefingEnabled: true, weeklyBriefingDay: 1 },
  );

  listReminders.mockResolvedValue([
    {
      ...briefingReminder('Medicine course', '2026-10-19T01:00:00Z'),
      recurrence: {
        frequency: 'daily',
        interval: 1,
        endsAt: '2026-10-21T01:00:00Z',
      },
    },
  ]);
  await briefings.run('owner', new Date('2026-10-19T00:00:00Z'));
  const content = createDelivery.mock.calls[0]![0].content;
  expect(content.match(/Medicine course/g)).toHaveLength(3);
  expect(content).not.toContain('At 22 Oct');
});

test('omitted weekly items are reported in the persisted message and worker warning', async () => {
  const { briefings, createDelivery, listTasks } = setup(
    'development',
    true,
    true,
    60,
    { weeklyBriefingEnabled: true, weeklyBriefingDay: 1 },
  );

  listTasks
    .mockResolvedValueOnce([
      briefingTask('x'.repeat(5000), '2026-10-19T02:00:00Z'),
    ])
    .mockResolvedValueOnce([]);
  const warning = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);

  try {
    await briefings.run('owner', new Date('2026-10-19T00:00:00Z'));
    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('1 more item omitted'),
      }),
    );
    expect(warning).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'briefing_items_omitted',
        userId: 'owner',
        date: '2026-10-19',
        telegram: 1,
        whatsapp: 1,
      }),
    );
  } finally {
    warning.mockRestore();
  }
});

test.each([
  [30, '2026-10-09T02:30:00Z', '2026-10-09-30-20', '2026-10-09-30-21'],
  [60, '2026-10-09T03:00:00Z', '2026-10-09-60-10', '2026-10-09-60-11'],
  [120, '2026-10-09T04:00:00Z', '2026-10-09-120-5', '2026-10-09-120-6'],
  [180, '2026-10-09T04:00:00Z', '2026-10-09-180-3', '2026-10-09-180-4'],
])(
  'scheduled follow-ups use a fresh delivery key each %i minutes',
  async (interval, next, currentKey, nextKey) => {
    const { followUps, createDelivery, listTasks } = setup(
      'development',
      true,
      true,
      Number(interval),
    );

    listTasks.mockResolvedValue([
      {
        id: 'overdue',
        title: 'Pay invoice',
        description: null,
        status: 'inbox',
        priority: 'medium',
        dueAt: new Date('2026-10-08T02:00:00Z'),
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        categories: [],
        source: { type: 'dashboard', label: null, messageId: null },
      },
    ]);
    await followUps.run('owner', now);
    await followUps.run('owner', new Date('2026-10-09T02:05:00Z'));
    await followUps.run('owner', new Date(next));
    expect(
      createDelivery.mock.calls.map(([input]) => input.idempotencyKey),
    ).toEqual([
      `follow-up:${currentKey}`,
      `follow-up:${currentKey}`,
      `follow-up:${currentKey}`,
      `follow-up:${currentKey}`,
      `follow-up:${nextKey}`,
      `follow-up:${nextKey}`,
    ]);
  },
);
