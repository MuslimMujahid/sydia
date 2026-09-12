import { describe, expect, jest, test } from '@jest/globals';
import type { Reminder } from '../../database/entities';
import type {
  IReminderRepository,
  IUserRepository,
} from '../../database/interfaces';
import type { QueueService } from '../../infra/queue';
import { ReminderSchedulerService } from './reminder-scheduler.service';

const reminder: Reminder = {
  id: 'reminder-1',
  title: 'Pay invoice',
  notes: null,
  status: 'scheduled',
  scheduledAt: new Date('2026-09-12T12:00:00.000Z'),
  recurrence: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  source: { type: 'dashboard', label: null, messageId: null },
};

describe('ReminderSchedulerService', () => {
  test('queues both the occurrence id and its idempotency key', async () => {
    const createOccurrence = jest
      .fn<IReminderRepository['createOccurrence']>()
      .mockResolvedValue({
        id: 'occurrence-1',
        idempotencyKey: 'reminder-1:2026-09-12T12:00:00.000Z',
      });

    const reminders = {
      createOccurrence,
    } as unknown as IReminderRepository;

    const add = jest.fn<
      (name: string, data: unknown, options: unknown) => Promise<void>
    >(() => Promise.resolve());

    const queues = {
      reminders: {
        getJobs: jest.fn(() => Promise.resolve([])),
        getJob: jest.fn(() => Promise.resolve(undefined)),
        add,
      },
    } as unknown as QueueService;

    const service = new ReminderSchedulerService(
      reminders,
      {} as IUserRepository,
      queues,
    );

    await service.schedule(reminder);

    expect(add).toHaveBeenCalledWith(
      'dispatch',
      {
        reminderId: 'reminder-1',
        idempotencyKey: 'reminder-1:2026-09-12T12:00:00.000Z',
        occurrenceId: 'occurrence-1',
      },
      expect.objectContaining({
        jobId: 'reminder-1-2026-09-12T12-00-00.000Z',
      }),
    );
  });
});
