import { expect, test } from "bun:test";
import type {
  RecordColumn,
  RecordRow,
} from "@/lib/services/api/record-notes/record-notes.api";
import {
  parseRecordPaste,
  recordDraftValues,
  recordValuesForWrite,
} from "./record-model";

const columns: RecordColumn[] = [
  { id: "paid", name: "Lunas", type: "boolean", required: false },
  { id: "cost", name: "Biaya", type: "number", required: false },
];

test("opening a record row retains false values and unmatched raw text", () => {
  const row: RecordRow = {
    id: "row",
    position: 0,
    sources: [],
    cells: {
      paid: { status: "typed", value: false, raw: "false" },
      cost: { status: "mismatched", raw: "belum ditetapkan" },
    },
  };

  expect(recordDraftValues(row, columns)).toEqual({
    paid: false,
    cost: "belum ditetapkan",
  });
});

test("clearing a cell writes null and keeps non-empty text unchanged", () => {
  expect(recordValuesForWrite({ clear: "  ", keep: "  Some text " })).toEqual({
    clear: null,
    keep: "  Some text ",
  });
});

test("editing one cell leaves the other stored values untouched", () => {
  expect(
    recordValuesForWrite(
      { name: "New name", happened: "2026-11-19 20:00" },
      { name: "Old name", happened: "2026-11-19 20:00" }
    )
  ).toEqual({ name: "New name" });
});

test("pasting spreadsheet rows keeps empty cells aligned with their columns", () => {
  expect(parseRecordPaste("true\t12\r\nfalse\t\r\n", columns)).toEqual([
    { values: { paid: "true", cost: "12" } },
    { values: { paid: "false", cost: "" } },
  ]);
});

test("pasting rows wider than the table rejects the entire batch", () => {
  expect(() => parseRecordPaste("true\t12\textra", columns)).toThrow(
    "Jumlah kolom data melebihi kolom tabel."
  );
});
