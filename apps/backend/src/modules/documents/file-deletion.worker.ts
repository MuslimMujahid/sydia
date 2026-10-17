import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  FILE_DELETION_REPOSITORY,
  type IFileDeletionRepository,
} from '../../database/interfaces';
import { StorageService } from '../../infra/storage';
import { QueueService } from '../../infra/queue';
import { DocumentArtifactCleanupService } from '../document-artifacts/document-artifact-cleanup.service';
import { DocumentExtractionService } from './document-extraction.service';

const DELETION_POLL_MS = 1_000;
const DELETION_BATCHES_PER_TICK = 50;

@Injectable()
export class FileDeletionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileDeletionWorker.name);
  private timer?: ReturnType<typeof setTimeout>;
  private stopping = false;
  private active?: Promise<void>;
  constructor(
    @Inject(FILE_DELETION_REPOSITORY)
    private readonly deletions: IFileDeletionRepository,
    private readonly storage: StorageService,
    private readonly extraction: DocumentExtractionService,
    private readonly cleanup: DocumentArtifactCleanupService,
    private readonly queue: QueueService,
  ) {}

  onModuleInit() {
    this.schedule(0);
  }

  private schedule(delay: number) {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.active = this.tick()
        .catch((error: unknown) => {
          this.logger.error(
            'File deletion worker failed; durable operation will be recovered after its lease expires.',
            error,
          );
        })
        .finally(() => this.schedule(DELETION_POLL_MS));
    }, delay);
    this.timer.unref();
  }

  async tick(): Promise<void> {
    await this.deletions.pruneExpiredPreviews(new Date());

    for (
      let index = 0;
      index < DELETION_BATCHES_PER_TICK && !this.stopping;
      index++
    ) {
      const claim = await this.deletions.claim(new Date());
      if (!claim) return;

      try {
        await this.deletions.processBatch(claim, async (key, documentId) => {
          // Manual retries and reprocessing have distinct queue IDs. Inspect
          // the active set by document identity, not only the first upload ID.
          // New jobs cannot read storage keys once the manifest is locked.
          const activeJobs = await this.queue.documents.getActive(0, -1);
          if (
            activeJobs.some(
              (job) =>
                job.data.documentId === documentId &&
                job.data.userId === claim.userId,
            )
          )
            return 'pending';
          const job = await this.queue.documents.getJob(documentId);

          // An active parser can still write a checkpoint. Keep the durable
          // deletion pending until it finishes, then remove queued retries.
          if (job) {
            if (await job.isActive()) return 'pending';
            await job.remove();
          }

          await this.cleanup.requestCleanup(claim.userId, key);
          await this.storage.delete(key);
          await this.extraction.deleteCheckpoint(key);
        });
      } catch (error: unknown) {
        this.logger.error(
          'File deletion batch failed; recording its retry budget.',
          error,
        );
        await this.deletions.recordClaimFailure(claim);
        throw error;
      }
    }
  }

  async onModuleDestroy() {
    this.stopping = true;
    clearTimeout(this.timer);
    await this.active;
  }
}
