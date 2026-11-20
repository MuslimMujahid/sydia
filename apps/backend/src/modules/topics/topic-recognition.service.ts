import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TOPIC_REPOSITORY,
  type ITopicRepository,
  type TopicRecognitionCandidateLog,
} from '../../database/interfaces';
import type { Topic, TopicClaim, TopicItemRef } from '../../database/entities';
import {
  DECISION_GATEWAY,
  DecisionSettings,
  type DecisionGateway,
  type DecisionMode,
} from '../../infra/decision-gateway';
import { EmbeddingsService } from '../../infra/embeddings';
import {
  candidateScore,
  cosineSimilarity,
  currentSalience,
  decay,
  passesFloor,
} from './salience';
import { TOPIC_SETTINGS } from './topic-settings';

export type TopicRecognitionInput = {
  userId: string;
  activeDay: number;
  /** The latest user message. */
  latest: string;
  /** Earlier messages of the conversation, oldest first. */
  recent: Array<{ role: string; content: string }>;
  /** Items the message had open or selected. */
  anchors: readonly TopicItemRef[];
  /** Topic recognized earlier in the same episode. */
  stickyTopicId: string | null;
  /** The owner's active, dormant and dismissed topics. */
  topics: readonly Topic[];
  claims: readonly TopicClaim[];
  mode: DecisionMode;
  /** 1 / (1 + days until the topic's nearest pending item), by topic id. */
  urgency?: ReadonlyMap<string, number>;
  /** Interactive on the reply path; background while forming. */
  lane?: 'interactive' | 'background';
  abortSignal?: AbortSignal;
};

export type TopicRecognition = {
  candidates: TopicRecognitionCandidateLog[];
  choice: string | null;
  confidence: number | null;
  /** The accepted topic, or null for none, no candidates or a failed gate. */
  topicId: string | null;
};

const NONE = 'none';
const RECENT_MESSAGES = 4;
const RECENT_CHARS = 350;

/** One line of a topic's state for the gate's choice criteria. */
function stateLine(topicId: string, claims: readonly TopicClaim[]): string {
  const latest = (kind: TopicClaim['kind']) =>
    claims.find((claim) => claim.topicId === topicId && claim.kind === kind)
      ?.text;

  const parts = [
    latest('decision') && `last decision: ${latest('decision')}`,
    latest('next_step') && `next step: ${latest('next_step')}`,
  ].filter(Boolean);

  return parts.length ? ` (${parts.join('; ')})` : '';
}

/**
 * Which existing topic, if any, a user message is about (TOPIC-RECOG-01/02).
 * Candidates come from embedding similarity, explicit anchors and episode
 * stickiness; the decision gateway picks one or none. Failures return no
 * topic: recognition must never block a turn.
 */
@Injectable()
export class TopicRecognitionService {
  private readonly logger = new Logger(TopicRecognitionService.name);

  constructor(
    @Inject(TOPIC_REPOSITORY) private readonly topics: ITopicRepository,
    private readonly embeddings: EmbeddingsService,
    @Inject(DECISION_GATEWAY) private readonly gateway: DecisionGateway,
    private readonly settings: DecisionSettings,
  ) {}

  async recognize(input: TopicRecognitionInput): Promise<TopicRecognition> {
    const none: TopicRecognition = {
      candidates: [],
      choice: null,
      confidence: null,
      topicId: null,
    };

    const eligible = input.topics.filter(
      (topic) => topic.status !== 'candidate',
    );

    if (!eligible.length) return none;

    const [vector, anchored] = await Promise.all([
      this.embed(input),
      this.topics.topicsLinkedTo(input.userId, input.anchors),
    ]);

    const anchoredIds = new Set(anchored);
    const scored = eligible
      .map((topic) => {
        const similarity =
          vector && topic.embedding.length
            ? cosineSimilarity(vector, topic.embedding)
            : 0;

        const anchoredTopic =
          anchoredIds.has(topic.id) || topic.id === input.stickyTopicId;

        const salience = currentSalience(topic, input.activeDay);
        // Each disconnect adds one step to the offset; its decayed size is the
        // recent-disconnect count of TOPIC-RANK-03.
        const offset = decay(
          topic.gateCutoffOffset,
          input.activeDay - topic.gateOffsetAtActiveDay,
        );

        return {
          topic,
          eligible: passesFloor(topic.status, similarity, anchoredTopic),
          log: {
            topicId: topic.id,
            status: topic.status,
            similarity,
            salience,
            score: candidateScore({
              similarity,
              salience,
              urgency: input.urgency?.get(topic.id) ?? 0,
              sticky: topic.id === input.stickyTopicId,
              recentDisconnects: offset / TOPIC_SETTINGS.disconnectStep,
            }),
            offered: false as boolean,
          } satisfies TopicRecognitionCandidateLog,
        };
      })
      .sort((a, b) => b.log.score - a.log.score);

    const ranked = scored
      .filter((entry) => entry.eligible)
      .slice(0, TOPIC_SETTINGS.candidatesPerTurn);

    for (const entry of ranked) entry.log.offered = true;
    // Calibration needs the near misses too, not only what passed the floor.
    const candidates = [
      ...new Set([
        ...ranked.map((entry) => entry.log),
        ...scored
          .slice(0, TOPIC_SETTINGS.loggedTopics)
          .map((entry) => entry.log),
      ]),
    ];

    if (!ranked.length) return { ...none, candidates };

    try {
      const result = await this.gateway.decide({
        stage: 'topic',
        version: this.settings.version,
        lane: input.lane ?? 'background',
        featureModes: { topics: input.mode },
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
        state: JSON.stringify({
          messages: [
            ...input.recent.slice(-RECENT_MESSAGES).map((message) => ({
              role: message.role,
              content: message.content.slice(0, RECENT_CHARS),
            })),
            { role: 'user', content: input.latest },
          ],
        }),
        questions: {
          topic: {
            type: 'choice',
            instructions:
              'Which of these ongoing topics of the user is the latest message about? Choose none when it is about none of them, is small talk, or only shares a word with a topic.',
            criteria: {
              [NONE]: 'The latest message is not about any of these topics.',
              ...Object.fromEntries(
                ranked.map(({ topic }) => [
                  topic.id,
                  `${topic.label}${topic.aliases.length ? ` (also: ${topic.aliases.join(', ')})` : ''}${stateLine(topic.id, input.claims)}`,
                ]),
              ),
            },
          },
        },
      });

      if (result.status !== 'ok') {
        this.logger.warn(
          JSON.stringify({
            event: 'topic_recognition_degraded',
            reason: result.reason,
            remediation:
              'No topic recognized for this message; check decision gateway capacity and timeouts.',
          }),
        );

        return { ...none, candidates };
      }

      const answer = result.answers.topic;
      if (answer?.type !== 'choice') return { ...none, candidates };
      const chosen = ranked.find(({ topic }) => topic.id === answer.choice);
      const cutoff =
        this.settings.thresholds.topicChoice +
        (chosen
          ? decay(
              chosen.topic.gateCutoffOffset,
              input.activeDay - chosen.topic.gateOffsetAtActiveDay,
            )
          : 0);

      return {
        candidates,
        choice: answer.choice,
        confidence: answer.confidence,
        topicId: chosen && answer.confidence >= cutoff ? chosen.topic.id : null,
      };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'topic_recognition_degraded',
          reason: error instanceof Error ? error.name : 'UnknownError',
          remediation:
            'No topic recognized for this message; the decision request failed.',
        }),
      );

      return { ...none, candidates };
    }
  }

  /** Embeds the latest message with the previous user message for context. */
  private async embed(input: TopicRecognitionInput): Promise<number[] | null> {
    const previous = [...input.recent]
      .reverse()
      .find((message) => message.role === 'user')?.content;

    try {
      return await this.embeddings.embed(
        [previous?.slice(0, RECENT_CHARS), input.latest]
          .filter(Boolean)
          .join('\n'),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'topic_recognition_degraded',
          reason: 'embedding',
          errorName: error instanceof Error ? error.name : 'UnknownError',
          remediation:
            'Similarity unavailable; only anchored or episode topics can be candidates.',
        }),
      );

      return null;
    }
  }
}
