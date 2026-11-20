import { expect, test } from "bun:test";
import { occurrenceLookupRange, parseOccurrenceId } from "./event-occurrence";

test("parses a timed occurrence id from the read service", () => {
  expect(
    parseOccurrenceId(
      `occurrence:series-1:${encodeURIComponent("2026-11-19T01:00:00.000Z")}`
    )
  ).toEqual({
    seriesEventId: "series-1",
    occurrenceKey: "2026-11-19T01:00:00.000Z",
  });
});

test("parses an all-day occurrence id", () => {
  expect(parseOccurrenceId("occurrence:abc:2026-11-19")).toEqual({
    seriesEventId: "abc",
    occurrenceKey: "2026-11-19",
  });
});

test("rejects ids that are not occurrences", () => {
  expect(parseOccurrenceId("evt_123")).toBeNull();
  expect(parseOccurrenceId("occurrence:")).toBeNull();
  expect(parseOccurrenceId("occurrence:abc:%E0%A4%A")).toBeNull();
});

test("looks a few days around the occurrence key", () => {
  expect(occurrenceLookupRange("2026-11-19T22:30:00.000Z")).toEqual({
    from: "2026-11-16T00:00:00.000Z",
    to: "2026-11-23T00:00:00.000Z",
  });
  expect(occurrenceLookupRange("nonsense")).toBeNull();
});
