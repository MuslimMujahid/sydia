import type {
  RecordColumn,
  RecordRow,
  RecordSnapshot,
} from '../../src/database/entities';
import {
  pageSchema,
  parseRecord,
  querySchema,
} from '../../src/modules/record-notes';
import { interpretCell } from '../../src/modules/record-notes/record-contract';
import { executeRecordQuery } from '../../src/modules/record-notes/record-query';
import type { ToolScript } from './harness';

export type FixtureColumn = Omit<RecordColumn, 'type' | 'required'> & {
  type: RecordColumn['type'];
  required?: false;
};

/**
 * One saved table answered by the real record-note read and query code, so a
 * filter the model writes selects exactly the rows production would select.
 */
export function recordTable(table: {
  id: string;
  title: string;
  description: string;
  columns: FixtureColumn[];
  rows: Array<Record<string, string>>;
  revision?: number;
}): {
  metadata: Record<string, unknown>;
  tools: Record<string, ToolScript>;
} {
  const columns: RecordColumn[] = table.columns.map((column) => ({
    ...column,
    required: false,
  }));

  const rows: RecordRow[] = table.rows.map((values, index) => ({
    id: `row-${index + 1}`,
    position: index + 1,
    cells: Object.fromEntries(
      columns.flatMap((column) => {
        const raw = values[column.id];

        return raw === undefined
          ? []
          : [[column.id, interpretCell(column, raw)]];
      }),
    ),
    sources: [],
  }));

  const revision = table.revision ?? rows.length + 1;
  const snapshot: RecordSnapshot = {
    table: {
      noteId: table.id,
      description: table.description,
      columns,
      stats: {
        rowCount: rows.length,
        columnCount: columns.length,
        mismatched: {},
        bounds: rows.length
          ? {
              lastRow: { id: rows.at(-1)!.id, position: rows.length },
              lastColumn: {
                id: columns.at(-1)!.id,
                position: columns.length,
              },
            }
          : null,
      },
      nextPosition: rows.length + 1,
    },
    rows,
    revision,
    title: table.title,
    parentId: null,
    updatedAt: new Date(),
    path: table.title,
  };

  const metadata = {
    id: table.id,
    ref: `custom:${table.id}`,
    kind: 'note',
    format: 'record',
    title: table.title,
    path: table.title,
    parentId: null,
    description: table.description,
    columns,
    revision,
    updatedAt: snapshot.updatedAt.toISOString(),
    ...snapshot.table.stats,
  };

  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  const decode = (value: string): unknown =>
    JSON.parse(Buffer.from(value, 'base64url').toString());

  return {
    metadata,
    tools: {
      get_record_note_metadata: metadata,
      read_record_note_content: (args: Record<string, unknown>) => {
        const { id, ...raw } = args;
        void id;
        const page = parseRecord(pageSchema, raw);
        const shown = page.columns ?? columns.map((column) => column.id);
        const offset =
          page.navigation === 'last'
            ? Math.floor(Math.max(0, rows.length - 1) / page.limit) * page.limit
            : page.cursor
              ? (decode(page.cursor) as { offset: number }).offset
              : (page.offset ?? 0);

        const slice = rows.slice(offset, offset + page.limit).map((row) => ({
          ...row,
          cells: Object.fromEntries(
            shown.flatMap((column) =>
              row.cells[column] ? [[column, row.cells[column]]] : [],
            ),
          ),
        }));

        return {
          id: table.id,
          revision,
          columns: shown,
          rowCount: rows.length,
          columnCount: columns.length,
          bounds: snapshot.table.stats.bounds,
          rows: slice,
          page: {
            offset,
            limit: page.limit,
            from: slice.length ? offset + 1 : 0,
            to: offset + slice.length,
            first: encode({ offset: 0 }),
            last: encode({
              offset:
                Math.floor(Math.max(0, rows.length - 1) / page.limit) *
                page.limit,
            }),
            next:
              offset + slice.length < rows.length
                ? encode({ offset: offset + page.limit })
                : null,
            previous:
              offset > 0
                ? encode({ offset: Math.max(0, offset - page.limit) })
                : null,
          },
        };
      },
      query_record_notes: (args: Record<string, unknown>) =>
        executeRecordQuery(
          'eval-user',
          parseRecord(querySchema, args),
          [snapshot],
          { encode, decode, now: new Date() },
        ),
    },
  };
}
