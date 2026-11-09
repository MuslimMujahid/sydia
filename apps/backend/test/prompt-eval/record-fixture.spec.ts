import { describe, expect, test } from '@jest/globals';
import { recordTable } from './record-fixture';

type Script = (args: Record<string, unknown>) => unknown;

const ORDERS = recordTable({
  id: 'n-pesanan',
  title: 'Catatan Pemesanan',
  description: 'Pesanan masuk.',
  columns: [
    { id: 'pemesan', name: 'Pemesan', type: 'text' },
    { id: 'jumlah', name: 'Jumlah', type: 'number' },
  ],
  revision: 2,
  rows: [{ pemesan: 'Bu Sari', jumlah: '5' }],
});

function run() {
  const tools = ORDERS.fresh();
  const call = (name: string, args: Record<string, unknown> = {}) =>
    (tools[name] as Script)({ id: 'n-pesanan', ...args }) as Record<
      string,
      unknown
    >;

  return { call };
}

describe('fresh record fixture', () => {
  test('a schema change shows in later reads with the next revision', () => {
    const { call } = run();

    call('change_record_schema', {
      revision: 2,
      columns: [
        { id: 'pemesan', name: 'Pemesan', type: 'text', required: false },
        { id: 'jumlah', name: 'Jumlah', type: 'number', required: false },
        { id: 'catatan', name: 'Catatan', type: 'text', required: false },
      ],
    });
    call('add_record_rows', {
      revision: 3,
      batch: {
        rows: [
          {
            values: {
              pemesan: 'Pak Dedi',
              jumlah: '4',
              catatan: 'Ambil sendiri',
            },
          },
        ],
      },
    });

    const page = call('read_record_note_content', { limit: 50 });

    expect(page.revision).toBe(4);
    expect(page.columns).toEqual(['pemesan', 'jumlah', 'catatan']);
    expect(page.rows).toEqual([
      expect.anything(),
      expect.objectContaining({
        cells: expect.objectContaining({
          catatan: expect.objectContaining({ raw: 'Ambil sendiri' }),
        }),
      }),
    ]);
  });

  test('an update changes only the given cells and a cleared cell disappears', () => {
    const { call } = run();

    call('add_record_rows', {
      revision: 2,
      batch: { rows: [{ values: { pemesan: 'Pak Dedi', jumlah: '4' } }] },
    });
    call('update_record_rows', {
      revision: 3,
      batch: { rows: [{ id: 'row-2', values: { jumlah: null } }] },
    });

    const page = call('read_record_note_content', { limit: 50 });
    const rows = page.rows as Array<{ id: string; cells: object }>;

    expect(page.revision).toBe(4);
    expect(rows[1]).toEqual(
      expect.objectContaining({
        id: 'row-2',
        cells: { pemesan: expect.objectContaining({ raw: 'Pak Dedi' }) },
      }),
    );
  });

  test('rows keep their IDs after an earlier row is deleted', () => {
    const { call } = run();

    call('add_record_rows', {
      revision: 2,
      batch: { rows: [{ values: { pemesan: 'Pak Dedi' } }] },
    });
    call('delete_record_rows', { revision: 3, batch: { ids: ['row-1'] } });

    const page = call('read_record_note_content', { limit: 50 });

    expect(page.rows).toEqual([expect.objectContaining({ id: 'row-2' })]);
    expect(
      call('update_record_rows', {
        revision: 4,
        batch: { rows: [{ id: 'row-1', values: { jumlah: '1' } }] },
      }),
    ).toEqual(new Error('Row not found: row-1.'));
  });

  test('each run starts from the original table', () => {
    run().call('change_record_schema', {
      revision: 2,
      columns: [{ id: 'pemesan', name: 'Pemesan', type: 'text' }],
    });

    const page = run().call('read_record_note_content', { limit: 50 });

    expect(page.revision).toBe(2);
    expect(page.columns).toEqual(['pemesan', 'jumlah']);
  });
});
