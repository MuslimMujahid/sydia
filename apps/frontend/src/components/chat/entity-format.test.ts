import assert from "node:assert/strict";
import { it } from "node:test";
import { formatEntityRecurrence } from "./entity-format";

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
