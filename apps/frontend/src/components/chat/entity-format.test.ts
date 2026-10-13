import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatAllDayEventRange,
  formatEntityRecurrence,
} from "./entity-format";

it("describes a weekly reminder with its weekdays in English", () => {
  assert.equal(
    formatEntityRecurrence(
      { frequency: "weekly", interval: 1, daysOfWeek: [2, 4] },
      "en"
    ),
    "Every week on Tuesday, Thursday"
  );
});
it("preserves Indonesian recurrence copy", () => {
  assert.equal(
    formatEntityRecurrence(
      { frequency: "weekly", interval: 1, daysOfWeek: [2, 4] },
      "id"
    ),
    "Berulang mingguan pada Selasa, Kamis"
  );
});

describe("formatAllDayEventRange", () => {
  it("displays the inclusive final day of a multi-day event", () => {
    assert.equal(
      formatAllDayEventRange(
        "2026-10-20T00:00:00.000Z",
        "2026-10-23T00:00:00.000Z",
        "id"
      ),
      "20 Okt 2026 – 22 Okt 2026 · Sepanjang hari"
    );
  });

  it("displays a single all-day date once", () => {
    assert.equal(
      formatAllDayEventRange("2026-10-20", "2026-10-21", "id"),
      "20 Okt 2026 · Sepanjang hari"
    );
  });

  it("uses the selected locale for an English date range", () => {
    assert.equal(
      formatAllDayEventRange("2026-10-20", "2026-10-23", "en"),
      "Oct 20, 2026 – Oct 22, 2026 · All day"
    );
  });
});
