import type {
  CreateTaskInput,
  Task,
  TaskPriority,
  TaskStatus,
  UpdateTaskInput,
} from "@/lib/services/api/tasks/tasks.api";
import { buildDueAt, splitDueAt, type DueParts } from "./task-due";
import { MAX_TASK_CATEGORIES } from "./task-view";

export const TASK_TITLE_MAX = 240;
export const TASK_NOTES_MAX = 4000;

export type TaskFormValues = {
  title: string;
  description: string;
  due: DueParts | null;
  priority: TaskPriority;
  status: TaskStatus;
  categoryIds: string[];
};

/** Editor state for a task, or the defaults for a new one (like the web). */
export function taskFormValues(
  task: Task | undefined,
  timeZone: string,
  initialDueDate?: string
): TaskFormValues {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    due: task
      ? splitDueAt(task.dueAt, timeZone)
      : initialDueDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDueDate)
        ? { dayKey: initialDueDate, time: null }
        : null,
    priority: task?.priority ?? "medium",
    status: task?.status ?? "inbox",
    categoryIds: task?.categories.map((category) => category.id) ?? [],
  };
}

export type TaskFormErrors = Partial<
  Record<"title" | "description" | "categoryIds", string>
>;

export function validateTaskForm(values: TaskFormValues): TaskFormErrors {
  const errors: TaskFormErrors = {};
  if (!values.title.trim()) errors.title = "Masukkan judul tugas.";
  if (values.description.length > TASK_NOTES_MAX)
    errors.description = "Catatan maksimal 4.000 karakter.";
  if (values.categoryIds.length > MAX_TASK_CATEGORIES)
    errors.categoryIds = "Pilih maksimal 5 kategori.";

  return errors;
}

/** The request body, built the same way as the web editor's submit. */
export function buildTaskInput(
  values: TaskFormValues,
  timeZone: string
): CreateTaskInput {
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    priority: values.priority,
    dueAt: buildDueAt(values.due, timeZone),
    categoryIds: values.categoryIds,
  };
}

/** Only changed fields are sent so older drafts cannot overwrite unrelated updates. */
export function buildTaskUpdate(
  initial: TaskFormValues,
  current: TaskFormValues,
  timeZone: string
): UpdateTaskInput {
  const patch: UpdateTaskInput = {};
  const title = current.title.trim();
  const description = current.description.trim();
  if (title !== initial.title.trim()) patch.title = title;
  if (description !== initial.description.trim())
    patch.description = description || null;
  if (current.priority !== initial.priority) patch.priority = current.priority;
  if (current.status !== initial.status) patch.status = current.status;
  if (
    current.due?.dayKey !== initial.due?.dayKey ||
    current.due?.time !== initial.due?.time
  )
    patch.dueAt = buildDueAt(current.due, timeZone);
  if (
    current.categoryIds.length !== initial.categoryIds.length ||
    current.categoryIds.some((id) => !initial.categoryIds.includes(id))
  )
    patch.categoryIds = current.categoryIds;

  return patch;
}

export function isTaskFormDirty(
  initial: TaskFormValues,
  current: TaskFormValues
): boolean {
  const comparable = (values: TaskFormValues) =>
    JSON.stringify({
      ...values,
      title: values.title.trim(),
      description: values.description.trim(),
      categoryIds: [...values.categoryIds].sort(),
    });

  return comparable(initial) !== comparable(current);
}
