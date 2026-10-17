import { expect, test } from '@jest/globals';
import { briefingDayWindows, isWeeklyBriefingDay } from './briefing-schedule';

test('weekly day follows the account date even when UTC is still Sunday', () => {
  expect(
    isWeeklyBriefingDay(new Date('2026-10-18T16:00:00Z'), 'Asia/Makassar', 1),
  ).toBe(true);
  expect(
    isWeeklyBriefingDay(new Date('2026-10-18T15:59:00Z'), 'Asia/Makassar', 1),
  ).toBe(false);
});

test('Sunday is ISO weekday seven', () => {
  expect(
    isWeeklyBriefingDay(new Date('2026-10-18T00:00:00Z'), 'Asia/Makassar', 7),
  ).toBe(true);
});

test('spring DST week ends at the seventh local midnight rather than after 168 hours', () => {
  const days = briefingDayWindows(
    new Date('2026-03-07T15:00:00Z'),
    'America/New_York',
  );

  expect(days.map((day) => day.date)).toEqual([
    '2026-03-07',
    '2026-03-08',
    '2026-03-09',
    '2026-03-10',
    '2026-03-11',
    '2026-03-12',
    '2026-03-13',
  ]);
  expect(days[0]!.start.toISOString()).toBe('2026-03-07T05:00:00.000Z');
  expect(days[6]!.end.toISOString()).toBe('2026-03-14T04:00:00.000Z');
});

test('autumn DST week preserves all seven local days', () => {
  const days = briefingDayWindows(
    new Date('2026-10-31T14:00:00Z'),
    'America/New_York',
  );

  expect(days[0]!.start.toISOString()).toBe('2026-10-31T04:00:00.000Z');
  expect(days[6]!.date).toBe('2026-11-06');
  expect(days[6]!.end.toISOString()).toBe('2026-11-07T05:00:00.000Z');
});
