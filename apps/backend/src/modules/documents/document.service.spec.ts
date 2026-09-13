import { describe, expect, jest, test } from '@jest/globals';
import type {
  Document,
  DocumentStatus,
  FileAsset,
} from '../../database/entities';
import type { IDocumentRepository } from '../../database/interfaces';
import type { EmbeddingsService } from '../../infra/embeddings';
import type { OpenRouterMediaService } from '../../infra/model-gateway';
import type { QueueService } from '../../infra/queue';
import type { StorageService } from '../../infra/storage';
import { DocumentService, NonRetryableDocumentError } from './document.service';

const userId = 'user-1';
const file = {
  originalname: 'notes.txt',
  mimetype: 'text/plain',
  size: 11,
  buffer: Buffer.from('hello world'),
};

function asset(mimeType = file.mimetype): FileAsset {
  return {
    id: 'asset-1',
    originalName: file.originalname,
    mimeType,
    size: file.size,
    kind: 'document',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function document(status: DocumentStatus = 'processing'): Document {
  return {
    id: 'document-1',
    title: file.originalname,
    textContent: null,
    transcript: null,
    imageDescription: null,
    structuredData: null,
    errorMessage: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    status,
    file: asset(),
  };
}

function dependencies() {
  const storage = {
    put: jest
      .fn<(key: string, value: Buffer, contentType: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    get: jest
      .fn<(key: string) => Promise<Buffer>>()
      .mockResolvedValue(file.buffer),
    delete: jest
      .fn<(key: string) => Promise<void>>()
      .mockResolvedValue(undefined),
  } as unknown as StorageService;

  const documents = {
    createFile: jest
      .fn<
        (
          id: string,
          input: {
            originalName: string;
            mimeType: string;
            size: number;
            checksum: string;
            storageKey: string;
            kind: 'document' | 'image' | 'audio';
          },
        ) => Promise<FileAsset>
      >()
      .mockResolvedValue(asset()),
    create: jest
      .fn<
        (
          id: string,
          input: { fileAssetId: string; title: string },
        ) => Promise<Document>
      >()
      .mockResolvedValue(document()),
    replaceChunks: jest
      .fn<
        (
          documentId: string,
          id: string,
          chunks: Array<{
            chunkIndex: number;
            pageNumber?: number | null;
            content: string;
          }>,
        ) => Promise<
          Array<{
            id: string;
            chunkIndex: number;
            pageNumber: number | null;
            content: string;
          }>
        >
      >()
      .mockImplementation((_documentId, _id, chunks) =>
        Promise.resolve(
          chunks.map((chunk, index) => ({
            id: `chunk-${index}`,
            chunkIndex: chunk.chunkIndex,
            pageNumber: chunk.pageNumber ?? null,
            content: chunk.content,
          })),
        ),
      ),
    complete: jest
      .fn<
        (
          id: string,
          input: {
            textContent?: string | null;
            transcript?: string | null;
            imageDescription?: string | null;
            structuredData?: unknown;
          },
        ) => Promise<void>
      >()
      .mockResolvedValue(undefined),
    saveExtraction: jest
      .fn<
        (
          id: string,
          input: { textContent?: string | null; transcript?: string | null },
        ) => Promise<void>
      >()
      .mockResolvedValue(undefined),
    listChunkEmbeddings: jest
      .fn<IDocumentRepository['listChunkEmbeddings']>()
      .mockResolvedValue([]),
    fail: jest
      .fn<(id: string, message: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    restart: jest
      .fn<(id: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    setChunkEmbedding: jest
      .fn<
        (
          id: string,
          embedding: number[],
          model: string,
          version: string,
        ) => Promise<void>
      >()
      .mockResolvedValue(undefined),
    searchKeyword: jest
      .fn<IDocumentRepository['searchKeyword']>()
      .mockResolvedValue([]),
    searchVector: jest
      .fn<IDocumentRepository['searchVector']>()
      .mockResolvedValue([]),
    findByMessageId: jest
      .fn<IDocumentRepository['findByMessageId']>()
      .mockResolvedValue([]),
    findById: jest
      .fn<
        (
          id: string,
          documentId: string,
          chunks?: boolean,
        ) => Promise<Document | null>
      >()
      .mockResolvedValue(document()),
    storageKey: jest
      .fn<(id: string, documentId: string) => Promise<string | null>>()
      .mockResolvedValue('user-1/blob'),
    delete: jest
      .fn<(id: string, documentId: string) => Promise<string | null>>()
      .mockResolvedValue('user-1/blob'),
  } as unknown as IDocumentRepository;

  const embeddings = {
    embed: jest
      .fn<(text: string) => Promise<number[] | null>>()
      .mockResolvedValue([0.1, 0.2]),
    modelName: jest.fn<() => string>().mockReturnValue('test-model'),
    version: 'test-version',
  } as unknown as EmbeddingsService;

  const media = {
    transcribe: jest
      .fn<OpenRouterMediaService['transcribe']>()
      .mockResolvedValue(null),
  } as unknown as OpenRouterMediaService;

  const queue = {
    documents: {
      add: jest
        .fn<
          (
            name: string,
            data: { documentId: string; userId: string },
            opts?: { jobId?: string },
          ) => Promise<unknown>
        >()
        .mockResolvedValue(undefined),
    },
  };

  return {
    service: new DocumentService(
      documents,
      storage,
      embeddings,
      media,
      queue as unknown as QueueService,
    ),
    storage,
    documents,
    embeddings,
    media,
    queue,
  };
}

describe('DocumentService ingest', () => {
  test('deletes the blob and propagates a createFile failure', async () => {
    const { service, storage, documents, queue } = dependencies();
    const error = new Error('database unavailable');
    documents.createFile = jest
      .fn<
        (
          id: string,
          input: {
            originalName: string;
            mimeType: string;
            size: number;
            checksum: string;
            storageKey: string;
            kind: 'document' | 'image' | 'audio';
          },
        ) => Promise<FileAsset>
      >()
      .mockRejectedValue(error);

    await expect(service.ingest(userId, file)).rejects.toBe(error);
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\//),
    );
    expect(documents.create).not.toHaveBeenCalled();
    expect(queue.documents.add).not.toHaveBeenCalled();
  });

  test('enqueues and returns the processing document without ingesting inline', async () => {
    const { service, documents, queue } = dependencies();

    await expect(service.ingest(userId, file)).resolves.toEqual(document());
    expect(queue.documents.add).toHaveBeenCalledWith(
      'ingest',
      { documentId: 'document-1', userId },
      { jobId: 'document-1' },
    );
    expect(documents.replaceChunks).not.toHaveBeenCalled();
    expect(documents.complete).not.toHaveBeenCalled();
  });

  test('cleans up the blob and document and propagates an enqueue failure', async () => {
    const { service, storage, documents, queue } = dependencies();
    const error = new Error('redis unavailable');
    queue.documents.add = jest
      .fn<
        (
          name: string,
          data: { documentId: string; userId: string },
          opts?: { jobId?: string },
        ) => Promise<unknown>
      >()
      .mockRejectedValue(error);

    await expect(service.ingest(userId, file)).rejects.toBe(error);
    expect(storage.delete).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\//),
    );
    expect(documents.delete).toHaveBeenCalledWith(userId, 'document-1');
  });
});

describe('DocumentService readiness', () => {
  test('waits until queued processing marks the document ready', async () => {
    const { service, documents } = dependencies();
    documents.findById = jest
      .fn<IDocumentRepository['findById']>()
      .mockResolvedValueOnce(document('processing'))
      .mockResolvedValueOnce(document('ready'));

    await expect(
      service.waitUntilReady(userId, 'document-1', 2_000),
    ).resolves.toMatchObject({ status: 'ready' });
    expect(documents.findById).toHaveBeenCalledTimes(2);
  });

  test('fails immediately when document processing fails', async () => {
    const { service, documents } = dependencies();
    documents.findById = jest
      .fn<IDocumentRepository['findById']>()
      .mockResolvedValue({
        ...document('failed'),
        errorMessage: 'Tidak dapat membaca file.',
      });

    await expect(service.waitUntilReady(userId, 'document-1')).rejects.toThrow(
      'Tidak dapat membaca file.',
    );
  });
});

describe('DocumentService processDocument', () => {
  test('parses, embeds, and completes a processing document', async () => {
    const { service, storage, documents } = dependencies();

    await service.processDocument('document-1', userId);
    expect(storage.get).toHaveBeenCalledWith('user-1/blob');
    expect(documents.replaceChunks).toHaveBeenCalledWith('document-1', userId, [
      { chunkIndex: 0, pageNumber: null, content: 'hello world' },
    ]);
    expect(documents.setChunkEmbedding).toHaveBeenCalledWith(
      'chunk-0',
      [0.1, 0.2],
      'test-model',
      'test-version',
    );
    expect(documents.complete).toHaveBeenCalledWith(
      'document-1',
      expect.objectContaining({ textContent: 'hello world' }),
    );
    expect(documents.fail).not.toHaveBeenCalled();
  });

  test('fails an unsupported format as non-retryable', async () => {
    const { service, documents } = dependencies();
    documents.findById = jest
      .fn<
        (
          id: string,
          documentId: string,
          chunks?: boolean,
        ) => Promise<Document | null>
      >()
      .mockResolvedValue({
        ...document(),
        file: { ...asset(), mimeType: 'application/octet-stream' },
      });

    await expect(
      service.processDocument('document-1', userId),
    ).rejects.toBeInstanceOf(NonRetryableDocumentError);
    expect(documents.complete).not.toHaveBeenCalled();
  });

  test('rejects missing embeddings without publishing chunks', async () => {
    const { service, documents, embeddings } = dependencies();
    jest.spyOn(embeddings, 'embed').mockResolvedValue(null);

    await expect(service.processDocument('document-1', userId)).rejects.toThrow(
      'Layanan embedding belum dikonfigurasi',
    );
    expect(documents.replaceChunks).not.toHaveBeenCalled();
    expect(documents.complete).not.toHaveBeenCalled();
  });

  test('is a no-op when the document is already ready', async () => {
    const { service, storage, documents } = dependencies();
    documents.findById = jest
      .fn<
        (
          id: string,
          documentId: string,
          chunks?: boolean,
        ) => Promise<Document | null>
      >()
      .mockResolvedValue(document('ready'));

    await service.processDocument('document-1', userId);
    expect(storage.get).not.toHaveBeenCalled();
    expect(documents.complete).not.toHaveBeenCalled();
  });

  test('rejects images as non-retryable now that vision is removed', async () => {
    const { service, documents } = dependencies();
    documents.findById = jest
      .fn<IDocumentRepository['findById']>()
      .mockResolvedValue({
        ...document(),
        file: { ...asset('image/png'), kind: 'image' },
      });

    await expect(
      service.processDocument('document-1', userId),
    ).rejects.toBeInstanceOf(NonRetryableDocumentError);
    expect(documents.complete).not.toHaveBeenCalled();
  });

  test('reuses a stored transcript instead of transcribing again', async () => {
    const { service, documents, media } = dependencies();
    documents.findById = jest
      .fn<IDocumentRepository['findById']>()
      .mockResolvedValue({
        ...document(),
        transcript: 'Halo dari catatan suara.',
        file: { ...asset('audio/webm'), kind: 'audio' },
      });

    await service.processDocument('document-1', userId);

    expect(media.transcribe).not.toHaveBeenCalled();
    expect(documents.saveExtraction).not.toHaveBeenCalled();
    expect(documents.replaceChunks).toHaveBeenCalledWith('document-1', userId, [
      {
        chunkIndex: 0,
        pageNumber: null,
        content: 'Halo dari catatan suara.',
      },
    ]);
    expect(documents.complete).toHaveBeenCalledWith(
      'document-1',
      expect.objectContaining({ transcript: 'Halo dari catatan suara.' }),
    );
  });

  test('persists a fresh transcript before embedding so retries reuse it', async () => {
    const { service, documents, media } = dependencies();
    documents.findById = jest
      .fn<IDocumentRepository['findById']>()
      .mockResolvedValue({
        ...document(),
        file: { ...asset('audio/webm'), kind: 'audio' },
      });
    media.transcribe = jest
      .fn<OpenRouterMediaService['transcribe']>()
      .mockResolvedValue('Halo.');

    await service.processDocument('document-1', userId);

    expect(media.transcribe).toHaveBeenCalledTimes(1);
    expect(documents.saveExtraction).toHaveBeenCalledWith('document-1', {
      transcript: 'Halo.',
    });
    expect(documents.complete).toHaveBeenCalledWith(
      'document-1',
      expect.objectContaining({ transcript: 'Halo.' }),
    );
  });

  test('skips re-embedding chunks that already carry an embedding', async () => {
    const { service, documents, embeddings } = dependencies();
    documents.listChunkEmbeddings = jest
      .fn<IDocumentRepository['listChunkEmbeddings']>()
      .mockResolvedValue([
        {
          id: 'chunk-0',
          chunkIndex: 0,
          content: 'hello world',
          embedded: true,
        },
      ]);

    await service.processDocument('document-1', userId);

    expect(documents.replaceChunks).not.toHaveBeenCalled();
    expect(embeddings.embed).not.toHaveBeenCalled();
    expect(documents.setChunkEmbedding).not.toHaveBeenCalled();
    expect(documents.complete).toHaveBeenCalled();
  });
});

describe('DocumentService retrieval', () => {
  test('lists all documents attached to a user-owned source message', async () => {
    const { service, documents } = dependencies();
    const attached = [
      { ...document('ready'), id: 'document-1' },
      { ...document('ready'), id: 'document-2' },
    ];

    documents.findByMessageId = jest
      .fn<IDocumentRepository['findByMessageId']>()
      .mockResolvedValue(attached);

    await expect(service.listAttached(userId, 'message-1')).resolves.toEqual(
      attached,
    );
    expect(documents.findByMessageId).toHaveBeenCalledWith(userId, 'message-1');
  });

  test('scopes retrieval to documents attached to the source message', async () => {
    const { service, documents } = dependencies();
    documents.findByMessageId = jest
      .fn<IDocumentRepository['findByMessageId']>()
      .mockResolvedValue([{ ...document('ready'), id: 'attached-document' }]);

    await service.searchForMessage(userId, 'message-1', 'invoice total', 6);

    expect(documents.searchKeyword).toHaveBeenCalledWith(
      userId,
      'invoice total',
      18,
      ['attached-document'],
    );
    expect(documents.searchVector).toHaveBeenCalledWith(
      userId,
      [0.1, 0.2],
      18,
      ['attached-document'],
    );
  });

  test('limits one document to two chunks and keeps other documents visible', async () => {
    const { service, documents } = dependencies();
    const result = [
      {
        id: 'a-1',
        documentId: 'document-a',
        title: 'a.pdf',
        chunkIndex: 0,
        pageNumber: 1,
        content: 'invoice total one',
      },
      {
        id: 'a-2',
        documentId: 'document-a',
        title: 'a.pdf',
        chunkIndex: 1,
        pageNumber: 2,
        content: 'invoice total two',
      },
      {
        id: 'a-3',
        documentId: 'document-a',
        title: 'a.pdf',
        chunkIndex: 2,
        pageNumber: 3,
        content: 'invoice total three',
      },
      {
        id: 'b-1',
        documentId: 'document-b',
        title: 'b.pdf',
        chunkIndex: 0,
        pageNumber: 1,
        content: 'invoice total four',
      },
    ];

    documents.searchVector = jest
      .fn<IDocumentRepository['searchVector']>()
      .mockResolvedValue(result);

    const found = await service.search(userId, 'invoice total', 4);

    expect(found.map(({ id }) => id)).toEqual(['a-1', 'a-2', 'b-1']);
  });
});
