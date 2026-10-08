import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  DOCUMENT_REPOSITORY,
  type IDocumentRepository,
} from '../../database/interfaces';
import {
  DOCUMENT_PARSER_VERSION,
  DOCUMENT_POLICY_VERSION,
} from '../../infra/document-parser';
import { QueueService } from '../../infra/queue';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentService, NonRetryableDocumentError } from './document.service';

export type ReprocessingOutcome = {
  documentId: string;
  outcome:
    | 'candidate'
    | 'ready'
    | 'missing'
    | 'skipped-media'
    | 'rejected'
    | 'retryable-failure';
};

export type ReprocessingOptions = {
  dryRun: boolean;
  limit?: number;
  afterId?: string;
  refreshExtraction?: boolean;
  onProgress?: (outcome: ReprocessingOutcome, afterId: string | null) => void;
};

@Injectable()
export class DocumentReprocessingService {
  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    private readonly repository: IDocumentRepository,
    private readonly documents: DocumentService,
    private readonly extraction: DocumentExtractionService,
    private readonly queues: QueueService,
  ) {}

  async batch(
    userId: string,
    documentIds: string[],
    options: ReprocessingOptions,
  ) {
    const limit = options.limit ?? 5;
    if (!userId.trim() || userId.length > 128)
      throw new Error('Reprocessing requires a valid owner ID.');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20)
      throw new Error('Reprocessing limit must be 1–20.');
    if (
      !documentIds.length ||
      documentIds.length > 1000 ||
      documentIds.some((id) => !id.trim() || id.length > 128)
    )
      throw new Error('Select 1–1000 valid document IDs.');
    const selection = [...new Set(documentIds)].sort();
    if (options.afterId && !selection.includes(options.afterId))
      throw new Error(
        'Resume cursor must belong to the selected document IDs.',
      );
    const remaining = selection.filter(
      (id) => !options.afterId || id > options.afterId,
    );

    const outcomes: ReprocessingOutcome[] = [];
    let afterId = options.afterId ?? null;
    let interrupted = false;

    const lease = options.dryRun ? null : await this.acquireLease();

    try {
      for (const documentId of remaining.slice(0, limit)) {
        await lease?.verify();
        if (!options.dryRun) await this.requireIdlePausedQueue();
        const record = await this.repository.findById(userId, documentId);
        let outcome: ReprocessingOutcome['outcome'];

        if (!record) outcome = 'missing';
        else if (record.file.kind !== 'document') outcome = 'skipped-media';
        else if (options.dryRun) outcome = 'candidate';
        else {
          try {
            if (options.refreshExtraction) {
              const key = await this.repository.storageKey(userId, documentId);
              if (key) await this.extraction.deleteCheckpoint(key);
            }

            // A paused, idle queue also allows an interrupted maintenance record
            // to resume from processing with its successful extraction intact.
            if (record.status !== 'processing')
              await this.repository.restart(documentId);
            await this.documents.processDocument(documentId, userId);
            const completed = await this.repository.findById(
              userId,
              documentId,
            );

            if (!completed) outcome = 'missing';
            else if (completed.status === 'ready') outcome = 'ready';
            else throw new Error('Document did not reach readiness.');
          } catch (error: unknown) {
            if (error instanceof NonRetryableDocumentError) {
              await this.documents.markProcessingFailed(documentId, error);
              outcome = 'rejected';
            } else {
              await this.documents.markProcessingFailed(documentId, error);
              outcome = 'retryable-failure';
              interrupted = true;
            }
          }
        }

        if (!interrupted) afterId = documentId;
        const result = { documentId, outcome };
        outcomes.push(result);
        options.onProgress?.(result, afterId);
        if (interrupted) break;
      }

      return {
        parserVersion: DOCUMENT_PARSER_VERSION,
        policyVersion: DOCUMENT_POLICY_VERSION,
        dryRun: options.dryRun,
        outcomes,
        afterId,
        interrupted,
        hasMore: remaining.some((id) => !afterId || id > afterId),
      };
    } finally {
      await lease?.release();
    }
  }

  private async acquireLease() {
    await this.requireIdlePausedQueue();
    const client = await this.queues.documents.getBackend().client;
    const key = this.queues.documents.toKey('reprocessing-lease');
    const token = randomUUID();
    client.defineCommand('sydiaDocumentMaintenanceAcquire', {
      numberOfKeys: 1,
      lua: "return redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX')",
    });
    client.defineCommand('sydiaDocumentMaintenanceRenew', {
      numberOfKeys: 1,
      lua: "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end",
    });
    client.defineCommand('sydiaDocumentMaintenanceRelease', {
      numberOfKeys: 1,
      lua: "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
    });
    const acquired: unknown = await client.runCommand(
      'sydiaDocumentMaintenanceAcquire',
      [key, token, 120_000],
    );

    if (acquired !== 'OK')
      throw new Error(
        'Another document reprocessing command holds the maintenance lease.',
      );
    let lost = false;
    let renewal = Promise.resolve();
    const timer = setInterval(() => {
      renewal = client
        .runCommand('sydiaDocumentMaintenanceRenew', [key, token, 120_000])
        .then((result: unknown) => {
          if (result !== 1) lost = true;
        })
        .catch(() => {
          lost = true;
        });
    }, 30_000);

    timer.unref();

    return {
      verify: async () => {
        if (lost || (await client.get(key)) !== token)
          throw new Error(
            'Document maintenance lease was lost; resume after checking queue state.',
          );
      },
      release: async () => {
        clearInterval(timer);
        await renewal;
        await client.runCommand('sydiaDocumentMaintenanceRelease', [
          key,
          token,
        ]);
      },
    };
  }

  private async requireIdlePausedQueue(): Promise<void> {
    if (
      !(await this.queues.documents.isPaused()) ||
      (await this.queues.documents.getActiveCount())
    )
      throw new Error(
        'Pause the documents queue and wait for active jobs to finish before reprocessing.',
      );
  }
}
