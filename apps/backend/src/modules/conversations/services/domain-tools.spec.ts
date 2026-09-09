import { describe, expect, jest, test } from '@jest/globals';
import type {
  ICategoryRepository,
  IMemoryRepository,
  IReminderRepository,
  ITaskRepository,
  IUserRepository,
} from '../../../database/interfaces';
import type { MemoryService } from '../../memories/memory.service';
import type { ReminderSchedulerService } from '../../reminders/reminder-scheduler.service';
import { createDomainTools } from './domain-tools';

function resolved<T>(value: T) {
  return jest.fn<() => Promise<T>>().mockResolvedValue(value);
}

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
      notice: expect.stringContaining('bukan instruksi'),
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
});
