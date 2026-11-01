import {
  executeRecordQuery,
  querySchema,
  assertRecordQueryBounds,
} from './record-query';
import { interpretCell, parseRecord, recordStats } from './record-contract';
import { ApiException } from '../../shared/errors';
import type {
  RecordColumn,
  RecordSnapshot,
  RecordRow,
} from '../../database/entities';

const columns: RecordColumn[] = [
  { id: 'v', name: 'Temperature', type: 'number', required: false },
  { id: 'q', name: 'Quantity', type: 'number', required: false },
  { id: 'd', name: 'Date', type: 'date', required: false },
  { id: 'b', name: 'Flag', type: 'boolean', required: false },
  { id: 't', name: 'Location', type: 'text', required: false },
];

function snapshot(
  values: Array<Record<string, string | boolean | null>>,
  id = 'table',
  revision = 1,
): RecordSnapshot {
  const rows: RecordRow[] = values.map((values, index) => ({
    id: `r${index + 1}`,
    position: index + 1,
    sources: [],
    cells: Object.fromEntries(
      Object.entries(values)
        .filter(([, v]) => v !== null)
        .map(([key, value]) => [
          key,
          interpretCell(
            columns.find((c) => c.id === key)!,
            value!,
          ),
        ]),
    ),
  }));

  return {
    table: {
      noteId: id,
      description: 'Observations',
      columns,
      stats: recordStats(columns, rows),
      nextPosition: rows.length + 1,
    },
    rows,
    revision,
    title: 'Measurements',
    path: 'Measurements',
    parentId: null,
    updatedAt: new Date('2026-11-01T00:00:00Z'),
  };
}

const source = {
  id: 'table',
  fields: { value: 'v', quantity: 'q', date: 'd', flag: 'b', location: 't' },
};

function run(
  raw: unknown,
  snapshots = [snapshot([{ v: '100' }, { v: '150' }, {}])],
) {
  return executeRecordQuery('owner', parseRecord(querySchema, raw), snapshots, {
    encode: JSON.stringify,
    decode: JSON.parse,
    now: new Date('2026-11-01T00:00:00Z'),
  });
}

const calculations = [
  { name: 'total', op: 'sum', expression: { field: 'value' } },
  { name: 'mean', op: 'average', expression: { field: 'value' } },
];

describe('deterministic record analysis', () => {
  it('reports independently calculated sums averages and missing contributions', () => {
    expect(run({ sources: [source], calculations }).results).toEqual([
      {
        keys: {},
        matchedRows: 3,
        calculations: {
          total: {
            value: '250',
            unit: null,
            contributing: 2,
            missing: 1,
            mismatched: 0,
          },
          mean: {
            value: '125',
            unit: null,
            contributing: 2,
            missing: 1,
            mismatched: 0,
          },
        },
      },
    ]);
  });
  it('counts valid zero in the average without converting absence to zero', () => {
    expect(
      run({ sources: [source], calculations }, [
        snapshot([{ v: '0' }, { v: '10' }, {}]),
      ]).results,
    ).toMatchObject([
      { calculations: { mean: { value: '5', contributing: 2, missing: 1 } } },
    ]);
  });
  it('calculates sales expressions before aggregating rather than multiplying totals', () => {
    expect(
      run(
        {
          sources: [source],
          calculations: [
            {
              name: 'sales',
              op: 'sum',
              expression: {
                op: 'multiply',
                left: { field: 'quantity' },
                right: { field: 'value' },
              },
            },
          ],
        },
        [
          snapshot([
            { q: '2', v: '12.5' },
            { q: '3', v: '4' },
          ]),
        ],
      ).results,
    ).toMatchObject([{ calculations: { sales: { value: '37' } } }]);
  });
  it('derives percentage ratios from named calculated values', () => {
    const calculations = [
      { name: 'one', op: 'min', expression: { field: 'quantity' } },
      { name: 'four', op: 'max', expression: { field: 'value' } },
    ];

    expect(
      run(
        {
          sources: [source],
          calculations,
          derived: [
            {
              name: 'ratio',
              expression: {
                op: 'multiply',
                left: {
                  op: 'divide',
                  left: { metric: 'one' },
                  right: { metric: 'four' },
                },
                right: { value: '100' },
              },
            },
          ],
        },
        [snapshot([{ q: '1', v: '4' }])],
      ).results,
    ).toMatchObject([{ calculations: { ratio: { value: '25' } } }]);
  });
  it('avoids floating point artifacts in decimal sums', () => {
    expect(
      run({ sources: [source], calculations }, [
        snapshot([{ v: '0.1' }, { v: '0.2' }]),
      ]).results,
    ).toMatchObject([{ calculations: { total: { value: '0.3' } } }]);
  });
  it('reports mismatches separately from missing values', () => {
    expect(
      run({ sources: [source], calculations }, [
        snapshot([{ v: '0' }, { v: '10' }, { v: 'dua' }, {}]),
      ]).results,
    ).toMatchObject([
      {
        calculations: {
          mean: { value: '5', contributing: 2, missing: 1, mismatched: 1 },
        },
      },
    ]);
  });
  it('distinguishes no input from a genuine zero aggregate', () => {
    expect(
      run({ sources: [source], calculations }, [snapshot([])]).results,
    ).toMatchObject([
      {
        matchedRows: 0,
        calculations: {
          total: { value: null, contributing: 0 },
          mean: { value: null },
        },
      },
    ]);
  });
  it('handles nested date and OR NOT filters with exact boundaries', () => {
    const filter = {
      and: [
        { field: 'date', op: 'gte', value: '2026-10-01' },
        { field: 'date', op: 'lt', value: '2026-11-01' },
        {
          or: [
            { field: 'location', op: 'eq', value: 'A' },
            { not: { field: 'flag', op: 'eq', value: true } },
          ],
        },
      ],
    };

    const data = snapshot([
      { v: '10', d: '2026-10-01', t: 'A', b: true },
      { v: '20', d: '2026-10-31', t: 'B', b: false },
      { v: '40', d: '2026-11-01', t: 'A', b: false },
      { v: '80', t: 'A', b: false },
    ]);

    const result = run({ sources: [source], filter, calculations }, [data]);
    expect(result.matchedRows).toBe(2);
    expect(result.exclusions.missing).toBe(1);
    expect(result.results).toMatchObject([
      { calculations: { total: { value: '30' } } },
    ]);
  });
  it('does not admit mismatched or absent values by negating a typed predicate', () => {
    expect(
      run(
        {
          sources: [source],
          filter: { not: { field: 'value', op: 'eq', value: '5' } },
        },
        [snapshot([{ v: 'two' }, {}, { v: '10' }])],
      ).matchedRows,
    ).toBe(1);
  });
  it('keeps case-sensitive text matching and absence checks distinct', () => {
    expect(
      run(
        {
          sources: [source],
          filter: { field: 'location', op: 'contains', value: 'A' },
        },
        [snapshot([{ t: 'A' }, { t: 'a' }, { t: '' }, {}])],
      ).matchedRows,
    ).toBe(1);
    expect(
      run({ sources: [source], filter: { field: 'location', op: 'empty' } }, [
        snapshot([{ t: '' }, {}]),
      ]).matchedRows,
    ).toBe(1);
  });
  it('combines explicit mappings across two differently named notes', () => {
    expect(
      run(
        {
          sources: [
            { id: 'a', fields: { amount: 'v' } },
            { id: 'b', fields: { amount: 'q' } },
          ],
          calculations: [
            { name: 'sum', op: 'sum', expression: { field: 'amount' } },
          ],
        },
        [snapshot([{ v: '10' }], 'a'), snapshot([{ q: '20' }], 'b')],
      ).results,
    ).toMatchObject([{ calculations: { sum: { value: '30' } } }]);
  });
  it('rejects undeclared field correspondences', () => {
    expect(() =>
      run(
        {
          sources: [
            { id: 'a', fields: { amount: 'v' } },
            { id: 'b', fields: { quantity: 'q' } },
          ],
        },
        [snapshot([], 'a'), snapshot([], 'b')],
      ),
    ).toThrow();
  });
  it('retains source note and row IDs in matching projections', () => {
    expect(
      run({
        sources: [source],
        select: ['value'],
        sort: [{ field: 'value', direction: 'desc' }],
      }).results,
    ).toEqual([
      {
        noteId: 'table',
        rowId: 'r2',
        position: 2,
        values: { value: { raw: '150', status: 'typed', value: '150' } },
      },
      {
        noteId: 'table',
        rowId: 'r1',
        position: 1,
        values: { value: { raw: '100', status: 'typed', value: '100' } },
      },
      { noteId: 'table', rowId: 'r3', position: 3, values: {} },
    ]);
  });
  it('aggregates all source rows before paginating groups', () => {
    const result = run(
      {
        sources: [source],
        groupBy: [{ field: 'date', period: 'month' }],
        calculations,
        limit: 1,
      },
      [
        snapshot([
          { v: '10', d: '2026-10-01' },
          { v: '20', d: '2026-10-02' },
          { v: '40', d: '2026-11-01' },
        ]),
      ],
    );

    expect(result.totalResults).toBe(2);
    expect(result.results).toMatchObject([
      {
        keys: { date: '2026-10' },
        calculations: { total: { value: '30', contributing: 2 } },
      },
    ]);
    expect(result.page.next).not.toBeNull();
  });
  it('rejects changed source revisions on a result cursor', () => {
    const first = run({ sources: [source], limit: 1 });
    expect(() =>
      run({ sources: [source], limit: 1, cursor: first.page.next }, [
        snapshot([{ v: '100' }, { v: '150' }, {}], 'table', 2),
      ]),
    ).toThrow();
  });
  it('rejects arithmetic with incompatible units even for empty data', () => {
    const s = snapshot([]);
    s.table.columns = s.table.columns.map((c) => ({
      ...c,
      ...(c.id === 'v' ? { unit: 'IDR' } : c.id === 'q' ? { unit: 'kg' } : {}),
    }));
    expect(() =>
      run(
        {
          sources: [source],
          calculations: [
            {
              name: 'bad',
              op: 'sum',
              expression: {
                op: 'add',
                left: { field: 'value' },
                right: { field: 'quantity' },
              },
            },
          ],
        },
        [s],
      ),
    ).toThrow();
  });
  it('rejects division by zero instead of returning a partial metric', () => {
    expect(() =>
      run(
        {
          sources: [source],
          calculations: [
            {
              name: 'bad',
              op: 'sum',
              expression: {
                op: 'divide',
                left: { field: 'value' },
                right: { field: 'quantity' },
              },
            },
          ],
        },
        [
          snapshot([
            { v: '10', q: '2' },
            { v: '10', q: '0' },
          ]),
        ],
      ),
    ).toThrow();
  });
  it('rejects constant division by zero even when no saved rows exist', () => {
    expect(() =>
      run(
        {
          sources: [source],
          calculations: [
            {
              name: 'invalid',
              op: 'sum',
              expression: {
                op: 'divide',
                left: { value: '1' },
                right: { value: '0' },
              },
            },
          ],
        },
        [snapshot([])],
      ),
    ).toThrow(ApiException);
  });

  it('requires timezone context for datetime buckets', () => {
    const s = snapshot([]);
    s.table.columns = s.table.columns.map((c) =>
      c.id === 'd' ? { ...c, type: 'datetime' } : c,
    );
    expect(() =>
      run(
        { sources: [source], groupBy: [{ field: 'date', period: 'month' }] },
        [s],
      ),
    ).toThrow();
  });
  it('rejects invalid predicate operators for a field type', () => {
    expect(() =>
      run({
        sources: [source],
        filter: { field: 'flag', op: 'gt', value: true },
      }),
    ).toThrow();
  });
});

describe('record query execution bounds and group ordering', () => {
  it('sorts complete grouped calculations before applying a result page size', () => {
    const result = run(
      {
        sources: [source],
        groupBy: [{ field: 'location' }],
        calculations: [
          { name: 'total', op: 'sum', expression: { field: 'value' } },
        ],
        sort: [{ field: 'total', direction: 'desc' }],
        limit: 1,
      },
      [
        snapshot([
          { t: 'A', v: '10' },
          { t: 'A', v: '15' },
          { t: 'B', v: '20' },
        ]),
      ],
    );

    expect(result.results).toMatchObject([
      {
        keys: { location: 'A' },
        calculations: { total: { value: '25', contributing: 2 } },
      },
    ]);
    expect(result.totalResults).toBe(2);
  });
  it('rejects deeply nested query input before interpreting it', () => {
    const nested: unknown = Array.from({ length: 20 }).reduce<unknown>(
      (child) => ({ not: child }),
      { field: 'value', op: 'eq', value: '1' },
    );

    expect(() => assertRecordQueryBounds(nested)).toThrow();
  });
});
