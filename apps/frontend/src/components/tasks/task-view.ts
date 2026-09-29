import {
  Ban,
  CheckCircle2,
  CircleDot,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import type {
  Task,
  TaskDueFilter,
  TaskPriority,
  TaskStatus,
} from "@/lib/services/api/tasks/tasks.api";

export const STATUS_ICONS: Record<TaskStatus, LucideIcon> = {
  inbox: Inbox,
  doing: CircleDot,
  done: CheckCircle2,
  cancelled: Ban,
};

export type TaskStatusFilter = TaskStatus | "all";
export type TaskSortKey = "due" | "priority" | "newest" | "title";

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Inbox",
  doing: "Dikerjakan",
  done: "Selesai",
  cancelled: "Dibatalkan",
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" && Object.keys(STATUS_LABELS).includes(value)
  );
}

export function isTaskSortKey(value: unknown): value is TaskSortKey {
  return typeof value === "string" && Object.keys(SORT_LABELS).includes(value);
}

export const STATUS_FILTER_LABELS: Record<TaskStatusFilter, string> = {
  all: "Semua",
  ...STATUS_LABELS,
};

export const STATUS_FILTERS: TaskStatusFilter[] = [
  "all",
  "inbox",
  "doing",
  "done",
  "cancelled",
];

export const DUE_LABELS: Record<TaskDueFilter | "all", string> = {
  all: "Semua tenggat",
  today: "Hari ini",
  upcoming: "Mendatang",
  overdue: "Terlambat",
  none: "Tanpa tenggat",
};

export const SORT_LABELS: Record<TaskSortKey, string> = {
  due: "Tenggat terdekat",
  priority: "Prioritas tertinggi",
  newest: "Terbaru dibuat",
  title: "Judul (A–Z)",
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// Open work stays on top; finished and cancelled tasks sink to the bottom.
const STATUS_RANK: Record<TaskStatus, number> = {
  inbox: 0,
  doing: 0,
  done: 1,
  cancelled: 2,
};

const TITLE_COLLATOR = new Intl.Collator("id-ID", { sensitivity: "base" });

export function countTasksByStatus(
  tasks: Task[]
): Record<TaskStatusFilter, number> {
  const counts: Record<TaskStatusFilter, number> = {
    all: tasks.length,
    inbox: 0,
    doing: 0,
    done: 0,
    cancelled: 0,
  };

  for (const task of tasks) counts[task.status] += 1;

  return counts;
}

export function filterTasksByStatus(
  tasks: Task[],
  status: TaskStatusFilter
): Task[] {
  return status === "all"
    ? tasks
    : tasks.filter((task) => task.status === status);
}

function timeOf(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();

  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function compareDue(a: Task, b: Task): number {
  const aTime = timeOf(a.dueAt);
  const bTime = timeOf(b.dueAt);
  if (aTime === bTime) return 0;

  return aTime < bTime ? -1 : 1;
}

function compareNewest(a: Task, b: Task): number {
  return timeOf(b.createdAt) - timeOf(a.createdAt);
}

const SORT_COMPARATORS: Record<TaskSortKey, (a: Task, b: Task) => number> = {
  due: (a, b) => compareDue(a, b) || compareNewest(a, b),
  priority: (a, b) =>
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    compareDue(a, b) ||
    compareNewest(a, b),
  newest: compareNewest,
  title: (a, b) => TITLE_COLLATOR.compare(a.title, b.title),
};

export function sortTasks(tasks: Task[], sort: TaskSortKey): Task[] {
  const compare = SORT_COMPARATORS[sort];

  return [...tasks].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || compare(a, b)
  );
}

export function isTaskOverdue(task: Task, now: Date): boolean {
  if (!task.dueAt || task.status === "done" || task.status === "cancelled") {
    return false;
  }

  return timeOf(task.dueAt) < now.getTime();
}
