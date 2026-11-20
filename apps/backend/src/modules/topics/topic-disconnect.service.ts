import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  TOPIC_REPOSITORY,
  type ITopicRepository,
} from '../../database/interfaces';
import { TOPIC_ITEM_TYPES, type TopicItemType } from '../../database/entities';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { addSalience, decay } from './salience';
import { TOPIC_EVENT_WEIGHTS, TOPIC_SETTINGS } from './topic-settings';

export const DISCONNECT_SCOPES = [
  'episode',
  'item',
  'topic_complete',
  'topic_forget',
] as const;
export type DisconnectScope = (typeof DISCONNECT_SCOPES)[number];

export type DisconnectInput = {
  topicId: string;
  scope: DisconnectScope;
  itemType?: TopicItemType;
  itemId?: string;
};

function refused(message: string): ApiException {
  return new ApiException({
    code: ErrorCodes.BAD_REQUEST,
    status: HttpStatus.BAD_REQUEST,
    message,
  });
}

/**
 * Applies a user's correction to a topic link (TOPIC-DISC-01). Every scope has
 * one deterministic effect; nothing is inferred here.
 */
@Injectable()
export class TopicDisconnectService {
  constructor(
    @Inject(TOPIC_REPOSITORY) private readonly topics: ITopicRepository,
  ) {}

  async disconnect(
    userId: string,
    conversationId: string | undefined,
    input: DisconnectInput,
  ): Promise<{
    status: 'done';
    scope: DisconnectScope;
    topic: string;
    effect: string;
  }> {
    const topic = await this.topics.find(userId, input.topicId);
    if (!topic) throw refused('That topic does not exist. Changed nothing.');
    const done = (effect: string) => ({
      status: 'done' as const,
      scope: input.scope,
      topic: topic.label,
      effect,
    });

    switch (input.scope) {
      case 'episode': {
        if (!conversationId)
          throw refused(
            'Episode disconnects need a conversation. Changed nothing.',
          );
        const [activeDay, state] = await Promise.all([
          this.topics.activeDayCount(userId),
          this.topics.conversationState(conversationId),
        ]);

        const episodeKey =
          state?.episodeKey ?? `${conversationId}:${new Date().toISOString()}`;

        await this.topics.suppress(topic.id, conversationId);
        const recorded = await this.topics.recordEvent({
          topicId: topic.id,
          kind: 'disconnect',
          weight: TOPIC_EVENT_WEIGHTS.disconnect,
          episodeKey,
          conversationId,
          activeDay,
        });

        if (recorded) {
          // Take back this episode's credit, then apply the penalty (TOPIC-RANK-01).
          const credit =
            topic.lastEpisodeKey === episodeKey
              ? TOPIC_EVENT_WEIGHTS.assigned
              : 0;

          const offset = decay(
            topic.gateCutoffOffset,
            activeDay - topic.gateOffsetAtActiveDay,
          );

          await this.topics.update(userId, topic.id, {
            ...addSalience(
              topic,
              TOPIC_EVENT_WEIGHTS.disconnect - credit,
              activeDay,
            ),
            gateCutoffOffset: Math.min(
              TOPIC_SETTINGS.disconnectCap,
              offset + TOPIC_SETTINGS.disconnectStep,
            ),
            gateOffsetAtActiveDay: activeDay,
          });
        }

        return done(
          'Not connected to this topic for the rest of this conversation; it can come up again later.',
        );
      }

      case 'item': {
        if (
          !input.itemId ||
          !input.itemType ||
          !TOPIC_ITEM_TYPES.includes(input.itemType)
        )
          throw refused(
            'Item disconnects need the item type and id from the topic. Changed nothing.',
          );
        const removed = await this.topics.removeLink(userId, topic.id, {
          type: input.itemType,
          id: input.itemId,
        });

        if (!removed)
          throw refused(
            'That item is not linked to this topic. Changed nothing.',
          );

        return done(
          'The item is no longer linked to this topic and will not be linked again.',
        );
      }

      case 'topic_complete':
        await this.topics.update(userId, topic.id, {
          status: 'dismissed',
          dismissedReason: 'completed',
        });

        return done(
          'The topic is closed; it comes back only if the user names it again.',
        );
      case 'topic_forget':
        await this.topics.deleteTopic(userId, topic.id);

        return done(
          'The topic and everything Sydia derived for it are deleted.',
        );
    }
  }
}
