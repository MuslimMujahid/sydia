import { describe, expect, jest, test } from '@jest/globals';
import { UnrecoverableError } from 'bullmq';
import { processDocumentJob } from './document-job.processor';
import { NonRetryableDocumentError } from './document.service';
import type { DocumentService } from './document.service';

function dependencies() {
  return {
    processDocument: jest
      .fn<DocumentService['processDocument']>()
      .mockResolvedValue(undefined),
    markProcessingFailed: jest
      .fn<DocumentService['markProcessingFailed']>()
      .mockResolvedValue(undefined),
  };
}

const data = { documentId: 'document-1', userId: 'owner-1', hint: 'Invoice' };

describe('document queue failure policy', () => {
  test('passes the owner and naming hint to processing', async () => {
    const documents = dependencies();
    await processDocumentJob(documents, { data, opts: {}, attemptsMade: 0 });
    expect(documents.processDocument).toHaveBeenCalledWith(
      data.documentId,
      data.userId,
      data.hint,
    );
    expect(documents.markProcessingFailed).not.toHaveBeenCalled();
  });

  test('stops deterministic failures even when retries remain', async () => {
    const documents = dependencies();
    const error = new NonRetryableDocumentError('Dokumen rusak.');
    documents.processDocument.mockRejectedValue(error);
    await expect(
      processDocumentJob(documents, {
        data,
        opts: { attempts: 5 },
        attemptsMade: 0,
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(documents.markProcessingFailed).toHaveBeenCalledWith(
      data.documentId,
      error,
    );
  });

  test('preserves processing state while transient retries remain', async () => {
    const documents = dependencies();
    const error = new Error('Embedding temporarily unavailable');
    documents.processDocument.mockRejectedValue(error);
    await expect(
      processDocumentJob(documents, {
        data,
        opts: { attempts: 3 },
        attemptsMade: 1,
      }),
    ).rejects.toBe(error);
    expect(documents.markProcessingFailed).not.toHaveBeenCalled();
  });

  test.each([undefined, 1, 3])(
    'marks failure at the final attempt (%s)',
    async (attempts) => {
      const documents = dependencies();
      const error = new Error('Embedding unavailable');
      documents.processDocument.mockRejectedValue(error);
      await expect(
        processDocumentJob(documents, {
          data,
          opts: { attempts },
          attemptsMade: (attempts ?? 1) - 1,
        }),
      ).rejects.toBe(error);
      expect(documents.markProcessingFailed).toHaveBeenCalledWith(
        data.documentId,
        error,
      );
    },
  );
});
