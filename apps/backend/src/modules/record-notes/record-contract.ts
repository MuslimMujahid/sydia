import { HttpStatus, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ApiException, ErrorCodes } from '../../shared/errors';
import type {
  RecordCell,
  RecordColumn,
  RecordRow,
  RecordStats,
} from '../../database/entities';

export function recordFailure(
  reason: string,
  message: string,
  status = HttpStatus.BAD_REQUEST,
): never {
  Logger.warn(`Record operation rejected: ${reason}`, 'RecordNotes');
  throw new ApiException({
    code:
      status === HttpStatus.CONFLICT
        ? ErrorCodes.CONFLICT
        : status === HttpStatus.NOT_FOUND
          ? ErrorCodes.NOT_FOUND
          : ErrorCodes.BAD_REQUEST,
    status,
    message,
    details: { reason },
  });
}

export function parseRecord<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    recordFailure(
      'VALIDATION',
      parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    );

  return parsed.data;
}

const id = z
  .string()
  .min(1)
  .max(160)
  .refine(
    (value) => !['__proto__', 'constructor', 'prototype'].includes(value),
    'Reserved identifier.',
  );

export const columnSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(160),
    type: z.enum(['text', 'number', 'date', 'datetime', 'boolean', 'choice']),
    unit: z.string().trim().min(1).max(40).optional(),
    options: z.array(z.string().min(1).max(160)).max(100).optional(),
    required: z.literal(false).default(false),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.unit && c.type !== 'number')
      ctx.addIssue({
        code: 'custom',
        message: 'Only numeric columns have units.',
      });
    if (
      c.type === 'choice' &&
      (!c.options?.length || new Set(c.options).size !== c.options.length)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Choice columns require unique options.',
      });
    if (c.type !== 'choice' && c.options)
      ctx.addIssue({
        code: 'custom',
        message: 'Only choice columns have options.',
      });
  });
export const columnsSchema = z
  .array(columnSchema)
  .max(64)
  .refine(
    (cs) => new Set(cs.map((c) => c.id)).size === cs.length,
    'Column IDs must be unique.',
  );
export const createRecordSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    parentId: id.nullable().default(null),
    description: z.string().max(4000).default(''),
    columns: columnsSchema,
    requestKey: id,
  })
  .strict();
const values = z.record(
  id,
  z.union([z.string().max(10000), z.boolean(), z.number().finite(), z.null()]),
);

const sources = z
  .array(
    z
      .object({
        ref: id,
        version: z.string().max(160).optional(),
        messageId: id.optional(),
      })
      .strict(),
  )
  .max(100);

export const changeSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('add_rows'),
      beforeId: id.optional(),
      afterId: id.optional(),
      rows: z
        .array(z.object({ values, sources: sources.optional() }).strict())
        .min(1)
        .max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal('update_rows'),
      rows: z.array(z.object({ id, values }).strict()).min(1).max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal('delete_rows'),
      ids: z.array(id).min(1).max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal('schema'),
      columns: columnsSchema,
      confirmed: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('sort_rows'),
      columnId: id,
      direction: z.enum(['asc', 'desc']),
    })
    .strict(),
  z
    .object({
      action: z.literal('paste_rows'),
      updates: z.array(z.object({ id, values }).strict()).max(200),
      additions: z.array(z.object({ values }).strict()).max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal('title'),
      title: z.string().trim().min(1).max(240),
    })
    .strict(),
  z
    .object({ action: z.literal('context'), description: z.string().max(4000) })
    .strict(),
  z.object({ action: z.literal('restore_columns'), undoKey: id }).strict(),
]);
export const mutationSchema = z
  .object({
    revision: z.number().int().positive(),
    requestKey: id,
    sessionId: id.optional(),
    change: changeSchema,
  })
  .strict();
export type RecordChange = z.infer<typeof changeSchema>;
export const pageSchema = z
  .object({
    offset: z.number().int().nonnegative().max(100000).optional(),
    limit: z.number().int().min(1).max(200).default(50),
    columns: z.array(id).max(64).optional(),
    navigation: z.enum(['first', 'last']).optional(),
    cursor: z.string().max(16000).optional(),
  })
  .strict();

// Decimal arithmetic: 12 fractional places, at most 18 integral digits. Never round input.
export const SCALE = 1_000_000_000_000n;

export function decimal(raw: string): bigint {
  if (!/^[+-]?\d{1,18}(?:\.\d{1,12})?$/.test(raw))
    recordFailure(
      'INVALID_NUMBER',
      'Use a decimal with up to 18 integral and 12 fractional digits.',
    );
  const sign = raw.startsWith('-') ? -1n : 1n;
  const [whole, fraction = ''] = raw.replace(/^[+-]/, '').split('.');

  return sign * (BigInt(whole!) * SCALE + BigInt(fraction.padEnd(12, '0')));
}

export function decimalText(n: bigint): string {
  if (n >= 10n ** 30n || n <= -(10n ** 30n))
    recordFailure('OVERFLOW', 'Numeric result exceeds supported precision.');
  const abs = n < 0n ? -n : n;
  const fraction = (abs % SCALE)
    .toString()
    .padStart(12, '0')
    .replace(/0+$/, '');

  return `${n < 0n ? '-' : ''}${abs / SCALE}${fraction ? `.${fraction}` : ''}`;
}

export function interpretCell(
  column: RecordColumn,
  input: string | boolean | number,
): RecordCell {
  const raw = String(input);
  const mismatch: RecordCell = { raw, status: 'mismatched' };

  switch (column.type) {
    case 'text':
      return { raw, status: 'typed', value: raw };

    case 'number': {
      if (!/^[+-]?\d{1,18}(?:\.\d{1,12})?$/.test(raw)) return mismatch;

      return { raw, status: 'typed', value: decimalText(decimal(raw)) };
    }

    case 'boolean':
      return raw === 'true' || raw === 'false'
        ? { raw, status: 'typed', value: raw === 'true' }
        : mismatch;
    case 'date':
      return z.iso.date().safeParse(raw).success
        ? { raw, status: 'typed', value: raw }
        : mismatch;

    case 'datetime': {
      if (!z.iso.datetime({ offset: true }).safeParse(raw).success)
        return mismatch;

      return {
        raw,
        status: 'typed',
        value: new Date(raw).toISOString(),
        timezone: raw.endsWith('Z') ? 'UTC' : raw.slice(-6),
      };
    }

    case 'choice':
      return column.options?.includes(raw)
        ? { raw, status: 'typed', value: raw }
        : mismatch;
  }
}

export function recordStats(
  columns: RecordColumn[],
  rows: RecordRow[],
): RecordStats {
  const mismatched: Record<string, number> = Object.fromEntries(
    columns.map((c) => [c.id, 0]),
  );

  let lastRow: RecordRow | undefined;
  let lastColumn = -1;
  for (const row of rows)
    columns.forEach((column, index) => {
      const cell = row.cells[column.id];
      if (cell?.status === 'mismatched') mismatched[column.id]!++;

      // Empty text is preserved, but is not a populated cell for bounds.
      if (cell && cell.raw !== '') {
        if (!lastRow || row.position > lastRow.position) lastRow = row;
        lastColumn = Math.max(lastColumn, index);
      }
    });

  return {
    rowCount: rows.length,
    columnCount: columns.length,
    mismatched,
    bounds: lastRow
      ? {
          lastRow: { id: lastRow.id, position: lastRow.position },
          lastColumn: { id: columns[lastColumn]!.id, position: lastColumn + 1 },
        }
      : null,
  };
}

export function applyRecordChange(
  snapshot: {
    columns: RecordColumn[];
    rows: RecordRow[];
    description: string;
    nextPosition: number;
  },
  change: RecordChange,
  context: { newId: () => string; assistant: boolean },
): {
  columns: RecordColumn[];
  rows: RecordRow[];
  description: string;
  nextPosition: number;
  changedIds: string[];
  stats: RecordStats;
  mismatched: Array<{ rowId: string; columnId: string }>;
} {
  const state = structuredClone(snapshot);
  const changedIds: string[] = [];

  if (change.action === 'schema') {
    const removed = state.columns.filter(
      (c) => !change.columns.some((n) => n.id === c.id),
    );

    const protectedChange =
      removed.length > 0 ||
      state.columns.some((c) => {
        const next = change.columns.find((n) => n.id === c.id);

        return (
          next &&
          (next.name !== c.name ||
            next.type !== c.type ||
            JSON.stringify(next.options) !== JSON.stringify(c.options) ||
            next.unit !== c.unit)
        );
      });

    if (
      (removed.length || (context.assistant && protectedChange)) &&
      !change.confirmed
    )
      recordFailure(
        'CONFIRMATION_REQUIRED',
        'Konfirmasi diperlukan. Menghapus kolom menghapus nilainya secara permanen.',
      );
    state.rows = state.rows.map((row) => ({
      ...row,
      cells: Object.fromEntries(
        change.columns.flatMap((c) => {
          const cell = row.cells[c.id];
          if (!cell) return [];
          const old = state.columns.find((o) => o.id === c.id);

          return [
            [
              c.id,
              old?.type !== c.type ||
              JSON.stringify(old.options) !== JSON.stringify(c.options) ||
              old.unit !== c.unit
                ? interpretCell(c, cell.raw)
                : cell,
            ],
          ];
        }),
      ),
    }));
    state.columns = change.columns;
  } else if (change.action === 'sort_rows') {
    const column = state.columns.find((c) => c.id === change.columnId);
    if (!column) recordFailure('UNKNOWN_COLUMN', 'Kolom tidak ditemukan.');
    state.rows.sort((a, b) => {
      const ac = a.cells[column.id],
        bc = b.cells[column.id];

      const av = ac?.status === 'typed' ? ac.value : null,
        bv = bc?.status === 'typed' ? bc.value : null;

      if (av === null || bv === null)
        return av === bv ? a.position - b.position : av === null ? 1 : -1;
      const x = column.type === 'number' ? decimal(String(av)) : av,
        y = column.type === 'number' ? decimal(String(bv)) : bv;

      return (
        (x < y ? -1 : x > y ? 1 : 0) * (change.direction === 'asc' ? 1 : -1) ||
        a.position - b.position
      );
    });
    state.rows.forEach((r, i) => {
      r.position = i + 1;
    });
    state.nextPosition = state.rows.length + 1;
  } else if (change.action === 'paste_rows') {
    if (change.updates.length + change.additions.length > 200)
      recordFailure('VALIDATION', 'Paste exceeds 200 rows.');
    let next = state;
    if (change.updates.length)
      next = applyRecordChange(
        next,
        { action: 'update_rows', rows: change.updates },
        context,
      );
    if (change.additions.length)
      next = applyRecordChange(
        next,
        { action: 'add_rows', rows: change.additions },
        context,
      );

    return {
      ...next,
      stats: recordStats(next.columns, next.rows),
      changedIds: [
        ...change.updates.map((r) => r.id),
        ...next.rows
          .filter((r) => !state.rows.some((old) => old.id === r.id))
          .map((r) => r.id),
      ],
      mismatched: next.rows.flatMap((r) =>
        Object.entries(r.cells)
          .filter(([, c]) => c.status === 'mismatched')
          .map(([columnId]) => ({ rowId: r.id, columnId })),
      ),
    };
  } else if (change.action === 'title') {
    // Workspace title validation and persistence are composed by the service.
  } else if (change.action === 'context')
    state.description = change.description;
  else if (change.action === 'delete_rows') {
    if (
      new Set(change.ids).size !== change.ids.length ||
      change.ids.some((id) => !state.rows.some((r) => r.id === id))
    )
      recordFailure('MISSING_ROW', 'Baris tidak ditemukan atau ID berulang.');
    state.rows = state.rows.filter((r) => !change.ids.includes(r.id));
    changedIds.push(...change.ids);
  } else {
    if (change.action === 'restore_columns')
      recordFailure(
        'INVALID_OPERATION',
        'Column restoration requires a saved service receipt.',
      );
    if (change.action === 'add_rows' && change.beforeId && change.afterId)
      recordFailure('VALIDATION', 'Choose one insertion anchor.');
    if (
      change.action === 'add_rows' &&
      (change.beforeId || change.afterId) &&
      !state.rows.some((r) => r.id === (change.beforeId ?? change.afterId))
    )
      recordFailure('MISSING_ROW', 'Insertion anchor is unavailable.');
    if (
      change.action === 'update_rows' &&
      new Set(change.rows.map((r) => r.id)).size !== change.rows.length
    )
      recordFailure('VALIDATION', 'A batch cannot update the same row twice.');

    for (const input of change.rows) {
      const row =
        change.action === 'add_rows'
          ? {
              id: context.newId(),
              position: state.nextPosition++,
              cells: {},
              sources: 'sources' in input ? (input.sources ?? []) : [],
            }
          : state.rows.find(
              (r) => r.id === ('id' in input ? input.id : undefined),
            );

      if (!row) recordFailure('MISSING_ROW', 'Baris tidak ditemukan.');

      for (const [id, value] of Object.entries(input.values)) {
        const col = state.columns.find((c) => c.id === id);
        if (!col)
          recordFailure('UNKNOWN_COLUMN', `Kolom tidak ditemukan: ${id}`);
        if (value === null) delete row.cells[id];
        else row.cells[id] = interpretCell(col, value);
      }

      if (change.action === 'add_rows') state.rows.push(row);
      changedIds.push(row.id);
    }

    if (change.action === 'add_rows' && (change.beforeId || change.afterId)) {
      const inserted = state.rows.filter((r) => changedIds.includes(r.id));
      const existing = state.rows.filter((r) => !changedIds.includes(r.id));
      const index =
        existing.findIndex(
          (r) => r.id === (change.beforeId ?? change.afterId),
        ) + (change.afterId ? 1 : 0);

      existing.splice(index, 0, ...inserted);
      state.rows = existing;
      state.rows.forEach((row, index) => {
        row.position = index + 1;
      });
      state.nextPosition = state.rows.length + 1;
    }
  }

  return {
    ...state,
    changedIds,
    stats: recordStats(state.columns, state.rows),
    mismatched: state.rows
      .filter((r) => change.action === 'schema' || changedIds.includes(r.id))
      .flatMap((r) =>
        Object.entries(r.cells)
          .filter(([, c]) => c.status === 'mismatched')
          .map(([columnId]) => ({ rowId: r.id, columnId })),
      ),
  };
}

export function serializeRecordCsv(
  columns: RecordColumn[],
  rows: RecordRow[],
): string {
  const quote = (s: string) =>
    /[,"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;

  return (
    [
      columns.map((c) => quote(c.name)).join(','),
      ...rows.map((r) =>
        columns
          .map((c) => {
            const cell = r.cells[c.id];

            return quote(
              !cell
                ? ''
                : cell.status === 'mismatched'
                  ? cell.raw
                  : String(cell.value),
            );
          })
          .join(','),
      ),
    ].join('\r\n') + '\r\n'
  );
}
