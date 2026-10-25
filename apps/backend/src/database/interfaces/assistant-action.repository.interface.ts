import type {
  AssistancePreference,
  AssistancePreferenceWrite,
  AssistantAction,
  AssistantActionStatus,
  NewAssistantAction,
} from '../entities';

export type AssistantActionUpdate = Partial<
  Pick<
    AssistantAction,
    | 'status'
    | 'statusReason'
    | 'snoozedUntil'
    | 'acceptedMessageId'
    | 'acceptedAt'
    | 'decidedAt'
    | 'executionLeaseUntil'
    | 'resultType'
    | 'resultId'
    | 'receiptKey'
    | 'lastErrorCode'
    | 'parameters'
    | 'version'
    | 'usefulUntil'
    | 'reason'
    | 'offerMessageId'
    | 'preparedBy'
    | 'conversationId'
  >
>;

export interface IAssistantActionRepository {
  /** Creates the action, or returns the existing one for the same semantic key. */
  prepare(
    input: NewAssistantAction,
  ): Promise<{ action: AssistantAction; created: boolean }>;
  findById(userId: string, id: string): Promise<AssistantAction | null>;
  listForConversation(
    userId: string,
    conversationId: string,
    statuses: readonly AssistantActionStatus[],
    limit?: number,
  ): Promise<AssistantAction[]>;
  listForTarget(
    userId: string,
    behavior: string,
    targetRef: string,
  ): Promise<AssistantAction[]>;
  listPreparedBy(
    userId: string,
    preparedBy: string,
  ): Promise<AssistantAction[]>;
  /** Owner-wide actions updated since an instant, any conversation or channel. */
  listRecentForOwner(
    userId: string,
    since: Date,
    statuses: readonly AssistantActionStatus[],
    limit: number,
  ): Promise<AssistantAction[]>;
  /** Marks actions prepared by one turn as shown by the persisted message. */
  markOffered(
    userId: string,
    preparedBy: string,
    offerMessageId: string,
    actionIds?: readonly string[],
  ): Promise<number>;
  /** Compare-and-set transition; null when the current status did not match. */
  transition(
    userId: string,
    id: string,
    from: readonly AssistantActionStatus[],
    update: AssistantActionUpdate,
  ): Promise<AssistantAction | null>;
  /** Claims execution for an authorized action, or recovers a stale lease. */
  claimExecution(
    userId: string,
    id: string,
    now: Date,
    leaseUntil: Date,
  ): Promise<AssistantAction | null>;
  listDueSnoozed(now: Date, limit: number): Promise<AssistantAction[]>;
  getPreference(userId: string): Promise<AssistancePreference | null>;
  savePreference(
    userId: string,
    input: AssistancePreferenceWrite,
  ): Promise<AssistancePreference>;
}

export const ASSISTANT_ACTION_REPOSITORY = Symbol('IAssistantActionRepository');
