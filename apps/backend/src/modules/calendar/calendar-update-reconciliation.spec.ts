import { describe, expect, test } from '@jest/globals';
import type { CalendarEventWrite } from '../../database/entities';
import { reconcileCalendarUpdate } from './calendar-update-reconciliation.js';

const base: CalendarEventWrite = {
  title: 'Original',
  location: 'Office',
  description: 'Notes',
  startAt: new Date('2026-10-11T09:00:00Z'),
  endAt: new Date('2026-10-11T10:00:00Z'),
  timezone: 'UTC',
  recurrence: [],
  attendees: ['a@example.test', 'b@example.test'],
  status: 'confirmed',
};

describe('calendar update reconciliation', () => {
  test('patches local fields while preserving independent provider changes', () => {
    expect(
      reconcileCalendarUpdate(
        base,
        { ...base, title: 'Edited' },
        { ...base, location: 'Remote office' },
      ),
    ).toEqual({ status: 'ready', patch: { title: 'Edited' } });
  });
  test('same-value convergence needs no provider write', () => {
    expect(
      reconcileCalendarUpdate(
        base,
        { ...base, title: 'Edited' },
        { ...base, title: 'Edited' },
      ),
    ).toEqual({ status: 'ready', patch: {} });
  });
  test('a different remote value in the requested field is a conflict', () => {
    expect(
      reconcileCalendarUpdate(
        base,
        { ...base, title: 'Edited' },
        { ...base, title: 'Later provider edit' },
      ),
    ).toEqual({ status: 'conflict', fields: ['title'] });
  });
  test('provider attendee order does not create a membership conflict', () => {
    expect(
      reconcileCalendarUpdate(
        base,
        { ...base, title: 'Edited' },
        { ...base, attendees: ['b@example.test', 'a@example.test'] },
      ),
    ).toEqual({ status: 'ready', patch: { title: 'Edited' } });
  });
  test('different attendee membership edits conflict as one group', () => {
    expect(
      reconcileCalendarUpdate(
        base,
        { ...base, attendees: ['a@example.test'] },
        { ...base, attendees: ['c@example.test'] },
      ),
    ).toEqual({ status: 'conflict', fields: ['attendees'] });
  });
  test('time and recurrence changes conflict together', () => {
    expect(
      reconcileCalendarUpdate(
        base,
        { ...base, startAt: new Date('2026-10-11T09:30:00Z') },
        { ...base, recurrence: ['RRULE:FREQ=WEEKLY'] },
      ),
    ).toEqual({ status: 'conflict', fields: ['time'] });
  });
  test('changing a timed event to all-day sends both exclusive dates and recurrence', () => {
    const desired: CalendarEventWrite = {
      title: base.title,
      allDayStartDate: new Date('2026-10-11T00:00:00Z'),
      allDayEndDate: new Date('2026-10-13T00:00:00Z'),
      description: base.description,
      location: base.location,
      attendees: base.attendees,
    };

    expect(reconcileCalendarUpdate(base, desired, base)).toEqual({
      status: 'ready',
      patch: {
        allDayStartDate: desired.allDayStartDate,
        allDayEndDate: desired.allDayEndDate,
        recurrence: [],
      },
    });
  });
  test('clearing optional fields explicitly sends their empty representation', () => {
    expect(
      reconcileCalendarUpdate(
        base,
        { ...base, description: null, location: null, attendees: [] },
        base,
      ),
    ).toEqual({
      status: 'ready',
      patch: { description: null, location: null, attendees: [] },
    });
  });
  test('Google empty strings confirm a requested clearing without another write', () => {
    expect(
      reconcileCalendarUpdate(
        base,
        { ...base, description: null, location: null },
        { ...base, description: '', location: '' },
      ),
    ).toEqual({ status: 'ready', patch: {} });
  });
  test('tentative status is a requested common-field change', () => {
    expect(
      reconcileCalendarUpdate(base, { ...base, status: 'tentative' }, base),
    ).toEqual({ status: 'ready', patch: { status: 'tentative' } });
  });
});
