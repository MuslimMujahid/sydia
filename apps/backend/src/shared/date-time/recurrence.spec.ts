import { describe, expect, it } from '@jest/globals';
import type { ReminderRecurrence } from '../../database/entities';
import {
  buildReminderRule,
  firstOccurrence,
  nextOccurrence,
  rruleWeekday,
  type ReminderRule,
} from './recurrence';
import { zonedParts } from './timezone-day';

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Local weekday and wall-clock time of an instant, as the zone shows them. */
function readLocal(
  spell: Date | null,
  timezone: string,
): { weekday: string; time: string } | null {
  if (!spell) return null;
  const parts = zonedParts(spell, timezone);

  return {
    weekday:
      WEEKDAYS[
        new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
      ]!,
    time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
  };
}

/** Wall-clock fields a rule produces, read as the zone's own local time. */
function readWallClock(value: Date): { weekday: string; time: string } {
  return {
    weekday: WEEKDAYS[value.getUTCDay()]!,
    time: `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`,
  };
}

function occurrences(
  rule: ReminderRule,
  take = 3,
): { weekday: string; time: string }[] {
  return rule.all((_date, index) => index < take).map(readWallClock);
}

describe('reminder recurrence rules', () => {
  it('shifts stored weekdays onto the rrule Monday-based scale', () => {
    expect(rruleWeekday(0)).toBe(6);
    expect(rruleWeekday(1)).toBe(0);
    expect(rruleWeekday(6)).toBe(5);
  });

  it('fires on the stored weekdays at the stored local time', () => {
    // Gym: Tuesday, Thursday, Friday at 17:00 WIB.
    const recurrence: ReminderRecurrence = {
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: [2, 4, 5],
    };

    const rule = buildReminderRule(
      recurrence,
      new Date('2026-09-15T10:00:00.000Z'),
      'Asia/Jakarta',
    );

    expect(occurrences(rule)).toEqual([
      { weekday: 'Tuesday', time: '17:00' },
      { weekday: 'Thursday', time: '17:00' },
      { weekday: 'Friday', time: '17:00' },
    ]);
  });

  it('holds a weekend morning in a positive-offset zone', () => {
    // Gym: Saturday 07:00 WITA, stored as the previous day in UTC.
    const rule = buildReminderRule(
      { frequency: 'weekly', interval: 1, daysOfWeek: [6] },
      new Date('2026-09-19T23:00:00.000Z'),
      'Asia/Makassar',
    );

    expect(occurrences(rule)).toEqual([
      { weekday: 'Saturday', time: '07:00' },
      { weekday: 'Saturday', time: '07:00' },
      { weekday: 'Saturday', time: '07:00' },
    ]);
  });

  it('keeps one local time of day across a daylight-saving shift', () => {
    // 2026-03-08 is the US spring-forward date; 09:00 local must stay 09:00.
    const rule = buildReminderRule(
      { frequency: 'daily', interval: 1 },
      new Date('2026-03-07T14:00:00.000Z'),
      'America/New_York',
    );

    expect(occurrences(rule).map(({ time }) => time)).toEqual([
      '09:00',
      '09:00',
      '09:00',
    ]);
  });

  it('honours the interval and the stored end date', () => {
    const rule = buildReminderRule(
      {
        frequency: 'weekly',
        interval: 2,
        daysOfWeek: [2],
        endsAt: '2026-10-31T00:00:00.000Z',
      },
      new Date('2026-09-15T10:00:00.000Z'),
      'Asia/Jakarta',
    );

    const all = rule.all();

    expect(all).toHaveLength(4);
    // The rule reports wall-clock fields, so 17:00 Jakarta reads as 17:00 UTC.
    expect(all.map(readWallClock)).toEqual([
      { weekday: 'Tuesday', time: '17:00' },
      { weekday: 'Tuesday', time: '17:00' },
      { weekday: 'Tuesday', time: '17:00' },
      { weekday: 'Tuesday', time: '17:00' },
    ]);
  });
});

describe('reminder occurrence resolution', () => {
  const gym: ReminderRecurrence = {
    frequency: 'weekly',
    interval: 1,
    daysOfWeek: [2, 4, 5],
  };

  it('snaps the first occurrence onto the stored weekdays', () => {
    // 2026-09-16 is a Wednesday in Jakarta, which the rule does not cover.
    expect(
      firstOccurrence(
        gym,
        new Date('2026-09-16T10:00:00.000Z'),
        'Asia/Jakarta',
      ).toISOString(),
    ).toBe('2026-09-17T10:00:00.000Z');

    // A matching weekday and time is kept, so edits are not surprising.
    expect(
      firstOccurrence(
        gym,
        new Date('2026-09-15T10:00:00.000Z'),
        'Asia/Jakarta',
      ).toISOString(),
    ).toBe('2026-09-15T10:00:00.000Z');
  });

  it('returns the next occurrence strictly after the current one', () => {
    expect(
      nextOccurrence(
        gym,
        new Date('2026-09-15T10:00:00.000Z'),
        'Asia/Jakarta',
      )?.toISOString(),
    ).toBe('2026-09-17T10:00:00.000Z');
    expect(
      nextOccurrence(
        gym,
        new Date('2026-09-18T10:00:00.000Z'),
        'Asia/Jakarta',
      )?.toISOString(),
    ).toBe('2026-09-22T10:00:00.000Z');
  });

  it('keeps the local time when the zone offset changes', () => {
    const tuesday: ReminderRecurrence = {
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: [2],
    };

    const next = nextOccurrence(
      tuesday,
      new Date('2026-03-10T13:00:00.000Z'),
      'America/New_York',
    );

    expect(readLocal(next, 'America/New_York')).toEqual({
      weekday: 'Tuesday',
      time: '09:00',
    });
  });

  it('reports no occurrence once the rule has ended', () => {
    expect(
      nextOccurrence(
        {
          frequency: 'weekly',
          interval: 1,
          daysOfWeek: [2],
          endsAt: '2026-09-20T00:00:00.000Z',
        },
        new Date('2026-09-15T10:00:00.000Z'),
        'Asia/Jakarta',
      ),
    ).toBeNull();
  });
});
