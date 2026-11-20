import { describe, expect, test } from "bun:test";
import {
  customRecurrence,
  describeRecurrence,
  initialCustomRepeat,
  presetRecurrence,
  recurrencePreset,
  type CustomRepeat,
} from "./event-recurrence";

const weekly: CustomRepeat = {
  frequency: "WEEKLY",
  interval: 2,
  days: ["MO", "FR"],
  end: "never",
  count: 10,
  until: "2026-10-30",
};

test("weekday preset repeats Monday through Friday", () => {
  expect(presetRecurrence("weekdays")).toEqual([
    "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  ]);
});

test("a custom series repeats on selected weekdays for a finite count", () => {
  expect(
    customRecurrence({ ...weekly, end: "count", count: 5 }, false)
  ).toEqual(["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=5"]);
});

test("a timed series ends at the end of the chosen day in Makassar", () => {
  expect(
    customRecurrence({ ...weekly, end: "date" }, false, "Asia/Makassar")
  ).toEqual([
    "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;UNTIL=20261030T155959Z",
  ]);
});

test("an all-day series uses a date-only repeat cutoff", () => {
  expect(customRecurrence({ ...weekly, end: "date" }, true)).toEqual([
    "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;UNTIL=20261030",
  ]);
});

test("imported complex recurrence is classified as custom without replacing it", () => {
  expect(
    recurrencePreset([
      "RRULE:FREQ=MONTHLY;BYDAY=2MO",
      "EXDATE:20261109T090000Z",
    ])
  ).toBe("custom");
});

test("custom weekday selection starts on the event's day", () => {
  expect(initialCustomRepeat([], "2026-10-12").days).toEqual(["MO"]);
});

test("a timed recurrence cutoff reopens on the chosen date in a negative UTC offset", () => {
  expect(
    initialCustomRepeat(
      ["RRULE:FREQ=WEEKLY;UNTIL=20261031T065959Z"],
      "2026-10-12",
      "America/Los_Angeles"
    ).until
  ).toBe("2026-10-30");
});

describe("describeRecurrence", () => {
  test("names presets with the editor's labels", () => {
    expect(describeRecurrence([])).toBe("Tidak berulang");
    expect(describeRecurrence(["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"])).toBe(
      "Setiap hari kerja (Senin–Jumat)"
    );
  });

  test("summarizes a custom weekly rule with a count", () => {
    expect(
      describeRecurrence(["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=5"])
    ).toBe("Setiap 2 minggu pada Sen, Jum · 5 kali");
  });

  test("shows a timed cutoff as the last day in the calendar zone", () => {
    expect(
      describeRecurrence(
        ["RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20261030T155959Z"],
        "Asia/Makassar"
      )
    ).toBe("Setiap hari · sampai 30 Okt 2026");
  });

  test("does not guess at rules it cannot express", () => {
    expect(describeRecurrence(["RRULE:FREQ=MONTHLY;BYDAY=2MO"])).toBe(
      "Berulang (aturan khusus)"
    );
  });
});
