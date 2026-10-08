import { type Job, UnrecoverableError } from 'bullmq';
import type { DocumentJob } from '../../infra/queue';
import {
  type DocumentService,
  NonRetryableDocumentError,
} from './document.service';

/** Shared by the production worker and queue integration checks. */
export async function processDocumentJob(
  documents: Pick<DocumentService, 'processDocument' | 'markProcessingFailed'>,
  job: Pick<Job<DocumentJob>, 'data' | 'opts' | 'attemptsMade'>,
): Promise<void> {
  try {
    await documents.processDocument(
      job.data.documentId,
      job.data.userId,
      job.data.hint,
    );
  } catch (error: unknown) {
    if (error instanceof NonRetryableDocumentError) {
      await documents.markProcessingFailed(job.data.documentId, error);
      throw new UnrecoverableError(error.message);
    }

    // Keep transient failures processing until the queue exhausts its attempts.
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1))
      await documents.markProcessingFailed(job.data.documentId, error);
    throw error;
  }
}
