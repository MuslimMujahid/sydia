import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  RecordCell,
  RecordColumn,
  RecordSnapshot,
} from '../../database/entities';
import {
  decimal,
  decimalText,
  parseRecord,
  recordFailure,
  SCALE,
} from './record-contract';

export type RecordExpression =
  | { field: string }
  | { value: string; unit?: string }
  | { metric: string }
  | {
      op: 'add' | 'subtract' | 'multiply' | 'divide';
      left: RecordExpression;
      right: RecordExpression;
    };
export type RecordFilter =
  | { and: RecordFilter[] }
  | { or: RecordFilter[] }
  | { not: RecordFilter }
  | {
      field: string;
      op:
        | 'eq'
        | 'ne'
        | 'gt'
        | 'gte'
        | 'lt'
        | 'lte'
        | 'contains'
        | 'starts_with'
        | 'in'
        | 'empty'
        | 'not_empty';
      value?: string | boolean | Array<string | boolean>;
    };
const key = z
  .string()
  .min(1)
  .max(160)
  .refine(
    (value) => !['__proto__', 'constructor', 'prototype'].includes(value),
    'Reserved identifier.',
  );

const expression: z.ZodType<RecordExpression> = z.lazy(() =>
  z.union([
    z.object({ field: key }).strict(),
    z
      .object({
        value: z.string().max(64),
        unit: z.string().max(40).optional(),
      })
      .strict(),
    z.object({ metric: key }).strict(),
    z
      .object({
        op: z.enum(['add', 'subtract', 'multiply', 'divide']),
        left: expression,
        right: expression,
      })
      .strict(),
  ]),
);

const filter: z.ZodType<RecordFilter> = z.lazy(() =>
  z.union([
    z.object({ and: z.array(filter).min(1).max(30) }).strict(),
    z.object({ or: z.array(filter).min(1).max(30) }).strict(),
    z.object({ not: filter }).strict(),
    z
      .object({
        field: key,
        op: z.enum([
          'eq',
          'ne',
          'gt',
          'gte',
          'lt',
          'lte',
          'contains',
          'starts_with',
          'in',
          'empty',
          'not_empty',
        ]),
        value: z
          .union([
            z.string().max(10000),
            z.boolean(),
            z.array(z.union([z.string().max(10000), z.boolean()])).max(200),
          ])
          .optional(),
      })
      .strict(),
  ]),
);

export const querySchema = z
  .object({
    sources: z
      .array(z.object({ id: key, fields: z.record(key, key) }).strict())
      .min(1)
      .max(20),
    filter: filter.optional(),
    select: z.array(key).max(64).optional(),
    sort: z
      .array(
        z.object({ field: key, direction: z.enum(['asc', 'desc']) }).strict(),
      )
      .max(10)
      .default([]),
    groupBy: z
      .array(
        z
          .object({
            field: key,
            period: z.enum(['day', 'week', 'month', 'year']).optional(),
            timezone: z.string().max(80).optional(),
          })
          .strict(),
      )
      .max(6)
      .default([]),
    calculations: z
      .array(
        z
          .object({
            name: key,
            op: z.enum(['count', 'sum', 'average', 'min', 'max']),
            expression: expression.optional(),
          })
          .strict(),
      )
      .max(30)
      .default([]),
    derived: z
      .array(z.object({ name: key, expression }).strict())
      .max(30)
      .default([]),
    limit: z.number().int().min(1).max(200).default(50),
    cursor: z.string().max(16000).optional(),
  })
  .strict();
export type RecordQuery = z.infer<typeof querySchema>;
type Unit = Record<string, number>;
type Field = { type: RecordColumn['type']; unit: Unit; options?: string[] };
type MappedRow = {
  noteId: string;
  rowId: string;
  position: number;
  values: Record<string, RecordCell>;
};
type Value = { n: bigint; unit: Unit };
type Evaluation = {
  value: Value | null;
  missing: boolean;
  mismatched: boolean;
};
const unit = (name?: string): Unit => (name ? { [name]: 1 } : {});
const unitKey = (u: Unit) =>
  JSON.stringify(
    Object.entries(u)
      .filter(([, v]) => v !== 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );

const unitLabel = (u: Unit) =>
  Object.entries(u)
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => (v === 1 ? k : `${k}^${v}`))
    .join('·') || null;

function assertUnits(a: Unit, b: Unit) {
  if (unitKey(a) !== unitKey(b))
    recordFailure(
      'INVALID_UNIT',
      'Arithmetic or mappings require compatible units.',
    );
}

function combined(a: Unit, b: Unit, sign: number): Unit {
  const out = { ...a };
  for (const [k, n] of Object.entries(b))
    out[k] = (Object.hasOwn(out, k) ? out[k]! : 0) + sign * n;

  return Object.fromEntries(Object.entries(out).filter(([, n]) => n !== 0));
}

function rounded(n: bigint, d: bigint): bigint {
  if (d === 0n)
    recordFailure('DIVISION_BY_ZERO', 'Division by zero is not defined.');
  const sign = n < 0n !== d < 0n ? -1n : 1n;
  const a = n < 0n ? -n : n,
    b = d < 0n ? -d : d;

  return sign * (a / b + ((a % b) * 2n >= b ? 1n : 0n));
}

export function assertRecordQueryBounds(
  value: unknown,
  depth = 0,
  budget = { n: 0 },
) {
  if (depth > 16 || ++budget.n > 3000)
    recordFailure(
      'EXPRESSION_LIMIT',
      'Query nesting or expression size exceeds the execution bound.',
    );
  if (value && typeof value === 'object')
    for (const child of Object.values(value))
      assertRecordQueryBounds(child, depth + 1, budget);
}

function expressionUnit(
  e: RecordExpression,
  fields: Map<string, Field>,
  metrics: Map<string, Unit>,
  allowMetric: boolean,
): Unit {
  if ('field' in e) {
    const f = fields.get(e.field);
    if (!f || f.type !== 'number')
      recordFailure('INVALID_EXPRESSION', `Expected numeric field: ${e.field}`);

    return f.unit;
  }

  if ('value' in e) {
    decimal(e.value);

    return unit(e.unit);
  }

  if ('metric' in e) {
    const u = metrics.get(e.metric);
    if (!allowMetric || !u)
      recordFailure(
        'INVALID_EXPRESSION',
        `Unknown calculated value: ${e.metric}`,
      );

    return u;
  }

  const a = expressionUnit(e.left, fields, metrics, allowMetric),
    b = expressionUnit(e.right, fields, metrics, allowMetric);

  if (e.op === 'add' || e.op === 'subtract') {
    assertUnits(a, b);

    return a;
  }

  return combined(a, b, e.op === 'multiply' ? 1 : -1);
}

function evaluate(
  e: RecordExpression,
  row: MappedRow | undefined,
  fields: Map<string, Field>,
  metrics: Map<string, Value | null>,
): Evaluation {
  if ('field' in e) {
    const cell = row?.values[e.field];
    if (!cell) return { value: null, missing: true, mismatched: false };
    if (cell.status === 'mismatched')
      return { value: null, missing: false, mismatched: true };

    return {
      value: {
        n: decimal(String(cell.value)),
        unit: fields.get(e.field)!.unit,
      },
      missing: false,
      mismatched: false,
    };
  }

  if ('value' in e)
    return {
      value: { n: decimal(e.value), unit: unit(e.unit) },
      missing: false,
      mismatched: false,
    };

  if ('metric' in e) {
    const v = metrics.get(e.metric);
    if (v === undefined)
      recordFailure('INVALID_EXPRESSION', 'Unknown calculated value.');

    return { value: v, missing: v === null, mismatched: false };
  }

  const a = evaluate(e.left, row, fields, metrics),
    b = evaluate(e.right, row, fields, metrics);

  const missing = a.missing || b.missing,
    mismatched = a.mismatched || b.mismatched;

  if (e.op === 'divide' && b.value?.n === 0n)
    recordFailure('DIVISION_BY_ZERO', 'Division by zero is not defined.');
  if (!a.value || !b.value) return { value: null, missing, mismatched };
  const x = a.value.n,
    y = b.value.n;

  const n =
    e.op === 'add'
      ? x + y
      : e.op === 'subtract'
        ? x - y
        : e.op === 'multiply'
          ? rounded(x * y, SCALE)
          : rounded(x * SCALE, y);

  decimalText(n);

  return {
    value: {
      n,
      unit:
        e.op === 'add' || e.op === 'subtract'
          ? a.value.unit
          : combined(a.value.unit, b.value.unit, e.op === 'multiply' ? 1 : -1),
    },
    missing,
    mismatched,
  };
}

function validateExpression(
  e: RecordExpression,
  fields: Map<string, Field>,
  metrics: Map<string, Unit>,
  allowMetric: boolean,
): Unit {
  const result = expressionUnit(e, fields, metrics, allowMetric);
  // Validate constant subexpressions even when there are no input rows/groups.
  // Field/metric operands have no value at this stage; runtime evaluation checks them.
  evaluate(
    e,
    undefined,
    fields,
    new Map([...metrics.keys()].map((name) => [name, null])),
  );

  return result;
}

function comparable(
  type: Field['type'],
  v: string | boolean,
): string | boolean | bigint | number {
  if (type === 'number') {
    if (typeof v !== 'string')
      recordFailure(
        'INVALID_FILTER',
        'Numeric comparisons require decimal strings.',
      );

    return decimal(v);
  }

  if (type === 'boolean') {
    if (typeof v !== 'boolean')
      recordFailure(
        'INVALID_FILTER',
        'Boolean comparisons require true or false.',
      );

    return v;
  }

  if (typeof v !== 'string')
    recordFailure('INVALID_FILTER', 'Expected text or ISO date.');
  if (type === 'date' && !z.iso.date().safeParse(v).success)
    recordFailure('INVALID_FILTER', 'Expected ISO calendar date.');

  if (type === 'datetime') {
    if (!z.iso.datetime({ offset: true }).safeParse(v).success)
      recordFailure(
        'INVALID_FILTER',
        'Expected datetime with timezone offset.',
      );

    return new Date(v).getTime();
  }

  return v;
}

function validateFilter(f: RecordFilter, fields: Map<string, Field>) {
  if ('and' in f) return f.and.forEach((x) => validateFilter(x, fields));
  if ('or' in f) return f.or.forEach((x) => validateFilter(x, fields));
  if ('not' in f) return validateFilter(f.not, fields);
  const field = fields.get(f.field);
  if (!field) recordFailure('UNKNOWN_FIELD', `Unknown query field: ${f.field}`);

  if (f.op === 'empty' || f.op === 'not_empty') {
    if (f.value !== undefined)
      recordFailure('INVALID_FILTER', 'Empty checks take no value.');

    return;
  }

  if (['contains', 'starts_with'].includes(f.op) && field.type !== 'text')
    recordFailure('INVALID_FILTER', 'Text matching requires a text column.');
  if (
    ['gt', 'gte', 'lt', 'lte'].includes(f.op) &&
    !['number', 'date', 'datetime'].includes(field.type)
  )
    recordFailure(
      'INVALID_FILTER',
      'Ordering requires a number, date or datetime.',
    );

  if (f.op === 'in') {
    if (!Array.isArray(f.value))
      recordFailure('INVALID_FILTER', 'Membership requires an array.');
    f.value.forEach((v) => comparable(field.type, v));
  } else {
    if (f.value === undefined || Array.isArray(f.value))
      recordFailure('INVALID_FILTER', 'Comparison requires one value.');
    comparable(field.type, f.value);
  }
}

type Match = { match: boolean | null; missing: boolean; mismatched: boolean };

function matches(
  f: RecordFilter,
  row: MappedRow,
  fields: Map<string, Field>,
): Match {
  if ('and' in f || 'or' in f) {
    const all = ('and' in f ? f.and : f.or).map((x) => matches(x, row, fields));
    const states = all.map((x) => x.match);
    const result =
      'and' in f
        ? states.includes(false)
          ? false
          : states.includes(null)
            ? null
            : true
        : states.includes(true)
          ? true
          : states.includes(null)
            ? null
            : false;

    return {
      match: result,
      missing: all.some((x) => x.missing),
      mismatched: all.some((x) => x.mismatched),
    };
  }

  if ('not' in f) {
    const m = matches(f.not, row, fields);

    return { ...m, match: m.match === null ? null : !m.match };
  }

  const c = row.values[f.field];
  if (c?.status === 'mismatched')
    return { match: null, missing: false, mismatched: true };
  if (f.op === 'empty' || f.op === 'not_empty')
    return {
      match: f.op === 'empty' ? !c : !!c,
      missing: false,
      mismatched: false,
    };
  if (!c) return { match: null, missing: true, mismatched: false };
  const type = fields.get(f.field)!.type;
  const a = comparable(type, c.value);
  const v = f.value;
  let ok = false;

  if (f.op === 'in')
    ok = (v as Array<string | boolean>).some((x) => a === comparable(type, x));
  else {
    const b = comparable(type, v as string | boolean);

    switch (f.op) {
      case 'eq':
        ok = a === b;
        break;
      case 'ne':
        ok = a !== b;
        break;
      case 'gt':
        ok = a > b;
        break;
      case 'gte':
        ok = a >= b;
        break;
      case 'lt':
        ok = a < b;
        break;
      case 'lte':
        ok = a <= b;
        break;
      case 'contains':
        ok = String(a).includes(String(b));
        break;
      case 'starts_with':
        ok = String(a).startsWith(String(b));
        break;
    }
  }

  return { match: ok, missing: false, mismatched: false };
}

function timeKey(
  cell: RecordCell,
  field: Field,
  g: RecordQuery['groupBy'][number],
): string | boolean {
  if (cell.status !== 'typed') throw new Error('Invalid grouping cell.');
  if (!g.period) return cell.value;
  let date = String(cell.value);

  if (field.type === 'datetime') {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: g.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const parts = formatter.formatToParts(new Date(date));

    const part = (type: string) => {
      const value = parts.find((p) => p.type === type)?.value;
      if (!value) throw new Error('Missing time bucket part.');

      return value;
    };

    date = `${part('year')}-${part('month')}-${part('day')}`;
  }

  if (g.period === 'year') return date.slice(0, 4);
  if (g.period === 'month') return date.slice(0, 7);

  if (g.period === 'week') {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));

    return d.toISOString().slice(0, 10);
  }

  return date.slice(0, 10);
}

export function executeRecordQuery(
  userId: string,
  query: RecordQuery,
  snapshots: RecordSnapshot[],
  context: {
    encode: (value: unknown) => string;
    decode: (value: string) => unknown;
    now: Date;
  },
) {
  assertRecordQueryBounds(query);
  const started = Date.now();

  const deadline = () => {
    if (Date.now() - started > 5000)
      recordFailure('TIMEOUT', 'Query execution exceeded five seconds.');
  };

  const fields = new Map<string, Field>();
  const records: MappedRow[] = [];
  if (new Set(query.sources.map((s) => s.id)).size !== query.sources.length)
    recordFailure('INVALID_SOURCE', 'Each selected source must be unique.');
  const names = Object.keys(query.sources[0]!.fields).sort();
  if (names.length > 64)
    recordFailure('EXECUTION_LIMIT', 'Query mappings exceed 64 fields.');
  if (!names.length)
    recordFailure('INVALID_MAPPING', 'Map at least one query field.');

  for (const source of query.sources) {
    const s = snapshots.find((s) => s.table.noteId === source.id);
    if (!s) recordFailure('NOT_FOUND', 'Selected source is unavailable.');
    if (
      JSON.stringify(Object.keys(source.fields).sort()) !==
      JSON.stringify(names)
    )
      recordFailure(
        'INVALID_MAPPING',
        'Every source must explicitly map the same query fields.',
      );

    for (const [name, id] of Object.entries(source.fields)) {
      const col = s.table.columns.find((c) => c.id === id);
      if (!col) recordFailure('UNKNOWN_COLUMN', `Unknown mapped column: ${id}`);
      const f: Field = {
        type: col.type,
        unit: unit(col.unit),
        options: col.options,
      };

      const existing = fields.get(name);
      if (existing) {
        if (
          existing.type !== f.type ||
          JSON.stringify(existing.options) !== JSON.stringify(f.options)
        )
          recordFailure(
            'INVALID_MAPPING',
            'Mapped columns have incompatible types or choices.',
          );
        assertUnits(existing.unit, f.unit);
      } else fields.set(name, f);
    }

    for (const row of s.rows) {
      deadline();
      records.push({
        noteId: source.id,
        rowId: row.id,
        position: row.position,
        values: Object.fromEntries(
          Object.entries(source.fields).flatMap(([name, id]) =>
            row.cells[id] ? [[name, row.cells[id]]] : [],
          ),
        ),
      });
    }
  }

  if (query.filter) validateFilter(query.filter, fields);
  const selection = query.select ?? names;
  for (const name of [...selection, ...query.groupBy.map((g) => g.field)])
    if (!fields.has(name))
      recordFailure('UNKNOWN_FIELD', `Unknown query field: ${name}`);

  for (const g of query.groupBy) {
    const f = fields.get(g.field)!;
    if (g.period && !['date', 'datetime'].includes(f.type))
      recordFailure('INVALID_GROUP', 'Time buckets require date columns.');
    if (g.period && f.type === 'datetime' && !g.timezone)
      recordFailure(
        'INVALID_TIMEZONE',
        'Datetime grouping requires an explicit timezone.',
      );

    if (g.timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: g.timezone });
      } catch {
        recordFailure('INVALID_TIMEZONE', 'Unknown IANA timezone.');
      }
    }
  }

  const aggregated = query.calculations.length > 0 || query.groupBy.length > 0;
  const metricUnits = new Map<string, Unit>();

  for (const c of query.calculations) {
    if (metricUnits.has(c.name))
      recordFailure('INVALID_CALCULATION', 'Metric names must be unique.');
    if (c.op !== 'count' && !c.expression)
      recordFailure(
        'INVALID_CALCULATION',
        'This aggregate requires an expression.',
      );
    const u = c.expression
      ? validateExpression(c.expression, fields, metricUnits, false)
      : {};

    metricUnits.set(c.name, c.op === 'count' ? {} : u);
  }

  for (const d of query.derived) {
    if (metricUnits.has(d.name))
      recordFailure('INVALID_CALCULATION', 'Metric names must be unique.');
    metricUnits.set(
      d.name,
      validateExpression(d.expression, new Map(), metricUnits, true),
    );
  }

  if (query.derived.length && !query.calculations.length)
    recordFailure(
      'INVALID_CALCULATION',
      'Derived values require calculations.',
    );
  const exclusions = {
    missing: 0,
    mismatched: 0,
    predicate: 0,
    groupMissing: 0,
    groupMismatched: 0,
  };

  const matched = records.filter((row) => {
    deadline();
    if (!query.filter) return true;
    const r = matches(query.filter, row, fields);
    if (r.match === true) return true;
    if (r.missing) exclusions.missing++;
    if (r.mismatched) exclusions.mismatched++;
    if (!r.missing && !r.mismatched) exclusions.predicate++;

    return false;
  });

  const sourceVersions = snapshots.map((s) => ({
    id: s.table.noteId,
    revision: s.revision,
  }));

  const { cursor, ...resolved } = query;
  const shape = createHash('sha256')
    .update(JSON.stringify(resolved))
    .digest('hex');

  let offset = 0;

  if (cursor) {
    const c = parseRecord(
      z.object({
        userId: z.string(),
        shape: z.string(),
        sources: z.array(z.object({ id: z.string(), revision: z.number() })),
        offset: z.number().int().nonnegative(),
      }),
      context.decode(cursor),
    );

    if (c.userId !== userId || c.shape !== shape)
      recordFailure(
        'INVALID_CURSOR',
        'Query cursor does not match this request.',
      );
    if (JSON.stringify(c.sources) !== JSON.stringify(sourceVersions))
      recordFailure(
        'STALE_CURSOR',
        'Selected records changed; restart the query.',
        409,
      );
    offset = c.offset;
  }

  const output: unknown[] = [];

  for (const sort of query.sort) {
    if (
      aggregated
        ? !metricUnits.has(sort.field) &&
          !query.groupBy.some((g) => g.field === sort.field)
        : !fields.has(sort.field)
    )
      recordFailure('INVALID_SORT', `Unknown sort field: ${sort.field}`);
  }

  if (aggregated) {
    type GroupResult = {
      keys: Record<string, string | boolean>;
      matchedRows: number;
      calculations: Record<
        string,
        {
          value: string | null;
          unit: string | null;
          contributing?: number;
          missing: number | boolean;
          mismatched: number | boolean;
        }
      >;
    };
    const groupOutput: GroupResult[] = [];
    const groups = new Map<
      string,
      { keys: Record<string, string | boolean>; rows: MappedRow[] }
    >();

    if (!query.groupBy.length) groups.set('{}', { keys: {}, rows: [] });

    for (const row of matched) {
      deadline();
      const keys: Record<string, string | boolean> = {};
      let absent = false,
        bad = false;

      for (const g of query.groupBy) {
        const cell = row.values[g.field];
        if (!cell) absent = true;
        else if (cell.status === 'mismatched') bad = true;
        else keys[g.field] = timeKey(cell, fields.get(g.field)!, g);
      }

      if (absent || bad) {
        if (absent) exclusions.groupMissing++;
        if (bad) exclusions.groupMismatched++;
        continue;
      }

      const k = JSON.stringify(keys);
      const group = groups.get(k) ?? { keys, rows: [] };
      group.rows.push(row);
      groups.set(k, group);
    }

    for (const [, group] of [...groups.entries()].sort(([a], [b]) =>
      a.localeCompare(b, 'en'),
    )) {
      deadline();
      const metrics: GroupResult['calculations'] = {};
      const values = new Map<string, Value | null>();

      for (const c of query.calculations) {
        let missing = 0,
          mismatched = 0;

        const ns: bigint[] = [];

        for (const row of group.rows) {
          deadline();

          if (!c.expression) {
            ns.push(SCALE);
            continue;
          }

          const e = evaluate(c.expression, row, fields, values);
          if (e.missing) missing++;
          if (e.mismatched) mismatched++;
          if (e.value) ns.push(e.value.n);
        }

        let value: bigint | null = null;

        if (c.op === 'count') value = BigInt(ns.length) * SCALE;
        else if (ns.length) {
          const sum = ns.reduce((a, b) => a + b, 0n);
          value =
            c.op === 'sum'
              ? sum
              : c.op === 'average'
                ? rounded(sum, BigInt(ns.length))
                : c.op === 'min'
                  ? ns.reduce((a, b) => (a < b ? a : b))
                  : ns.reduce((a, b) => (a > b ? a : b));
        }

        const u = metricUnits.get(c.name)!;
        values.set(c.name, value === null ? null : { n: value, unit: u });
        metrics[c.name] = {
          value: value === null ? null : decimalText(value),
          unit: unitLabel(u),
          contributing: ns.length,
          missing,
          mismatched,
        };
      }

      for (const d of query.derived) {
        const e = evaluate(d.expression, undefined, new Map(), values);
        values.set(d.name, e.value);
        metrics[d.name] = {
          value: e.value ? decimalText(e.value.n) : null,
          unit: unitLabel(metricUnits.get(d.name)!),
          missing: e.missing,
          mismatched: e.mismatched,
        };
      }

      groupOutput.push({
        keys: group.keys,
        matchedRows: group.rows.length,
        calculations: metrics,
      });
    }

    groupOutput.sort((a, b) => {
      for (const sort of query.sort) {
        const av = metricUnits.has(sort.field)
          ? a.calculations[sort.field]!.value
          : a.keys[sort.field];

        const bv = metricUnits.has(sort.field)
          ? b.calculations[sort.field]!.value
          : b.keys[sort.field];

        if (av == null || bv == null) {
          if (av !== bv) return av == null ? 1 : -1;
          continue;
        }

        const x = metricUnits.has(sort.field) ? decimal(String(av)) : av,
          y = metricUnits.has(sort.field) ? decimal(String(bv)) : bv;

        const comparison = x < y ? -1 : x > y ? 1 : 0;
        if (comparison) return comparison * (sort.direction === 'asc' ? 1 : -1);
      }

      return JSON.stringify(a.keys).localeCompare(JSON.stringify(b.keys), 'en');
    });
    output.push(...groupOutput);
  } else {
    matched.sort((a, b) => {
      for (const sort of query.sort) {
        const ac = a.values[sort.field],
          bc = b.values[sort.field];

        const av =
            ac?.status === 'typed'
              ? comparable(fields.get(sort.field)!.type, ac.value)
              : null,
          bv =
            bc?.status === 'typed'
              ? comparable(fields.get(sort.field)!.type, bc.value)
              : null;

        if (av === null || bv === null) {
          if (av !== bv) return av === null ? 1 : -1;
        } else {
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          if (cmp) return cmp * (sort.direction === 'asc' ? 1 : -1);
        }
      }

      return (
        a.noteId.localeCompare(b.noteId, 'en') ||
        a.position - b.position ||
        a.rowId.localeCompare(b.rowId, 'en')
      );
    });
    output.push(
      ...matched.map((row) => ({
        ...row,
        values: Object.fromEntries(
          selection.flatMap((f) => (row.values[f] ? [[f, row.values[f]]] : [])),
        ),
      })),
    );
  }

  const token = (at: number) =>
    context.encode({ userId, shape, sources: sourceVersions, offset: at });

  return {
    kind: aggregated ? 'groups' : 'records',
    query: resolved,
    sources: sourceVersions,
    executedAt: context.now.toISOString(),
    scope: 'saved',
    inputRows: records.length,
    matchedRows: matched.length,
    exclusions,
    totalResults: output.length,
    results: output.slice(offset, offset + query.limit),
    page: {
      offset,
      limit: query.limit,
      next:
        offset + query.limit < output.length
          ? token(offset + query.limit)
          : null,
      previous: offset > 0 ? token(Math.max(0, offset - query.limit)) : null,
    },
  };
}
