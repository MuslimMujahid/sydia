import type { JSONSchema7 } from 'ai';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  IMemoryRepository,
  IReminderRepository,
  ITaskRepository,
  IUserRepository,
} from '../../../database/interfaces';
import type { TaskStatus } from '../../../database/entities';
import type { AssistantTool } from './tool-executor.service';
import { MemoryService } from '../../memories/memory.service';
import { ReminderSchedulerService } from '../../reminders/reminder-scheduler.service';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Argumen alat tidak valid.');

  return value as Record<string, unknown>;
}

function text(
  record: Record<string, unknown>,
  key: string,
  required = true,
): string | undefined {
  const value = record[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${key} wajib berupa teks.`);

  return value.trim();
}

function optionalDate(
  record: Record<string, unknown>,
  key: string,
): Date | null | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
    throw new Error(`${key} wajib berupa waktu ISO.`);

  return new Date(value);
}

function schema(
  properties: NonNullable<JSONSchema7['properties']>,
  required: string[] = [],
): JSONSchema7 {
  return { type: 'object', properties, required, additionalProperties: false };
}

const string = { type: 'string' } as const;
const nullableString: JSONSchema7 = { type: ['string', 'null'] };

export function createDomainTools(deps: {
  tasks: ITaskRepository;
  reminders: IReminderRepository;
  memories: IMemoryRepository;
  memoryService: MemoryService;
  scheduler: ReminderSchedulerService;
  users: IUserRepository;
}): AssistantTool[] {
  const createTask: AssistantTool = {
    definition: {
      name: 'create_task',
      label: 'Membuat tugas',
      description: 'Buat tugas baru. Gunakan dueAt ISO bila ada tenggat.',
      parameters: schema(
        {
          title: string,
          description: nullableString,
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          dueAt: nullableString,
          tags: { type: 'array', items: string },
        },
        ['title'],
      ),
    },
    parseArguments: (value) => object(value) as Prisma.InputJsonValue,
    execute: async ({ userId, sourceMessageId, arguments: raw }) => {
      const a = object(raw);
      const task = await deps.tasks.create(userId, {
        title: text(a, 'title')!,
        description: text(a, 'description', false) ?? null,
        priority:
          (a.priority as 'low' | 'medium' | 'high' | undefined) ?? 'medium',
        dueAt: optionalDate(a, 'dueAt') ?? null,
        tags: Array.isArray(a.tags)
          ? a.tags.filter((v): v is string => typeof v === 'string')
          : [],
        sourceType: 'chat',
        sourceMessageId,
      });

      return {
        objectType: 'task',
        object: task,
      };
    },
  };

  const updateTask: AssistantTool = {
    definition: {
      name: 'update_task',
      label: 'Memperbarui tugas',
      description:
        'Perbarui tugas yang ada, termasuk memindahkan status ke inbox, doing, done, atau cancelled. Gunakan id jika diketahui, atau query untuk merujuk tugas aktif terakhir/judul.',
      parameters: schema(
        {
          id: string,
          query: string,
          title: string,
          description: nullableString,
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          dueAt: nullableString,
          status: {
            type: 'string',
            enum: ['inbox', 'doing', 'done', 'cancelled'],
          },
        },
        [],
      ),
    },
    parseArguments: (value) => object(value) as Prisma.InputJsonValue,
    execute: async ({ userId, arguments: raw }) => {
      const a = object(raw);
      const current = await deps.tasks.findReference(
        userId,
        text(a, 'id', false),
        text(a, 'query', false),
      );

      if (!current) throw new Error('Tugas yang dimaksud tidak ditemukan.');
      const task = await deps.tasks.update(userId, current.id, {
        title: text(a, 'title', false),
        description:
          a.description === null ? null : text(a, 'description', false),
        priority: a.priority as 'low' | 'medium' | 'high' | undefined,
        dueAt: optionalDate(a, 'dueAt'),
        status: a.status as TaskStatus | undefined,
      });

      return {
        objectType: 'task',
        object: task,
      };
    },
  };

  const listTasks: AssistantTool = {
    definition: {
      name: 'list_tasks',
      label: 'Mencari tugas',
      description:
        'Cari atau tanyakan tugas pengguna. Status tersedia: inbox, doing, done, cancelled.',
      parameters: schema({
        query: string,
        status: {
          type: 'string',
          enum: ['inbox', 'doing', 'done', 'cancelled'],
        },
        due: { type: 'string', enum: ['today', 'upcoming', 'overdue', 'none'] },
      }),
    },
    parseArguments: (value) => object(value) as Prisma.InputJsonValue,
    execute: async ({ userId, arguments: raw }) => {
      const a = object(raw);
      const timezone = (await deps.users.findById(userId))?.timezone ?? 'UTC';
      const tasks = await deps.tasks.list(userId, {
        search: text(a, 'query', false),
        status: a.status as TaskStatus | undefined,
        due: a.due as 'today' | 'upcoming' | 'overdue' | 'none' | undefined,
        timezone,
      });

      return { tasks };
    },
  };

  const createReminder: AssistantTool = {
    definition: {
      name: 'create_reminder',
      label: 'Membuat pengingat',
      description:
        'Buat pengingat satu kali atau berulang. scheduledAt wajib ISO absolut.',
      parameters: schema(
        {
          title: string,
          notes: nullableString,
          scheduledAt: string,
          recurrence: {
            type: ['object', 'null'],
            properties: {
              frequency: {
                type: 'string',
                enum: ['daily', 'weekly', 'monthly', 'yearly'],
              },
              interval: { type: 'integer', minimum: 1 },
              daysOfWeek: {
                type: 'array',
                items: { type: 'integer', minimum: 0, maximum: 6 },
              },
              endsAt: nullableString,
            },
            required: ['frequency', 'interval'],
          },
        },
        ['title', 'scheduledAt'],
      ),
    },
    parseArguments: (value) => object(value) as Prisma.InputJsonValue,
    execute: async ({ userId, sourceMessageId, arguments: raw }) => {
      const a = object(raw);
      const scheduledAt = optionalDate(a, 'scheduledAt');
      if (!(scheduledAt instanceof Date))
        throw new Error('scheduledAt wajib diisi.');
      const reminder = await deps.reminders.create(userId, {
        title: text(a, 'title')!,
        notes: text(a, 'notes', false) ?? null,
        scheduledAt,
        timezone:
          (await deps.users.findById(userId))?.timezone ?? 'Asia/Jakarta',
        recurrence: (a.recurrence ?? null) as never,
        sourceType: 'chat',
        sourceMessageId,
      });

      await deps.scheduler.schedule(reminder);

      return {
        objectType: 'reminder',
        object: reminder,
      };
    },
  };

  const updateReminder: AssistantTool = {
    definition: {
      name: 'update_reminder',
      label: 'Memperbarui pengingat',
      description:
        'Perbarui, tunda, jadwalkan ulang, selesaikan, atau batalkan pengingat.',
      parameters: schema({
        id: string,
        query: string,
        title: string,
        notes: nullableString,
        scheduledAt: string,
        status: {
          type: 'string',
          enum: ['scheduled', 'completed', 'cancelled'],
        },
      }),
    },
    parseArguments: (value) => object(value) as Prisma.InputJsonValue,
    execute: async ({ userId, arguments: raw }) => {
      const a = object(raw);
      const current = await deps.reminders.findReference(
        userId,
        text(a, 'id', false),
        text(a, 'query', false),
      );

      if (!current) throw new Error('Pengingat yang dimaksud tidak ditemukan.');
      const parsedSchedule = optionalDate(a, 'scheduledAt');
      const reminder = await deps.reminders.update(userId, current.id, {
        title: text(a, 'title', false),
        notes: a.notes === null ? null : text(a, 'notes', false),
        scheduledAt:
          parsedSchedule instanceof Date ? parsedSchedule : undefined,
        status: a.status as 'scheduled' | 'completed' | 'cancelled' | undefined,
      });

      if (reminder) await deps.scheduler.schedule(reminder);

      return {
        objectType: 'reminder',
        object: reminder,
      };
    },
  };

  const createMemory: AssistantTool = {
    definition: {
      name: 'save_memory',
      label: 'Menyimpan memori',
      description:
        'Simpan fakta, preferensi, atau catatan jangka panjang pengguna.',
      parameters: schema({ content: string, category: nullableString }, [
        'content',
      ]),
    },
    parseArguments: (value) => object(value) as Prisma.InputJsonValue,
    execute: async ({ userId, sourceMessageId, arguments: raw }) => {
      const a = object(raw);
      const memory = await deps.memoryService.create(userId, {
        content: text(a, 'content')!,
        category: text(a, 'category', false) ?? null,
        sourceType: 'chat',
        sourceMessageId,
      });

      return { memory };
    },
  };

  const updateMemory: AssistantTool = {
    definition: {
      name: 'update_memory',
      label: 'Memperbarui memori',
      description:
        'Koreksi memori lama dengan membuat versi baru yang menggantikannya.',
      parameters: schema(
        {
          id: string,
          query: string,
          content: string,
          category: nullableString,
        },
        ['content'],
      ),
    },
    parseArguments: (value) => object(value) as Prisma.InputJsonValue,
    execute: async ({ userId, arguments: raw }) => {
      const a = object(raw);
      let id = text(a, 'id', false);

      if (!id) {
        const found = await deps.memoryService.search(
          userId,
          text(a, 'query', false) ?? text(a, 'content')!,
          1,
        );

        id = found[0]?.id;
      }

      if (!id) throw new Error('Memori yang dimaksud tidak ditemukan.');
      const memory = await deps.memoryService.update(userId, id, {
        content: text(a, 'content')!,
        category: text(a, 'category', false),
      });

      if (!memory) throw new Error('Memori yang dimaksud tidak ditemukan.');

      return { memory };
    },
  };

  const searchMemory: AssistantTool = {
    definition: {
      name: 'search_memory',
      label: 'Mencari memori',
      description: 'Cari memori tahan lama lintas sesi percakapan.',
      parameters: schema({ query: string }, ['query']),
    },
    parseArguments: (value) => object(value) as Prisma.InputJsonValue,
    execute: async ({ userId, arguments: raw }) => ({
      memories: await deps.memoryService.search(
        userId,
        text(object(raw), 'query')!,
        5,
      ),
    }),
  };

  return [
    createTask,
    updateTask,
    listTasks,
    createReminder,
    updateReminder,
    createMemory,
    updateMemory,
    searchMemory,
  ];
}
