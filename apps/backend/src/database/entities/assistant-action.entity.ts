import type {
  AssistancePreference as PrismaAssistancePreference,
  AssistantAction as PrismaAssistantAction,
} from '../../generated/prisma/client';

/**
 * `prepared` is persisted but not yet visible; `offered` requires a persisted
 * assistant message or confirmed delivery that showed it. `authorized` records
 * conversational acceptance, which is not proof of execution.
 */
export const ASSISTANT_ACTION_STATUSES = [
  'prepared',
  'offered',
  'snoozed',
  'authorized',
  'executing',
  'completed',
  'dismissed',
  'expired',
  'invalidated',
  'failed',
] as const;
export type AssistantActionStatus = (typeof ASSISTANT_ACTION_STATUSES)[number];

export const ASSISTANT_ACTION_TYPES = [
  'create_task',
  'create_reminder',
  'create_calendar_event',
  'create_note',
] as const;
export type AssistantActionType = (typeof ASSISTANT_ACTION_TYPES)[number];

export const ASSISTANCE_BEHAVIORS = [
  'meeting_preparation',
  'commitment',
  'work_resumption',
  'scheduling',
] as const;
export type AssistanceBehavior = (typeof ASSISTANCE_BEHAVIORS)[number];

export type AssistantActionEvidence = {
  kind: string;
  id: string;
  version: string;
};

export type AssistantAction = Pick<
  PrismaAssistantAction,
  | 'id'
  | 'userId'
  | 'conversationId'
  | 'preparedBy'
  | 'offerMessageId'
  | 'targetRef'
  | 'version'
  | 'reason'
  | 'deduplicationKey'
  | 'statusReason'
  | 'usefulUntil'
  | 'snoozedUntil'
  | 'acceptedMessageId'
  | 'acceptedAt'
  | 'decidedAt'
  | 'executionLeaseUntil'
  | 'resultType'
  | 'resultId'
  | 'receiptKey'
  | 'lastErrorCode'
  | 'createdAt'
  | 'updatedAt'
> & {
  behavior: AssistanceBehavior;
  actionType: AssistantActionType;
  status: AssistantActionStatus;
  parameters: Record<string, unknown>;
  evidence: AssistantActionEvidence[];
};

export type NewAssistantAction = {
  userId: string;
  conversationId: string;
  preparedBy: string;
  behavior: AssistanceBehavior;
  actionType: AssistantActionType;
  targetRef: string;
  parameters: Record<string, unknown>;
  reason: string;
  evidence: AssistantActionEvidence[];
  deduplicationKey: string;
  usefulUntil: Date;
};

export type AssistancePreference = Pick<
  PrismaAssistancePreference,
  | 'userId'
  | 'pausedAll'
  | 'pausedUntil'
  | 'pausedBehaviors'
  | 'quietStart'
  | 'quietEnd'
  | 'instructionMessageId'
  | 'updatedAt'
>;

export type AssistancePreferenceWrite = Partial<
  Pick<
    AssistancePreference,
    | 'pausedAll'
    | 'pausedUntil'
    | 'pausedBehaviors'
    | 'quietStart'
    | 'quietEnd'
    | 'instructionMessageId'
  >
>;
