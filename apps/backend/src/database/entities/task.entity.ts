import type { Task as PrismaTask } from '../../generated/prisma/client';
import type { Category } from './category.entity';

export const TASK_STATUSES = ['inbox', 'doing', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type Task = Pick<
  PrismaTask,
  | 'id'
  | 'title'
  | 'description'
  | 'dueAt'
  | 'completedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  status: TaskStatus;
  priority: TaskPriority;
  categories: Category[];
  source: {
    type: 'dashboard' | 'chat' | 'whatsapp';
    label: string | null;
    messageId: string | null;
  };
};

export type TaskWrite = {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: Date | null;
  categoryIds?: string[];
  sourceType?: 'dashboard' | 'chat' | 'whatsapp';
  sourceMessageId?: string | null;
};
