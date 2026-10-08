import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DOCUMENT_ARTIFACT_CLEANUP_REPOSITORY,
  type IDocumentArtifactCleanupRepository,
} from '../../database/interfaces';
import { StorageService } from '../../infra/storage';
import { extractionKey } from '../../shared/documents';

const CLEANUP_BATCH_SIZE = 100;
const CLEANUP_INTERVAL_MS = 60_000;
const UPLOAD_LEASE_MS = 5 * 60_000;
const UPLOAD_LEASE_RENEWAL_MS = 60_000;

@Injectable()
export class DocumentArtifactCleanupService {
  private readonly logger = new Logger(DocumentArtifactCleanupService.name);
  private timer?: NodeJS.Timeout;
  private sweepInFlight?: Promise<number>;

  constructor(
    @Inject(DOCUMENT_ARTIFACT_CLEANUP_REPOSITORY)
    private readonly artifacts: IDocumentArtifactCleanupRepository,
    private readonly storage: StorageService,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.sweep().catch((error: unknown) =>
        this.logger.error('Document artifact cleanup sweep failed', error),
      );
    }, CLEANUP_INTERVAL_MS);
    this.timer.unref();
    void this.sweep().catch((error: unknown) =>
      this.logger.error('Document artifact cleanup sweep failed', error),
    );
  }

  async sweep(): Promise<number> {
    if (this.sweepInFlight) return this.sweepInFlight;
    this.sweepInFlight = this.cleanOrphanedArtifacts();

    try {
      return await this.sweepInFlight;
    } finally {
      this.sweepInFlight = undefined;
    }
  }

  private async cleanOrphanedArtifacts(): Promise<number> {
    const now = new Date();
    const artifacts = await this.artifacts.claimOrphaned(
      CLEANUP_BATCH_SIZE,
      now,
      now,
    );

    let removed = 0;

    for (const artifact of artifacts) {
      try {
        await this.storage.delete(artifact.storageKey);
        await this.storage.delete(extractionKey(artifact.storageKey));
        await this.artifacts.remove(artifact.storageKey);
        removed++;
      } catch (error: unknown) {
        await this.artifacts.recordAttempt(artifact.storageKey, new Date());
        this.logger.warn(
          `Could not remove document artifacts for ${artifact.storageKey}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return removed;
  }

  trackUpload(ownerId: string, storageKey: string): Promise<void> {
    return this.artifacts.trackUpload(ownerId, storageKey);
  }

  startUploadLease(storageKey: string): () => void {
    const timer = setInterval(() => {
      void this.artifacts
        .renewUpload(storageKey, new Date(Date.now() + UPLOAD_LEASE_MS))
        .catch((error: unknown) =>
          this.logger.warn(
            `Could not renew upload cleanup lease for ${storageKey}`,
            error instanceof Error ? error.stack : undefined,
          ),
        );
    }, UPLOAD_LEASE_RENEWAL_MS);

    timer.unref();

    return () => clearInterval(timer);
  }

  requestCleanup(ownerId: string, storageKey: string): Promise<void> {
    return this.artifacts.requestCleanup(ownerId, storageKey);
  }

  activateUpload(storageKey: string): Promise<void> {
    return this.artifacts.activateUpload(storageKey).catch((error: unknown) => {
      this.logger.warn(
        `Could not clear upload cleanup tracking for ${storageKey}`,
        error instanceof Error ? error.stack : undefined,
      );
    });
  }
}
