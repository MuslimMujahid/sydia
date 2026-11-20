import { Injectable, Logger } from '@nestjs/common';
import { DecisionSettings } from '../../infra/decision-gateway';
import { QueueService } from '../../infra/queue';
import { TOPIC_SETTINGS } from './topic-settings';

/**
 * Queues topic formation after a reply (TOPIC-FORM-01), debounced per
 * conversation so a burst of messages is formed once. A lost enqueue loses
 * nothing: formation reads from a per-conversation cursor, so the next turn's
 * job picks the skipped messages up.
 */
@Injectable()
export class TopicSchedulerService {
  private readonly logger = new Logger(TopicSchedulerService.name);

  constructor(
    private readonly queues: QueueService,
    private readonly settings: DecisionSettings,
  ) {}

  async schedule(userId: string, conversationId: string): Promise<void> {
    if (this.settings.mode('topics', userId) === 'off') return;

    try {
      await this.queues.topicFormations.add(
        'form',
        { userId, conversationId },
        {
          delay: TOPIC_SETTINGS.formationDelayMs,
          deduplication: {
            id: `topic-formation-${conversationId}`,
            ttl: TOPIC_SETTINGS.formationDelayMs,
            extend: true,
            replace: true,
          },
        },
      );
    } catch (error) {
      this.logger.error(
        'Topic formation enqueue failed; the next turn in this conversation picks the messages up. Check Redis connectivity.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
