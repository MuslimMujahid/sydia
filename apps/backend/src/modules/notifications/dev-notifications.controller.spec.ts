import { CalendarReminderService } from '../calendar/calendar-reminder.service';
import type { ICalendarRepository } from '../../database/interfaces';
import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { validate } from 'class-validator';
import type { Task, User } from '../../database/entities';
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
        briefingTime: '08:00',
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

  const reminders = {
    list: jest.fn<IReminderRepository['list']>().mockResolvedValue([]),
  } as unknown as IReminderRepository;

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
