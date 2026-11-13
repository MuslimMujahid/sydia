import type {
  RecordChange,
  RecordColumn,
  RecordRow,
} from "@/lib/services/api/record-notes/record-notes.api";

interface RecordRecoveryInput {
  title: string;
  description: string;
  columns: RecordColumn[];
  rows: RecordRow[];
  rowCount: number;
  drafts: Array<{
    rowId: string;
    columnId: string;
    value: string | boolean | null;
  }>;
  change?: RecordChange;
}

/** Retain the loaded table page, with unsaved values taking precedence. Recovery
 * is a text note; the complete saved table can still be restored from Trash. */
export function recordRecoveryText(input: RecordRecoveryInput): string {
  const { change, drafts, rows } = input;
  const columns =
    change?.action === "schema"
      ? [
          ...change.columns,
          ...input.columns.filter(
            (column) => !change.columns.some((next) => next.id === column.id)
          ),
        ]
      : input.columns;

  const updates =
    change?.action === "update_rows"
      ? change.rows
      : change?.action === "paste_rows"
        ? change.updates
        : [];

  const additions =
    change?.action === "add_rows"
      ? change.rows
      : change?.action === "paste_rows"
        ? change.additions
        : [];

  const lines = rows.map((row) =>
    columns
      .map((column) => {
        const draft = drafts.find(
          (cell) => cell.rowId === row.id && cell.columnId === column.id
        );

        const update = updates.find((entry) => entry.id === row.id);
        const value = draft
          ? draft.value
          : update && column.id in update.values
            ? update.values[column.id]
            : row.cells[column.id]?.raw;

        return value === null || value === undefined ? "" : String(value);
      })
      .join("\t")
  );

  lines.push(
    ...additions.map((row) =>
      columns.map((column) => String(row.values[column.id] ?? "")).join("\t")
    )
  );

  return [
    input.title,
    input.description,
    `Baris yang sedang dibuka (${rows.length} dari ${input.rowCount})`,
    columns.map((column) => column.name).join("\t"),
    ...lines,
  ]
    .filter(Boolean)
    .join("\n\n");
}
