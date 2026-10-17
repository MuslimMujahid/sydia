import type {
  FileDeletionClaim,
  FileDeletionItem,
  FileDeletionOperation,
} from '../entities/file-deletion.entity';
import type { FileLibraryRef } from '../entities';

export interface IFileDeletionRepository {
  preview(
    userId: string,
    items: FileLibraryRef[],
    now: Date,
  ): Promise<FileDeletionOperation>;
  start(
    userId: string,
    previewId: string,
    idempotencyKey: string,
    now: Date,
  ): Promise<FileDeletionOperation>;
  list(
    userId: string,
    offset: number,
    limit: number,
  ): Promise<{ items: FileDeletionOperation[]; total: number }>;
  detail(userId: string, id: string): Promise<FileDeletionOperation>;
  failures(
    userId: string,
    id: string,
    offset: number,
    limit: number,
  ): Promise<{ items: FileDeletionItem[]; total: number }>;
  retry(
    userId: string,
    id: string,
    previewId: string | undefined,
    now: Date,
  ): Promise<FileDeletionOperation>;
  retryPreview(
    userId: string,
    id: string,
    now: Date,
  ): Promise<FileDeletionOperation>;
  claim(now: Date): Promise<FileDeletionClaim | null>;
  pruneExpiredPreviews(now: Date): Promise<number>;
  recordClaimFailure(claim: FileDeletionClaim): Promise<void>;
  processBatch(
    claim: FileDeletionClaim,
    removeArtifacts: (
      key: string,
      documentId: string,
    ) => Promise<void | 'pending'>,
  ): Promise<boolean>;
}
export const FILE_DELETION_REPOSITORY = Symbol('IFileDeletionRepository');
