import type {
  MemoryBank,
  MemorySourceKind,
  MemorySourceSnapshot,
  MemoryDeliveryState,
  ResolvedMemoryReference,
  MemoryCheckpoint,
  MemoryIngestionSegment,
  MemoryRollback,
  MemoryRollbackBoundary,
} from '../entities';

export type ReconcileMemoryRollback = {
  userId: string;
  bankId: string;
  namespace: string;
  boundary: MemoryRollbackBoundary;
  facts: Array<{
    sourceId: string;
    remoteFactId: string;
    text: string;
    occurredAt: string | null;
    embedding: number[];
  }>;
  embeddingModel: string;
  embeddingVersion: string;
};

export type MemoryRollbackResult =
  | { status: 'written' | 'unchanged'; record: MemoryRollback }
  | { status: 'stale' | 'unavailable' | 'busy' };

export type EnqueueMemorySource = {
  userId: string;
  bankId: string;
  sourceKey: string;
  kind: MemorySourceKind;
  content: string;
  checksum: string;
  sourceMessageIds: string[];
  conversationId: string | null;
  eventAt: Date;
  /** Required for corrections: caller must have read this generation. */
  expectedGeneration?: number;
  requestKey?: string;
  requestFingerprint?: string;
  legacySnapshot?: { id: string; updatedAt: Date };
};

export type MemorySourcesWriteResult =
  | { status: 'written'; snapshots: MemorySourceSnapshot[] }
  | { status: 'unavailable' | 'suppressed' | 'stale' };

export type MemorySourceWriteResult =
  | { status: 'written' | 'unchanged'; snapshot: MemorySourceSnapshot }
  | { status: 'unavailable' | 'suppressed' | 'stale' };

export interface IHindsightRepository {
  rollbackRecord(
    userId: string,
    bankId: string,
  ): Promise<MemoryRollback | null>;
  rollbackBoundary(
    userId: string,
    bankId: string,
  ): Promise<MemoryRollbackBoundary | null>;
  reconcileRollback(
    input: ReconcileMemoryRollback,
  ): Promise<MemoryRollbackResult>;
  /** Creation verifies the owner still exists; retired mappings never reactivate. */
  ensureBank(
    userId: string,
    namespace: string,
    bankId: string,
  ): Promise<MemoryBank | null>;
  findBank(userId: string, namespace: string): Promise<MemoryBank | null>;
  enqueue(input: EnqueueMemorySource): Promise<MemorySourceWriteResult>;
  replaceSources(
    inputs: EnqueueMemorySource[],
  ): Promise<MemorySourcesWriteResult>;
  findMutation(
    userId: string,
    bankId: string,
    requestKey: string,
  ): Promise<MemorySourceSnapshot[]>;
  snapshot(
    userId: string,
    sourceId: string,
  ): Promise<MemorySourceSnapshot | null>;
  /** Owner-scoped pagination for portability, including retired source metadata. */
  ownerSourcePage(
    userId: string,
    afterId?: string,
    limit?: number,
  ): Promise<MemorySourceSnapshot[]>;
  findSource(
    userId: string,
    bankId: string,
    sourceKey: string,
  ): Promise<MemorySourceSnapshot | null>;
  forget(
    userId: string,
    sourceId: string,
    expectedGeneration: number,
  ): Promise<'deleted' | 'missing' | 'stale'>;
  forgetSources(
    userId: string,
    targets: Array<{ sourceId: string; generation: number }>,
    additionalMessageIds?: string[],
  ): Promise<'deleted' | 'missing' | 'stale'>;
  /** A single lease covers bank provisioning, source delivery, and remote erasure. */
  claimBank(
    bankId: string,
    token: string,
    until: Date,
  ): Promise<MemoryBank | null>;
  renewBank(bankId: string, token: string, until: Date): Promise<boolean>;
  releaseBank(
    bankId: string,
    token: string,
    nextAttemptAt: Date,
    errorCode?: string,
  ): Promise<void>;
  pendingBanks(
    namespace: string,
    now: Date,
    limit: number,
    erasureOnly?: boolean,
  ): Promise<MemoryBank[]>;
  bankSources(bankId: string, limit?: number): Promise<MemorySourceSnapshot[]>;
  /** Records the attempt before sending; lost acknowledgements reuse operationId. */
  startDispatch(
    bankId: string,
    token: string,
    deliveryId: string,
  ): Promise<boolean>;
  transitionDelivery(
    bankId: string,
    token: string,
    deliveryId: string,
    state: MemoryDeliveryState,
  ): Promise<boolean>;
  /** Atomically checks current generation, suppression, owner, and opt-out. */
  admit(
    bankId: string,
    token: string,
    deliveryId: string,
    factIds: string[],
  ): Promise<boolean>;
  resolveReference(
    userId: string,
    referenceId: string,
    includeRetired?: boolean,
  ): Promise<ResolvedMemoryReference | null>;
  referencesForDocuments(
    userId: string,
    bankId: string,
    documentIds: string[],
  ): Promise<ResolvedMemoryReference[]>;
  markBankErased(bankId: string, token: string): Promise<boolean>;
  suppressedMessageIds(userId: string, ids: string[]): Promise<string[]>;
  pendingErasureCount(userId: string): Promise<number>;
  retireStaleImports(bankId: string, token: string): Promise<number>;
  ingestionSegment(
    userId: string,
    namespace: string,
    policyVersion: string,
    conversationId: string,
    throughMessageId: string,
  ): Promise<MemoryIngestionSegment | null>;
  stageCheckpoint(
    segment: MemoryIngestionSegment,
    sourceIds: string[],
  ): Promise<boolean>;
  completeCheckpoint(userId: string, checkpointId: string): Promise<boolean>;
  pendingCheckpoints(
    namespace: string,
    limit: number,
  ): Promise<MemoryCheckpoint[]>;
  explicitSourceMessageIds(userId: string, ids: string[]): Promise<string[]>;
  recoverableIngestion(
    namespace: string,
    policyVersion: string,
    idleBefore: Date,
    userIds: string[],
    limit: number,
  ): Promise<
    Array<{
      userId: string;
      conversationId: string;
      throughMessageId: string;
      lastMessageAt: Date;
    }>
  >;
  rejectDelivery(
    bankId: string,
    token: string,
    deliveryId: string,
  ): Promise<boolean>;
}

export const HINDSIGHT_REPOSITORY = Symbol('IHindsightRepository');
