import { describe, expect, test } from "bun:test";
import {
  addDays,
  dayKeyInZone,
  dayRangeInZone,
  formatConversationDay,
  zonedTimeToInstant,
} from "./date-time";

describe("dayKeyInZone", () => {
  test("uses the profile time zone, not UTC", () => {
    // 23:30 UTC on 1 March is already 2 March in Jakarta (UTC+7).
    expect(dayKeyInZone("2026-03-01T23:30:00Z", "Asia/Jakarta")).toBe(
      "2026-03-02"
    );
    expect(dayKeyInZone("2026-03-01T23:30:00Z", "UTC")).toBe("2026-03-01");
  });
});

describe("zonedTimeToInstant", () => {
  test("converts a Jakarta wall time to the matching instant", () => {
    const instant = zonedTimeToInstant(
      { year: 2026, month: 11, day: 19, hour: 9, minute: 30 },
      "Asia/Jakarta"
    );
    expect(instant.toISOString()).toBe("2026-11-19T02:30:00.000Z");
  });

  test("handles a zone with daylight saving time", () => {
    const instant = zonedTimeToInstant(
      { year: 2026, month: 7, day: 1, hour: 12, minute: 0 },
      "America/New_York"
    );
    expect(instant.toISOString()).toBe("2026-07-01T16:00:00.000Z");
  });
});

describe("dayRangeInZone", () => {
  test("covers whole local days", () => {
    expect(dayRangeInZone("2026-11-19", 1, "Asia/Makassar")).toEqual({
      from: "2026-11-18T16:00:00.000Z",
      to: "2026-11-19T16:00:00.000Z",
    });
  });
});

describe("addDays", () => {
  test("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("formatConversationDay", () => {
  const now = new Date("2026-11-19T05:00:00Z");

  test("labels today, yesterday, and recent days", () => {
    expect(
      formatConversationDay("2026-11-19T01:00:00Z", "Asia/Jakarta", "id", now)
    ).toBe("Hari ini");
    expect(
      formatConversationDay("2026-11-18T01:00:00Z", "Asia/Jakarta", "id", now)
    ).toBe("Kemarin");
    expect(
      formatConversationDay("2026-11-16T01:00:00Z", "Asia/Jakarta", "en", now)
    ).toBe("3 days ago");
  });
});
