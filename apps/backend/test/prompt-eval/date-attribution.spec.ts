import { describe, expect, test } from '@jest/globals';
import {
  checkDateAttribution,
  type DateAttributionSpec,
} from './date-attribution';

const stock: DateAttributionSpec = {
  today: '2026-02-10',
  requestedDate: '2026-02-10',
  rows: [
    { fragment: 'Rice', date: '2026-02-10' },
    { fragment: 'Eggs', date: '2026-02-10' },
    { fragment: 'Flour', date: '2026-02-09' },
  ],
};

const expenses: DateAttributionSpec = {
  today: '2026-02-10',
  requestedDate: '2026-02-09',
  rows: [
    { fragment: 'Water', date: '2026-02-09' },
    { fragment: 'Power', date: '2026-02-09' },
    { fragment: 'Bags', date: '2026-02-10' },
  ],
  totalIdr: 120000,
};

describe('date attribution acceptance', () => {
  test('accepts the requested rows without requiring extra date wording', () => {
    expect(checkDateAttribution('Rice, Eggs.', stock)).toBe(true);
  });
  test('accepts an older row in a separate historical section', () => {
    expect(
      checkDateAttribution(
        'Today:\n- Rice\n- Eggs\nPreviously:\n- Flour',
        stock,
      ),
    ).toBe(true);
  });
  test('accepts dates attached to rows in a table spanning multiple days', () => {
    expect(
      checkDateAttribution(
        '| 9 Feb 2026 | Flour |\n| 10 Feb 2026 | Rice |\n| 10 Feb 2026 | Eggs |',
        stock,
      ),
    ).toBe(true);
  });
  test('accepts an older row with a trailing Indonesian date', () => {
    expect(
      checkDateAttribution(
        'Hari ini: Rice, Eggs.\nSebelumnya Flour (9 Februari 2026).',
        stock,
      ),
    ).toBe(true);
  });
  test('rejects another day presented as part of the requested list', () => {
    expect(
      checkDateAttribution('Today:\n- Rice\n- Eggs\n- Flour', stock),
    ).not.toBe(true);
  });
  test('rejects an undated mixed list', () => {
    expect(checkDateAttribution('Rice, Eggs, Flour.', stock)).not.toBe(true);
  });
  test('rejects a requested row put in a historical section', () => {
    expect(
      checkDateAttribution('Today: Rice.\nPreviously: Eggs, Flour.', stock),
    ).not.toBe(true);
  });
  test('rejects a historical row explicitly dated as today despite a history heading', () => {
    expect(
      checkDateAttribution(
        'Today: Rice, Eggs.\nPreviously: Flour (10 Feb 2026).',
        stock,
      ),
    ).not.toBe(true);
  });
  test('rejects a requested row assigned another explicit date', () => {
    expect(
      checkDateAttribution('9 Feb 2026: Rice\n10 Feb 2026: Eggs', stock),
    ).not.toBe(true);
  });
  test('rejects a repeated historical row falsely included in today after correct history', () => {
    expect(
      checkDateAttribution(
        'Previously: Flour.\nToday: Rice, Eggs, Flour.',
        stock,
      ),
    ).not.toBe(true);
  });
  test('rejects an omitted requested row', () => {
    expect(
      checkDateAttribution('Today: Rice.\nPreviously: Flour.', stock),
    ).not.toBe(true);
  });
  test('accepts an explicit exclusion of today from yesterday total', () => {
    expect(
      checkDateAttribution(
        'Kemarin: Water, Power. Totalnya Rp120.000.\nHari ini Bags belum termasuk.',
        expenses,
      ),
    ).toBe(true);
  });
  test('rejects a total that includes another day', () => {
    expect(
      checkDateAttribution(
        'Kemarin: Water, Power. Totalnya Rp135.000.\nHari ini Bags belum termasuk.',
        expenses,
      ),
    ).not.toBe(true);
  });
  test('accepts a separately identified full-table row count', () => {
    expect(
      checkDateAttribution(
        'Today: Rice, Eggs.\nTabel ini totalnya 3 baris, termasuk Flour (9 Feb 2026).',
        stock,
      ),
    ).toBe(true);
  });
  test('rejects a requested-day row count that includes history', () => {
    expect(
      checkDateAttribution(
        'Today: Rice, Eggs. Total hari ini 3 baris.\nPreviously: Flour.',
        stock,
      ),
    ).not.toBe(true);
  });
  test('accepts a historical heading after a list in the same line', () => {
    expect(
      checkDateAttribution('Today: Rice, Eggs; Previously: Flour.', stock),
    ).toBe(true);
  });
  test('accepts a follow-up offer after correctly listing requested rows', () => {
    expect(
      checkDateAttribution(
        'Today: Rice, Eggs.\nPreviously: Flour.\nWould you like me to update Rice?',
        stock,
      ),
    ).toBe(true);
  });
  test('rejects an incorrect implicit requested-day total even with table wording', () => {
    expect(
      checkDateAttribution(
        'Kemarin: Water, Power. Total tabel Rp135.000.',
        expenses,
      ),
    ).not.toBe(true);
  });
  test('accepts a separate total for another day', () => {
    expect(
      checkDateAttribution(
        'Kemarin: Water, Power. Total Rp120.000.\nHari ini: Bags. Total Rp15.000.',
        expenses,
      ),
    ).toBe(true);
  });
  test('does not let table wording exempt an explicitly requested-day currency total', () => {
    expect(
      checkDateAttribution(
        'Kemarin: Water, Power. Total tabel kemarin Rp135.000.',
        expenses,
      ),
    ).not.toBe(true);
  });
});
