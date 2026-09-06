import type { Task, TaskStatus, TaskWrite } from '../entities';

export type TaskFilters = {
  status?: TaskStatus | TaskStatus[];
  due?: 'today' | 'upcoming' | 'overdue' | 'none';
  search?: string;
  now?: Date;
  timezone?: string;
};

export interface ITaskRepository {
  list(userId: string, filters?: TaskFilters): Promise<Task[]>;
  findById(userId: string, id: string): Promise<Task | null>;
  findReference(
    userId: string,
    id?: string,
    query?: string,
  ): Promise<Task | null>;
  create(userId: string, input: TaskWrite): Promise<Task>;
  update(
    userId: string,
    id: string,
    input: Partial<TaskWrite>,
  ): Promise<Task | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

export const TASK_REPOSITORY = Symbol('ITaskRepository');
