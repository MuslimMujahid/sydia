// @ts-expect-error Bun supplies this module to the test runner, not the browser app.
import { expect, test } from "bun:test";
import {
  customRecurrence,
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
