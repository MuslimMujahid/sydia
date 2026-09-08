import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { IConversationRepository } from '../../database/interfaces';
import type { QueueService } from '../../infra/queue';
import { MemoryDreamSchedulerService } from './memory-dream-scheduler.service';

describe('MemoryDreamSchedulerService', () => {
  test('replaces the pending conversation dream with a new idle boundary', async () => {
    const remove = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const pendingJob = {
      data: { kind: 'dream', conversationId: 'conversation-1' },
      remove,
    };

    const add = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({});

    const queues = {
      memoryDreams: {
        getJobs: jest
          .fn<() => Promise<unknown[]>>()
          .mockResolvedValue([pendingJob]),
        add,
      },
    } as unknown as QueueService;

    const scheduler = new MemoryDreamSchedulerService(
      {} as IConversationRepository,
      queues,
      new ConfigService({ BACKEND_MEMORY_DREAM_IDLE_MS: 900_000 }),
    );

    await scheduler.schedule('user-1', 'conversation-1', 'assistant-message-2');

    expect(remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'dream',
      {
        kind: 'dream',
        userId: 'user-1',
        conversationId: 'conversation-1',
        throughMessageId: 'assistant-message-2',
      },
      {
        jobId: 'memory-dream-conversation-1-assistant-message-2',
        delay: 900_000,
      },
    );
  });

  test('queues short pending segments during recovery', async () => {
    const add = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({});

    const findPendingMemoryDreams = jest
      .fn<IConversationRepository['findPendingMemoryDreams']>()
      .mockResolvedValue([
        {
          userId: 'user-1',
          conversationId: 'conversation-1',
          throughMessageId: 'assistant-message-2',
        },
      ]);

    const scheduler = new MemoryDreamSchedulerService(
      { findPendingMemoryDreams } as unknown as IConversationRepository,
      { memoryDreams: { add } } as unknown as QueueService,
      new ConfigService({
        BACKEND_MEMORY_DREAM_SHORT_SEGMENT_AGE_MS: 21_600_000,
      }),
    );

    await expect(scheduler.recover()).resolves.toBe(1);
    expect(add).toHaveBeenCalledWith(
      'dream',
      expect.objectContaining({ allowShortSegment: true }),
      {
        jobId: 'memory-dream-recovery-conversation-1-assistant-message-2',
      },
    );
  });
});
