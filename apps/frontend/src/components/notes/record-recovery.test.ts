// @ts-expect-error Bun supplies this module to the test runner, not the browser app.
import { test, expect } from "bun:test";
import type {
  RecordColumn,
  RecordRow,
} from "@/lib/services/api/record-notes/record-notes.api";
import { recordRecoveryText } from "./record-recovery";

const columns: RecordColumn[] = [
  { id: "item", name: "Barang", type: "text", required: false },
  { id: "quantity", name: "Jumlah", type: "number", required: false },
];

const rows: RecordRow[] = [
  {
    id: "book",
    position: 0,
    cells: {
      item: { raw: "Buku", status: "typed", value: "Buku" },
      quantity: { raw: "10", status: "typed", value: "10" },
    },
    sources: [],
  },
];

test("table recovery uses the local cell draft instead of the saved value", () => {
  const text = recordRecoveryText({
    title: "Persediaan",
    description: "Stok awal",
    columns,
    rows,
    rowCount: 20,
    drafts: [{ rowId: "book", columnId: "quantity", value: "12" }],
  });

  expect(text).toBe(
    "Persediaan\n\nStok awal\n\nBaris yang sedang dibuka (1 dari 20)\n\nBarang\tJumlah\n\nBuku\t12"
  );
});

test("table recovery retains the rows in an unfinished paste", () => {
  const text = recordRecoveryText({
    title: "Persediaan",
    description: "",
    columns,
    rows,
    rowCount: 1,
    drafts: [],
    change: {
      action: "paste_rows",
      updates: [{ id: "book", values: { quantity: "15" } }],
      additions: [{ values: { item: "Pensil", quantity: "7" } }],
    },
  });

  expect(text).toContain("Buku\t15\n\nPensil\t7");
});

test("table recovery preserves an explicitly cleared value", () => {
  const text = recordRecoveryText({
    title: "Persediaan",
    description: "",
    columns,
    rows,
    rowCount: 1,
    drafts: [{ rowId: "book", columnId: "quantity", value: null }],
  });

  expect(text).toEndWith("Buku\t");
});

test("table recovery retains values in a column whose removal is unfinished", () => {
  const text = recordRecoveryText({
    title: "Persediaan",
    description: "",
    columns,
    rows,
    rowCount: 1,
    drafts: [],
    change: { action: "schema", columns: [columns[0]!] },
  });

  expect(text).toEndWith("Barang\tJumlah\n\nBuku\t10");
});
