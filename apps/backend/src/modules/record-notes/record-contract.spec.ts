import {
  applyRecordChange,
  interpretCell,
  recordStats,
  serializeRecordCsv,
  parseRecord,
  columnsSchema,
  type RecordChange,
} from './record-contract';
import type { RecordColumn, RecordRow } from '../../database/entities';

const column = (type: RecordColumn['type'] = 'number'): RecordColumn => ({
  id: 'value',
  name: 'Value',
  type,
  required: false,
  ...(type === 'choice' ? { options: ['A', 'B'] } : {}),
});

const row = (
  id: string,
  value: string | boolean | null,
  type: RecordColumn['type'] = 'number',
  position = 1,
): RecordRow => ({
  id,
  position,
  cells: value === null ? {} : { value: interpretCell(column(type), value) },
  sources: [{ ref: 'original', version: 'v1' }],
});

const state = (
  rows: RecordRow[] = [],
  columns: RecordColumn[] = [column()],
) => ({
  columns,
  rows,
  description: 'Measurements',
  nextPosition: rows.length + 1,
});

const apply = (
  s: ReturnType<typeof state>,
  change: RecordChange,
  assistant = false,
) => applyRecordChange(s, change, { newId: () => 'new-row', assistant });

describe('record cell interpretation', () => {
  it.each([
    ['text', 'two', 'two'],
    ['number', '12.5', '12.5'],
    ['date', '2026-11-01', '2026-11-01'],
    ['datetime', '2026-11-01T08:00:00+08:00', '2026-11-01T00:00:00.000Z'],
    ['boolean', false, false],
    ['choice', 'A', 'A'],
  ] as const)('%s round trips a typed value', (type, input, value) => {
    expect(interpretCell(column(type), input)).toMatchObject({
      status: 'typed',
      value,
      raw: String(input),
    });
  });
  it.each(['two', '1,200', '0.1234567890123', '1e2', ' 2 ', 'NaN'])(
    'preserves mismatched numeric input %s exactly',
    (raw) => {
      expect(interpretCell(column(), raw)).toEqual({
        status: 'mismatched',
        raw,
      });
    },
  );
  it('keeps zero and false populated while absent cells have no value', () => {
    const columns = [column(), { ...column('boolean'), id: 'flag' }];
    const rows = [
      {
        ...row('r', '0'),
        cells: {
          value: interpretCell(column(), '0'),
          flag: interpretCell(column('boolean'), false),
        },
      },
    ];

    expect(recordStats(columns, rows)).toEqual({
      rowCount: 1,
      columnCount: 2,
      mismatched: { value: 0, flag: 0 },
      bounds: {
        lastRow: { id: 'r', position: 1 },
        lastColumn: { id: 'flag', position: 2 },
      },
    });
  });
  it('preserves empty text without treating it as a populated bound', () => {
    const empty = row('r', '', 'text');
    expect(recordStats([column('text')], [empty]).bounds).toBeNull();
    expect(empty.cells.value).toEqual({ raw: '', status: 'typed', value: '' });
  });
  it('rejects invalid dates without normalizing them into another day', () => {
    expect(interpretCell(column('date'), '2026-02-30')).toEqual({
      status: 'mismatched',
      raw: '2026-02-30',
    });
  });
});
describe('record schema and row mutations', () => {
  it('adds an optional column without backfilling existing rows', () => {
    const result = apply(state([row('r', '10')]), {
      action: 'schema',
      columns: [column(), { ...column('text'), id: 'description' }],
    });

    expect(result.rows[0]!.cells).toEqual({
      value: { raw: '10', status: 'typed', value: '10' },
    });
  });
  it('renames a column without changing its identity or values', () => {
    const result = apply(state([row('r', '10')]), {
      action: 'schema',
      columns: [{ ...column(), name: 'Temperature' }],
    });

    expect(result.columns[0]!.id).toBe('value');
    expect(result.rows[0]!.cells.value).toEqual({
      raw: '10',
      status: 'typed',
      value: '10',
    });
  });
  it('reinterprets original input when changing type and changing back', () => {
    const changed = apply(state([row('r', 'two', 'text')], [column('text')]), {
      action: 'schema',
      columns: [column()],
    });

    expect(changed.rows[0]!.cells.value).toEqual({
      status: 'mismatched',
      raw: 'two',
    });
    const restored = apply(changed, {
      action: 'schema',
      columns: [column('text')],
    });

    expect(restored.rows[0]!.cells.value).toEqual({
      status: 'typed',
      raw: 'two',
      value: 'two',
    });
  });
  it('undo reinterprets current values rather than restoring stale cells', () => {
    const changed = apply(state([row('r', '10')]), {
      action: 'schema',
      columns: [column('text')],
    });

    const edited = apply(changed, {
      action: 'update_rows',
      rows: [{ id: 'r', values: { value: '20' } }],
    });

    expect(
      apply(edited, { action: 'schema', columns: [column()] }).rows[0]!.cells
        .value,
    ).toEqual({ raw: '20', status: 'typed', value: '20' });
  });
  it('requires assistant confirmation for rename', () => {
    expect(() =>
      apply(
        state(),
        { action: 'schema', columns: [{ ...column(), name: 'Renamed' }] },
        true,
      ),
    ).toThrow();
  });
  it('requires confirmation for manual column deletion', () => {
    expect(() =>
      apply(state([row('r', '10')]), { action: 'schema', columns: [] }),
    ).toThrow();
  });
  it('clearing the last populated cell resets bounds without deleting the row', () => {
    const result = apply(state([row('r', '0')]), {
      action: 'update_rows',
      rows: [{ id: 'r', values: { value: null } }],
    });

    expect(result.stats).toMatchObject({ rowCount: 1, bounds: null });
    expect(result.rows[0]!.cells).toEqual({});
  });
  it('preserves another equal-valued record when correcting a stable row ID', () => {
    const result = apply(
      state([row('first', '10'), row('second', '10', 'number', 2)]),
      {
        action: 'update_rows',
        rows: [{ id: 'second', values: { value: '20' } }],
      },
    );

    expect(result.rows.map((r) => [r.id, r.cells.value])).toEqual([
      ['first', { raw: '10', status: 'typed', value: '10' }],
      ['second', { raw: '20', status: 'typed', value: '20' }],
    ]);
  });
  it('rejects an invalid batch without mutating its input snapshot', () => {
    const original = state([row('r', '10')]);
    expect(() =>
      apply(original, {
        action: 'update_rows',
        rows: [
          { id: 'r', values: { value: '20' } },
          { id: 'unknown', values: { value: '30' } },
        ],
      }),
    ).toThrow();
    expect(original.rows[0]!.cells.value).toEqual({
      raw: '10',
      status: 'typed',
      value: '10',
    });
  });
  it('preserves source evidence when correcting a row', () => {
    const result = apply(state([row('r', '10')]), {
      action: 'update_rows',
      rows: [{ id: 'r', values: { value: '20' } }],
    });

    expect(result.rows[0]!.sources).toEqual([
      { ref: 'original', version: 'v1' },
    ]);
  });
  it('rejects duplicate column IDs and required columns', () => {
    expect(() => parseRecord(columnsSchema, [column(), column()])).toThrow();
    expect(() =>
      parseRecord(columnsSchema, [{ ...column(), required: true }]),
    ).toThrow();
  });
  it('pastes updates and additions atomically', () => {
    const result = apply(state([row('r', '10')]), {
      action: 'paste_rows',
      updates: [{ id: 'r', values: { value: '20' } }],
      additions: [{ values: { value: '30' } }],
    });

    expect(result.rows.map((r) => r.cells.value?.raw)).toEqual(['20', '30']);
    expect(result.changedIds).toEqual(['r', 'new-row']);
  });
  it('rejects an invalid paste without committing its valid updates', () => {
    const original = state([row('r', '10')]);
    expect(() =>
      apply(original, {
        action: 'paste_rows',
        updates: [{ id: 'r', values: { value: '20' } }],
        additions: [{ values: { unknown: '30' } }],
      }),
    ).toThrow();
    expect(original.rows[0]!.cells.value?.raw).toBe('10');
  });
});
describe('saved CSV serialization', () => {
  it('escapes commas quotes newlines and Unicode independently of locale', () => {
    const columns = [
      { ...column('text'), name: 'Name, label' },
      { ...column('text'), id: 'other', name: 'Catatan' },
    ];

    const rows = [
      {
        ...row('r', 'Kopi "susu"\n一', 'text'),
        cells: {
          value: interpretCell(columns[0]!, 'Kopi "susu"\n一'),
          other: interpretCell(columns[1]!, 'café, ya'),
        },
      },
    ];

    expect(serializeRecordCsv(columns, rows)).toBe(
      '"Name, label",Catatan\r\n"Kopi ""susu""\n一","café, ya"\r\n',
    );
  });
  it('exports zero false mismatches and absent cells without defaults', () => {
    const columns = [
      column(),
      { ...column('boolean'), id: 'flag' },
      { ...column(), id: 'bad' },
      { ...column(), id: 'absent' },
    ];

    const rows = [
      {
        ...row('r', '0'),
        cells: {
          value: interpretCell(column(), '0'),
          flag: interpretCell(column('boolean'), false),
          bad: interpretCell(column(), 'dua'),
        },
      },
    ];

    expect(serializeRecordCsv(columns, rows)).toBe(
      'Value,Value,Value,Value\r\n0,false,dua,\r\n',
    );
  });
  it('exports headers even when no records exist', () => {
    expect(serializeRecordCsv([column()], [])).toBe('Value\r\n');
  });
});

describe('record row insertion', () => {
  it('inserts around a stable row ID without redirecting existing cells', () => {
    const result = apply(state([row('a', '10'), row('b', '20', 'number', 2)]), {
      action: 'add_rows',
      beforeId: 'b',
      rows: [{ values: { value: '15' } }],
    });

    expect(
      result.rows.map((r) => [r.id, r.position, r.cells.value?.raw]),
    ).toEqual([
      ['a', 1, '10'],
      ['new-row', 2, '15'],
      ['b', 3, '20'],
    ]);
  });
  it('rejects an unavailable insertion anchor without appending elsewhere', () => {
    const original = state([row('a', '10')]);
    expect(() =>
      apply(original, {
        action: 'add_rows',
        beforeId: 'deleted',
        rows: [{ values: { value: '15' } }],
      }),
    ).toThrow();
    expect(original.rows).toHaveLength(1);
  });
});

it('rejects prototype names as column identities while preserving them as display text', () => {
  expect(() =>
    parseRecord(columnsSchema, [{ ...column(), id: '__proto__' }]),
  ).toThrow();
  expect(
    parseRecord(columnsSchema, [{ ...column(), name: '__proto__' }])[0]!.name,
  ).toBe('__proto__');
});
