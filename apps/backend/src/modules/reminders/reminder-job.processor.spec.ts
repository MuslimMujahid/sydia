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
} from '../../database/interfaces';
import { processReminderJob } from './reminder-job.processor';

type Dependencies = Parameters<typeof processReminderJob>[0];
const reminder: ReminderDelivery = {
  id: 'reminder-1',
  userId: 'user-1',
  title: 'Pay invoice',
  notes: null,
  scheduledAt: new Date('2026-09-12T12:00:00.000Z'),
  timezone: 'Asia/Jakarta',
  recurrence: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  source: { type: 'dashboard', label: null, messageId: null },
};

const job = {
  reminderId: 'reminder-1',
  occurrenceId: 'occurrence-1',
  idempotencyKey: 'reminder-1:2026-09-12T12:00:00.000Z',
};

function setup() {
  const find = jest
    .fn<IReminderRepository['findByIdForDelivery']>()
    .mockResolvedValue(reminder);

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

  const enqueue = jest
    .fn<Dependencies['notifications']['enqueue']>()
    .mockResolvedValue({
      deliveries: [],
      replayed: false,
      policyOutcome: 'queued',
    });

  const body = jest
    .fn<Dependencies['composer']['reminderBody']>()
    .mockResolvedValue('Pay invoice');

  const add = jest.fn<Dependencies['queues']['reminders']['add']>();
  const deps: Dependencies = {
    reminders: {
      findByIdForDelivery: find,
      updateDeliverySchedule: advance,
      createOccurrence: occurrence,
    } as unknown as IReminderRepository,
    notifications: { enqueue },
    composer: { reminderBody: body },
    queues: {
      reminders: { add } as unknown as Dependencies['queues']['reminders'],
    },
  };

  return { deps, find, advance, enqueue, add };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(reminder.scheduledAt);
});
afterEach(() => {
  jest.useRealTimers();
});
describe('statusless reminder delivery', () => {
  test('sends a one-time reminder without a lifecycle status or a completion write', async () => {
    const { deps, enqueue, advance } = setup();
    await processReminderJob(deps, job);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        kind: 'reminder',
        content: 'Pay invoice',
        idempotencyKey: job.idempotencyKey,
      }),
    );
    expect(advance).not.toHaveBeenCalled();
  });
  test('does not send a deleted reminder from a leftover queue job', async () => {
    const { deps, find, enqueue } = setup();
    find.mockResolvedValue(null);
    await processReminderJob(deps, job);
    expect(enqueue).not.toHaveBeenCalled();
  });
  test('does not send the old time after a reminder is rescheduled', async () => {
    const { deps, find, enqueue } = setup();
    find.mockResolvedValue({
      ...reminder,
      scheduledAt: new Date('2026-09-13T12:00:00.000Z'),
    });
    await processReminderJob(deps, job);
    expect(enqueue).not.toHaveBeenCalled();
  });
  test('advances a recurring reminder and queues the next daily occurrence', async () => {
    const { deps, find, advance, add } = setup();
    find.mockResolvedValue({
      ...reminder,
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
    const { deps, find, enqueue, advance } = setup();
    find.mockResolvedValue({
      ...reminder,
      recurrence: { frequency: 'daily', interval: 1 },
    });
    enqueue.mockRejectedValue(new Error('Notification queue unavailable'));
    await expect(processReminderJob(deps, job)).rejects.toThrow(
      'Notification queue unavailable',
    );
    expect(advance).not.toHaveBeenCalled();
  });
});
