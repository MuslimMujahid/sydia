import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CHANNEL_CONVERSATION_IDLE_MS,
  TOPIC_REPOSITORY,
  USER_REPOSITORY,
  type ITopicRepository,
  type IUserRepository,
  type NewTopicClaim,
} from '../../database/interfaces';
import type {
  Topic,
  TopicConversationState,
  TopicItemRef,
  TopicSourceInvocation,
  TopicSourceMessage,
} from '../../database/entities';
import { DecisionSettings } from '../../infra/decision-gateway';
import { EmbeddingsService } from '../../infra/embeddings';
import {
  LANGUAGE_MODEL,
  type LanguageModelGateway,
} from '../../infra/model-gateway';
import { containsDecisionCredential } from '../../shared/decision-privacy';
import { addSalience } from './salience';
import {
  TOPIC_EXTRACTION_OUTPUT_TOKENS,
  TOPIC_EXTRACTION_PROMPT,
  TOPIC_EXTRACTION_REASONING,
  TOPIC_EXTRACTION_SCHEMA,
  parseTopicExtraction,
} from './topic-extraction';
import {
  messageAnchors,
  touchedItemTitle,
  touchedItems,
  uniqueItems,
} from './topic-item-references';
import { namesTopic } from './topic-naming';
import { TopicRecognitionService } from './topic-recognition.service';
import { TOPIC_EVENT_WEIGHTS, TOPIC_SETTINGS } from './topic-settings';

/** Calendar date (YYYY-MM-DD) of an instant in the owner's time zone. */
function localDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Owner-local send date with its weekday, e.g. "Saturday 2026-11-21". */
function sentOn(at: Date, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
  }).format(at);

  return `${weekday} ${localDay(at, timeZone)}`;
}

type Episode = Omit<TopicConversationState, 'processedThroughAt'>;

/** The user messages of one episode, with every message they span. */
type Segment = {
  userMessages: TopicSourceMessage[];
  messages: TopicSourceMessage[];
  invocations: TopicSourceInvocation[];
  episode: Episode;
};

/**
 * Background formation (docs/TOPIC_CONTEXT_SPEC.md, TOPIC-FORM-01–03): reads
 * the conversation since the last pass, recognizes and assigns topics, links
 * the items the turn touched, and records state claims and salience events.
 * Runs off the reply path; in shadow mode nothing it writes reaches a prompt.
 */
@Injectable()
export class TopicFormationService {
  private readonly logger = new Logger(TopicFormationService.name);
  private readonly idleMs: number;

  constructor(
    @Inject(TOPIC_REPOSITORY) private readonly topics: ITopicRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(LANGUAGE_MODEL) private readonly model: LanguageModelGateway,
    private readonly embeddings: EmbeddingsService,
    private readonly settings: DecisionSettings,
    private readonly recognition: TopicRecognitionService,
    @Optional() config: ConfigService = new ConfigService(),
  ) {
    this.idleMs = config.get<number>(
      'BACKEND_CHANNEL_CONVERSATION_IDLE_MS',
      CHANNEL_CONVERSATION_IDLE_MS,
    );
  }

  async process(userId: string, conversationId: string): Promise<void> {
    const mode = this.settings.mode('topics', userId);
    if (mode === 'off') return;
    const user = await this.users.findById(userId);
    if (!user) return;

    const state = await this.topics.conversationState(conversationId);
    const input = await this.topics.formationInput(
      userId,
      conversationId,
      state?.processedThroughAt ?? null,
    );

    const last = input.messages.at(-1);
    if (!last) return;
    const userMessages = input.messages.filter(({ role }) => role === 'user');

    // Opted out (TOPIC-PRIV-01): move the cursor past this content without
    // reading it, so turning memory back on never backfills it.
    if (!user.automaticMemoryEnabled || !userMessages.length) {
      if (state)
        await this.topics.saveConversationState({
          ...state,
          processedThroughAt: last.createdAt,
        });
      else if (userMessages[0])
        await this.topics.saveConversationState({
          ...this.newEpisode(userId, conversationId, userMessages[0]),
          processedThroughAt: last.createdAt,
        });

      return;
    }

    let activeDay = 0;
    for (const day of new Set(
      userMessages.map(({ createdAt }) => localDay(createdAt, user.timezone)),
    ))
      activeDay = await this.topics.touchActiveDay(userId, day);

    const segments = this.segments(
      userId,
      conversationId,
      input.messages,
      input.invocations,
      state,
    );

    // The cursor moves after each segment, so a retry after a failed model
    // call resumes there instead of repeating segments already written.
    for (const [index, segment] of segments.entries()) {
      const episode = await this.form(segment, activeDay, mode, user.timezone);
      const isLast = index === segments.length - 1;

      await this.topics.saveConversationState({
        ...episode,
        processedThroughAt: isLast
          ? last.createdAt
          : segment.messages.at(-1)!.createdAt,
      });
    }
  }

  private newEpisode(
    userId: string,
    conversationId: string,
    first: TopicSourceMessage,
  ): Episode {
    return {
      conversationId,
      userId,
      episodeKey: `${conversationId}:${first.id}`,
      episodeStartedAt: first.createdAt,
      lastUserMessageAt: first.createdAt,
      currentTopicId: null,
      noneStreak: 0,
    };
  }

  /**
   * Splits new messages into episodes (TOPIC-EPISODE-01): a user message after
   * the idle window starts one. Topic changes are applied while forming.
   */
  private segments(
    userId: string,
    conversationId: string,
    messages: readonly TopicSourceMessage[],
    invocations: readonly TopicSourceInvocation[],
    state: TopicConversationState | null,
  ): Segment[] {
    const segments: Segment[] = [];
    let episode: Episode | null = state;
    let current: Segment | null = null;

    for (const message of messages) {
      if (message.role === 'user') {
        const idle =
          !episode ||
          message.createdAt.getTime() - episode.lastUserMessageAt.getTime() >
            this.idleMs;

        if (idle || !current) {
          episode = idle
            ? this.newEpisode(userId, conversationId, message)
            : episode!;
          current = {
            userMessages: [],
            messages: [],
            invocations: [],
            episode,
          };
          segments.push(current);
        }

        episode = { ...episode!, lastUserMessageAt: message.createdAt };
        current.episode = episode;
        current.userMessages.push(message);
        current.invocations.push(
          ...invocations.filter((call) => call.inputMessageId === message.id),
        );
      }

      // Assistant messages before the first new user message belong to the
      // previous pass and are already accounted for.
      current?.messages.push(message);
    }

    return segments;
  }

  private async form(
    segment: Segment,
    activeDay: number,
    mode: ReturnType<DecisionSettings['mode']>,
    timezone: string,
  ): Promise<Episode> {
    const { episode, userMessages } = segment;
    const latest = userMessages.at(-1)!;
    const userId = episode.userId;

    if (
      containsDecisionCredential(
        segment.messages.map(({ content }) => content).join('\n'),
      )
    )
      return episode;

    // A correction made through disconnect_topic is already applied. Reading
    // the same messages again would attach them to whatever topic is left
    // (a forgotten topic's sibling, say) and must leave no trace of "forget".
    if (segment.invocations.some(({ name }) => name === 'disconnect_topic'))
      return episode;

    // A topic the user disconnected in this episode stays out of it (TOPIC-DISC-01).
    const [all, suppressed] = await Promise.all([
      this.topics.list(userId, ['candidate', 'active', 'dormant', 'dismissed']),
      this.topics.suppressedTopicIds(
        episode.conversationId,
        episode.episodeStartedAt,
      ),
    ]);

    const named = new Set(
      all
        .filter((topic) =>
          userMessages.some((message) => namesTopic(message.content, topic)),
        )
        .map(({ id }) => id),
    );

    // Naming a suppressed topic again lifts its suppression.
    const known = all.filter(
      (topic) => !suppressed.includes(topic.id) || named.has(topic.id),
    );

    const claims = await this.topics.claims(known.map(({ id }) => id));
    const anchors = uniqueItems(userMessages.flatMap(messageAnchors));

    // When the feature is enabled the turn already recognized this message;
    // reuse that answer instead of asking the gate again.
    const recognized =
      (mode === 'enabled'
        ? await this.topics.recognitionFor(latest.id)
        : null) ??
      (await this.recognition.recognize({
        userId,
        activeDay,
        latest: latest.content,
        recent: segment.messages
          .filter((message) => message !== latest)
          .map(({ role, content }) => ({ role, content })),
        anchors,
        stickyTopicId: episode.currentTopicId,
        topics: known,
        claims,
        mode,
        namedTopicIds: named,
      }));

    const touched = segment.invocations.flatMap((invocation) =>
      touchedItems(invocation).map((item) => ({
        item,
        title: touchedItemTitle(invocation, item.id),
      })),
    );

    const items = uniqueItems(touched.map(({ item }) => item)).map((item) => ({
      item,
      title:
        touched.find(
          (entry) => entry.item.type === item.type && entry.item.id === item.id,
        )?.title ?? null,
    }));

    const shown = this.topicsToShow(known, recognized.candidates, episode);
    const extraction = await this.extract(
      segment,
      shown,
      claims,
      items,
      timezone,
    );

    let assigned: Topic | null = null;

    if (extraction.action === 'existing')
      assigned = shown.find(({ id }) => id === extraction.topicId) ?? null;
    else if (extraction.action === 'new')
      assigned = await this.topics.create({
        userId,
        label: extraction.label!,
        aliases: extraction.aliases,
        episodeKey: episode.episodeKey,
        activeDay,
        at: latest.createdAt,
      });

    // A topic change starts a new episode (TOPIC-EPISODE-01).
    const next: Episode =
      assigned &&
      episode.currentTopicId &&
      assigned.id !== episode.currentTopicId
        ? {
            ...episode,
            episodeKey: `${episode.conversationId}:${userMessages[0]!.id}`,
            episodeStartedAt: userMessages[0]!.createdAt,
          }
        : episode;

    if (assigned && extraction.action !== 'none')
      await this.apply(assigned, extraction, {
        episode: next,
        activeDay,
        at: latest.createdAt,
        isNew: extraction.action === 'new',
        items: items.map(({ item }) => item),
        userMessages,
      });

    if (mode !== 'off')
      await this.topics.logRecognition({
        userId,
        conversationId: episode.conversationId,
        messageId: latest.id,
        mode,
        candidates: recognized.candidates,
        choice: recognized.choice,
        confidence: recognized.confidence,
        accepted: recognized.topicId !== null,
        assignedTopicId: assigned?.id ?? null,
      });

    if (assigned)
      return { ...next, currentTopicId: assigned.id, noneStreak: 0 };
    const noneStreak = episode.noneStreak + 1;

    return {
      ...next,
      noneStreak,
      currentTopicId: noneStreak >= 2 ? null : episode.currentTopicId,
    };
  }

  /** Recognized candidates, the episode's topic, then the most recent ones. */
  private topicsToShow(
    known: readonly Topic[],
    candidates: ReadonlyArray<{ topicId: string; offered: boolean }>,
    episode: Episode,
  ): Topic[] {
    const preferred = [
      ...candidates
        .filter(({ offered }) => offered)
        .map(({ topicId }) => topicId),
      ...(episode.currentTopicId ? [episode.currentTopicId] : []),
    ];

    const byId = new Map(known.map((topic) => [topic.id, topic]));
    const ordered = [
      ...preferred.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
      // Dismissed topics come back only through recognition's strong match.
      ...known.filter((topic) => topic.status !== 'dismissed'),
    ];

    return [
      ...new Map(ordered.map((topic) => [topic.id, topic])).values(),
    ].slice(0, TOPIC_SETTINGS.formationTopicLimit);
  }

  private async extract(
    segment: Segment,
    shown: readonly Topic[],
    claims: Awaited<ReturnType<ITopicRepository['claims']>>,
    items: ReadonlyArray<{ item: TopicItemRef; title: string | null }>,
    timezone: string,
  ) {
    let userIndex = 0;
    // Short refs stand for claim ids, so the model never handles raw ids.
    const refToClaim = new Map<string, string>();
    const stateRefs = new Map<string, Set<string>>();
    const stateOf = (topicId: string) =>
      claims
        .filter((claim) => claim.topicId === topicId)
        .slice(0, TOPIC_SETTINGS.formationStatePerTopic)
        .map(({ id, kind, text }) => {
          const ref = `s${refToClaim.size + 1}`;
          refToClaim.set(ref, id);
          stateRefs.set(
            topicId,
            (stateRefs.get(topicId) ?? new Set()).add(ref),
          );

          return { ref, kind, text };
        });

    const result = await this.model.generate({
      userId: segment.episode.userId,
      conversationId: segment.episode.conversationId,
      traceName: 'topic-formation',
      outputSchema: TOPIC_EXTRACTION_SCHEMA,
      maxOutputTokens: TOPIC_EXTRACTION_OUTPUT_TOKENS,
      reasoningEffort: TOPIC_EXTRACTION_REASONING,
      messages: [
        { role: 'system', content: TOPIC_EXTRACTION_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            topics: shown.map((topic) => ({
              id: topic.id,
              label: topic.label,
              aliases: topic.aliases,
              state: stateOf(topic.id),
            })),
            messages: segment.messages.map(({ role, content, createdAt }) => ({
              ...(role === 'user' ? { userMessageIndex: userIndex++ } : {}),
              // Relative dates in a message resolve against this (owner-local).
              sentOn: sentOn(createdAt, timezone),
              role,
              content: content.slice(0, TOPIC_SETTINGS.formationMessageChars),
            })),
            items: items.map(({ item, title }, index) => ({
              index,
              type: item.type,
              title,
            })),
          }),
        },
      ],
    });

    const extraction = parseTopicExtraction(result.text, {
      items: items.length,
      userMessages: segment.userMessages.length,
      stateRefs,
    });

    return extraction.action === 'none'
      ? extraction
      : {
          ...extraction,
          resolved: extraction.resolved.flatMap((ref) => {
            const id = refToClaim.get(ref);

            return id ? [id] : [];
          }),
        };
  }

  private async apply(
    topic: Topic,
    extraction: Exclude<
      ReturnType<typeof parseTopicExtraction>,
      { action: 'none' }
    >,
    context: {
      episode: Episode;
      activeDay: number;
      at: Date;
      isNew: boolean;
      items: readonly TopicItemRef[];
      userMessages: readonly TopicSourceMessage[];
    },
  ): Promise<void> {
    const { episode, activeDay, at } = context;
    const update: Parameters<ITopicRepository['update']>[2] = {
      lastActiveAt: at,
    };

    // At most one salience event per topic and episode (TOPIC-RANK-01). A new
    // topic starts at salience 1, which already counts this episode.
    if (!context.isNew && topic.lastEpisodeKey !== episode.episodeKey) {
      const kind =
        at.getTime() - topic.lastActiveAt.getTime() >=
        TOPIC_SETTINGS.returnedAfterMs
          ? 'returned'
          : 'assigned';

      const recorded = await this.topics.recordEvent({
        topicId: topic.id,
        kind,
        weight: TOPIC_EVENT_WEIGHTS[kind],
        episodeKey: episode.episodeKey,
        conversationId: episode.conversationId,
        activeDay,
      });

      if (recorded) {
        Object.assign(
          update,
          addSalience(topic, TOPIC_EVENT_WEIGHTS[kind], activeDay),
          {
            episodeCount: topic.episodeCount + 1,
            lastEpisodeKey: episode.episodeKey,
          },
        );
      }
    } else if (context.isNew)
      await this.topics.recordEvent({
        topicId: topic.id,
        kind: 'assigned',
        weight: TOPIC_EVENT_WEIGHTS.assigned,
        episodeKey: episode.episodeKey,
        conversationId: episode.conversationId,
        activeDay,
      });

    await this.topics.linkItems(
      topic.id,
      extraction.linkedItems.flatMap((index) =>
        context.items[index] ? [context.items[index]] : [],
      ),
      'touched',
    );

    // Statements the new messages completed, answered or replaced (resolved
    // holds claim ids here) go before the new ones are added.
    if (!context.isNew && extraction.resolved.length)
      await this.topics.removeClaims(topic.id, extraction.resolved);

    const newClaims: NewTopicClaim[] = extraction.claims.map((claim) => ({
      kind: claim.kind,
      text: claim.text,
      explicit: claim.explicit,
      messageId: context.userMessages[claim.messageIndex]?.id ?? null,
    }));

    await this.topics.addClaims(
      topic.id,
      newClaims,
      TOPIC_SETTINGS.claimLimits,
    );

    const aliases = [
      ...new Map(
        [...topic.aliases, ...extraction.aliases]
          .filter(
            (alias) =>
              alias.toLocaleLowerCase() !== topic.label.toLocaleLowerCase(),
          )
          .map((alias) => [alias.toLocaleLowerCase(), alias]),
      ).values(),
    ].slice(0, 8);

    if (aliases.length !== topic.aliases.length) update.aliases = aliases;

    // The user said the effort is over: close it like topic_complete would.
    if (!context.isNew && extraction.completed) {
      update.status = 'dismissed';
      update.dismissedReason = 'completed';
    } else
      update.status = await this.nextStatus(topic, {
        episodeCount: update.episodeCount ?? topic.episodeCount,
        salience: update.salience ?? topic.salience,
      });
    // The lifecycle times grace and dormancy from the last status change.
    if (update.status !== topic.status) update.statusAtActiveDay = activeDay;

    if (
      context.isNew ||
      update.aliases ||
      newClaims.length ||
      extraction.resolved.length
    ) {
      const embedding = await this.embed(topic, aliases, newClaims);
      if (embedding) update.embedding = embedding;
    }

    await this.topics.update(topic.userId, topic.id, update);
  }

  /** TOPIC-FORM-03 promotion and TOPIC-LIFE-02 reactivation with hysteresis. */
  private async nextStatus(
    topic: Topic,
    next: { episodeCount: number; salience: number },
  ): Promise<Topic['status']> {
    switch (topic.status) {
      case 'candidate':
        return next.episodeCount >= 2 ||
          (await this.topics.hasActionableLink(topic.id))
          ? 'active'
          : 'candidate';
      case 'dormant':
        return next.salience >= 1 ? 'active' : 'dormant';
      // Only a strong recognition match shows a dismissed topic; the model
      // assigning it confirms the user came back to it.
      case 'dismissed':
        return 'active';
      default:
        return topic.status;
    }
  }

  private async embed(
    topic: Topic,
    aliases: readonly string[],
    newClaims: readonly NewTopicClaim[],
  ): Promise<number[] | null> {
    const claims = await this.topics.claims([topic.id]);
    const text = [
      topic.label,
      aliases.join(', '),
      ...(claims.length
        ? claims.slice(0, 6).map((claim) => claim.text)
        : newClaims.map((claim) => claim.text)),
    ]
      .filter(Boolean)
      .join('\n');

    try {
      return await this.embeddings.embed(text);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'topic_embedding_failed',
          topicId: topic.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          remediation:
            'The topic keeps its previous embedding; it is refreshed on its next update.',
        }),
      );

      return null;
    }
  }
}
