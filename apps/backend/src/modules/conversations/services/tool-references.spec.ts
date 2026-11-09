import { describe, expect, jest, test } from '@jest/globals';
import type { Reminder, Task } from '../../../database/entities';
import type {
  ICategoryRepository,
  IReminderRepository,
  ITaskRepository,
  IUserRepository,
} from '../../../database/interfaces';
import type { MemoryAccessService } from '../../memories/memory-access.service';
import type { ReminderSchedulerService } from '../../reminders/reminder-scheduler.service';
import { createDomainTools } from './domain-tools';
import { toolErrorContent } from './tool-executor.service';
import {
  AmbiguousReferenceError,
  REFERENCE_CANDIDATE_LIMIT,
} from './tool-references';

function task(id: string, title: string, dueAt: Date | null = null): Task {
  return {
    id,
    title,
    description: null,
    status: 'inbox',
    priority: 'medium',
    dueAt,
    completedAt: null,
    categories: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    source: { type: 'chat', label: null, messageId: null },
  };
}

function reminder(
  id: string,
  title: string,
  overrides: Partial<Reminder> = {},
): Reminder {
  return {
    id,
    title,
    notes: null,
    scheduledAt: new Date('2026-09-12T12:00:00.000Z'),
    timezone: 'Asia/Jakarta',
    recurrence: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    source: { type: 'chat', label: null, messageId: null },
    ...overrides,
  };
}

function setup({
  tasks = [],
  reminders = [],
}: {
  tasks?: Task[];
  reminders?: Reminder[];
}) {
  const updateTask = jest
    .fn<ITaskRepository['update']>()
    .mockImplementation((_userId, id) =>
      Promise.resolve(tasks.find((item) => item.id === id) ?? null),
    );

  const updateReminder = jest
    .fn<IReminderRepository['update']>()
    .mockImplementation((_userId, id) =>
      Promise.resolve(reminders.find((item) => item.id === id) ?? null),
    );

  const deleteReminder = jest
    .fn<IReminderRepository['delete']>()
    .mockResolvedValue(true);

  const schedule = jest
    .fn<(reminder: Reminder) => Promise<void>>()
    .mockResolvedValue(undefined);

  const cancel = jest
    .fn<(id: string) => Promise<void>>()
    .mockResolvedValue(undefined);

  const tools = createDomainTools({
    tasks: {
      list: jest.fn<ITaskRepository['list']>().mockResolvedValue(tasks),
      findById: jest
        .fn<ITaskRepository['findById']>()
        .mockImplementation((_userId, id) =>
          Promise.resolve(tasks.find((item) => item.id === id) ?? null),
        ),
      update: updateTask,
    } as unknown as ITaskRepository,
    categories: {
      findByNames: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
    } as unknown as ICategoryRepository,
    reminders: {
      list: jest.fn<IReminderRepository['list']>().mockResolvedValue(reminders),
      findById: jest
        .fn<IReminderRepository['findById']>()
        .mockImplementation((_userId, id) =>
          Promise.resolve(reminders.find((item) => item.id === id) ?? null),
        ),
      update: updateReminder,
      delete: deleteReminder,
    } as unknown as IReminderRepository,
    memoryService: {} as MemoryAccessService,
    scheduler: { schedule, cancel } as unknown as ReminderSchedulerService,
    users: {
      findById: jest
        .fn<() => Promise<{ timezone: string }>>()
        .mockResolvedValue({ timezone: 'Asia/Jakarta' }),
    } as unknown as IUserRepository,
  });

  function execute(name: string, args: Record<string, string>) {
    const tool = tools.find((candidate) => candidate.definition.name === name);
    if (!tool) throw new Error(`Missing tool: ${name}`);

    return tool.execute({
      userId: 'user-1',
      sourceMessageId: 'message-1',
      idempotencyKey: `${name}-1`,
      arguments: args,
    });
  }

  return { execute, updateTask, updateReminder, deleteReminder, schedule };
}

describe('text references to tasks and reminders', () => {
  test('a task query matching two tasks changes neither and lists both with local due times', async () => {
    const { execute, updateTask } = setup({
      tasks: [
        task('task-1', 'Kirim invoice Acme', new Date('2026-09-15T10:00:00Z')),
        task('task-2', 'Kirim invoice Budi'),
      ],
    });

    await expect(
      execute('update_task', { query: 'invoice', status: 'done' }),
    ).rejects.toMatchObject({
      candidates: [
        { id: 'task-1', title: 'Kirim invoice Acme', when: '2026-09-15 17:00' },
        { id: 'task-2', title: 'Kirim invoice Budi', when: null },
      ],
    });
    expect(updateTask).not.toHaveBeenCalled();
  });

  test('a task whose whole title is the query wins over longer titles containing it', async () => {
    const { execute, updateTask } = setup({
      tasks: [
        task('task-1', 'Laporan bulanan'),
        task('task-2', 'Laporan'),
        task('task-3', 'Kirim laporan'),
      ],
    });

    await execute('update_task', { query: 'laporan', status: 'done' });

    expect(updateTask).toHaveBeenCalledWith(
      'user-1',
      'task-2',
      expect.objectContaining({ status: 'done' }),
    );
  });

  test('a task update without an id or query changes nothing', async () => {
    const { execute, updateTask } = setup({
      tasks: [task('task-1', 'Kirim invoice')],
    });

    await expect(execute('update_task', { status: 'done' })).rejects.toThrow(
      'id or query is required.',
    );
    expect(updateTask).not.toHaveBeenCalled();
  });

  test('a reminder query matching two reminders neither changes nor reschedules either', async () => {
    const { execute, updateReminder, schedule } = setup({
      reminders: [
        reminder('reminder-1', 'Minum obat pagi', {
          recurrence: { frequency: 'daily', interval: 1 },
        }),
        reminder('reminder-2', 'Minum obat malam'),
      ],
    });

    await expect(
      execute('update_reminder', { query: 'minum obat', title: 'Obat' }),
    ).rejects.toMatchObject({
      candidates: [
        {
          id: 'reminder-1',
          title: 'Minum obat pagi',
          when: '2026-09-12 19:00',
          recurring: true,
        },
        {
          id: 'reminder-2',
          title: 'Minum obat malam',
          when: '2026-09-12 19:00',
        },
      ],
    });
    expect(updateReminder).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  test('a reminder update without an id or query changes nothing', async () => {
    const { execute, updateReminder } = setup({
      reminders: [reminder('reminder-1', 'Chat teman')],
    });

    await expect(
      execute('update_reminder', { title: 'Telepon teman' }),
    ).rejects.toThrow('id or query is required.');
    expect(updateReminder).not.toHaveBeenCalled();
  });

  test('deleting by query picks the title match over a reminder that only mentions it in its notes', async () => {
    const { execute, deleteReminder } = setup({
      reminders: [
        reminder('reminder-1', 'Kontrol dokter'),
        reminder('reminder-2', 'Ambil hasil lab', {
          notes: 'Bawa surat dokter',
        }),
      ],
    });

    await expect(
      execute('delete_reminder', { query: 'dokter' }),
    ).resolves.toEqual({
      deleted: true,
      reminderId: 'reminder-1',
      title: 'Kontrol dokter',
    });
    expect(deleteReminder).toHaveBeenCalledTimes(1);
  });

  test('the model receives every candidate even when they exceed the error message limit', () => {
    const titles = ['a', 'b', 'c', 'd'].map(
      (suffix) => `Rapat koordinasi proyek pembangunan gedung ${suffix}`,
    );

    const error = new AmbiguousReferenceError(
      'task',
      'rapat',
      titles.map((title, index) => ({
        id: `task-${index}`,
        title,
        when: null,
      })),
    );

    expect(JSON.parse(toolErrorContent(error))).toEqual({
      error: 'ambiguous_reference',
      message: expect.stringContaining('Several tasks match "rapat"'),
      candidates: titles.map((title, index) => ({
        id: `task-${index}`,
        title,
        when: null,
      })),
    });
  });

  test('candidates beyond the limit are counted rather than listed', () => {
    const error = new AmbiguousReferenceError(
      'reminder',
      'rapat',
      Array.from({ length: REFERENCE_CANDIDATE_LIMIT + 2 }, (_, index) => ({
        id: `reminder-${index}`,
        title: 'Rapat',
        when: null,
      })),
    );

    const content = JSON.parse(toolErrorContent(error)) as {
      candidates: unknown[];
      omitted: number;
    };

    expect(content.candidates).toHaveLength(REFERENCE_CANDIDATE_LIMIT);
    expect(content.omitted).toBe(2);
  });
});
