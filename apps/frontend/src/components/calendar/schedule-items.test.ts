// @ts-expect-error Bun supplies this module to the test runner, not the browser app.
import { describe, expect, test } from "bun:test";
import type { CalendarEvent } from "../../lib/services/api/calendar/calendar.api";
import {
  buildScheduleItems,
  getItemDayKeys,
  isAllDayOn,
  itemRangeLabel,
  type ScheduleItem,
} from "./schedule-items";

function allDayEvent(): CalendarEvent {
  return {
    id: "event-all-day",
    provider: "local",
    providerEventId: null,
    title: "Release planning",
    description: null,
    location: null,
    startAt: null,
    endAt: null,
    timezone: null,
    allDayStartDate: "2026-03-08T00:00:00.000Z",
    allDayEndDate: "2026-03-10T00:00:00.000Z",
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
  };
}

function eventItem(): ScheduleItem {
  const [item] = buildScheduleItems([allDayEvent()], []);
  if (!item || item.kind !== "event")
    throw new Error("Expected one all-day calendar event.");

  return item;
}

describe("all-day calendar schedule items", () => {
  test("uses date-only bounds across time zones and excludes the end date", () => {
    const item = eventItem();
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
    expect(itemRangeLabel(eventItem(), "Asia/Makassar")).toBe("Sepanjang hari");
  });
});
