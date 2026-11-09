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

type TableSpec = {
  id: string;
  title: string;
  description: string;
  columns: FixtureColumn[];
  rows: Array<Record<string, string>>;
  /** Stable row IDs, parallel to `rows`; defaults to `row-<position>`. */
  rowIds?: string[];
  revision?: number;
};

type TableFixture = {
  metadata: Record<string, unknown>;
  tools: Record<string, ToolScript>;
};

/**
 * One saved table answered by the real record-note read and query code, so a
 * filter the model writes selects exactly the rows production would select.
 * `fresh()` returns tools for a single run whose reads show the rows and
 * columns that run added, so a model that re-reads after writing sees its own
 * write.
 */
export function recordTable(
  table: TableSpec,
): TableFixture & { fresh: () => Record<string, ToolScript> } {
  return {
    ...tableTools(table),
    fresh: () => {
      const rows = [...table.rows];
      const rowIds = rows.map((_, index) => `row-${index + 1}`);
      let nextId = rows.length + 1;
      let columns = [...table.columns];
      let revision = table.revision ?? rows.length + 1;
      const current = () =>
        tableTools({ ...table, columns, rows, rowIds, revision });

      const delegate =
        (name: string) =>
        (args: Record<string, unknown>): unknown => {
          const script = current().tools[name];

          return typeof script === 'function'
            ? (script as (a: Record<string, unknown>) => unknown)(args)
            : script;
        };

      const committed = (changedIds: string[]) => {
        revision += 1;

        return {
          ...current().metadata,
          status: 'committed',
          saved: true,
          changedIds,
        };
      };

      const batchOf = (args: Record<string, unknown>) =>
        (args.batch ?? {}) as {
          rows?: Array<{ id?: string; values?: Record<string, unknown> }>;
          ids?: string[];
        };

      const missing = (ids: string[]) => {
        const unknown = ids.filter((id) => !rowIds.includes(id));

        return unknown.length
          ? new Error(`Row not found: ${unknown.join(', ')}.`)
          : null;
      };

      return {
        get_record_note_metadata: delegate('get_record_note_metadata'),
        read_record_note_content: delegate('read_record_note_content'),
        query_record_notes: delegate('query_record_notes'),
        add_record_rows: (args: Record<string, unknown>) => {
          const added = (batchOf(args).rows ?? []).map(({ values = {} }) =>
            Object.fromEntries(
              Object.entries(values).flatMap(([key, value]) =>
                value === null || value === undefined || value === ''
                  ? []
                  : [[key, cellText(value)]],
              ),
            ),
          );

          const ids = added.map(() => `row-${nextId++}`);

          rows.push(...added);
          rowIds.push(...ids);

          return committed(ids);
        },
        // Omitted values stay; null or an empty string clears the cell.
        update_record_rows: (args: Record<string, unknown>) => {
          const updates = batchOf(args).rows ?? [];
          const error = missing(updates.map(({ id }) => String(id)));
          if (error) return error;

          for (const { id, values = {} } of updates) {
            const index = rowIds.indexOf(String(id));
            const row = { ...rows[index] };

            for (const [key, value] of Object.entries(values))
              if (value === null || value === '') delete row[key];
              else if (value !== undefined) row[key] = cellText(value);
            rows[index] = row;
          }

          return committed(updates.map(({ id }) => String(id)));
        },
        delete_record_rows: (args: Record<string, unknown>) => {
          const ids = batchOf(args).ids ?? [];
          const error = missing(ids);
          if (error) return error;

          for (const id of ids) {
            const index = rowIds.indexOf(id);
            rows.splice(index, 1);
            rowIds.splice(index, 1);
          }

          return committed(ids);
        },
        // The full ordered schema replaces the columns, as in production.
        change_record_schema: (args: Record<string, unknown>) => {
          if (!Array.isArray(args.columns) || !args.columns.length)
            return new Error('columns must list the full schema.');
          columns = (args.columns as FixtureColumn[]).map(
            ({ id, name, type, unit, options }) => ({
              id,
              name,
              type,
              ...(unit ? { unit } : {}),
              ...(options ? { options } : {}),
            }),
          );

          return committed([]);
        },
      };
    },
  };
}

function cellText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function tableTools(table: TableSpec): TableFixture {
  const columns: RecordColumn[] = table.columns.map((column) => ({
    ...column,
    required: false,
  }));

  const rows: RecordRow[] = table.rows.map((values, index) => ({
    id: table.rowIds?.[index] ?? `row-${index + 1}`,
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
