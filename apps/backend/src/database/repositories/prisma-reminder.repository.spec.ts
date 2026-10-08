import { describe, expect, jest, test } from '@jest/globals';
import type { PrismaService } from '../../infra/prisma';
import { PrismaReminderRepository } from './prisma-reminder.repository';

describe('reminder API projection', () => {
  test('lists reminders without lifecycle status or completion timestamps', async () => {
    const row = {
      id: 'reminder-1',
      userId: 'user-1',
      title: 'Pay invoice',
      notes: null,
      scheduledAt: new Date('2026-09-12T12:00:00.000Z'),
      timezone: 'Asia/Jakarta',
      recurrence: null,
      sourceType: 'dashboard',
      sourceMessageId: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };

    const findMany = jest
      .fn<(args: unknown) => Promise<(typeof row)[]>>()
      .mockResolvedValue([row]);

    const repository = new PrismaReminderRepository({
      reminder: { findMany },
    } as unknown as PrismaService);

    const reminders = await repository.list('user-1', {
      now: new Date('2026-09-12T00:00:00.000Z'),
    });

    expect(reminders).toEqual([
      {
        id: 'reminder-1',
        title: 'Pay invoice',
        notes: null,
        scheduledAt: new Date('2026-09-12T12:00:00.000Z'),
        timezone: 'Asia/Jakarta',
        recurrence: null,
        source: {
          type: 'dashboard',
          label: 'Dibuat di dasbor',
          messageId: null,
        },
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ status: expect.anything() }),
        select: expect.not.objectContaining({ status: true }),
      }),
    );
  });
});
