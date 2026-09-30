import type { CalendarEvent } from "@/lib/services/api/calendar/calendar.api";
import type { Task, TaskStatus } from "@/lib/services/api/tasks/tasks.api";
import {
  addDays,
  dayKeyInZone,
  formatDayKeyLabel,
  formatShortDate,
  formatTimeInZone,
  MINUTES_PER_DAY,
  minutesOfDayInZone,
  zonedMidnightMs,
  type DayKey,
} from "./calendar-date";

/**
 * Events and tasks share the calendar as "scheduled items". Events span a
 * start and an end; tasks are a single due moment, drawn as a short block.
 */
export type ScheduleItem =
  | {
      kind: "event";
      /** Unique across kinds, safe as a React key. */
      key: string;
      title: string;
      start: number;
      end: number;
      event: CalendarEvent;
    }
  | {
      kind: "task";
      key: string;
      title: string;
      start: number;
      end: number;
      task: Task;
    };

export type ScheduleItemKind = ScheduleItem["kind"];

/** How long a task looks in the time grid. */
export const TASK_DISPLAY_MINUTES = 30;

const DAY_MS = 86_400_000;

function toTime(value: string): number {
  return new Date(value).getTime();
}

/**
 * Merge events and dated tasks into one list sorted by start time. Cancelled
 * events and tasks, and tasks without a due date, are not scheduled.
 */
export function buildScheduleItems(
  events: CalendarEvent[],
  tasks: Task[]
): ScheduleItem[] {
  const items: ScheduleItem[] = [];

  for (const event of events) {
    if (event.status === "cancelled") continue;
    const start = toTime(event.startAt);
    const end = toTime(event.endAt);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    items.push({
      kind: "event",
      key: `event:${event.id}`,
      title: event.title,
      start,
      end: Math.max(end, start),
      event,
    });
  }

  for (const task of tasks) {
    if (!task.dueAt || task.status === "cancelled") continue;
    const start = toTime(task.dueAt);
    if (Number.isNaN(start)) continue;
    items.push({
      kind: "task",
      key: `task:${task.id}`,
      title: task.title,
      start,
      end: start,
      task,
    });
  }

  return items.sort(compareItems);
}

function compareItems(left: ScheduleItem, right: ScheduleItem): number {
  return (
    left.start - right.start ||
    // Events before tasks at the same moment, then longer events first.
    (left.kind === right.kind ? 0 : left.kind === "event" ? -1 : 1) ||
    right.end - left.end ||
    left.title.localeCompare(right.title, "id-ID")
  );
}

/** Day keys an item covers in the page time zone. */
export function getItemDayKeys(item: ScheduleItem, timeZone: string): DayKey[] {
  const firstKey = dayKeyInZone(new Date(item.start), timeZone);
  if (item.end <= item.start) return [firstKey];
  const lastKey = dayKeyInZone(new Date(item.end - 1), timeZone);
  const keys: DayKey[] = [];
  let key = firstKey;

  // The guard caps runaway ranges; the calendar never shows more than a year.
  for (let guard = 0; guard < 370; guard += 1) {
    keys.push(key);
    if (key >= lastKey) break;
    key = addDays(key, 1);
  }

  return keys;
}

/** Items per day for the given days, each day in start order. */
export function groupItemsByDay(
  items: ScheduleItem[],
  dayKeys: DayKey[],
  timeZone: string
): Record<DayKey, ScheduleItem[]> {
  const visible = new Set(dayKeys);
  const groups: Record<DayKey, ScheduleItem[]> = {};

  for (const item of items)
    for (const key of getItemDayKeys(item, timeZone)) {
      if (!visible.has(key)) continue;
      (groups[key] ??= []).push(item);
    }

  return groups;
}

/**
 * Whether an event fills the whole of a day, or runs for a day or more. These
 * sit in the all-day strip instead of the hourly grid.
 */
export function isAllDayOn(
  item: ScheduleItem,
  dayKey: DayKey,
  timeZone: string
): boolean {
  if (item.kind !== "event") return false;
  if (item.end - item.start >= DAY_MS) return true;

  return (
    item.start <= zonedMidnightMs(dayKey, timeZone) &&
    item.end >= zonedMidnightMs(addDays(dayKey, 1), timeZone)
  );
}

export type PositionedItem = {
  item: ScheduleItem;
  /** Minutes since midnight where the block starts on this day. */
  startMinute: number;
  /** Minutes since midnight where the block ends on this day. */
  endMinute: number;
  /** Column within its overlap cluster, from 0. */
  column: number;
  /** Columns in its overlap cluster. */
  columns: number;
};

/** The minimum height of any block, so short items stay legible. */
const MIN_BLOCK_MINUTES = 20;

/**
 * Lay out an day's timed items: each gets its clipped minutes on that day and
 * a column so overlapping items sit side by side.
 */
export function layoutTimedItems(
  items: ScheduleItem[],
  dayKey: DayKey,
  timeZone: string
): PositionedItem[] {
  const positioned = items.map((item) => {
    const startsToday = dayKeyInZone(new Date(item.start), timeZone) === dayKey;
    const startMinute = startsToday
      ? minutesOfDayInZone(new Date(item.start), timeZone)
      : 0;

    let endMinute: number;

    if (item.kind === "task") endMinute = startMinute + TASK_DISPLAY_MINUTES;
    else if (dayKeyInZone(new Date(item.end), timeZone) > dayKey)
      endMinute = MINUTES_PER_DAY;
    else endMinute = minutesOfDayInZone(new Date(item.end), timeZone);

    return {
      item,
      startMinute,
      endMinute: Math.min(
        MINUTES_PER_DAY,
        Math.max(endMinute, startMinute + MIN_BLOCK_MINUTES)
      ),
      column: 0,
      columns: 1,
    };
  });

  positioned.sort(
    (left, right) =>
      left.startMinute - right.startMinute ||
      right.endMinute - left.endMinute ||
      compareItems(left.item, right.item)
  );

  let cluster: PositionedItem[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    for (const entry of cluster) entry.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };

  for (const entry of positioned) {
    if (entry.startMinute >= clusterEnd) closeCluster();
    let column = columnEnds.findIndex((end) => end <= entry.startMinute);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(entry.endMinute);
    } else columnEnds[column] = entry.endMinute;
    entry.column = column;
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.endMinute);
  }

  closeCluster();

  return positioned;
}

/** The status a task shows, preferring an optimistic value being saved. */
export type TaskStatusOverride = { taskId: string; status: TaskStatus };

export function taskStatusOf(
  task: Task,
  override: TaskStatusOverride | undefined
): TaskStatus {
  return override?.taskId === task.id ? override.status : task.status;
}

/** "09.00–10.30" for events, "09.00" for tasks, in the page time zone. */
export function itemTimeLabel(item: ScheduleItem, timeZone: string): string {
  if (item.kind === "task")
    return formatTimeInZone(item.task.dueAt ?? "", timeZone);

  return `${formatTimeInZone(item.event.startAt, timeZone)}–${formatTimeInZone(
    item.event.endAt,
    timeZone
  )}`;
}

/**
 * When an item happens, for its detail popover: "Rabu, 30 September · 10.00–
 * 11.00", "1 Okt – 2 Okt · Sepanjang hari", or "30 Sep, 23.00 – 1 Okt, 01.00".
 */
export function itemWhenLabel(item: ScheduleItem, timeZone: string): string {
  const startKey = dayKeyInZone(new Date(item.start), timeZone);

  if (item.kind === "task")
    return `${formatDayKeyLabel(startKey)} · ${itemTimeLabel(item, timeZone)}`;

  const lastKey =
    item.end > item.start
      ? dayKeyInZone(new Date(item.end - 1), timeZone)
      : startKey;

  const allDay =
    item.end > item.start &&
    minutesOfDayInZone(new Date(item.start), timeZone) === 0 &&
    minutesOfDayInZone(new Date(item.end), timeZone) === 0;

  if (allDay)
    return startKey === lastKey
      ? `${formatDayKeyLabel(startKey)} · Sepanjang hari`
      : `${formatShortDate(startKey)} – ${formatShortDate(lastKey)} · Sepanjang hari`;

  if (startKey === lastKey)
    return `${formatDayKeyLabel(startKey)} · ${itemTimeLabel(item, timeZone)}`;

  return `${formatShortDate(startKey)}, ${formatTimeInZone(
    item.event.startAt,
    timeZone
  )} – ${formatShortDate(lastKey)}, ${formatTimeInZone(item.event.endAt, timeZone)}`;
}
