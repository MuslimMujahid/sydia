// @ts-expect-error Bun supplies this module to the test runner, not the browser app.
import { describe, expect, test } from "bun:test";
import type {
  CalendarEvent,
  CalendarEventWriteInput,
} from "@/lib/services/api/calendar/calendar.api";
import { changedEventValues } from "./calendar-event-write";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    provider: "local",
    providerEventId: null,
    title: "Series title",
    description: "Series description",
    location: "Room 1",
    startAt: "2026-10-11T09:00:00.000Z",
    endAt: "2026-10-11T10:00:00.000Z",
    timezone: "UTC",
    allDayStartDate: null,
    allDayEndDate: null,
    recurrence: [],
    recurringParentProviderEventId: null,
    recurringParentEventId: null,
    recurrenceExceptionKey: null,
    originalStartAt: null,
    originalStartDate: null,
    attendees: ["guest@example.com"],
    status: "confirmed",
    syncState: "local",
    createdAt: "2026-10-10T12:00:00.000Z",
    updatedAt: "2026-10-10T12:00:00.000Z",
    ...overrides,
  };
}

function timedValues(
  overrides: Partial<Extract<CalendarEventWriteInput, { startAt: string }>> = {}
): CalendarEventWriteInput {
  return {
    title: "Series title",
    description: "Series description",
    location: "Room 1",
    attendees: ["guest@example.com"],
    startAt: "2026-10-11T09:00:00.000Z",
    endAt: "2026-10-11T10:00:00.000Z",
    timezone: "UTC",
    ...overrides,
  };
}

describe("changedEventValues", () => {
  test("omits inherited fields unchanged in the event editor", () => {
    expect(changedEventValues(event(), timedValues())).toEqual({});
  });

  test("sends only the field changed on a local occurrence", () => {
    expect(
      changedEventValues(event(), timedValues({ title: "Occurrence title" }))
    ).toEqual({ title: "Occurrence title" });
  });

  test("keeps a changed schedule together as one temporal group", () => {
    expect(
      changedEventValues(
        event(),
        timedValues({
          startAt: "2026-10-11T11:00:00.000Z",
          endAt: "2026-10-11T12:00:00.000Z",
        })
      )
    ).toEqual({
      startAt: "2026-10-11T11:00:00.000Z",
      endAt: "2026-10-11T12:00:00.000Z",
      timezone: "UTC",
    });
  });
});

test("a changed repeat rule is included in an event update", () => {
  expect(
    changedEventValues(
      event(),
      timedValues({ recurrence: ["RRULE:FREQ=WEEKLY"] })
    )
  ).toEqual({ recurrence: ["RRULE:FREQ=WEEKLY"] });
});

test("removing a series repeat rule sends an empty recurrence", () => {
  expect(
    changedEventValues(
      event({ recurrence: ["RRULE:FREQ=DAILY"] }),
      timedValues({ recurrence: [] })
    )
  ).toEqual({ recurrence: [] });
});

test("an unchanged repeat rule is omitted from an update", () => {
  expect(
    changedEventValues(
      event({ recurrence: ["RRULE:FREQ=DAILY"] }),
      timedValues({ recurrence: ["RRULE:FREQ=DAILY"] })
    )
  ).toEqual({});
});

test("a Meet request is sent even when other event fields are unchanged", () => {
  expect(
    changedEventValues(event(), timedValues({ createGoogleMeet: true }))
  ).toEqual({ createGoogleMeet: true });
});

test("changing an event reminder sends only the selected lead time", () => {
  expect(
    changedEventValues(
      event({ reminderMinutes: 10 }),
      timedValues({ reminderMinutes: 30 })
    )
  ).toEqual({ reminderMinutes: 30 });
});

test("an unchanged event reminder is omitted from occurrence overrides", () => {
  expect(
    changedEventValues(
      event({ reminderMinutes: 15 }),
      timedValues({ reminderMinutes: 15 })
    )
  ).toEqual({});
});
