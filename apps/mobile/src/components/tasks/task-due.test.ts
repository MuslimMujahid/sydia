import { describe, expect, test } from "bun:test";
import {
  END_OF_DAY_TIME,
  buildDueAt,
  formatTaskDue,
  splitDueAt,
} from "./task-due";

const JAKARTA = "Asia/Jakarta";

describe("splitDueAt", () => {
  test("reads the day and time in the profile time zone", () => {
    // 17:30 UTC is 00:30 the next day in Jakarta.
    expect(splitDueAt("2026-11-19T17:30:00.000Z", JAKARTA)).toEqual({
      dayKey: "2026-11-20",
      time: "00:30",
    });
  });

  test(`treats ${END_OF_DAY_TIME} as a task without a time`, () => {
    expect(splitDueAt("2026-11-19T16:59:00.000Z", JAKARTA)).toEqual({
      dayKey: "2026-11-19",
      time: null,
    });
  });

  test("returns null for a missing or unreadable date", () => {
    expect(splitDueAt(null, JAKARTA)).toBeNull();
    expect(splitDueAt("not a date", JAKARTA)).toBeNull();
  });
});

describe("buildDueAt", () => {
  test("saves a timed due date as that wall time", () => {
    expect(buildDueAt({ dayKey: "2026-11-20", time: "09:15" }, JAKARTA)).toBe(
      "2026-11-20T02:15:00.000Z"
    );
  });

  test("saves a day without a time at the end of that day", () => {
    expect(buildDueAt({ dayKey: "2026-11-20", time: null }, JAKARTA)).toBe(
      "2026-11-20T16:59:00.000Z"
    );
  });

  test("round-trips with splitDueAt", () => {
    const parts = { dayKey: "2026-12-31", time: "18:45" };
    expect(splitDueAt(buildDueAt(parts, JAKARTA), JAKARTA)).toEqual(parts);
  });

  test("clears the due date", () => {
    expect(buildDueAt(null, JAKARTA)).toBeNull();
  });
});

describe("formatTaskDue", () => {
  const now = new Date("2026-11-19T03:00:00.000Z"); // 10:00 in Jakarta

  test("shows only the day when the task has no time", () => {
    expect(formatTaskDue("2026-11-19T16:59:00.000Z", JAKARTA, now)).toBe(
      "Hari ini"
    );
    expect(formatTaskDue("2026-11-20T16:59:00.000Z", JAKARTA, now)).toBe(
      "Besok"
    );
  });

  test("adds the time when the task has one", () => {
    expect(formatTaskDue("2026-11-19T07:30:00.000Z", JAKARTA, now)).toBe(
      "Hari ini 14.30"
    );
  });
});
