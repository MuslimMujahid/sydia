export type DocumentArtifactCleanup = {
  ownerId: string;
  storageKey: string;
};

export interface IDocumentArtifactCleanupRepository {
  trackUpload(ownerId: string, storageKey: string): Promise<void>;
  renewUpload(storageKey: string, leaseExpiresAt: Date): Promise<void>;
  requestCleanup(ownerId: string, storageKey: string): Promise<void>;
  activateUpload(storageKey: string): Promise<void>;
  claimOrphaned(
    limit: number,
    expiredBefore: Date,
    claimedAt: Date,
  ): Promise<DocumentArtifactCleanup[]>;
  recordAttempt(storageKey: string, attemptedAt: Date): Promise<void>;
  remove(storageKey: string): Promise<void>;
}

export const DOCUMENT_ARTIFACT_CLEANUP_REPOSITORY = Symbol(
  'IDocumentArtifactCleanupRepository',
);
