import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CONVERSATION_REPOSITORY,
  type IConversationRepository,
} from '../../database/interfaces';
import { QueueService } from '../../infra/queue';

const DEFAULT_IDLE_DELAY_MS = 15 * 60 * 1000;
const DEFAULT_SHORT_SEGMENT_AGE_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class MemoryDreamSchedulerService {
  private readonly idleDelayMs: number;
  private readonly shortSegmentAgeMs: number;

  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    private readonly queues: QueueService,
    config: ConfigService,
  ) {
    this.idleDelayMs = config.get<number>(
      'BACKEND_MEMORY_DREAM_IDLE_MS',
      DEFAULT_IDLE_DELAY_MS,
    );
    this.shortSegmentAgeMs = config.get<number>(
      'BACKEND_MEMORY_DREAM_SHORT_SEGMENT_AGE_MS',
      DEFAULT_SHORT_SEGMENT_AGE_MS,
    );
  }

  async schedule(
    userId: string,
    conversationId: string,
    throughMessageId: string,
  ): Promise<void> {
    const pending = await this.queues.memoryDreams.getJobs([
      'delayed',
      'waiting',
    ]);

    await Promise.all(
      pending
        .filter(
          (job) =>
            job.data.kind === 'dream' &&
            job.data.conversationId === conversationId,
        )
        .map((job) => job.remove()),
    );

    await this.queues.memoryDreams.add(
      'dream',
      { kind: 'dream', userId, conversationId, throughMessageId },
      {
        jobId: `memory-dream-${conversationId}-${throughMessageId}`,
        delay: this.idleDelayMs,
      },
    );
  }

  async recover(): Promise<number> {
    const pending = await this.conversations.findPendingMemoryDreams(
      new Date(Date.now() - this.shortSegmentAgeMs),
    );

    await Promise.all(
      pending.map(({ userId, conversationId, throughMessageId }) =>
        this.queues.memoryDreams.add(
          'dream',
          {
            kind: 'dream' as const,
            userId,
            conversationId,
            throughMessageId,
            allowShortSegment: true,
          },
          {
            jobId: `memory-dream-recovery-${conversationId}-${throughMessageId}`,
          },
        ),
      ),
    );

    return pending.length;
  }
}
