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
 * Events and tasks share the calendar as "scheduled items", as on the web.
 * Events span a start and an end; tasks are a single due moment.
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

const DAY_MS = 86_400_000;

/** Label for a task saved without a time (due at the last minute of its day). */
export const NO_TIME_LABEL = "Tanpa jam";

/**
 * Whether a task has a due date but no time. The task editor saves those at
 * 23:59, so the last minute of the day stands for "no time".
 */
export function isTaskWithoutTime(
  item: ScheduleItem,
  timeZone: string
): boolean {
  return (
    item.kind === "task" &&
    minutesOfDayInZone(new Date(item.start), timeZone) === MINUTES_PER_DAY - 1
  );
}

function taskTimeLabel(item: ScheduleItem, timeZone: string): string {
  return isTaskWithoutTime(item, timeZone)
    ? NO_TIME_LABEL
    : formatTimeInZone(new Date(item.start).toISOString(), timeZone);
}

function toTime(value: string): number {
  return new Date(value).getTime();
}

/**
 * Events from several overlapping range queries, without duplicates. The
 * newest copy of an event wins.
 */
export function mergeEventLists(lists: CalendarEvent[][]): CalendarEvent[] {
  const byId = new Map<string, CalendarEvent>();

  for (const list of lists)
    for (const event of list) {
      const current = byId.get(event.id);
      if (!current || current.updatedAt <= event.updatedAt)
        byId.set(event.id, event);
    }

  return [...byId.values()];
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
    const startValue = event.allDayStartDate ?? event.startAt;
    const endValue = event.allDayEndDate ?? event.endAt;
    if (!startValue || !endValue) continue;
    const start = toTime(startValue);
    const end = toTime(endValue);
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

/** Day keys an item covers in the profile time zone. */
export function getItemDayKeys(item: ScheduleItem, timeZone: string): DayKey[] {
  if (
    item.kind === "event" &&
    item.event.allDayStartDate &&
    item.event.allDayEndDate
  ) {
    const firstKey = item.event.allDayStartDate.slice(0, 10);
    const endExclusive = item.event.allDayEndDate.slice(0, 10);
    const keys: DayKey[] = [];
    let key = firstKey;

    for (let guard = 0; guard < 370 && key < endExclusive; guard += 1) {
      keys.push(key);
      key = addDays(key, 1);
    }

    return keys;
  }

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
 * Whether an event fills the whole of a day, or runs for a day or more. Those
 * read "Sepanjang hari" on that day instead of a time range.
 */
export function isAllDayOn(
  item: ScheduleItem,
  dayKey: DayKey,
  timeZone: string
): boolean {
  if (item.kind !== "event") return false;

  if (item.event.allDayStartDate && item.event.allDayEndDate) {
    return (
      item.event.allDayStartDate.slice(0, 10) <= dayKey &&
      dayKey < item.event.allDayEndDate.slice(0, 10)
    );
  }

  if (item.end - item.start >= DAY_MS) return true;

  return (
    item.start <= zonedMidnightMs(dayKey, timeZone) &&
    item.end >= zonedMidnightMs(addDays(dayKey, 1), timeZone)
  );
}

/** The status a task shows, preferring an optimistic value being saved. */
export type TaskStatusOverride = { taskId: string; status: TaskStatus };

export function taskStatusOf(
  task: Task,
  override: TaskStatusOverride | undefined
): TaskStatus {
  return override?.taskId === task.id ? override.status : task.status;
}

/** "09.00–10.30" for events, "09.00" for tasks, in the profile time zone. */
export function itemTimeLabel(item: ScheduleItem, timeZone: string): string {
  if (item.kind === "task") return taskTimeLabel(item, timeZone);
  if (item.event.allDayStartDate && item.event.allDayEndDate)
    return "Sepanjang hari";
  if (!item.event.startAt || !item.event.endAt) return "";

  return `${formatTimeInZone(item.event.startAt, timeZone)}–${formatTimeInZone(
    item.event.endAt,
    timeZone
  )}`;
}

/** "09.00 – 10.30" for events, "10.00" for tasks. */
export function itemRangeLabel(item: ScheduleItem, timeZone: string): string {
  if (item.kind === "task") return taskTimeLabel(item, timeZone);
  if (item.event.allDayStartDate && item.event.allDayEndDate)
    return "Sepanjang hari";
  if (!item.event.startAt || !item.event.endAt) return "";

  return `${formatTimeInZone(item.event.startAt, timeZone)} – ${formatTimeInZone(
    item.event.endAt,
    timeZone
  )}`;
}

/**
 * The agenda row's time on one day: a multi-day event reads "Sepanjang hari"
 * on the days it fully covers, its start time on the first day, and "s.d."
 * its end time on the last day.
 */
export function itemDayTimeLabel(
  item: ScheduleItem,
  dayKey: DayKey,
  timeZone: string
): { start: string; end: string | null } {
  if (item.kind === "task")
    return { start: taskTimeLabel(item, timeZone), end: null };
  if (isAllDayOn(item, dayKey, timeZone))
    return { start: "Sepanjang hari", end: null };
  if (!item.event.startAt || !item.event.endAt)
    return { start: "Sepanjang hari", end: null };

  const startsToday = dayKeyInZone(new Date(item.start), timeZone) === dayKey;
  const endsToday =
    item.end > item.start &&
    dayKeyInZone(new Date(item.end - 1), timeZone) === dayKey;

  if (startsToday && endsToday)
    return {
      start: formatTimeInZone(item.event.startAt, timeZone),
      end: formatTimeInZone(item.event.endAt, timeZone),
    };
  if (startsToday)
    return { start: formatTimeInZone(item.event.startAt, timeZone), end: null };

  return {
    start: "s.d.",
    end: formatTimeInZone(item.event.endAt, timeZone),
  };
}

/**
 * When an item happens, for its detail view: "Rabu, 30 September · 10.00–
 * 11.00", "1 Okt – 2 Okt · Sepanjang hari", or "30 Sep, 23.00 – 1 Okt, 01.00".
 * All-day end dates are exclusive, so the last day shown is the one before.
 */
export function itemWhenLabel(item: ScheduleItem, timeZone: string): string {
  if (
    item.kind === "event" &&
    item.event.allDayStartDate &&
    item.event.allDayEndDate
  ) {
    const firstKey = item.event.allDayStartDate.slice(0, 10);
    const lastKey = addDays(item.event.allDayEndDate.slice(0, 10), -1);

    return firstKey >= lastKey
      ? `${formatDayKeyLabel(firstKey)} · Sepanjang hari`
      : `${formatShortDate(firstKey)} – ${formatShortDate(lastKey)} · Sepanjang hari`;
  }

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
  if (!item.event.startAt || !item.event.endAt)
    return itemTimeLabel(item, timeZone);

  return `${formatShortDate(startKey)}, ${formatTimeInZone(
    item.event.startAt,
    timeZone
  )} – ${formatShortDate(lastKey)}, ${formatTimeInZone(item.event.endAt, timeZone)}`;
}

/** The schedule item for a single event, as the detail view shows it. */
export function eventScheduleItem(event: CalendarEvent): ScheduleItem | null {
  return buildScheduleItems([{ ...event, status: "confirmed" }], [])[0] ?? null;
}

export type AgendaSection = {
  key: DayKey;
  isToday: boolean;
  /** The selected day always gets a section, even when it is empty. */
  isAnchor: boolean;
  data: ScheduleItem[];
};

/**
 * Day sections for the agenda: every busy day from the anchor onward, plus
 * the anchor itself so selecting an empty day still shows that day.
 */
export function buildAgendaSections(
  itemsByDay: Record<DayKey, ScheduleItem[]>,
  dayKeys: DayKey[],
  anchor: DayKey,
  todayKey: DayKey
): AgendaSection[] {
  return dayKeys
    .filter((key) => key >= anchor)
    .filter((key) => key === anchor || (itemsByDay[key]?.length ?? 0) > 0)
    .map((key) => ({
      key,
      isToday: key === todayKey,
      isAnchor: key === anchor,
      data: itemsByDay[key] ?? [],
    }));
}

/** Days that have at least one item, for the week strip and month dots. */
export function busyDayKinds(
  itemsByDay: Record<DayKey, ScheduleItem[]>
): Map<DayKey, Set<ScheduleItemKind>> {
  const busy = new Map<DayKey, Set<ScheduleItemKind>>();

  for (const [key, items] of Object.entries(itemsByDay)) {
    if (!items.length) continue;
    busy.set(key, new Set(items.map((item) => item.kind)));
  }

  return busy;
}
