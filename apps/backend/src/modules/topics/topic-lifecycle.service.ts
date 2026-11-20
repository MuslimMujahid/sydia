import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TOPIC_REPOSITORY,
  type ITopicRepository,
} from '../../database/interfaces';
import { lifecycleChange, overCap } from './topic-lifecycle';

const ANCHOR_TYPES = new Set(['reminder', 'task', 'calendar_event']);

export type LifecycleSweepResult = {
  users: number;
  dormant: number;
  dismissed: number;
  deleted: number;
  failedUsers: number;
};

/**
 * Daily lifecycle sweep (TOPIC-LIFE-01/02): expires unconfirmed candidates,
 * moves topics nobody returns to from active to dormant to dismissed, deletes
 * dismissed topics after a year, and keeps active topics under the cap. Decay
 * runs on each owner's active-day clock, so a user who is away loses nothing.
 */
@Injectable()
export class TopicLifecycleService {
  private readonly logger = new Logger(TopicLifecycleService.name);

  constructor(
    @Inject(TOPIC_REPOSITORY) private readonly topics: ITopicRepository,
  ) {}

  async sweep(now = new Date()): Promise<LifecycleSweepResult> {
    const result: LifecycleSweepResult = {
      users: 0,
      dormant: 0,
      dismissed: 0,
      deleted: 0,
      failedUsers: 0,
    };

    for (const userId of await this.topics.usersWithTopics()) {
      try {
        const counts = await this.sweepUser(userId, now);
        result.users += 1;
        result.dormant += counts.dormant;
        result.dismissed += counts.dismissed;
        result.deleted += counts.deleted;
      } catch (error) {
        // One owner's failure must not stop the others; the next sweep retries.
        result.failedUsers += 1;
        this.logger.error(
          JSON.stringify({
            event: 'topic_lifecycle_failed',
            userId,
            errorName: error instanceof Error ? error.name : 'UnknownError',
            remediation:
              "This owner's topics keep their status until the next daily sweep.",
          }),
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.logger.log(
      JSON.stringify({ event: 'topic_lifecycle_swept', ...result }),
    );

    return result;
  }

  async sweepUser(
    userId: string,
    now: Date,
  ): Promise<{ dormant: number; dismissed: number; deleted: number }> {
    const counts = { dormant: 0, dismissed: 0, deleted: 0 };
    const [activeDay, topics] = await Promise.all([
      this.topics.activeDayCount(userId),
      this.topics.list(userId, ['candidate', 'active', 'dormant', 'dismissed']),
    ]);

    if (!topics.length) return counts;

    const items = await this.topics.linkedItems(
      userId,
      topics.map(({ id }) => id),
      now,
    );

    const anchored = new Set(
      items
        .filter((item) => item.active && ANCHOR_TYPES.has(item.type))
        .map((item) => item.topicId),
    );

    const stillActive = new Set<string>();

    for (const topic of topics) {
      const change = lifecycleChange(topic, {
        activeDay,
        now,
        anchored: anchored.has(topic.id),
      });

      if (!change) {
        if (topic.status === 'active') stillActive.add(topic.id);
        continue;
      }

      if (change.kind === 'delete') {
        if (await this.topics.deleteTopic(userId, topic.id))
          counts.deleted += 1;
        continue;
      }

      await this.topics.update(userId, topic.id, {
        status: change.status,
        statusAtActiveDay: activeDay,
        ...(change.dismissedReason
          ? { dismissedReason: change.dismissedReason }
          : {}),
      });
      counts[change.status] += 1;
    }

    for (const id of overCap(
      topics
        .filter((topic) => stillActive.has(topic.id))
        .map((topic) => ({ ...topic, anchored: anchored.has(topic.id) })),
      activeDay,
    )) {
      await this.topics.update(userId, id, {
        status: 'dormant',
        statusAtActiveDay: activeDay,
      });
      counts.dormant += 1;
    }

    return counts;
  }
}
