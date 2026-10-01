import type {
  HindsightBank as PrismaBank,
  HindsightSource as PrismaSource,
  HindsightDelivery as PrismaDelivery,
  HindsightReference as PrismaReference,
  HindsightCheckpoint as PrismaCheckpoint,
  HindsightRollback as PrismaRollback,
} from '../../generated/prisma/client';

export type MemoryRollback = Pick<
  PrismaRollback,
  | 'bankId'
  | 'userId'
  | 'namespace'
  | 'boundaryChecksum'
  | 'sourceCount'
  | 'factCount'
  | 'createdAt'
>;

/** Stable current-state manifest checked again inside the reconciliation transaction. */
export type MemoryRollbackBoundary = {
  sources: Array<{
    id: string;
    sourceKey: string;
    kind: string;
    generation: number;
    state: string;
    checksum: string;
    eventAt: string;
    sourceMessageIds: string[];
    legacyMemoryId: string | null;
    legacyUpdatedAt: string | null;
    deliveries: Array<{
      id: string;
      generation: number;
      state: string;
      checksum: string;
      factIds: string[];
    }>;
  }>;
  conversations: Array<{ id: string; throughMessageId: string | null }>;
  legacy: Array<{ id: string; updatedAt: string }>;
};

export type MemoryBank = Pick<
  PrismaBank,
  | 'id'
  | 'userId'
  | 'namespace'
  | 'leaseToken'
  | 'leaseUntil'
  | 'nextAttemptAt'
  | 'attempts'
  | 'lastErrorCode'
  | 'erasedAt'
  | 'createdAt'
  | 'updatedAt'
> & { state: 'active' | 'erasing' | 'erased' };

export type MemorySourceKind = 'explicit' | 'automatic' | 'import';
export type MemorySource = Pick<
  PrismaSource,
  | 'id'
  | 'bankId'
  | 'sourceKey'
  | 'generation'
  | 'checksum'
  | 'sourceMessageIds'
  | 'conversationId'
  | 'legacyMemoryId'
  | 'legacyUpdatedAt'
  | 'eventAt'
  | 'createdAt'
  | 'updatedAt'
> & { state: 'active' | 'deleted'; kind: MemorySourceKind };

export type MemoryDeliveryState =
  | 'pending'
  | 'submitted'
  | 'retained'
  | 'admitted'
  | 'erase_pending'
  | 'erased'
  | 'failed';
export type MemoryDelivery = Pick<
  PrismaDelivery,
  | 'id'
  | 'sourceId'
  | 'generation'
  | 'documentId'
  | 'operationId'
  | 'requestKey'
  | 'requestFingerprint'
  | 'checksum'
  | 'content'
  | 'dispatchStartedAt'
  | 'retainedAt'
  | 'admittedAt'
  | 'erasedAt'
  | 'createdAt'
  | 'updatedAt'
> & { state: MemoryDeliveryState };

export type MemoryReference = Pick<
  PrismaReference,
  'id' | 'deliveryId' | 'remoteFactId' | 'createdAt'
>;
export type MemorySourceSnapshot = {
  bank: MemoryBank;
  source: MemorySource;
  deliveries: MemoryDelivery[];
};
export type ResolvedMemoryReference = MemorySourceSnapshot & {
  reference: MemoryReference;
  delivery: MemoryDelivery;
};

export type MemoryCheckpoint = Pick<
  PrismaCheckpoint,
  | 'id'
  | 'userId'
  | 'namespace'
  | 'conversationId'
  | 'policyVersion'
  | 'throughMessageId'
  | 'throughCreatedAt'
  | 'pendingMessageId'
  | 'pendingCreatedAt'
  | 'pendingSourceIds'
>;
export type MemoryIngestionSegment = {
  checkpoint: MemoryCheckpoint;
  through: { id: string; createdAt: Date };
  messages: Array<{ id: string; content: string; createdAt: Date }>;
};
