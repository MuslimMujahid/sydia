import type {
  Topic as PrismaTopic,
  TopicClaim as PrismaTopicClaim,
  TopicConversationState as PrismaTopicConversationState,
} from '../../generated/prisma/client';

/** Lifecycle of an implicit topic (docs/TOPIC_CONTEXT_SPEC.md, TOPIC-LIFE-01). */
export const TOPIC_STATUSES = [
  'candidate',
  'active',
  'dormant',
  'dismissed',
] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export const TOPIC_CLAIM_KINDS = [
  'decision',
  'next_step',
  'open_question',
] as const;
export type TopicClaimKind = (typeof TOPIC_CLAIM_KINDS)[number];

/** Items a topic can link to; a note is identified by its `custom:`/`daily:` ref. */
export const TOPIC_ITEM_TYPES = [
  'note',
  'reminder',
  'task',
  'calendar_event',
  'contact',
  'document',
] as const;
export type TopicItemType = (typeof TOPIC_ITEM_TYPES)[number];

export type TopicItemRef = { type: TopicItemType; id: string };

export type TopicLinkOrigin = 'touched' | 'user_stated' | 'inferred';

export type TopicEventKind =
  'assigned' | 'returned' | 'item_edit' | 'disconnect';

export type Topic = Pick<
  PrismaTopic,
  | 'id'
  | 'userId'
  | 'label'
  | 'aliases'
  | 'embedding'
  | 'salience'
  | 'salienceAtActiveDay'
  | 'gateCutoffOffset'
  | 'gateOffsetAtActiveDay'
  | 'episodeCount'
  | 'lastEpisodeKey'
  | 'lastActiveAt'
  | 'createdAt'
> & { status: TopicStatus };

export type TopicClaim = Pick<
  PrismaTopicClaim,
  'id' | 'topicId' | 'text' | 'explicit' | 'messageId' | 'createdAt'
> & { kind: TopicClaimKind };

export type TopicConversationState = Pick<
  PrismaTopicConversationState,
  | 'conversationId'
  | 'userId'
  | 'processedThroughAt'
  | 'episodeKey'
  | 'episodeStartedAt'
  | 'lastUserMessageAt'
  | 'currentTopicId'
  | 'noneStreak'
>;

/** A message the formation pass reads, with what the user had open. */
export type TopicSourceMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  activeNoteRef: string | null;
  sourceNoteRefs: string[];
  sourceDocumentIds: string[];
};

/** A completed tool call made while answering one of those messages. */
export type TopicSourceInvocation = {
  inputMessageId: string;
  name: string;
  arguments: unknown;
  result: unknown;
};

/**
 * A linked item as it stands now, read from its own store (TOPIC-CTX-01).
 * `when` is the next pending reminder time, a task's due time, or an event's
 * start; `day` is set instead for all-day events.
 */
export type TopicItemSummary = {
  topicId: string;
  type: TopicItemType;
  id: string;
  title: string;
  when: Date | null;
  day: string | null;
  status: string;
  /** Pending reminder, open task, upcoming or recurring event, live note. */
  active: boolean;
  recurring: boolean;
  origin: TopicLinkOrigin;
  linkedAt: Date;
};

export function isTopicStatus(value: unknown): value is TopicStatus {
  return TOPIC_STATUSES.includes(value as TopicStatus);
}

export function isTopicClaimKind(value: unknown): value is TopicClaimKind {
  return TOPIC_CLAIM_KINDS.includes(value as TopicClaimKind);
}
