// @ts-expect-error Bun supplies this module to the test runner, not the browser app.
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

test("nonexistent daylight saving wall time is rejected", () => {
  expect(() => eventTimeToIso("2026-03-08T02:30", "America/New_York")).toThrow(
    "Waktu ini tidak tersedia"
  );
});
