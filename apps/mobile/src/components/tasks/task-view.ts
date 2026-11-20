import type {
  Task,
  TaskDueFilter,
  TaskPriority,
  TaskStatus,
} from "@/lib/services/api/tasks/tasks.api";

/**
 * Task list rules ported from apps/frontend/src/components/tasks/task-view.ts.
 * Pure: no React Native imports, so `bun test` can cover it.
 */

export type TaskSortKey = "due" | "priority" | "newest" | "title";

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
};

export const PRIORITY_ORDER: TaskPriority[] = ["low", "medium", "high"];

/** Status names for the editor; "Inbox" reads as "Belum selesai" on a phone. */
export const STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Belum selesai",
  done: "Selesai",
  cancelled: "Batal",
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" && Object.keys(STATUS_LABELS).includes(value)
  );
}

export function isTaskSortKey(value: unknown): value is TaskSortKey {
  return typeof value === "string" && Object.keys(SORT_LABELS).includes(value);
}

export const TASK_SECTION_KEYS = [
  "scheduled",
  "unscheduled",
  "done",
  "cancelled",
] as const;

export type TaskSectionKey = (typeof TASK_SECTION_KEYS)[number];

export const TASK_SECTION_LABELS: Record<TaskSectionKey, string> = {
  scheduled: "Terjadwal",
  unscheduled: "Belum terjadwal",
  done: "Selesai",
  cancelled: "Batal",
};

/** Sections that start folded so open work stays in view. */
export const COLLAPSIBLE_SECTIONS: readonly TaskSectionKey[] = [
  "done",
  "cancelled",
];

export const DUE_FILTERS: (TaskDueFilter | "all")[] = [
  "all",
  "today",
  "upcoming",
  "overdue",
  "none",
];

/** Chip labels; "Semua" replaces the web's "Semua tenggat" to fit a chip. */
export const DUE_LABELS: Record<TaskDueFilter | "all", string> = {
  all: "Semua",
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
  done: 1,
  cancelled: 2,
};

const TITLE_COLLATOR = new Intl.Collator("id-ID", { sensitivity: "base" });

export type TaskSection = { key: TaskSectionKey; tasks: Task[] };

/** Group tasks by deadline and status, preserving input order and optimistic status. */
export function groupTasksBySection(
  tasks: Task[],
  statusOf: (task: Task) => TaskStatus = (task) => task.status
): TaskSection[] {
  const groups: Record<TaskSectionKey, Task[]> = {
    scheduled: [],
    unscheduled: [],
    done: [],
    cancelled: [],
  };

  for (const task of tasks) {
    const status = statusOf(task);
    const key =
      status === "inbox"
        ? task.dueAt === null
          ? "unscheduled"
          : "scheduled"
        : status;

    groups[key].push(task);
  }

  return TASK_SECTION_KEYS.flatMap((key) =>
    groups[key].length ? [{ key, tasks: groups[key] }] : []
  );
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

export function isTaskOverdue(
  task: Pick<Task, "dueAt" | "status">,
  now: Date
): boolean {
  if (!task.dueAt || task.status === "done" || task.status === "cancelled")
    return false;

  return timeOf(task.dueAt) < now.getTime();
}

/** At most this many categories per task (backend and web limit). */
export const MAX_TASK_CATEGORIES = 5;

/** At most this many categories per account. */
export const MAX_CATEGORIES = 25;
