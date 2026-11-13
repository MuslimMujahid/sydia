/* eslint-disable @typescript-eslint/require-await -- in-memory doubles implement async repository contracts */
import { describe, expect, jest, test } from '@jest/globals';
import type {
  IReminderRepository,
  ReminderOccurrenceDetail,
} from '../../database/interfaces';
import type {
  Reminder,
  ReminderOccurrenceStatus,
  ReminderWrite,
} from '../../database/entities';
import {
  ReminderActionError,
  ReminderLifecycleService,
} from './reminder-lifecycle.service';
import type { ReminderSchedulerService } from './reminder-scheduler.service';

const now = new Date('2026-11-13T01:00:00.000Z');
const MINUTE = 60_000;

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'reminder-1',
    title: 'Rapat',
    notes: 'Bawa laptop',
    scheduledAt: new Date('2026-11-13T00:30:00.000Z'),
    timezone: 'Asia/Jakarta',
    recurrence: null,
    important: false,
    repeatIntervalMinutes: 5,
    snoozedFrom: null,
    latestOccurrence: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    source: { type: 'chat', label: null, messageId: null },
    ...overrides,
  };
}

function occurrence(
  overrides: Partial<ReminderOccurrenceDetail> = {},
): ReminderOccurrenceDetail {
  return {
    id: 'occurrence-1',
    reminderId: 'reminder-1',
    occurrenceAt: new Date('2026-11-13T00:30:00.000Z'),
    status: 'delivered',
    important: false,
    messagesSent: 1,
    lastSentAt: new Date('2026-11-13T00:30:00.000Z'),
    deliveredAt: new Date('2026-11-13T00:30:00.000Z'),
    acknowledgedAt: null,
    userId: 'user-1',
    idempotencyKey: 'reminder-1:2026-11-13T00:30:00.000Z',
    title: 'Rapat',
    ...overrides,
  };
}

function setup(
  options: {
    original?: Reminder;
    occurrence?: ReminderOccurrenceDetail | null;
  } = {},
) {
  const original = options.original ?? reminder();
  const state = {
    occurrence:
      options.occurrence === undefined ? occurrence() : options.occurrence,
    copies: [] as ReminderWrite[],
  };

  const repository = {
    findById: jest.fn(async (_userId: string, id: string) =>
      id === original.id ? original : null,
    ),
    findOccurrence: jest.fn(async (_userId: string, id: string) =>
      state.occurrence && id === state.occurrence.id
        ? { ...state.occurrence }
        : null,
    ),
    findLatestDispatchedOccurrence: jest.fn(async () =>
      state.occurrence && state.occurrence.status !== 'pending'
        ? { ...state.occurrence }
        : null,
    ),
    createSnoozeCopy: jest.fn(
      async (
        _userId: string,
        _id: string,
        allowed: readonly ReminderOccurrenceStatus[],
        copy: ReminderWrite,
      ) => {
        if (!state.occurrence || !allowed.includes(state.occurrence.status))
          return null;
        state.occurrence.status = 'snoozed';
        state.copies.push(copy);

        return reminder({
          ...copy,
          id: 'copy-1',
          notes: copy.notes ?? null,
          recurrence: null,
          important: copy.important ?? false,
          repeatIntervalMinutes: copy.repeatIntervalMinutes ?? 5,
          snoozedFrom: {
            occurrenceId: state.occurrence.id,
            occurrenceAt: state.occurrence.occurrenceAt,
          },
        });
      },
    ),
    listAwaitingAcknowledgement: jest.fn(async () =>
      state.occurrence?.status === 'awaiting_ack' ? [state.occurrence] : [],
    ),
    acknowledge: jest.fn(async (_userId: string, id: string, at: Date) => {
      if (state.occurrence?.id !== id) return null;
      if (state.occurrence.status !== 'awaiting_ack') return null;
      state.occurrence.status = 'acknowledged';
      state.occurrence.acknowledgedAt = at;

      return { ...state.occurrence };
    }),
  };

  const scheduler = {
    schedule: jest
      .fn<(reminder: Reminder) => Promise<void>>()
      .mockResolvedValue(undefined),
    cancelOccurrenceFollowUps: jest
      .fn<(id: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    stopRepeats: jest
      .fn<(id: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    retimeRepeats: jest
      .fn<(userId: string, reminder: Reminder) => Promise<void>>()
      .mockResolvedValue(undefined),
  };

  const service = new ReminderLifecycleService(
    repository as unknown as IReminderRepository,
    scheduler as unknown as ReminderSchedulerService,
  );

  return { service, repository, scheduler, state };
}

const snooze = (
  service: ReminderLifecycleService,
  input: Partial<Parameters<ReminderLifecycleService['snooze']>[1]> = {},
) =>
  service.snooze(
    'user-1',
    {
      occurrenceId: 'occurrence-1',
      until: new Date(now.getTime() + 15 * MINUTE),
      source: { type: 'chat', messageId: 'message-1' },
      ...input,
    },
    now,
  );

describe('snooze', () => {
  test('a fired one-time reminder gets a one-time copy at the new time and its occurrence is snoozed', async () => {
    const { service, scheduler, state } = setup();
    const result = await snooze(service);

    expect(state.copies).toEqual([
      {
        title: 'Rapat',
        notes: 'Bawa laptop',
        scheduledAt: new Date(now.getTime() + 15 * MINUTE),
        timezone: 'Asia/Jakarta',
        recurrence: null,
        important: false,
        repeatIntervalMinutes: 5,
        sourceType: 'chat',
        sourceMessageId: 'message-1',
      },
    ]);
    expect(result.snoozed.status).toBe('snoozed');
    expect(scheduler.schedule).toHaveBeenCalledWith(result.reminder);
    expect(scheduler.cancelOccurrenceFollowUps).toHaveBeenCalledWith(
      'occurrence-1',
    );
  });

  test('a recurring reminder keeps its schedule; only a one-time copy is created', async () => {
    const original = reminder({
      recurrence: { frequency: 'daily', interval: 1 },
      scheduledAt: new Date('2026-11-14T00:30:00.000Z'),
    });

    const { service, state } = setup({ original });
    await snooze(service);

    expect(state.copies[0]?.recurrence).toBeNull();
    expect(original.scheduledAt).toEqual(new Date('2026-11-14T00:30:00.000Z'));
  });

  test('an important reminder awaiting acknowledgement becomes an important copy with the same interval', async () => {
    const { service, state } = setup({
      original: reminder({ important: true, repeatIntervalMinutes: 10 }),
      occurrence: occurrence({ status: 'awaiting_ack', important: true }),
    });

    await snooze(service);

    expect(state.copies[0]).toMatchObject({
      important: true,
      repeatIntervalMinutes: 10,
    });
  });

  test('an expired occurrence can still be snoozed', async () => {
    const { service, state } = setup({
      occurrence: occurrence({ status: 'expired' }),
    });

    await snooze(service);

    expect(state.copies).toHaveLength(1);
  });

  test('a reminder that never fired cannot be snoozed', async () => {
    const { service } = setup({ occurrence: null });

    await expect(
      snooze(service, { occurrenceId: undefined, reminderId: 'reminder-1' }),
    ).rejects.toMatchObject({ code: 'not_dispatched' });
  });

  test('a pending occurrence cannot be snoozed', async () => {
    const { service } = setup({
      occurrence: occurrence({ status: 'pending' }),
    });

    await expect(snooze(service)).rejects.toMatchObject({
      code: 'not_dispatched',
    });
  });

  test('a snooze under one minute away is rejected', async () => {
    const { service } = setup();

    await expect(
      snooze(service, { until: new Date(now.getTime() + 30_000) }),
    ).rejects.toMatchObject({ code: 'too_soon' });
  });

  test('passing the next recurring occurrence needs confirmation', async () => {
    const original = reminder({
      recurrence: { frequency: 'daily', interval: 1 },
      scheduledAt: new Date('2026-11-14T00:30:00.000Z'),
    });

    const late = new Date('2026-11-14T02:00:00.000Z');
    const { service, state } = setup({ original });

    await expect(snooze(service, { until: late })).rejects.toBeInstanceOf(
      ReminderActionError,
    );
    await expect(snooze(service, { until: late })).rejects.toMatchObject({
      code: 'needs_confirmation',
    });
    await snooze(service, { until: late, confirmPastNextOccurrence: true });
    expect(state.copies).toHaveLength(1);
  });

  test("another user's or a missing occurrence is not found", async () => {
    const { service } = setup();

    await expect(
      snooze(service, { occurrenceId: 'missing' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('acknowledge', () => {
  test('acknowledges an awaiting occurrence and removes its pending follow-ups', async () => {
    const { service, scheduler } = setup({
      occurrence: occurrence({ status: 'awaiting_ack', important: true }),
    });

    const result = await service.acknowledge(
      'user-1',
      { occurrenceId: 'occurrence-1' },
      now,
    );

    expect(result.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'occurrence-1', status: 'acknowledged' },
    ]);
    expect(scheduler.cancelOccurrenceFollowUps).toHaveBeenCalledWith(
      'occurrence-1',
    );
  });

  test('a delivered regular occurrence has nothing to acknowledge', async () => {
    const { service } = setup();

    await expect(
      service.acknowledge('user-1', { occurrenceId: 'occurrence-1' }, now),
    ).resolves.toEqual([]);
  });

  test('by reminder id, acknowledges every awaiting occurrence of that reminder', async () => {
    const { service } = setup({
      occurrence: occurrence({ status: 'awaiting_ack' }),
    });

    const result = await service.acknowledge(
      'user-1',
      { reminderId: 'reminder-1' },
      now,
    );

    expect(result).toHaveLength(1);
  });
});

describe('afterUpdate', () => {
  test('rescheduling stops the current repeats', async () => {
    const { service, scheduler } = setup();
    const before = reminder({ important: true });
    await service.afterUpdate('user-1', before, {
      ...before,
      scheduledAt: new Date('2026-11-13T05:00:00.000Z'),
    });

    expect(scheduler.stopRepeats).toHaveBeenCalledWith('reminder-1');
  });

  test('switching to regular stops the current repeats', async () => {
    const { service, scheduler } = setup();
    const before = reminder({ important: true });
    await service.afterUpdate('user-1', before, {
      ...before,
      important: false,
    });

    expect(scheduler.stopRepeats).toHaveBeenCalledWith('reminder-1');
  });

  test('a new interval re-times the pending repeat without stopping it', async () => {
    const { service, scheduler } = setup();
    const before = reminder({ important: true });
    const after = { ...before, repeatIntervalMinutes: 15 };
    await service.afterUpdate('user-1', before, after);

    expect(scheduler.stopRepeats).not.toHaveBeenCalled();
    expect(scheduler.retimeRepeats).toHaveBeenCalledWith('user-1', after);
  });

  test('a title edit leaves repeats untouched', async () => {
    const { service, scheduler } = setup();
    const before = reminder({ important: true });
    await service.afterUpdate('user-1', before, {
      ...before,
      title: 'Rapat 2',
    });

    expect(scheduler.stopRepeats).not.toHaveBeenCalled();
    expect(scheduler.retimeRepeats).not.toHaveBeenCalled();
    expect(scheduler.schedule).toHaveBeenCalled();
  });
});
