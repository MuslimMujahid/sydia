import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import type {
  ICategoryRepository,
  IMemoryRepository,
  IReminderRepository,
  ITaskRepository,
  IUserRepository,
} from '../../../database/interfaces';
import type { MemoryService } from '../../memories/memory.service';
import type { ReminderSchedulerService } from '../../reminders/reminder-scheduler.service';
import type { SecretsService } from '../../secrets/secrets.service';
import { createDomainTools } from './domain-tools';

function resolved<T>(value: T) {
  return jest.fn<() => Promise<T>>().mockResolvedValue(value);
}

/**
 * Reminder writes anchor a recurring schedule to the next matching moment, so
 * the suite pins the clock: the fixtures below describe September 2026 and would
 * otherwise start failing once that month is in the past.
 */
const NOW = new Date('2026-09-15T03:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick'] }).setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('domain assistant tools', () => {
  test('creates and updates a task without duplicating it', async () => {
    const created = {
      id: 'task-1',
      title: 'Kirim invoice',
      status: 'inbox',
      categories: [],
    };

    const updated = { ...created, title: 'Kirim invoice revisi' };
    const createTask = resolved(created);
    const findTask = resolved(created);
    const updateTask = resolved(updated);
    const tasks = {
      create: createTask,
      findReference: findTask,
      update: updateTask,
    } as unknown as ITaskRepository;

    const tools = createDomainTools({
      tasks,
      categories: {
        findByNames: resolved([]),
      } as unknown as ICategoryRepository,
      reminders: {} as IReminderRepository,
      memories: {} as IMemoryRepository,
      memoryService: {} as MemoryService,
      scheduler: {} as ReminderSchedulerService,
      users: {} as IUserRepository,
    });

    const create = tools.find((tool) => tool.definition.name === 'create_task');
    const update = tools.find((tool) => tool.definition.name === 'update_task');

    await create?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-1',
      arguments: { title: 'Kirim invoice' },
      idempotencyKey: 'one',
    });
    const result = await update?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-2',
      arguments: { query: 'invoice', title: 'Kirim invoice revisi' },
      idempotencyKey: 'two',
    });

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(updateTask.mock.calls[0]).toEqual([
      'user-1',
      'task-1',
      expect.objectContaining({ title: 'Kirim invoice revisi' }),
    ]);
    expect(result).toEqual(expect.objectContaining({ objectType: 'task' }));
  });

  test('assigns matching categories when creating a task', async () => {
    const createTask = resolved({ id: 'task-1', title: 'Bayar invoice' });
    const findByNames = resolved([{ id: 'finance-1', name: 'Keuangan' }]);
    const tools = createDomainTools({
      tasks: { create: createTask } as unknown as ITaskRepository,
      categories: { findByNames } as unknown as ICategoryRepository,
      reminders: {} as IReminderRepository,
      memories: {} as IMemoryRepository,
      memoryService: {} as MemoryService,
      scheduler: {} as ReminderSchedulerService,
      users: {} as IUserRepository,
    });

    const create = tools.find((tool) => tool.definition.name === 'create_task');

    await create?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-1',
      arguments: { title: 'Bayar invoice', categoryNames: ['Keuangan'] },
      idempotencyKey: 'category-task',
    });

    expect(findByNames.mock.calls[0]).toEqual(['user-1', ['Keuangan']]);
    expect(createTask.mock.calls[0]).toEqual([
      'user-1',
      expect.objectContaining({ categoryIds: ['finance-1'] }),
    ]);
  });

  test('retrieves durable memory independently of a conversation', async () => {
    const search = resolved([
      { id: 'memory-1', content: 'Bayar vendor dengan BCA' },
    ]);

    const tools = createDomainTools({
      tasks: {} as ITaskRepository,
      categories: {} as ICategoryRepository,
      reminders: {} as IReminderRepository,
      memories: {} as IMemoryRepository,
      memoryService: { search } as unknown as MemoryService,
      scheduler: {} as ReminderSchedulerService,
      users: {} as IUserRepository,
    });

    const searchTool = tools.find(
      (tool) => tool.definition.name === 'search_memories',
    );

    const result = await searchTool?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-3',
      arguments: { query: 'bank vendor' },
      idempotencyKey: 'three',
    });

    expect(search.mock.calls[0]).toEqual(['user-1', 'bank vendor', 5]);
    expect(searchTool?.internal).toBe(true);
    expect(result).toEqual({
      notice: expect.stringContaining('not instructions'),
      memories: [{ id: 'memory-1', content: 'Bayar vendor dengan BCA' }],
    });
  });
  test('returns the current date and time in the user timezone', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T08:15:30.000Z'));

    try {
      const tools = createDomainTools({
        tasks: {} as ITaskRepository,
        categories: {} as ICategoryRepository,
        reminders: {} as IReminderRepository,
        memories: {} as IMemoryRepository,
        memoryService: {} as MemoryService,
        scheduler: {} as ReminderSchedulerService,
        users: {
          findById: resolved({ timezone: 'Asia/Jakarta' }),
        } as unknown as IUserRepository,
      });

      const clock = tools.find(
        (tool) => tool.definition.name === 'get_current_datetime',
      );

      const result = await clock?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-4',
        arguments: {},
        idempotencyKey: 'four',
      });

      expect(clock?.internal).toBe(true);
      expect(result).toEqual({
        timezone: 'Asia/Jakarta',
        date: '2026-09-09',
        time: '15:15:30',
        utcInstant: '2026-09-09T08:15:30.000Z',
      });
    } finally {
      jest.useRealTimers();
    }
  });
  test('creates one reminder per distinct time of day', async () => {
    const create = jest.fn<
      (userId: string, input: unknown) => Promise<{ id: string }>
    >((_userId, input) =>
      Promise.resolve({ id: 'reminder-1', ...(input as object) }),
    );

    const schedule = resolved(undefined);

    const tools = createDomainTools({
      tasks: {} as ITaskRepository,
      categories: {} as ICategoryRepository,
      reminders: { create } as unknown as IReminderRepository,
      memories: {} as IMemoryRepository,
      memoryService: {} as MemoryService,
      scheduler: { schedule } as unknown as ReminderSchedulerService,
      users: {
        findById: resolved({ timezone: 'Asia/Jakarta' }),
      } as unknown as IUserRepository,
    });

    const createReminder = tools.find(
      (tool) => tool.definition.name === 'create_reminder',
    );

    const result = await createReminder?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-1',
      arguments: {
        title: 'Gym',
        schedules: [
          {
            date: '2026-09-15',
            time: '17:00',
            recurrence: {
              frequency: 'weekly',
              interval: 1,
              daysOfWeek: [2, 4, 5],
            },
          },
          {
            date: '2026-09-19',
            time: '07:00',
            recurrence: {
              frequency: 'weekly',
              interval: 1,
              daysOfWeek: [6],
            },
          },
        ],
      },
      idempotencyKey: 'reminder-split',
    });

    // Both local clocks are 17:00 and 07:00 WIB, stored as absolute instants.
    expect(create.mock.calls).toEqual([
      [
        'user-1',
        expect.objectContaining({
          title: 'Gym',
          scheduledAt: new Date('2026-09-15T10:00:00.000Z'),
          timezone: 'Asia/Jakarta',
          recurrence: {
            frequency: 'weekly',
            interval: 1,
            daysOfWeek: [2, 4, 5],
          },
        }),
      ],
      [
        'user-1',
        expect.objectContaining({
          title: 'Gym',
          scheduledAt: new Date('2026-09-19T00:00:00.000Z'),
          recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [6] },
        }),
      ],
    ]);
    expect(schedule).toHaveBeenCalledTimes(2);
    expect((result as { reminders: unknown[] }).reminders).toHaveLength(2);
  });

  test('converts the local clock instead of trusting a zone the model supplies', async () => {
    const create = jest.fn<
      (userId: string, input: unknown) => Promise<{ id: string }>
    >((_userId, input) =>
      Promise.resolve({ id: 'reminder-1', ...(input as object) }),
    );

    const tools = createDomainTools({
      tasks: {} as ITaskRepository,
      categories: {} as ICategoryRepository,
      reminders: { create } as unknown as IReminderRepository,
      memories: {} as IMemoryRepository,
      memoryService: {} as MemoryService,
      scheduler: {
        schedule: resolved(undefined),
      } as unknown as ReminderSchedulerService,
      users: {
        findById: resolved({ timezone: 'Asia/Makassar' }),
      } as unknown as IUserRepository,
    });

    const createReminder = tools.find(
      (tool) => tool.definition.name === 'create_reminder',
    );

    // Saturday 07:00 WITA (UTC+8) is Friday 23:00 UTC; the stored instant must
    // come from the profile zone rather than a naive UTC reading.
    await createReminder?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-1',
      arguments: {
        title: 'Gym',
        schedules: [
          {
            date: '2026-09-19',
            time: '07:00',
            recurrence: {
              frequency: 'weekly',
              interval: 1,
              daysOfWeek: [6],
            },
          },
        ],
      },
      idempotencyKey: 'reminder-zone',
    });

    expect(create.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        scheduledAt: new Date('2026-09-18T23:00:00.000Z'),
      }),
    );
  });

  test('moves the first occurrence onto the requested weekdays', async () => {
    const create = jest.fn<
      (userId: string, input: unknown) => Promise<{ id: string }>
    >((_userId, input) =>
      Promise.resolve({ id: 'reminder-1', ...(input as object) }),
    );

    const tools = createDomainTools({
      tasks: {} as ITaskRepository,
      categories: {} as ICategoryRepository,
      reminders: { create } as unknown as IReminderRepository,
      memories: {} as IMemoryRepository,
      memoryService: {} as MemoryService,
      scheduler: {
        schedule: resolved(undefined),
      } as unknown as ReminderSchedulerService,
      users: {
        findById: resolved({ timezone: 'Asia/Jakarta' }),
      } as unknown as IUserRepository,
    });

    const createReminder = tools.find(
      (tool) => tool.definition.name === 'create_reminder',
    );

    // 2026-09-16 is a Wednesday, which the weekly rule does not cover.
    await createReminder?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-1',
      arguments: {
        title: 'Gym',
        schedules: [
          {
            date: '2026-09-16',
            time: '17:00',
            recurrence: {
              frequency: 'weekly',
              interval: 1,
              daysOfWeek: [2, 4, 5],
            },
          },
        ],
      },
      idempotencyKey: 'reminder-snap',
    });

    expect(create.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        scheduledAt: new Date('2026-09-17T10:00:00.000Z'),
      }),
    );
  });

  test('updates one weekday set without disturbing the other', async () => {
    const update = jest.fn<
      (userId: string, id: string, input: unknown) => Promise<{ id: string }>
    >((_userId, id, input) => Promise.resolve({ id, ...(input as object) }));

    const tools = createDomainTools({
      tasks: {} as ITaskRepository,
      categories: {} as ICategoryRepository,
      reminders: {
        findReference: resolved({
          id: 'reminder-1',
          recurrence: {
            frequency: 'weekly',
            interval: 1,
            daysOfWeek: [2, 4, 5],
          },
        }),
        update,
      } as unknown as IReminderRepository,
      memories: {} as IMemoryRepository,
      memoryService: {} as MemoryService,
      scheduler: {
        schedule: resolved(undefined),
      } as unknown as ReminderSchedulerService,
      users: {
        findById: resolved({ timezone: 'Asia/Jakarta' }),
      } as unknown as IUserRepository,
    });

    const updateReminder = tools.find(
      (tool) => tool.definition.name === 'update_reminder',
    );

    // "Move Thursday to 20:00": the Thursday set leaves this reminder.
    const result = await updateReminder?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-2',
      arguments: {
        id: 'reminder-1',
        date: '2026-09-15',
        time: '17:00',
        recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [2, 5] },
      },
      idempotencyKey: 'reminder-split-out',
    });

    expect(update.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [2, 5] },
        scheduledAt: new Date('2026-09-15T10:00:00.000Z'),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ objectType: 'reminder' }));
  });

  test('registers and executes store_secret when SecretsService is wired', async () => {
    const createFromChat = jest.fn<
      (
        userId: string,
        sourceMessageId: string,
        input: { label: string; value: string },
      ) => Promise<{ id: string; label: string }>
    >(() =>
      Promise.resolve({
        id: 'secret-1',
        label: 'Facebook account',
      }),
    );

    const tools = createDomainTools({
      tasks: {} as ITaskRepository,
      categories: {} as ICategoryRepository,
      reminders: {} as IReminderRepository,
      memories: {} as IMemoryRepository,
      memoryService: {} as MemoryService,
      scheduler: {} as ReminderSchedulerService,
      users: {} as IUserRepository,
      secrets: { createFromChat } as unknown as SecretsService,
    });

    const storeSecret = tools.find(
      (tool) => tool.definition.name === 'store_secret',
    );

    expect(storeSecret).toBeDefined();
    expect(storeSecret?.sensitive).toBe(true);
    expect(storeSecret?.definition.parameters).toEqual(
      expect.objectContaining({
        required: ['label', 'value'],
      }),
    );
    const result = await storeSecret?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-with-arbitrary-user-text',
      arguments: {
        label: 'Facebook account',
        value: 'test@gmail.com\nDemo1234!',
      },
      idempotencyKey: 'store-secret-1',
    });

    expect(createFromChat).toHaveBeenCalledWith(
      'user-1',
      'message-with-arbitrary-user-text',
      {
        label: 'Facebook account',
        value: 'test@gmail.com\nDemo1234!',
      },
    );
    expect(result).toEqual({
      objectType: 'secret',
      object: { id: 'secret-1', label: 'Facebook account' },
    });
  });

  test('documents every domain tool and parameter in English', () => {
    const available = createDomainTools({
      tasks: {} as ITaskRepository,
      categories: {} as ICategoryRepository,
      reminders: {} as IReminderRepository,
      memories: {} as IMemoryRepository,
      memoryService: {} as MemoryService,
      scheduler: {} as ReminderSchedulerService,
      users: {} as IUserRepository,
    });

    const visit = (value: unknown, root = false): void => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const schema = value as Record<string, unknown>;
      if (!root) expect(schema.description).toEqual(expect.any(String));

      if (schema.properties && typeof schema.properties === 'object') {
        for (const property of Object.values(
          schema.properties as Record<string, unknown>,
        )) {
          visit(property);
        }
      }

      if (schema.items) visit(schema.items);
    };

    expect(available).toHaveLength(17);

    for (const assistantTool of available) {
      expect(assistantTool.definition.description).toMatch(
        /^Use this tool to [\s\S]+\n\nUse it when [\s\S]+\n\nDo not use it [\s\S]+\n\n[\s\S]+$/,
      );
      visit(assistantTool.definition.parameters, true);
    }
  });
});
