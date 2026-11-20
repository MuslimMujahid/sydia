import { describe, expect, test } from "bun:test";
import type { CalendarEvent } from "@/lib/services/api/calendar/calendar.api";
import {
  eventDraftToWrite,
  initialEventDraft,
  moveAllDayStart,
  moveStart,
  parseAttendees,
  toggleAllDay,
  validateEventDraft,
} from "./event-draft";

const zone = "Asia/Makassar";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    provider: "local",
    providerEventId: null,
    title: "Rapat wali murid",
    description: "<p>Bawa <b>rapor</b></p>",
    location: "Aula",
    startAt: "2026-11-19T01:00:00.000Z",
    endAt: "2026-11-19T02:30:00.000Z",
    timezone: zone,
    allDayStartDate: null,
    allDayEndDate: null,
    recurrence: [],
    recurringParentProviderEventId: null,
    recurringParentEventId: null,
    recurrenceExceptionKey: null,
    originalStartAt: null,
    originalStartDate: null,
    attendees: ["guru@sekolah.id"],
    status: "confirmed",
    syncState: "local",
    reminderMinutes: 30,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("initialEventDraft", () => {
  test("a new event today starts at the next full hour for one hour", () => {
    const draft = initialEventDraft({
      timezone: zone,
      now: new Date("2026-11-19T02:20:00.000Z"),
    });

    expect([draft.startAt, draft.endAt]).toEqual([
      "2026-11-19T11:00",
      "2026-11-19T12:00",
    ]);
  });

  test("a new event on another day starts at 09.00", () => {
    const draft = initialEventDraft({
      timezone: zone,
      day: "2026-11-25",
      now: new Date("2026-11-19T02:20:00.000Z"),
    });

    expect(draft.startAt).toBe("2026-11-25T09:00");
  });

  test("an event opens in its calendar time zone with plain-text notes", () => {
    const draft = initialEventDraft({ event: event(), timezone: zone });

    expect(draft.startAt).toBe("2026-11-19T09:00");
    expect(draft.endAt).toBe("2026-11-19T10:30");
    expect(draft.notes).toBe("Bawa rapor");
    expect(draft.reminderMinutes).toBe(30);
  });

  test("an all-day event shows its inclusive last day", () => {
    const draft = initialEventDraft({
      event: event({
        startAt: null,
        endAt: null,
        allDayStartDate: "2026-12-24T00:00:00.000Z",
        allDayEndDate: "2026-12-27T00:00:00.000Z",
      }),
      timezone: zone,
    });

    expect([
      draft.isAllDay,
      draft.allDayStartDate,
      draft.allDayEndDate,
    ]).toEqual([true, "2026-12-24", "2026-12-26"]);
  });
});

test("moving the start keeps the event length", () => {
  const draft = initialEventDraft({ event: event(), timezone: zone });

  expect(moveStart(draft, "2026-11-20T23:00").endAt).toBe("2026-11-21T00:30");
});

test("moving an all-day start keeps the number of days", () => {
  const draft = {
    ...initialEventDraft({ timezone: zone, day: "2026-12-24" }),
    isAllDay: true,
    allDayEndDate: "2026-12-26",
  };

  expect(moveAllDayStart(draft, "2026-12-30").allDayEndDate).toBe("2027-01-01");
});

test("switching to all-day keeps the chosen day", () => {
  const draft = initialEventDraft({ timezone: zone, day: "2026-12-24" });

  expect(toggleAllDay(draft, true).allDayStartDate).toBe("2026-12-24");
});

test("attendees split on commas and spaces without duplicates", () => {
  expect(parseAttendees("a@x.id, b@x.id  a@x.id;c@x.id")).toEqual([
    "a@x.id",
    "b@x.id",
    "c@x.id",
  ]);
});

describe("validateEventDraft", () => {
  test("requires a title and an end after the start", () => {
    const draft = {
      ...initialEventDraft({ timezone: zone, day: "2026-11-25" }),
      title: "A",
      endAt: "2026-11-25T08:00",
    };

    expect(validateEventDraft(draft)).toEqual({
      title: "Masukkan judul minimal 2 karakter.",
      end: "Waktu selesai harus setelah waktu mulai.",
    });
  });

  test("rejects invalid attendee emails", () => {
    const draft = {
      ...initialEventDraft({ timezone: zone, day: "2026-11-25" }),
      title: "Arisan",
      attendees: "ibu@rumah",
    };

    expect(validateEventDraft(draft).attendees).toBe(
      "Masukkan alamat email peserta yang valid."
    );
  });
});

describe("eventDraftToWrite", () => {
  test("writes timed events in the calendar time zone", () => {
    const draft = {
      ...initialEventDraft({ timezone: zone, day: "2026-11-25" }),
      title: " Arisan ",
    };

    expect(eventDraftToWrite(draft, { timezone: zone })).toMatchObject({
      title: "Arisan",
      startAt: "2026-11-25T01:00:00.000Z",
      endAt: "2026-11-25T02:00:00.000Z",
      timezone: zone,
      description: null,
      location: null,
      attendees: [],
      reminderMinutes: 10,
    });
  });

  test("all-day writes an exclusive end date", () => {
    const draft = {
      ...initialEventDraft({ timezone: zone, day: "2026-12-24" }),
      title: "Libur",
      isAllDay: true,
      allDayEndDate: "2026-12-26",
    };

    expect(eventDraftToWrite(draft, { timezone: zone })).toMatchObject({
      allDayStartDate: "2026-12-24",
      allDayEndDate: "2026-12-27",
    });
  });

  test("keeps stored HTML notes unless they were edited", () => {
    const original = "<p>Bawa <b>rapor</b></p>";
    const draft = initialEventDraft({ event: event(), timezone: zone });

    expect(
      eventDraftToWrite(draft, {
        timezone: zone,
        originalDescription: original,
      }).description
    ).toBe(original);
    expect(
      eventDraftToWrite(
        { ...draft, notes: "Bawa rapor\nDan KTP", notesTouched: true },
        { timezone: zone, originalDescription: original }
      ).description
    ).toBe("<p>Bawa rapor</p><p>Dan KTP</p>");
  });
});

test("switching a multi-day all-day event to timed keeps the last day", () => {
  const record = event({
    startAt: null,
    endAt: null,
    allDayStartDate: "2026-12-24",
    allDayEndDate: "2026-12-27",
  });
  const draft = initialEventDraft({ event: record, timezone: zone });

  expect(toggleAllDay(draft, false).endAt).toBe("2026-12-26T10:00");
});

test("saving another field leaves the original event description byte for byte", () => {
  const description = " <p>Bawa <b>rapor</b></p>\n";
  const draft = initialEventDraft({
    event: event({ description }),
    timezone: zone,
  });

  expect(
    eventDraftToWrite(draft, {
      timezone: zone,
      originalDescription: description,
    }).description
  ).toBe(description);
});

test("an update can leave the existing reminder configuration out of the payload", () => {
  const draft = initialEventDraft({ event: event(), timezone: zone });

  expect(
    eventDraftToWrite(draft, { timezone: zone, includeReminder: false })
  ).not.toHaveProperty("reminderMinutes");
});

test("writes rich notes from the HTML editor without flattening formatting", () => {
  const draft = initialEventDraft({ event: event(), timezone: zone });
  const html =
    '<p><strong>Bawa rapor</strong> dan <a href="https://example.test/">lihat petunjuk</a></p>';
  const edited = {
    ...draft,
    notes: "Bawa rapor dan lihat petunjuk",
    notesTouched: true,
    notesHtml: html,
  };

  expect(eventDraftToWrite(edited, { timezone: zone }).description).toBe(html);
});
