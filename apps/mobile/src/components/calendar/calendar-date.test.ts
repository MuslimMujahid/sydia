import { describe, expect, test } from "bun:test";
import {
  addMonths,
  dayKeyInZone,
  daysBetween,
  getDayRange,
  getMonthGridDays,
  getMonthGridRange,
  isDayKey,
  minutesOfDayInZone,
  startOfWeek,
  WEEKDAY_SHORT_LABELS,
  zonedMidnightMs,
} from "./calendar-date";

describe("day keys", () => {
  test("validate real calendar days only", () => {
    expect(isDayKey("2026-02-28")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-2-1")).toBe(false);
  });

  test("clamp month steps to the shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  test("weeks start on Monday", () => {
    expect(startOfWeek("2026-11-19")).toBe("2026-11-16");
    expect(startOfWeek("2026-11-22")).toBe("2026-11-16");
  });

  test("count whole days between keys", () => {
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
  });
});

describe("time zones", () => {
  test("read the day and minute of an instant in the profile zone", () => {
    const instant = new Date("2026-11-19T16:30:00.000Z");

    expect(dayKeyInZone(instant, "Asia/Makassar")).toBe("2026-11-20");
    expect(minutesOfDayInZone(instant, "Asia/Makassar")).toBe(30);
  });

  test("find local midnight", () => {
    expect(
      new Date(zonedMidnightMs("2026-11-20", "Asia/Makassar")).toISOString()
    ).toBe("2026-11-19T16:00:00.000Z");
  });

  test("ranges cover whole local days", () => {
    expect(getDayRange("2026-11-19", "2026-11-20", "Asia/Jakarta")).toEqual({
      from: "2026-11-18T17:00:00.000Z",
      to: "2026-11-19T17:00:00.000Z",
    });
  });
});

describe("month grid", () => {
  test("covers whole Monday-first weeks", () => {
    const days = getMonthGridDays(2026, 11);

    expect(days[0]?.key).toBe("2026-10-26");
    expect(days.length % 7).toBe(0);
    expect(days.filter((day) => day.inMonth)).toHaveLength(30);
  });

  test("queries the visible grid", () => {
    expect(getMonthGridRange(2026, 11, "UTC")).toEqual({
      from: "2026-10-26T00:00:00.000Z",
      to: "2026-12-07T00:00:00.000Z",
    });
  });

  test("labels weekdays from Monday", () => {
    expect(WEEKDAY_SHORT_LABELS).toHaveLength(7);
    expect(WEEKDAY_SHORT_LABELS[0]).toBe("Sen");
  });
});
