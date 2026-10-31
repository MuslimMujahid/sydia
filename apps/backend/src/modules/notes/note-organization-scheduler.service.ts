import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueService } from '../../infra/queue';
import {
  NOTE_WORK_REPOSITORY,
  type INoteWorkRepository,
} from '../../database/interfaces';

@Injectable()
export class NoteOrganizationSchedulerService {
  private readonly logger = new Logger(NoteOrganizationSchedulerService.name);
  private readonly idleMs: number;
  constructor(
    @Inject(NOTE_WORK_REPOSITORY) private readonly work: INoteWorkRepository,
    private readonly queues: QueueService,
    config: ConfigService,
  ) {
    this.idleMs = Number(
      config.get<number | string>('BACKEND_MEMORY_DREAM_IDLE_MS', 15 * 60_000),
    );
    if (!Number.isFinite(this.idleMs) || this.idleMs < 0)
      throw new Error(
        'BACKEND_MEMORY_DREAM_IDLE_MS must be a non-negative finite duration.',
      );
  }

  async schedule(userId: string, conversationId: string, messageId: string) {
    await this.work.acceptMessage({
      userId,
      sourceMessageId: messageId,
      key: `source:message:${messageId}`,
      stage: 'source',
      notBefore: new Date(Date.now() + this.idleMs),
      payload: {},
    });

    try {
      await this.queues.noteOrganizations.add(
        'organize',
        { kind: 'user', userId },
        {
          delay: this.idleMs,
          deduplication: {
            id: `note-organization-${conversationId}`,
            ttl: this.idleMs,
            extend: true,
            replace: true,
          },
        },
      );
    } catch (error) {
      this.logger.error(
        'Note organization enqueue failed; durable source remains eligible for periodic recovery. Check Redis connectivity.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
