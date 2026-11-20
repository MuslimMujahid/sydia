import type {
  Topic,
  TopicClaim,
  TopicClaimKind,
  TopicConversationState,
  TopicEventKind,
  TopicItemRef,
  TopicLinkOrigin,
  TopicSourceInvocation,
  TopicSourceMessage,
  TopicStatus,
} from '../entities';

export type NewTopic = {
  userId: string;
  label: string;
  aliases: string[];
  episodeKey: string;
  activeDay: number;
  at: Date;
};

export type TopicUpdate = Partial<
  Pick<
    Topic,
    | 'label'
    | 'aliases'
    | 'embedding'
    | 'status'
    | 'salience'
    | 'salienceAtActiveDay'
    | 'episodeCount'
    | 'lastEpisodeKey'
    | 'lastActiveAt'
  >
>;

export type NewTopicClaim = {
  kind: TopicClaimKind;
  text: string;
  explicit: boolean;
  messageId: string | null;
};

export type NewTopicEvent = {
  topicId: string;
  kind: TopicEventKind;
  weight: number;
  episodeKey: string;
  conversationId: string;
  activeDay: number;
};

export type TopicRecognitionCandidateLog = {
  topicId: string;
  status: TopicStatus;
  similarity: number;
  salience: number;
  score: number;
  /** Whether it passed the floor and was offered to the gate. */
  offered: boolean;
};

export type NewTopicRecognitionLog = {
  userId: string;
  conversationId: string;
  messageId: string;
  mode: string;
  candidates: TopicRecognitionCandidateLog[];
  choice: string | null;
  confidence: number | null;
  accepted: boolean;
  assignedTopicId: string | null;
};

export interface ITopicRepository {
  /** The owner's topics in the given statuses. */
  list(userId: string, statuses: readonly TopicStatus[]): Promise<Topic[]>;
  /** Claims of these topics, newest first. */
  claims(topicIds: readonly string[]): Promise<TopicClaim[]>;
  /** IDs of the owner's topics with a live (not removed) link to any item. */
  topicsLinkedTo(
    userId: string,
    items: readonly TopicItemRef[],
  ): Promise<string[]>;
  /** Whether the topic links a reminder, task or event (promotes a candidate). */
  hasActionableLink(topicId: string): Promise<boolean>;
  create(input: NewTopic): Promise<Topic>;
  update(userId: string, topicId: string, patch: TopicUpdate): Promise<void>;
  /**
   * Links items, skipping any link the user removed (a removed link is a
   * suppression). Returns how many links were added.
   */
  linkItems(
    topicId: string,
    items: readonly TopicItemRef[],
    origin: TopicLinkOrigin,
  ): Promise<number>;
  /** Adds claims, then keeps only the newest `limit[kind]` of each kind. */
  addClaims(
    topicId: string,
    claims: readonly NewTopicClaim[],
    limit: Readonly<Record<TopicClaimKind, number>>,
  ): Promise<void>;
  /** Removes claims of one topic (resolved by later messages). */
  removeClaims(topicId: string, claimIds: readonly string[]): Promise<void>;
  /** Records an event once per topic, episode and kind; false when it existed. */
  recordEvent(input: NewTopicEvent): Promise<boolean>;
  conversationState(
    conversationId: string,
  ): Promise<TopicConversationState | null>;
  saveConversationState(state: TopicConversationState): Promise<void>;
  /**
   * Advances the owner's active-day clock when `localDay` (YYYY-MM-DD) is a
   * new day, and returns the current active-day count.
   */
  touchActiveDay(userId: string, localDay: string): Promise<number>;
  /**
   * Owned messages of one conversation created after `after` (all when null),
   * oldest first, with completed tool calls made for its user messages.
   */
  formationInput(
    userId: string,
    conversationId: string,
    after: Date | null,
  ): Promise<{
    messages: TopicSourceMessage[];
    invocations: TopicSourceInvocation[];
  }>;
  logRecognition(input: NewTopicRecognitionLog): Promise<void>;
}

export const TOPIC_REPOSITORY = Symbol('ITopicRepository');
