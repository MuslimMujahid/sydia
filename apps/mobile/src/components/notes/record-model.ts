import type {
  RecordCell,
  RecordColumn,
  RecordRow,
} from "@/lib/services/api/record-notes/record-notes.api";

export const recordColumnTypes = [
  { type: "text", label: "Teks" },
  { type: "number", label: "Angka" },
  { type: "date", label: "Tanggal" },
  { type: "datetime", label: "Tanggal dan waktu" },
  { type: "boolean", label: "Ya atau tidak" },
  { type: "choice", label: "Pilihan" },
] as const;

export function columnTypeLabel(type: RecordColumn["type"]): string {
  return recordColumnTypes.find((entry) => entry.type === type)?.label ?? type;
}

export function recordCellText(cell: RecordCell | undefined): string {
  if (!cell) return "";
  if (cell.status === "typed" && typeof cell.value === "boolean")
    return cell.value ? "Ya" : "Tidak";

  return cell.raw;
}

export function recordDraftValues(
  row: RecordRow | null,
  columns: RecordColumn[]
): Record<string, string | boolean | null> {
  return Object.fromEntries(
    columns.map((column) => {
      const cell = row?.cells[column.id];
      if (!cell) return [column.id, null];
      const value =
        cell.status === "typed" && typeof cell.value === "boolean"
          ? cell.value
          : cell.raw;
      return [column.id, value];
    })
  );
}

export function recordValuesForWrite(
  values: Record<string, string | boolean | null>,
  previous?: Record<string, string | boolean | null>
) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([key, value]) => !previous || previous[key] !== value)
      .map(([key, value]) => [
        key,
        typeof value === "string" && !value.trim() ? null : value,
      ])
  );
}

/** Spreadsheet clipboard input uses tabs between cells and a line per row. */
export function parseRecordPaste(text: string, columns: RecordColumn[]) {
  if (!text.trim()) throw new Error("Tempel data tabel terlebih dahulu.");

  const lines = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  if (lines.length > 200)
    throw new Error("Tempel paling banyak 200 baris sekaligus.");

  return lines.map((line) => {
    const cells = line.split("\t");
    if (cells.length > columns.length)
      throw new Error("Jumlah kolom data melebihi kolom tabel.");
    return {
      values: Object.fromEntries(
        cells.map((value, index) => [columns[index]!.id, value])
      ),
    };
  });
}
