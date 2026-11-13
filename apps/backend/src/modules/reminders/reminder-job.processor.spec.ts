/* eslint-disable @typescript-eslint/require-await -- in-memory doubles implement async repository contracts */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import type {
  ReminderDelivery,
  IReminderRepository,
  ReminderOccurrenceDetail,
} from '../../database/interfaces';
import type { ReminderOccurrenceStatus } from '../../database/entities';
import type { ReminderJob } from '../../infra/queue';
import { processReminderJob } from './reminder-job.processor';

type Dependencies = Parameters<typeof processReminderJob>[0];
type EnqueueInput = Parameters<Dependencies['notifications']['enqueue']>[0];
const MINUTE = 60_000;
const t0 = new Date('2026-09-12T12:00:00.000Z');

const reminder: ReminderDelivery = {
  id: 'reminder-1',
  userId: 'user-1',
  title: 'Pay invoice',
  notes: null,
  scheduledAt: t0,
  timezone: 'Asia/Jakarta',
  recurrence: null,
  important: false,
  repeatIntervalMinutes: 5,
  snoozedFrom: null,
  latestOccurrence: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  source: { type: 'dashboard', label: null, messageId: null },
};

const job = {
  reminderId: 'reminder-1',
  occurrenceId: 'occurrence-1',
  idempotencyKey: 'reminder-1:2026-09-12T12:00:00.000Z',
};

/** In-memory occurrence lifecycle with the repository's compare-and-set rules. */
function occurrenceStore() {
  const state: ReminderOccurrenceDetail = {
    id: 'occurrence-1',
    reminderId: 'reminder-1',
    occurrenceAt: t0,
    idempotencyKey: job.idempotencyKey,
    userId: 'user-1',
    title: 'Pay invoice',
    status: 'pending',
    important: false,
    messagesSent: 0,
    lastSentAt: null,
    deliveredAt: null,
    acknowledgedAt: null,
  };

  return {
    state,
    repository: {
      findOccurrenceForDelivery: jest.fn(async (id: string) =>
        id === state.id ? { ...state } : null,
      ),
      markDispatched: jest.fn(
        async (_id: string, input: { important: boolean; at: Date }) => {
          if (state.status !== 'pending') return false;
          state.status = input.important ? 'awaiting_ack' : 'delivered';
          state.important = input.important;
          state.messagesSent = 1;
          state.lastSentAt = input.at;

          return true;
        },
      ),
      recordRepeat: jest.fn(async (_id: string, expected: number, at: Date) => {
        if (state.status !== 'awaiting_ack' || state.messagesSent !== expected)
          return false;
        state.messagesSent += 1;
        state.lastSentAt = at;

        return true;
      }),
      transitionOccurrence: jest.fn(
        async (
          _id: string,
          from: readonly ReminderOccurrenceStatus[],
          to: ReminderOccurrenceStatus,
        ) => {
          if (!from.includes(state.status)) return false;
          state.status = to;

          return true;
        },
      ),
      supersedeAwaiting: jest
        .fn<
          (reminderId: string, exceptOccurrenceId: string) => Promise<string[]>
        >()
        .mockResolvedValue([]),
    },
  };
}

function setup(overrides: Partial<ReminderDelivery> = {}) {
  const store = occurrenceStore();
  const current = { reminder: { ...reminder, ...overrides } };
  const find = jest.fn(async () => current.reminder as ReminderDelivery | null);
  const advance = jest
    .fn<IReminderRepository['updateDeliverySchedule']>()
    .mockResolvedValue(reminder);

  const occurrence = jest
    .fn<IReminderRepository['createOccurrence']>()
    .mockResolvedValue({
      id: 'occurrence-2',
      idempotencyKey: 'reminder-1:2026-09-13T12:00:00.000Z',
      status: 'pending',
    });

  const sent: EnqueueInput[] = [];
  const enqueue = jest.fn(async (input: EnqueueInput) => {
    sent.push(input);

    return {
      deliveries: [],
      replayed: false,
      policyOutcome: 'queued' as const,
    };
  });

  const body = jest.fn(
    async (
      _reminder: ReminderDelivery,
      options: { occurrenceAt?: Date; sequence?: number } = {},
    ) => `body #${options.sequence ?? 1}`,
  );

  const finalBody = jest.fn(async () => 'final');
  const add = jest
    .fn<(name: string, data: ReminderJob, options: unknown) => Promise<void>>()
    .mockResolvedValue(undefined);

  const deps: Dependencies = {
    reminders: {
      findByIdForDelivery: find,
      updateDeliverySchedule: advance,
      createOccurrence: occurrence,
      ...store.repository,
    } as unknown as IReminderRepository,
    notifications: { enqueue },
    composer: { reminderBody: body, reminderFinalBody: finalBody },
    queues: {
      reminders: { add } as unknown as Dependencies['queues']['reminders'],
    },
    now: () => new Date(Date.now()),
  };

  /** Runs the newest queued follow-up after its delay elapses. */
  const runNextFollowUp = async (): Promise<boolean> => {
    const call = add.mock.calls.at(-1);
    if (!call) return false;
    const [, data, options] = call as [string, ReminderJob, { delay: number }];

    if (data.kind !== 'repeat' && data.kind !== 'final') return false;
    add.mockClear();
    jest.setSystemTime(Date.now() + options.delay);
    await processReminderJob(deps, data);

    return true;
  };

  return {
    deps,
    store,
    current,
    find,
    advance,
    enqueue,
    sent,
    add,
    body,
    runNextFollowUp,
  };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(t0);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('regular reminder dispatch', () => {
  test('sends a one-time reminder once and marks the occurrence delivered', async () => {
    const { deps, enqueue, advance, add, store } = setup();
    await processReminderJob(deps, job);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        kind: 'reminder',
        content: 'body #1',
        idempotencyKey: job.idempotencyKey,
      }),
    );
    expect(store.state).toMatchObject({ status: 'delivered', messagesSent: 1 });
    expect(add).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
  });
  test('does not send a deleted reminder from a leftover queue job', async () => {
    const { deps, find, enqueue } = setup();
    find.mockResolvedValue(null);
    await processReminderJob(deps, job);
    expect(enqueue).not.toHaveBeenCalled();
  });
  test('does not send the old time after a reminder is rescheduled', async () => {
    const { deps, current, enqueue } = setup();
    current.reminder = {
      ...reminder,
      scheduledAt: new Date('2026-09-13T12:00:00.000Z'),
    };
    await processReminderJob(deps, job);
    expect(enqueue).not.toHaveBeenCalled();
  });
  test('advances a recurring reminder and queues the next daily occurrence', async () => {
    const { deps, advance, add } = setup({
      recurrence: { frequency: 'daily', interval: 1 },
    });

    await processReminderJob(deps, job);
    expect(advance).toHaveBeenCalledWith(
      'reminder-1',
      new Date('2026-09-13T12:00:00.000Z'),
    );
    expect(add).toHaveBeenCalledWith(
      'dispatch',
      {
        reminderId: 'reminder-1',
        occurrenceId: 'occurrence-2',
        idempotencyKey: 'reminder-1:2026-09-13T12:00:00.000Z',
      },
      { jobId: 'reminder-1-2026-09-13T12-00-00.000Z', delay: 86400000 },
    );
  });
  test('does not advance recurrence when notification enqueue fails', async () => {
    const { deps, enqueue, advance } = setup({
      recurrence: { frequency: 'daily', interval: 1 },
    });

    enqueue.mockRejectedValue(new Error('Notification queue unavailable'));
    await expect(processReminderJob(deps, job)).rejects.toThrow(
      'Notification queue unavailable',
    );
    expect(advance).not.toHaveBeenCalled();
  });
});

describe('important reminder repeats', () => {
  test('an unacknowledged reminder sends ten messages at the interval, then one final note', async () => {
    const { deps, sent, store, runNextFollowUp } = setup({ important: true });
    await processReminderJob(deps, job);
    while (await runNextFollowUp());

    const reminders = sent.filter(({ kind }) => kind !== 'reminder_final');
    expect(reminders.map(({ kind }) => kind)).toEqual([
      'reminder',
      ...Array.from({ length: 9 }, () => 'reminder_repeat'),
    ]);
    expect(reminders.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      job.idempotencyKey,
      ...Array.from(
        { length: 9 },
        (_, index) => `${job.idempotencyKey}:repeat:${index + 2}`,
      ),
    ]);
    expect(sent.at(-1)).toMatchObject({
      kind: 'reminder_final',
      content: 'final',
      idempotencyKey: `${job.idempotencyKey}:final`,
    });
    expect(store.state).toMatchObject({ status: 'expired', messagesSent: 10 });
    // Ten messages 5 minutes apart, the final note one interval later.
    expect(Date.now() - t0.getTime()).toBe(50 * MINUTE);
  });

  test('repeats render the repeat number and the original occurrence time', async () => {
    const { deps, body, runNextFollowUp } = setup({ important: true });
    await processReminderJob(deps, job);
    await runNextFollowUp();
    expect(body).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'reminder-1' }),
      { occurrenceAt: t0, sequence: 2 },
    );
  });

  test('a newer occurrence supersedes older awaiting ones of the same reminder', async () => {
    const { deps, store } = setup({ important: true });
    await processReminderJob(deps, job);
    expect(store.repository.supersedeAwaiting.mock.calls).toEqual([
      ['reminder-1', 'occurrence-1'],
    ]);
  });

  test('acknowledging after the third message stops every later message', async () => {
    const { deps, sent, store, add, runNextFollowUp } = setup({
      important: true,
    });

    await processReminderJob(deps, job);
    await runNextFollowUp();
    await runNextFollowUp();
    expect(sent).toHaveLength(3);
    store.state.status = 'acknowledged';
    await runNextFollowUp();
    expect(sent).toHaveLength(3);
    expect(add).not.toHaveBeenCalled();
  });

  test('switching the reminder to regular drops the pending repeat', async () => {
    const { deps, sent, current, runNextFollowUp } = setup({ important: true });
    await processReminderJob(deps, job);
    current.reminder = { ...current.reminder, important: false };
    await runNextFollowUp();
    expect(sent).toHaveLength(1);
  });

  test('a changed interval applies to the next repeat onward', async () => {
    const { deps, current, add, runNextFollowUp } = setup({ important: true });
    await processReminderJob(deps, job);
    current.reminder = { ...current.reminder, repeatIntervalMinutes: 15 };
    await runNextFollowUp();
    expect(add).toHaveBeenLastCalledWith(
      'repeat',
      expect.objectContaining({ sequence: 3 }),
      expect.objectContaining({ delay: 15 * MINUTE }),
    );
  });

  test('a retried repeat whose count was recorded re-sends the same message', async () => {
    const { deps, sent, store } = setup({ important: true });
    await processReminderJob(deps, job);
    const repeat: ReminderJob = {
      kind: 'repeat',
      reminderId: 'reminder-1',
      occurrenceId: 'occurrence-1',
      sequence: 2,
    };

    store.state.messagesSent = 2;
    await processReminderJob(deps, repeat);
    expect(sent.at(-1)?.idempotencyKey).toBe(`${job.idempotencyKey}:repeat:2`);
    expect(store.repository.recordRepeat).not.toHaveBeenCalled();
  });

  test('a stale repeat for an older count sends nothing', async () => {
    const { deps, sent, store } = setup({ important: true });
    await processReminderJob(deps, job);
    store.state.messagesSent = 4;
    await processReminderJob(deps, {
      kind: 'repeat',
      reminderId: 'reminder-1',
      occurrenceId: 'occurrence-1',
      sequence: 2,
    });
    expect(sent).toHaveLength(1);
  });

  test('the final note is skipped once the occurrence was snoozed', async () => {
    const { deps, sent, store } = setup({ important: true });
    await processReminderJob(deps, job);
    store.state.status = 'snoozed';
    await processReminderJob(deps, {
      kind: 'final',
      reminderId: 'reminder-1',
      occurrenceId: 'occurrence-1',
    });
    expect(sent).toHaveLength(1);
  });
});
