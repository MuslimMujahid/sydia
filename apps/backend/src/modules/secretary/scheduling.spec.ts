import {
  findSchedule,
  schedulingInstant,
  type BusyInterval,
  type ScheduleConstraints,
} from './scheduling';

const now = new Date('2026-10-23T00:00:00Z');
const constraints: ScheduleConstraints = {
  date: '2026-10-24',
  timezone: 'Asia/Makassar',
  durationMinutes: 60,
  windowStart: '09:00',
  windowEnd: '17:00',
  bufferMinutes: 15,
  preferredBefore: '12:00',
};

const busy: BusyInterval[] = [
  {
    id: 'standup',
    title: 'Standup',
    start: new Date('2026-10-24T01:00:00Z'),
    end: new Date('2026-10-24T01:30:00Z'),
  },
  {
    id: 'design',
    title: 'Design',
    start: new Date('2026-10-24T03:00:00Z'),
    end: new Date('2026-10-24T04:00:00Z'),
  },
  {
    id: 'review',
    title: 'Review',
    start: new Date('2026-10-24T06:00:00Z'),
    end: new Date('2026-10-24T07:00:00Z'),
  },
  {
    id: 'daily',
    title: 'Daily',
    start: new Date('2026-10-24T08:30:00Z'),
    end: new Date('2026-10-24T09:00:00Z'),
  },
];

describe('Secretary scheduling constraints', () => {
  test('recommends the earliest full morning interval before the task deadline', () => {
    const result = findSchedule(
      { ...constraints, deadline: new Date('2026-10-24T05:00:00Z') },
      busy,
      now,
    );

    // 09:30 standup finish + 15-minute gap; finish 15 minutes before 11:00 review.
    expect(result.slots).toEqual([
      {
        start: '2026-10-24T01:45:00.000Z',
        end: '2026-10-24T02:45:00.000Z',
        preferred: true,
      },
    ]);
  });

  test('detects overlap and recommends the later interval inside the requested window', () => {
    const result = findSchedule(
      { ...constraints, windowStart: '14:00', requestedStart: '14:30' },
      busy,
      now,
    );

    expect(result.requestedAvailable).toBe(false);
    expect(result.conflicts).toEqual([
      {
        id: 'review',
        title: 'Review',
        start: '2026-10-24T06:00:00.000Z',
        end: '2026-10-24T07:00:00.000Z',
      },
    ]);
    expect(result.slots).toEqual([
      {
        start: '2026-10-24T07:15:00.000Z',
        end: '2026-10-24T08:15:00.000Z',
        preferred: false,
      },
    ]);
  });

  test('rejects a slot that violates the gap even without a direct event overlap', () => {
    const result = findSchedule(
      { ...constraints, requestedStart: '09:30' },
      busy,
      now,
    );

    expect(result.requestedAvailable).toBe(false);
    expect(result.conflicts.map((item) => item.id)).toEqual(['standup']);
  });

  test('permits touching event boundaries when the user explicitly requires no buffer', () => {
    const result = findSchedule(
      { ...constraints, bufferMinutes: 0, requestedStart: '09:30' },
      busy,
      now,
    );

    expect(result.requestedAvailable).toBe(true);
    expect(result.slots[0]).toEqual({
      start: '2026-10-24T01:30:00.000Z',
      end: '2026-10-24T02:30:00.000Z',
      preferred: true,
    });
  });

  test('does not shorten a continuous duration to fit fragmented availability', () => {
    const result = findSchedule(
      { ...constraints, durationMinutes: 90, windowEnd: '13:00' },
      busy,
      now,
    );

    expect(result).toEqual({
      status: 'no_slot',
      slots: [],
      conflicts: [],
      requestedAvailable: null,
    });
  });

  test('does not schedule past the task deadline', () => {
    const result = findSchedule(
      {
        ...constraints,
        windowStart: '12:15',
        deadline: new Date('2026-10-24T05:00:00Z'),
      },
      busy,
      now,
    );

    expect(result.slots).toEqual([]);
  });

  test('does not invent a duration when it is missing or zero', () => {
    expect(() =>
      findSchedule({ ...constraints, durationMinutes: 0 }, busy, now),
    ).toThrow('Specify a duration');
  });

  test('does not offer an interval in the past', () => {
    const result = findSchedule(
      constraints,
      busy,
      new Date('2026-10-24T09:01:00Z'),
    );

    expect(result.slots).toEqual([]);
  });

  test('treats a full-day busy interval as unavailable without relaxing working hours', () => {
    const result = findSchedule(
      constraints,
      [
        {
          id: 'leave',
          title: 'Leave',
          start: new Date('2026-10-23T16:00:00Z'),
          end: new Date('2026-10-24T16:00:00Z'),
        },
      ],
      now,
    );

    expect(result.status).toBe('no_slot');
    expect(result.slots).toEqual([]);
  });

  test('fails on invalid busy data instead of substituting an empty calendar', () => {
    expect(() =>
      findSchedule(
        constraints,
        [
          {
            id: 'bad',
            title: 'Bad',
            start: new Date('invalid'),
            end: new Date('invalid'),
          },
        ],
        now,
      ),
    ).toThrow('Calendar availability contains an invalid interval');
  });

  test('resolves Singapore and Makassar wall times to the same instant', () => {
    expect(
      schedulingInstant('2026-10-26', '10:30', 'Asia/Singapore').toISOString(),
    ).toBe('2026-10-26T02:30:00.000Z');
    expect(
      schedulingInstant('2026-10-26', '10:30', 'Asia/Makassar').toISOString(),
    ).toBe('2026-10-26T02:30:00.000Z');
  });

  test('requires clarification when a local time occurs twice during DST fallback', () => {
    expect(() =>
      schedulingInstant('2026-11-01', '01:30', 'America/New_York'),
    ).toThrow('That local time occurs twice');
  });

  test('rejects a skipped local time during DST spring-forward', () => {
    expect(() =>
      schedulingInstant('2026-03-08', '02:30', 'America/New_York'),
    ).toThrow('That local time is skipped');
  });

  test('rejects impossible calendar dates instead of normalizing into another month', () => {
    expect(() =>
      schedulingInstant('2026-02-30', '09:00', 'Asia/Makassar'),
    ).toThrow('That calendar date does not exist');
  });
});
