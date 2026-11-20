import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  TOPIC_REPOSITORY,
  type ITopicRepository,
} from '../../database/interfaces';
import {
  TOPIC_ITEM_TYPES,
  type TopicItemRef,
  type TopicItemType,
} from '../../database/entities';
import { EmbeddingsService } from '../../infra/embeddings';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { addSalience, decay } from './salience';
import { TOPIC_EVENT_WEIGHTS, TOPIC_SETTINGS } from './topic-settings';

export const DISCONNECT_SCOPES = [
  'episode',
  'item',
  'split',
  'topic_complete',
  'topic_forget',
] as const;
export type DisconnectScope = (typeof DISCONNECT_SCOPES)[number];

export type DisconnectInput = {
  topicId: string;
  scope: DisconnectScope;
  itemType?: TopicItemType;
  itemId?: string;
  /** split: the new topic's name and the listed items that move to it. */
  newLabel?: string;
  items?: TopicItemRef[];
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
  private readonly logger = new Logger(TopicDisconnectService.name);

  constructor(
    @Inject(TOPIC_REPOSITORY) private readonly topics: ITopicRepository,
    @Optional() private readonly embeddings?: EmbeddingsService,
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

      case 'split':
        return done(await this.split(userId, conversationId, topic.id, input));
      case 'topic_complete':
        await this.topics.update(userId, topic.id, {
          status: 'dismissed',
          dismissedReason: 'completed',
          statusAtActiveDay: await this.topics.activeDayCount(userId),
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

  /** TOPIC-DISC-02: move the named items into a new topic the user named. */
  private async split(
    userId: string,
    conversationId: string | undefined,
    topicId: string,
    input: DisconnectInput,
  ): Promise<string> {
    const label = input.newLabel?.trim().replace(/\s+/g, ' ') ?? '';
    const items = input.items ?? [];
    if (!label || label.length > 80 || !items.length)
      throw refused(
        'A split needs the new topic name and at least one listed item. Changed nothing.',
      );
    const now = new Date();
    const linked = await this.topics.linkedItems(userId, [topicId], now);
    const missing = items.filter(
      (item) =>
        !linked.some(
          (entry) => entry.type === item.type && entry.id === item.id,
        ),
    );

    if (missing.length)
      throw refused(
        'Some of those items are not linked to this topic. Changed nothing.',
      );

    const activeDay = await this.topics.activeDayCount(userId);
    const created = await this.topics.create({
      userId,
      label,
      aliases: [],
      episodeKey: `${conversationId ?? 'split'}:${now.toISOString()}`,
      activeDay,
      at: now,
    });

    for (const item of items)
      await this.topics.removeLink(userId, topicId, item);
    await this.topics.linkItems(created.id, items, 'user_stated');

    let embedding: number[] | null = null;

    try {
      embedding = (await this.embeddings?.embed(label)) ?? null;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'topic_embedding_failed',
          topicId: created.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          remediation:
            'The new topic is found by its links until its next update embeds it.',
        }),
      );
    }

    // The user named this effort, so it is confirmed from the start.
    await this.topics.update(userId, created.id, {
      status: 'active',
      statusAtActiveDay: activeDay,
      ...(embedding ? { embedding } : {}),
    });

    return `Moved ${items.length} item(s) into the new topic "${label}"; they will not be linked back to the old one.`;
  }
}
