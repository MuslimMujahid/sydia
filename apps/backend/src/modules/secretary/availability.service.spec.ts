/* eslint-disable @typescript-eslint/require-await -- in-memory doubles implement async repository contracts */
import { jest } from '@jest/globals';
import type {
  ITaskRepository,
  IUserRepository,
} from '../../database/interfaces';
import type {
  CalendarReadService,
  CalendarEventOccurrence,
} from '../calendar/calendar-read.service';
import {
  AvailabilityService,
  AvailabilityUnavailableError,
} from './availability.service';

// Fixture mirrors docs/PROACTIVE_SECRETARY_TEST_SCENARIOS.md (D1 = 2026-10-26, WITA = UTC+8).
const D1 = '2026-10-26';
const at = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`);

function event(
  id: string,
  title: string,
  start: Date | null,
  end: Date | null,
  status: 'confirmed' | 'cancelled' = 'confirmed',
  allDay?: { start: string; end: string },
): CalendarEventOccurrence {
  return {
    id,
    title,
    startAt: start,
    endAt: end,
    status,
    allDayStartDate: allDay ? new Date(`${allDay.start}T00:00:00Z`) : null,
    allDayEndDate: allDay ? new Date(`${allDay.end}T00:00:00Z`) : null,
  } as unknown as CalendarEventOccurrence;
}

const events = [
  event('standup', 'Standup tim', at(D1, '09:00'), at(D1, '09:30')),
  event('design', 'Review desain', at(D1, '11:00'), at(D1, '12:00')),
  event('acme', 'Review proposal Acme', at(D1, '14:00'), at(D1, '15:00')),
  event(
    'cancelled',
    'Rapat dibatalkan',
    at(D1, '15:15'),
    at(D1, '16:00'),
    'cancelled',
  ),
  event('daily', 'Sinkronisasi harian', at(D1, '16:30'), at(D1, '17:00')),
  event(
    'workshop',
    'Lokakarya sehari penuh',
    at('2026-10-27', '09:00'),
    at('2026-10-27', '17:00'),
  ),
  event('leave', 'Cuti sehari', null, null, 'confirmed', {
    start: '2026-10-29',
    end: '2026-10-30',
  }),
];

function service(options: { fail?: boolean } = {}) {
  const calendar = {
    list: jest.fn(async () => {
      if (options.fail) throw new Error('db down');

      return events;
    }),
  } as unknown as CalendarReadService;

  const tasks = {
    findById: jest.fn(async (_user: string, id: string) =>
      id === 'pricing'
        ? {
            id,
            title: 'Finalisasi harga proposal Acme',
            status: 'inbox',
            dueAt: at(D1, '13:00'),
          }
        : null,
    ),
  } as unknown as ITaskRepository;

  const users = {
    findById: jest.fn(async () => ({ id: 'u', timezone: 'Asia/Makassar' })),
  } as unknown as IUserRepository;

  return new AvailabilityService(calendar, tasks, users, {
    now: () => new Date('2026-10-25T10:00:00+08:00'),
  });
}

const base = {
  durationMinutes: 60,
  windowStart: '09:00',
  windowEnd: '17:00',
  bufferMinutes: 15,
};

describe('AvailabilityService against the scheduling oracle', () => {
  test('recommends 09:45–10:45 for the pricing task before its 13:00 deadline', async () => {
    const result = await service().check('u', {
      date: D1,
      ...base,
      preferredBefore: '12:00',
      taskId: 'pricing',
    });

    expect(result.slots[0]).toEqual({
      start: `${D1} 09:45`,
      end: `${D1} 10:45`,
      matchesPreference: true,
    });
    expect(result.constraints.deadline).toBe(`${D1} 13:00`);
    expect(result.slots.every((slot) => slot.end <= `${D1} 13:00`)).toBe(true);
  });

  test('14:30 overlaps the Acme review and 15:15–16:15 is the later valid slot', async () => {
    const result = await service().check('u', {
      date: D1,
      ...base,
      windowStart: '14:00',
      requestedStart: '14:30',
    });

    expect(result.requested?.available).toBe(false);
    expect(result.requested?.conflicts).toEqual([
      expect.objectContaining({
        title: 'Review proposal Acme',
        reason: 'overlap',
      }),
    ]);
    expect(result.slots[0]).toMatchObject({
      start: `${D1} 15:15`,
      end: `${D1} 16:15`,
    });
  });

  test('09:30 violates the buffer after standup without a direct overlap', async () => {
    const result = await service().check('u', {
      date: D1,
      ...base,
      requestedStart: '09:30',
    });

    expect(result.requested?.available).toBe(false);
    expect(result.requested?.conflicts).toEqual([
      expect.objectContaining({ title: 'Standup tim', reason: 'buffer' }),
    ]);
  });

  test('a zero-buffer exception allows touching intervals', async () => {
    const result = await service().check('u', {
      date: D1,
      ...base,
      bufferMinutes: 0,
      requestedStart: '09:30',
    });

    expect(result.requested?.available).toBe(true);
  });

  test('cancelled events do not block; reminders are not busy time', async () => {
    const free = await service().check('u', {
      date: D1,
      ...base,
      requestedStart: '15:15',
    });

    const reminderSlot = await service().check('u', {
      date: D1,
      ...base,
      durationMinutes: 30,
      requestedStart: '13:15',
    });

    expect(free.requested?.available).toBe(true);
    expect(reminderSlot.requested?.available).toBe(true);
  });

  test('no continuous 90 minutes between 09:00 and 13:00', async () => {
    const result = await service().check('u', {
      date: D1,
      ...base,
      durationMinutes: 90,
      windowEnd: '13:00',
    });

    expect(result.status).toBe('no_slot');
    expect(result.slots).toEqual([]);
  });

  test('a full workday leaves no slot inside working hours', async () => {
    const result = await service().check('u', { date: '2026-10-27', ...base });

    expect(result.status).toBe('no_slot');
  });

  test('all-day leave blocks D4 but not its exclusive end day', async () => {
    const leave = await service().check('u', {
      date: '2026-10-29',
      ...base,
      requestedStart: '10:00',
    });

    const after = await service().check('u', {
      date: '2026-10-30',
      ...base,
      requestedStart: '10:00',
    });

    expect(leave.requested?.available).toBe(false);
    expect(after.requested?.available).toBe(true);
  });

  test('a failed calendar read is a visible failure, not an empty calendar', async () => {
    await expect(
      service({ fail: true }).check('u', {
        date: D1,
        ...base,
        requestedStart: '15:15',
      }),
    ).rejects.toBeInstanceOf(AvailabilityUnavailableError);
  });
});
