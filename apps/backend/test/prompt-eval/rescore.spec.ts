import { describe, expect, test } from '@jest/globals';
import { rescoreReport, type SavedReport } from './rescore';

function savedAnswer(
  text: string,
  failures: Array<{ check: string; reason: string }> = [],
): SavedReport {
  return {
    meta: { startedAt: '2026-02-10T03:00:00.000Z' },
    scenarios: [
      {
        id: 'open-named-note-held-out-buka',
        area: 'tool-choice',
        passed: failures.length ? 0 : 1,
        runs: [
          {
            text,
            failures,
            calls: [
              { name: 'read_record_note_content', args: { id: 'n-stok' } },
            ],
          },
        ],
      },
    ],
  };
}

describe('saved score replay', () => {
  test('replaces a strict date word ban with accepted historical context', () => {
    const original = savedAnswer(
      'Hari ini: Gula, Telur.\nSebelumnya: Minyak, Tepung.',
      [
        {
          check: 'does not mention "Minyak", "Tepung"',
          reason: 'mentions Minyak, Tepung',
        },
      ],
    );

    const result = rescoreReport(original);
    expect(result.scenarios[0]!.passed).toBe(1);
  });
  test('preserves unrelated failed checks', () => {
    const original = savedAnswer(
      'Hari ini: Gula, Telur.\nSebelumnya: Minyak, Tepung.',
      [{ check: 'replies in Indonesian', reason: 'reply reads as English' }],
    );

    const result = rescoreReport(original);
    expect(result.scenarios[0]!.runs[0]!.failures).toEqual([
      { check: 'replies in Indonesian', reason: 'reply reads as English' },
    ]);
  });
  test('checks originally passing answers for wrong date attribution', () => {
    const original = savedAnswer('Kemarin: Gula, Telur.');
    const result = rescoreReport(original);
    expect(result.scenarios[0]!.passed).toBe(0);
  });
  test('keeps missing requested rows as failures', () => {
    const original = savedAnswer('Hari ini: Gula.', [
      { check: 'mentions "Gula", "Telur"', reason: 'missing Telur' },
    ]);

    const result = rescoreReport(original);
    expect(result.scenarios[0]!.runs[0]!.failures).toEqual([
      {
        check: 'correctly attributes requested-day rows and totals',
        reason: 'Missing requested rows: Telur.',
      },
    ]);
  });
  test('uses the recorded local date across a UTC day boundary', () => {
    const original = savedAnswer(
      '2026-02-11: Gula, Telur.\n2026-02-10: Minyak.\n2026-02-09: Tepung.',
    );

    original.meta.startedAt = '2026-02-10T18:00:00.000Z';
    expect(rescoreReport(original).scenarios[0]!.passed).toBe(1);
  });
  test('does not modify the input report or its recorded tool calls', () => {
    const original = savedAnswer('Hari ini: Gula, Telur.');
    const before = structuredClone(original);
    rescoreReport(original);
    expect(original).toEqual(before);
  });
  test('replaying a revised scorecard is idempotent', () => {
    const original = savedAnswer('Gula, Telur, Minyak.');
    const scored = rescoreReport(original);
    expect(rescoreReport(scored)).toEqual(scored);
  });
  test('marks the scoring version without changing model metadata', () => {
    const original = savedAnswer('Gula, Telur.');
    original.meta.model = 'configured-model';
    expect(rescoreReport(original).meta).toEqual({
      startedAt: '2026-02-10T03:00:00.000Z',
      model: 'configured-model',
      scoringVersion: 'date-attribution-v2',
      fixtureDate: '2026-02-10',
    });
  });
});
