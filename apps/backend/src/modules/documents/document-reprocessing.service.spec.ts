import { describe, expect, jest, test } from '@jest/globals';
import type { Document } from '../../database/entities';
import type { IDocumentRepository } from '../../database/interfaces';
import type { QueueService } from '../../infra/queue';
import type { DocumentExtractionService } from './document-extraction.service';
import { DocumentService, NonRetryableDocumentError } from './document.service';
import { DocumentReprocessingService } from './document-reprocessing.service';

function setup() {
  const records = new Map<string, Document>(
    ['a', 'b', 'c'].map((id) => [
      id,
      {
        id,
        status: 'ready',
        file: { kind: 'document' },
      } as Document,
    ]),
  );

  const repository = {
    findById: jest
      .fn<IDocumentRepository['findById']>()
      .mockImplementation((userId, id) =>
        Promise.resolve(userId === 'owner' ? (records.get(id) ?? null) : null),
      ),
    storageKey: jest
      .fn<IDocumentRepository['storageKey']>()
      .mockResolvedValue('owner/original'),
    restart: jest
      .fn<IDocumentRepository['restart']>()
      .mockImplementation((id) => {
        const record = records.get(id);
        if (record) record.status = 'processing';

        return Promise.resolve();
      }),
  };

  const documents = {
    processDocument: jest
      .fn<DocumentService['processDocument']>()
      .mockImplementation((id) => {
        const record = records.get(id);
        if (record) record.status = 'ready';

        return Promise.resolve();
      }),
    markProcessingFailed: jest
      .fn<DocumentService['markProcessingFailed']>()
      .mockImplementation((id) => {
        const record = records.get(id);
        if (record) record.status = 'failed';

        return Promise.resolve();
      }),
  };

  const extraction = {
    deleteCheckpoint: jest
      .fn<DocumentExtractionService['deleteCheckpoint']>()
      .mockResolvedValue(undefined),
  };

  let lease: string | null = null;
  const client = {
    defineCommand: jest.fn(),
    get: jest
      .fn<(key: string) => Promise<string | null>>()
      .mockImplementation(() => Promise.resolve(lease)),
    runCommand: jest
      .fn<(name: string, args: unknown[]) => Promise<unknown>>()
      .mockImplementation((name, args) => {
        const token = String(args[1]);

        if (name.endsWith('Acquire')) {
          if (lease) return Promise.resolve(null);
          lease = token;

          return Promise.resolve('OK');
        }

        if (lease !== token) return Promise.resolve(0);
        if (name.endsWith('Release')) lease = null;

        return Promise.resolve(1);
      }),
  };

  const queue = {
    isPaused: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    getActiveCount: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    getBackend: () => ({ client: Promise.resolve(client) }),
    toKey: (suffix: string) => `bull:documents:${suffix}`,
  };

  return {
    records,
    repository,
    documents,
    extraction,
    queue,
    client,
    service: new DocumentReprocessingService(
      repository as unknown as IDocumentRepository,
      documents as unknown as DocumentService,
      extraction as unknown as DocumentExtractionService,
      { documents: queue } as unknown as QueueService,
    ),
  };
}

describe('DocumentReprocessingService', () => {
  test('dry run bounds and sorts the explicit selection without writes or queue changes', async () => {
    const { service, repository, documents, queue } = setup();
    const result = await service.batch('owner', ['c', 'a', 'b', 'a'], {
      dryRun: true,
      limit: 2,
    });

    expect(result.outcomes).toEqual([
      { documentId: 'a', outcome: 'candidate' },
      { documentId: 'b', outcome: 'candidate' },
    ]);
    expect(result.afterId).toBe('b');
    expect(result.hasMore).toBe(true);
    expect(repository.restart).not.toHaveBeenCalled();
    expect(documents.processDocument).not.toHaveBeenCalled();
    expect(queue.isPaused).not.toHaveBeenCalled();
  });

  test.each([false, true])(
    'refuses writes when queue pause/active state is unsafe (%p)',
    async (paused) => {
      const { service, repository, queue } = setup();
      queue.isPaused.mockResolvedValue(paused);
      queue.getActiveCount.mockResolvedValue(paused ? 1 : 0);
      await expect(
        service.batch('owner', ['a'], { dryRun: false }),
      ).rejects.toThrow('Pause the documents queue');
      expect(repository.findById).not.toHaveBeenCalled();
    },
  );

  test('stops on a transient failure and resumes after the last completed ID', async () => {
    const { service, documents, repository, extraction } = setup();
    documents.processDocument
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Embedding outage'));
    // Successful processing must also publish readiness in the repository.
    const normal = documents.processDocument.getMockImplementation()!;
    documents.processDocument
      .mockReset()
      .mockImplementationOnce(normal)
      .mockRejectedValueOnce(new Error('Embedding outage'))
      .mockImplementation(normal);
    const progress = jest.fn();
    const first = await service.batch('owner', ['c', 'b', 'a'], {
      dryRun: false,
      onProgress: progress,
    });

    expect(first.interrupted).toBe(true);
    expect(first.afterId).toBe('a');
    expect(first.outcomes.at(-1)?.outcome).toBe('retryable-failure');
    const second = await service.batch('owner', ['a', 'b', 'c'], {
      dryRun: false,
      afterId: first.afterId!,
    });

    expect(second.interrupted).toBe(false);
    expect(second.afterId).toBe('c');
    expect(second.hasMore).toBe(false);
    expect(documents.processDocument.mock.calls.map(([id]) => id)).toEqual([
      'a',
      'b',
      'b',
      'c',
    ]);
    expect(repository.restart.mock.calls.map(([id]) => id)).toEqual([
      'a',
      'b',
      'b',
      'c',
    ]);
    expect(extraction.deleteCheckpoint).not.toHaveBeenCalled();
    expect(progress).toHaveBeenLastCalledWith(
      { documentId: 'b', outcome: 'retryable-failure' },
      'a',
    );
  });

  test('resumes a processing record left by an interrupted maintenance command', async () => {
    const { service, records, repository, documents } = setup();
    records.get('a')!.status = 'processing';
    const result = await service.batch('owner', ['a'], { dryRun: false });
    expect(result.outcomes[0]?.outcome).toBe('ready');
    expect(repository.restart).not.toHaveBeenCalled();
    expect(documents.processDocument).toHaveBeenCalledWith('a', 'owner');
  });

  test('explicit refresh deletes only the selected owned checkpoint', async () => {
    const { service, extraction, repository } = setup();
    const result = await service.batch('owner', ['a'], {
      dryRun: false,
      refreshExtraction: true,
    });

    expect(extraction.deleteCheckpoint).toHaveBeenCalledWith('owner/original');
    expect(repository.storageKey).toHaveBeenCalledWith('owner', 'a');
    expect(result.parserVersion).toBe('officeparser-8.1.1');
    expect(result.policyVersion).toBe(3);
  });

  test('owner scoping prevents another owner from restarting or reading a document', async () => {
    const { service, repository, documents } = setup();
    const result = await service.batch('other-owner', ['a'], { dryRun: false });
    expect(result.outcomes[0]?.outcome).toBe('missing');
    expect(repository.restart).not.toHaveBeenCalled();
    expect(documents.processDocument).not.toHaveBeenCalled();
  });

  test('skips standalone media and advances past deterministic document failures', async () => {
    const { service, records, documents } = setup();
    records.get('a')!.file.kind = 'image';
    documents.processDocument.mockRejectedValueOnce(
      new NonRetryableDocumentError('Unsupported format'),
    );
    const result = await service.batch('owner', ['a', 'b'], { dryRun: false });
    expect(result.outcomes.map(({ outcome }) => outcome)).toEqual([
      'skipped-media',
      'rejected',
    ]);
    expect(result.afterId).toBe('b');
    expect(result.interrupted).toBe(false);
  });

  test('rejects simultaneous maintenance and releases the lease after processing', async () => {
    const { service, documents, repository } = setup();
    let finish: (() => void) | undefined;
    documents.processDocument.mockImplementationOnce(async (id) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      await repository.restart(id);
      // The second call below restores readiness using the normal implementation.
      await documents.processDocument(id, 'owner');
    });
    const first = service.batch('owner', ['a'], { dryRun: false });
    while (!finish) await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(
      service.batch('owner', ['b'], { dryRun: false }),
    ).rejects.toThrow('maintenance lease');
    finish();
    await first;
    await expect(
      service.batch('owner', ['b'], { dryRun: false }),
    ).resolves.toMatchObject({ afterId: 'b' });
  });

  test('fails before writes when the maintenance lease is lost', async () => {
    const { service, client, repository } = setup();
    client.get.mockResolvedValue('another-command');
    await expect(
      service.batch('owner', ['a'], { dryRun: false }),
    ).rejects.toThrow('lease was lost');
    expect(repository.restart).not.toHaveBeenCalled();
  });

  test('executes maintenance without a parser selector', async () => {
    const { service } = setup();

    await expect(
      service.batch('owner', ['a'], { dryRun: false }),
    ).resolves.toMatchObject({
      outcomes: [{ documentId: 'a', outcome: 'ready' }],
    });
  });
});
