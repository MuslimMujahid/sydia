export type RecordColumnType =
  'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'choice';
export type RecordColumn = {
  id: string;
  name: string;
  type: RecordColumnType;
  unit?: string;
  options?: string[];
  required: false;
};
export type RecordCell =
  | { raw: string; status: 'typed'; value: string | boolean; timezone?: string }
  | { raw: string; status: 'mismatched' };
export type RecordRow = {
  id: string;
  position: number;
  cells: Record<string, RecordCell>;
  sources: Array<{ ref: string; version?: string; messageId?: string }>;
};
export type RecordStats = {
  rowCount: number;
  columnCount: number;
  mismatched: Record<string, number>;
  bounds: null | {
    lastRow: { id: string; position: number };
    lastColumn: { id: string; position: number };
  };
};
export type RecordTable = {
  noteId: string;
  description: string;
  columns: RecordColumn[];
  stats: RecordStats;
  nextPosition: number;
};
export type RecordSnapshot = {
  table: RecordTable;
  rows: RecordRow[];
  revision: number;
  title: string;
  parentId: string | null;
  updatedAt: Date;
  path: string;
};
