import { expect, test } from "bun:test";
import { eventTimeInZone, eventTimeToIso } from "./event-time";

test("calendar wall time is saved in the calendar timezone", () => {
  expect(eventTimeToIso("2026-10-08T09:00", "Asia/Makassar")).toBe(
    "2026-10-08T01:00:00.000Z"
  );
});

test("editing displays the saved time in the calendar timezone", () => {
  expect(eventTimeInZone("2026-10-08T01:00:00.000Z", "Asia/Makassar")).toBe(
    "2026-10-08T09:00"
  );
});

test("midnight is written as hour 00, not 24", () => {
  expect(eventTimeInZone("2026-10-07T16:00:00.000Z", "Asia/Makassar")).toBe(
    "2026-10-08T00:00"
  );
});

test("nonexistent daylight saving wall time is rejected", () => {
  expect(() => eventTimeToIso("2026-03-08T02:30", "America/New_York")).toThrow(
    "Waktu ini tidak tersedia"
  );
});
