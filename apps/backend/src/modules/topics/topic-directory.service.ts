import { Inject, Injectable } from '@nestjs/common';
import {
  TOPIC_REPOSITORY,
  type ITopicRepository,
} from '../../database/interfaces';
import type { TopicStatus } from '../../database/entities';

/** How each status is described to the user (TOPIC-PRIV-02). */
const STATUS_LABEL: Record<TopicStatus, string> = {
  active: 'active',
  dormant: 'quiet (not mentioned lately)',
  candidate: 'unconfirmed (mentioned once)',
  dismissed: 'closed',
};

export type TopicDirectoryEntry = {
  topicId: string;
  topic: string;
  alsoCalled?: string[];
  status: string;
  lastDiscussed: string;
  lastDecision?: string;
  nextStep?: string;
  pendingItems: number;
};

/**
 * Everything Sydia keeps as topics for one owner, for "what do you remember
 * about me?" questions and so any topic can be completed, split or forgotten
 * by id. Read-only.
 */
@Injectable()
export class TopicDirectoryService {
  constructor(
    @Inject(TOPIC_REPOSITORY) private readonly topics: ITopicRepository,
  ) {}

  async list(userId: string, now = new Date()): Promise<TopicDirectoryEntry[]> {
    const topics = await this.topics.list(userId, [
      'active',
      'dormant',
      'candidate',
      'dismissed',
    ]);

    if (!topics.length) return [];
    const ids = topics.map(({ id }) => id);
    const [claims, items] = await Promise.all([
      this.topics.claims(ids),
      this.topics.linkedItems(userId, ids, now),
    ]);

    const order: TopicStatus[] = [
      'active',
      'dormant',
      'candidate',
      'dismissed',
    ];

    return [...topics]
      .sort(
        (a, b) =>
          order.indexOf(a.status) - order.indexOf(b.status) ||
          b.lastActiveAt.getTime() - a.lastActiveAt.getTime(),
      )
      .map((topic) => {
        const latest = (kind: 'decision' | 'next_step') =>
          claims.find(
            (claim) => claim.topicId === topic.id && claim.kind === kind,
          )?.text;

        return {
          topicId: topic.id,
          topic: topic.label,
          ...(topic.aliases.length ? { alsoCalled: topic.aliases } : {}),
          status: STATUS_LABEL[topic.status],
          lastDiscussed: topic.lastActiveAt.toISOString().slice(0, 10),
          ...(latest('decision') ? { lastDecision: latest('decision') } : {}),
          ...(latest('next_step') ? { nextStep: latest('next_step') } : {}),
          pendingItems: items.filter(
            (item) => item.topicId === topic.id && item.active,
          ).length,
        };
      });
  }
}
