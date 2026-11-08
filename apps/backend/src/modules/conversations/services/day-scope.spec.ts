import { describe, expect, test } from '@jest/globals';
import { dayScopeContext, dayScopeRange } from './day-scope';

describe('day scope range', () => {
  // 2026-11-08 is a Sunday.
  const today = '2026-11-08';

  test.each([
    ['today', '2026-11-08', '2026-11-08'],
    ['yesterday', '2026-11-07', '2026-11-07'],
    ['tomorrow', '2026-11-09', '2026-11-09'],
    ['this_week', '2026-11-02', '2026-11-08'],
    ['last_week', '2026-10-26', '2026-11-01'],
    ['this_month', '2026-11-01', '2026-11-30'],
    ['last_month', '2026-10-01', '2026-10-31'],
  ] as const)('%s runs from %s to %s', (scope, from, to) => {
    expect(dayScopeRange(scope, today)).toEqual({ from, to });
  });

  test('weeks start on Monday', () => {
    expect(dayScopeRange('this_week', '2026-11-09')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    });
  });

  test('periods cross year and leap-day boundaries', () => {
    expect(dayScopeRange('yesterday', '2027-01-01')).toEqual({
      from: '2026-12-31',
      to: '2026-12-31',
    });
    expect(dayScopeRange('last_month', '2028-03-15')).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
    expect(dayScopeRange('this_month', '2026-12-31')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });

  test('the context line names a single day once and a period by both ends', () => {
    expect(dayScopeContext('today', today)).toContain('today (2026-11-08,');
    expect(dayScopeContext('last_week', today)).toContain(
      'last week (2026-10-26 to 2026-11-01,',
    );
  });
});
