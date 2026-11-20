import { expect, test } from "bun:test";
import { agendaWindow, stepAgenda } from "./agenda-window";

test("day view fetches all seven local days visible in the week strip", () => {
  const window = agendaWindow("day", "2026-11-19", "Asia/Makassar");

  expect(window.range).toEqual({
    from: "2026-11-15T16:00:00.000Z",
    to: "2026-11-22T16:00:00.000Z",
  });
});

test("month view fetches adjacent months' days displayed by the calendar grid", () => {
  const window = agendaWindow("month", "2026-11-19", "UTC");

  expect(window.days[0]).toBe("2026-10-26");
});

test("year view includes leap day when the selected year is a leap year", () => {
  const window = agendaWindow("year", "2028-08-19", "UTC");

  expect(window.days).toContain("2028-02-29");
});

test("schedule navigation starts after the last day of the current 30-day agenda", () => {
  expect(stepAgenda("schedule", "2026-11-19", 1)).toBe("2026-12-19");
});
