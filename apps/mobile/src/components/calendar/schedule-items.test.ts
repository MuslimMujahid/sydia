import { describe, expect, test } from "bun:test";
import type { CalendarEvent } from "@/lib/services/api/calendar/calendar.api";
import type { Task } from "@/lib/services/api/tasks/tasks.api";
import {
  buildAgendaSections,
  buildScheduleItems,
  getItemDayKeys,
  groupItemsByDay,
  isAllDayOn,
  itemDayTimeLabel,
  itemRangeLabel,
  itemWhenLabel,
  mergeEventLists,
  type ScheduleItem,
} from "./schedule-items";

function calendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    provider: "local",
    providerEventId: null,
    title: "Rapat sekolah",
    description: null,
    location: null,
    startAt: "2026-11-19T01:00:00.000Z",
    endAt: "2026-11-19T02:00:00.000Z",
    timezone: "Asia/Makassar",
    allDayStartDate: null,
    allDayEndDate: null,
    recurrence: [],
    recurringParentProviderEventId: null,
    recurringParentEventId: null,
    recurrenceExceptionKey: null,
    originalStartAt: null,
    originalStartDate: null,
    attendees: [],
    status: "confirmed",
    syncState: "local",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function allDayEvent(): CalendarEvent {
  return calendarEvent({
    id: "event-all-day",
    title: "Libur sekolah",
    startAt: null,
    endAt: null,
    timezone: null,
    allDayStartDate: "2026-03-08T00:00:00.000Z",
    allDayEndDate: "2026-03-10T00:00:00.000Z",
  });
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Bayar listrik",
    description: null,
    status: "inbox",
    priority: "medium",
    dueAt: "2026-11-19T03:00:00.000Z",
    categories: [],
    source: null,
    completedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function eventItem(event: CalendarEvent): ScheduleItem {
  const [item] = buildScheduleItems([event], []);
  if (!item) throw new Error("Expected one schedule item.");

  return item;
}

describe("all-day calendar schedule items", () => {
  test("uses date-only bounds across time zones and excludes the end date", () => {
    const item = eventItem(allDayEvent());
    const timeZone = "America/Los_Angeles";

    expect(getItemDayKeys(item, timeZone)).toEqual([
      "2026-03-08",
      "2026-03-09",
    ]);
    expect(isAllDayOn(item, "2026-03-08", timeZone)).toBe(true);
    expect(isAllDayOn(item, "2026-03-09", timeZone)).toBe(true);
    expect(isAllDayOn(item, "2026-03-10", timeZone)).toBe(false);
  });

  test("shows the all-day label without requiring timed values", () => {
    expect(itemRangeLabel(eventItem(allDayEvent()), "Asia/Makassar")).toBe(
      "Sepanjang hari"
    );
  });

  test("labels the inclusive last day in the detail view", () => {
    expect(itemWhenLabel(eventItem(allDayEvent()), "Asia/Makassar")).toBe(
      "8 Mar – 9 Mar · Sepanjang hari"
    );
  });
});

describe("buildScheduleItems", () => {
  test("drops cancelled events and undated or cancelled tasks", () => {
    const items = buildScheduleItems(
      [calendarEvent(), calendarEvent({ id: "gone", status: "cancelled" })],
      [
        task(),
        task({ id: "undated", dueAt: null }),
        task({ id: "cancelled", status: "cancelled" }),
      ]
    );

    expect(items.map((item) => item.key)).toEqual([
      "event:event-1",
      "task:task-1",
    ]);
  });
});

describe("mergeEventLists", () => {
  test("keeps one copy of an event shared by two range queries", () => {
    const older = calendarEvent({ title: "Lama" });
    const newer = calendarEvent({
      title: "Baru",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });

    expect(
      mergeEventLists([[older], [newer]]).map((event) => event.title)
    ).toEqual(["Baru"]);
  });
});

describe("agenda sections", () => {
  const timeZone = "Asia/Makassar";

  test("lists busy days from the anchor and keeps an empty anchor day", () => {
    const items = buildScheduleItems(
      [
        calendarEvent({
          id: "before",
          startAt: "2026-11-17T01:00:00.000Z",
          endAt: "2026-11-17T02:00:00.000Z",
        }),
        calendarEvent({
          id: "later",
          startAt: "2026-11-21T01:00:00.000Z",
          endAt: "2026-11-21T02:00:00.000Z",
        }),
      ],
      []
    );
    const days = [
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
    ];
    const sections = buildAgendaSections(
      groupItemsByDay(items, days, timeZone),
      days,
      "2026-11-19",
      "2026-11-19"
    );

    expect(
      sections.map((section) => [section.key, section.data.length])
    ).toEqual([
      ["2026-11-19", 0],
      ["2026-11-21", 1],
    ]);
    expect(sections[0]?.isToday).toBe(true);
  });

  test("labels each day of an overnight event", () => {
    const item = eventItem(
      calendarEvent({
        startAt: "2026-11-19T14:00:00.000Z",
        endAt: "2026-11-19T18:00:00.000Z",
      })
    );

    // 22.00 on the 19th until 02.00 on the 20th in Makassar (UTC+8).
    expect(itemDayTimeLabel(item, "2026-11-19", timeZone)).toEqual({
      start: "22.00",
      end: null,
    });
    expect(itemDayTimeLabel(item, "2026-11-20", timeZone)).toEqual({
      start: "s.d.",
      end: "02.00",
    });
  });
});
