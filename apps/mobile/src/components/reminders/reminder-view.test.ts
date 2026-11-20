import { describe, expect, test } from "bun:test";
import type { Reminder } from "@/lib/services/api/reminders/reminders.api";
import {
  buildReminderInput,
  buildReminderUpdate,
  groupRemindersByDay,
  isReminderFormDirty,
  reminderActionReason,
  reminderFormValues,
  repeatIntervalOptions,
  snoozePresets,
  timeActionFor,
  validateReminderForm,
} from "./reminder-view";

const JAKARTA = "Asia/Jakarta";
const NOW = new Date("2026-11-19T03:00:00.000Z"); // 10:00 in Jakarta

function reminder(
  id: string,
  scheduledAt: string,
  extra: Partial<Reminder> = {}
): Reminder {
  return {
    id,
    title: id,
    notes: null,
    scheduledAt,
    recurrence: null,
    source: null,
    important: false,
    repeatIntervalMinutes: 5,
    snoozedFrom: null,
    latestOccurrence: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...extra,
  };
}

describe("groupRemindersByDay", () => {
  test("groups by the day in the profile zone and keeps the API order", () => {
    const sections = groupRemindersByDay(
      [
        reminder("a", "2026-11-19T05:00:00.000Z"),
        reminder("b", "2026-11-19T18:00:00.000Z"), // 01:00 on 20 Nov in Jakarta
        reminder("c", "2026-11-19T07:00:00.000Z"),
      ],
      JAKARTA,
      NOW
    );

    expect(
      sections.map((section) => [
        section.title,
        section.data.map((item) => item.id),
      ])
    ).toEqual([
      ["Hari ini", ["a", "c"]],
      ["Besok", ["b"]],
    ]);
  });
});

describe("buildReminderInput", () => {
  const base = {
    ...reminderFormValues(undefined, NOW),
    title: "  Bayar listrik ",
    notes: "  ",
    scheduledAt: new Date("2026-11-20T01:00:00.000Z"),
  };

  test("builds a one-time reminder like the web", () => {
    expect(buildReminderInput(base)).toEqual({
      title: "Bayar listrik",
      notes: null,
      scheduledAt: "2026-11-20T01:00:00.000Z",
      recurrence: null,
      important: false,
      repeatIntervalMinutes: 5,
    });
  });

  test("keeps sorted weekdays only for weekly reminders", () => {
    const weekly = buildReminderInput({
      ...base,
      frequency: "weekly",
      interval: 2,
      daysOfWeek: [5, 1, 5],
      endsAt: new Date("2026-12-31T00:00:00.000Z"),
    });
    expect(weekly.recurrence).toEqual({
      frequency: "weekly",
      interval: 2,
      daysOfWeek: [1, 5],
      endsAt: "2026-12-31T00:00:00.000Z",
    });

    const monthly = buildReminderInput({
      ...base,
      frequency: "monthly",
      daysOfWeek: [1],
    });
    expect(monthly.recurrence).toEqual({ frequency: "monthly", interval: 1 });
  });

  test("clamps the interval to the backend range", () => {
    expect(
      buildReminderInput({ ...base, frequency: "daily", interval: 0 })
        .recurrence?.interval
    ).toBe(1);
    expect(
      buildReminderInput({ ...base, frequency: "daily", interval: 500 })
        .recurrence?.interval
    ).toBe(100);
  });
});

describe("validateReminderForm", () => {
  test("requires a title and a time", () => {
    const errors = validateReminderForm({
      ...reminderFormValues(undefined, NOW),
      scheduledAt: null,
    });
    expect(errors).toEqual({
      title: "Masukkan judul pengingat.",
      scheduledAt: "Pilih waktu pengingat.",
    });
  });

  test("rejects a repeat end before the first reminder", () => {
    const errors = validateReminderForm({
      ...reminderFormValues(undefined, NOW),
      title: "Minum obat",
      frequency: "daily",
      scheduledAt: new Date("2026-11-20T01:00:00.000Z"),
      endsAt: new Date("2026-11-19T01:00:00.000Z"),
    });
    expect(errors.endsAt).toBe("Waktu berakhir harus setelah waktu pengingat.");
  });
});

describe("isReminderFormDirty", () => {
  test("ignores surrounding whitespace and weekday order", () => {
    const initial = reminderFormValues(
      reminder("a", "2026-11-20T01:00:00.000Z", {
        recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [1, 3] },
      }),
      NOW
    );
    expect(
      isReminderFormDirty(initial, {
        ...initial,
        title: " a ",
        daysOfWeek: [3, 1],
      })
    ).toBe(false);
    expect(isReminderFormDirty(initial, { ...initial, important: true })).toBe(
      true
    );
  });
});

test("offers the web's repeat choices plus a custom value from chat", () => {
  expect(repeatIntervalOptions(10).map((option) => option.value)).toEqual([
    5, 10, 15,
  ]);
  expect(repeatIntervalOptions(25).at(-1)).toEqual({
    value: 25,
    label: "25 menit (custom)",
  });
});

test("snoozes a fired reminder and reschedules one that has not fired", () => {
  expect(timeActionFor(reminder("new", "2026-11-20T01:00:00.000Z"))).toBe(
    "reschedule"
  );
  expect(
    timeActionFor(
      reminder("fired", "2026-11-20T01:00:00.000Z", {
        latestOccurrence: {
          id: "o1",
          occurrenceAt: "2026-11-19T01:00:00.000Z",
          status: "delivered",
          messagesSent: 1,
          lastSentAt: null,
          deliveredAt: null,
          acknowledgedAt: null,
        },
      })
    )
  ).toBe("snooze");
});

test("snooze presets count from now and include tomorrow morning", () => {
  const presets = snoozePresets(NOW, JAKARTA);
  expect(presets[0]?.at.toISOString()).toBe("2026-11-19T03:15:00.000Z");
  expect(presets.at(-1)?.at.toISOString()).toBe("2026-11-20T01:00:00.000Z");
});

test("reads the backend's action reason from an API error", () => {
  expect(
    reminderActionReason({ details: { reason: "needs_confirmation" } })
  ).toBe("needs_confirmation");
  expect(reminderActionReason(new Error("x"))).toBeNull();
  expect(reminderActionReason(null)).toBeNull();
});

test("editing the title leaves a reminder's existing schedule outside the update", () => {
  const initial = reminderFormValues(
    reminder("Tagihan", "2026-11-20T01:00:00.000Z", {
      recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [1, 3] },
    })
  );

  expect(
    buildReminderUpdate(initial, { ...initial, title: "Bayar tagihan" })
  ).toEqual({
    title: "Bayar tagihan",
  });
});
