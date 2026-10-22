import {
  billingTestAccess,
  billingRepositoryFixture,
} from '../../../test/support/billing-fixtures';
import { StorageQuotaService } from '../billing';
import type { IBillingRepository } from '../../database/interfaces';
import { DocumentProcessingPendingError } from '../../shared/documents';
import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type {
  Document,
  DocumentStatus,
  FileAsset,
} from '../../database/entities';
import type { IDocumentRepository } from '../../database/interfaces';
import type { EmbeddingsService } from '../../infra/embeddings';
import type {
  LanguageModelGateway,
  OpenRouterMediaService,
} from '../../infra/model-gateway';
import type { QueueService } from '../../infra/queue';
import type { StorageService } from '../../infra/storage';
import type { DocumentExtractionService } from './document-extraction.service';
import { DocumentService, NonRetryableDocumentError } from './document.service';

const userId = 'user-1';
const file = {
  originalname: 'message.txt',
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
    title: 'KTP Muh Muslim Al-Mujahid.jpg',
    description: null,
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

function dependencies(
  storageRepository: IBillingRepository = billingRepositoryFixture(),
) {
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
    createWithFile: jest
      .fn<IDocumentRepository['createWithFile']>()
      .mockResolvedValue(document()),
    deleteFileByStorageKey: jest
      .fn<IDocumentRepository['deleteFileByStorageKey']>()
      .mockResolvedValue(undefined),
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
    update: jest
      .fn<IDocumentRepository['update']>()
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
          input: {
            textContent?: string | null;
            transcript?: string | null;
            imageDescription?: string | null;
          },
        ) => Promise<void>
      >()
      .mockResolvedValue(undefined),
    updateChunkPage: jest
      .fn<IDocumentRepository['updateChunkPage']>()
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
    embedMany: jest
      .fn<(texts: string[]) => Promise<Array<number[] | null>>>()
      .mockImplementation((texts) =>
        Promise.resolve(texts.map(() => [0.1, 0.2])),
      ),
    modelName: jest.fn<() => string>().mockReturnValue('test-model'),
    version: 'test-version',
  } as unknown as EmbeddingsService;

  const media = {
    transcribe: jest
      .fn<OpenRouterMediaService['transcribe']>()
      .mockResolvedValue(null),
    describeImage: jest
      .fn<OpenRouterMediaService['describeImage']>()
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

  const languageModel = {
    provider: 'openrouter' as const,
    model: 'test-model',
    generate: jest.fn<LanguageModelGateway['generate']>().mockResolvedValue({
      text: '',
      usage: {},
    }),
  } satisfies LanguageModelGateway;

  const extraction = {
    extract: jest.fn<DocumentExtractionService['extract']>().mockResolvedValue({
      text: 'hello world',
      chunks: [{ chunkIndex: 0, pageNumber: null, content: 'hello world' }],
      methods: ['native'],
      warnings: [],
    }),
    deleteCheckpoint: jest
      .fn<DocumentExtractionService['deleteCheckpoint']>()
      .mockResolvedValue(undefined),
  };

  return {
    service: new DocumentService(
      billingTestAccess(),
      new StorageQuotaService(storageRepository),
      documents,
      storage,
      embeddings,
      media,
      queue as unknown as QueueService,
      languageModel,
      new ConfigService({ BACKEND_AUTH_URL: 'http://localhost:5000' }),
      extraction as unknown as DocumentExtractionService,
    ),
    storage,
    documents,
    embeddings,
    media,
    queue,
    languageModel,
    extraction,
  };
}

describe('DocumentService links', () => {
  test('builds a public content URL without reading storage', async () => {
    const { service, storage, documents } = dependencies();

    await expect(service.linkFor('user-1', 'document-1')).resolves.toEqual({
      filename: 'KTP Muh Muslim Al-Mujahid.jpg',
      url: 'http://localhost:5000/documents/document-1/content',
    });
    expect(documents.findById).toHaveBeenCalledWith('user-1', 'document-1');
    expect(storage.get).not.toHaveBeenCalled();
  });
  test('loads the user-facing title instead of the original upload id', async () => {
    const { service, storage, documents } = dependencies();

    await expect(service.loadFile('user-1', 'document-1')).resolves.toEqual({
      filename: 'KTP Muh Muslim Al-Mujahid.jpg',
      mimeType: 'text/plain',
      buffer: file.buffer,
    });
    expect(documents.findById).toHaveBeenCalledWith('user-1', 'document-1');
    expect(storage.get).toHaveBeenCalledWith('user-1/blob');
  });
});

describe('DocumentService ingest', () => {
  test('persists the name the model chooses for a machine-made upload name', async () => {
    const { service, documents, languageModel } = dependencies();
    languageModel.generate = jest
      .fn<LanguageModelGateway['generate']>()
      .mockResolvedValue({
        text: 'Kartu Anggota Perpustakaan.jpg',
        usage: {},
      });

    await service.ingest(
      userId,
      { ...file, originalname: 'AQADPhVrG2a7SVV.jpg', mimetype: 'image/jpeg' },
      { hint: 'library membership card' },
    );

    expect(documents.update).toHaveBeenCalledWith(userId, 'document-1', {
      title: 'Kartu Anggota Perpustakaan.jpg',
    });
  });

  test('keeps the uploaded name when the model returns it unchanged', async () => {
    const { service, documents, languageModel } = dependencies();
    languageModel.generate = jest
      .fn<LanguageModelGateway['generate']>()
      .mockResolvedValue({ text: 'Rencana.png', usage: {} });

    await service.ingest(
      userId,
      { ...file, originalname: 'Rencana.png', mimetype: 'image/png' },
      { hint: 'rencana kegiatan' },
    );

    expect(languageModel.generate).toHaveBeenCalledTimes(1);
    expect(documents.update).not.toHaveBeenCalled();
  });

  test('treats a case or padding difference as the same name', async () => {
    const { service, documents, languageModel } = dependencies();
    languageModel.generate = jest
      .fn<LanguageModelGateway['generate']>()
      .mockResolvedValue({ text: '  rencana.PNG  ', usage: {} });

    await service.ingest(
      userId,
      { ...file, originalname: 'Rencana.png', mimetype: 'image/png' },
      { hint: 'rencana kegiatan' },
    );

    expect(documents.update).not.toHaveBeenCalled();
  });

  test('keeps the uploaded name when the model fails', async () => {
    const { service, documents, languageModel, queue } = dependencies();
    languageModel.generate = jest
      .fn<LanguageModelGateway['generate']>()
      .mockRejectedValue(new Error('provider unavailable'));

    await expect(
      service.ingest(
        userId,
        {
          ...file,
          originalname: 'AQADPhVrG2a7SVV.jpg',
          mimetype: 'image/jpeg',
        },
        { hint: 'nota pembelian' },
      ),
    ).resolves.toEqual(document());
    expect(documents.update).not.toHaveBeenCalled();
    expect(queue.documents.add).toHaveBeenCalled();
  });

  test('keeps the uploaded name when the model reply scrubs away to nothing', async () => {
    const { service, documents, languageModel } = dependencies();
    languageModel.generate = jest
      .fn<LanguageModelGateway['generate']>()
      .mockResolvedValue({ text: '"   "', usage: {} });

    await service.ingest(
      userId,
      { ...file, originalname: 'AQADPhVrG2a7SVV.jpg', mimetype: 'image/jpeg' },
      { hint: 'nota pembelian' },
    );

    expect(documents.update).not.toHaveBeenCalled();
  });

  test('does not ask the model when there is no content and no hint', async () => {
    const { service, documents, languageModel } = dependencies();

    await service.ingest(userId, file);

    expect(languageModel.generate).not.toHaveBeenCalled();
    expect(documents.update).not.toHaveBeenCalled();
  });

  test('cleans up the upload and checkpoint when atomic record creation fails', async () => {
    const { service, storage, documents, queue, extraction } = dependencies();
    const error = new Error('database unavailable');
    documents.createWithFile = jest
      .fn<IDocumentRepository['createWithFile']>()
      .mockRejectedValue(error);

    await expect(service.ingest(userId, file)).rejects.toBe(error);
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\//),
    );
    expect(documents.create).not.toHaveBeenCalled();
    expect(documents.deleteFileByStorageKey).toHaveBeenCalledWith(
      userId,
      expect.stringMatching(/^user-1\//),
    );
    expect(extraction.deleteCheckpoint).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\//),
    );
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
    expect(documents.deleteFileByStorageKey).toHaveBeenCalledWith(
      userId,
      expect.stringMatching(/^user-1\//),
    );
  });

  test('removes a partially written original when storage fails', async () => {
    const { service, storage, documents, extraction, queue } = dependencies();
    const error = new Error('disk full');
    storage.put = jest.fn<StorageService['put']>().mockRejectedValue(error);

    await expect(service.ingest(userId, file)).rejects.toBe(error);
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(extraction.deleteCheckpoint).toHaveBeenCalledTimes(1);
    expect(documents.createWithFile).not.toHaveBeenCalled();
    expect(queue.documents.add).not.toHaveBeenCalled();
  });

  test('reports incomplete cleanup while attempting every artifact deletion', async () => {
    const { service, storage, documents, extraction, queue } = dependencies();
    const error = new Error('queue failed');
    queue.documents.add.mockRejectedValue(error);
    documents.deleteFileByStorageKey = jest
      .fn<IDocumentRepository['deleteFileByStorageKey']>()
      .mockRejectedValue(new Error('database unavailable'));
    storage.delete = jest
      .fn<StorageService['delete']>()
      .mockRejectedValue(new Error('storage unavailable'));

    const outcome = service.ingest(userId, file);

    await expect(outcome).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      cause: expect.any(AggregateError),
      message:
        'Unggahan gagal dan pembersihan file belum selesai. Hubungi administrator.',
    });
    await expect(outcome).rejects.toMatchObject({
      response: {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          details: { cleanupIncomplete: true },
        },
      },
    });
    expect(extraction.deleteCheckpoint).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledTimes(1);
  });

  test('a completely cleaned failed upload releases its reserved bytes', async () => {
    const releaseStorage = jest
      .fn<IBillingRepository['releaseStorage']>()
      .mockResolvedValue(undefined);

    const { service, storage } = dependencies(
      billingRepositoryFixture({ releaseStorage }),
    );

    storage.put = jest
      .fn<StorageService['put']>()
      .mockRejectedValue(new Error('storage unavailable'));
    await expect(service.ingest(userId, file)).rejects.toThrow(
      'storage unavailable',
    );
    expect(releaseStorage).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\//),
    );
  });

  test('incomplete upload cleanup retains reserved bytes for durable recovery', async () => {
    const releaseStorage = jest
      .fn<IBillingRepository['releaseStorage']>()
      .mockResolvedValue(undefined);

    const { service, storage } = dependencies(
      billingRepositoryFixture({ releaseStorage }),
    );

    storage.put = jest
      .fn<StorageService['put']>()
      .mockRejectedValue(new Error('partial write'));
    storage.delete = jest
      .fn<StorageService['delete']>()
      .mockRejectedValue(new Error('cleanup unavailable'));
    await expect(service.ingest(userId, file)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(releaseStorage).not.toHaveBeenCalled();
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
    expect(storage.get).toHaveBeenCalledWith('user-1/blob', 100_000_000);
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
        file: {
          ...asset(),
          originalName: 'legacy.doc',
          mimeType: 'application/octet-stream',
        },
      });

    await expect(
      service.processDocument('document-1', userId),
    ).rejects.toBeInstanceOf(NonRetryableDocumentError);
    expect(documents.complete).not.toHaveBeenCalled();
  });

  test('rejects missing embeddings without publishing chunks', async () => {
    const { service, documents, embeddings } = dependencies();
    jest.spyOn(embeddings, 'embedMany').mockResolvedValue([null]);

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

  test('describes, names, indexes, and completes a machine-named image', async () => {
    const { service, documents, media, languageModel } = dependencies();
    const description =
      'A dashboard for OLLO guest laundry showing machine availability.';

    documents.findById = jest
      .fn<IDocumentRepository['findById']>()
      .mockResolvedValue({
        ...document(),
        file: {
          ...asset('image/jpeg'),
          kind: 'image',
          originalName: 'AQADkhRrG2a7SVV-.jpg',
        },
      });
    media.describeImage = jest
      .fn<OpenRouterMediaService['describeImage']>()
      .mockResolvedValue(description);
    languageModel.generate.mockResolvedValue({
      text: 'OLLO guest laundry dashboard.jpg',
      usage: {},
    });

    await service.processDocument('document-1', userId);

    expect(media.describeImage).toHaveBeenCalledWith(file.buffer, 'image/jpeg');
    expect(media.transcribe).not.toHaveBeenCalled();
    expect(languageModel.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining(description),
          }),
        ]),
      }),
    );
    expect(documents.update).toHaveBeenCalledWith('user-1', 'document-1', {
      title: 'OLLO guest laundry dashboard.jpg',
    });
    expect(documents.complete).toHaveBeenCalledWith(
      'document-1',
      expect.objectContaining({ imageDescription: description }),
    );
  });

  test('lets the model keep an image name it judges already clear', async () => {
    const { service, documents, media, languageModel } = dependencies();
    const description = 'An OLLO guest-laundry dashboard.';
    documents.findById = jest
      .fn<IDocumentRepository['findById']>()
      .mockResolvedValue({
        ...document(),
        title: 'ollo-guest-laundry-dashboard.png',
        file: {
          ...asset('image/png'),
          kind: 'image',
          originalName: 'ollo-guest-laundry-dashboard.png',
        },
      });
    media.describeImage = jest
      .fn<OpenRouterMediaService['describeImage']>()
      .mockResolvedValue(description);
    languageModel.generate.mockResolvedValue({
      text: 'ollo-guest-laundry-dashboard.png',
      usage: {},
    });

    await service.processDocument('document-1', userId);

    // The model is consulted, decides the name is already clear, and returns it
    // unchanged — so nothing is written.
    expect(languageModel.generate).toHaveBeenCalledTimes(1);
    expect(documents.update).not.toHaveBeenCalled();
    expect(documents.complete).toHaveBeenCalledWith(
      'document-1',
      expect.objectContaining({ imageDescription: description }),
    );
  });

  test('keeps the current image title when naming fails', async () => {
    const { service, documents, media, languageModel } = dependencies();
    const description = 'An OLLO guest-laundry dashboard.';
    documents.findById = jest
      .fn<IDocumentRepository['findById']>()
      .mockResolvedValue({
        ...document(),
        title: 'AQADkhRrG2a7SVV-.png',
        file: {
          ...asset('image/png'),
          kind: 'image',
          originalName: 'AQADkhRrG2a7SVV-.png',
        },
      });
    media.describeImage = jest
      .fn<OpenRouterMediaService['describeImage']>()
      .mockResolvedValue(description);
    languageModel.generate.mockRejectedValue(new Error('model unavailable'));

    await service.processDocument('document-1', userId);

    expect(documents.update).not.toHaveBeenCalled();
    expect(documents.complete).toHaveBeenCalledWith(
      'document-1',
      expect.objectContaining({ imageDescription: description }),
    );
  });

  test('describes and indexes an image', async () => {
    const { service, documents, media } = dependencies();
    const description = 'A receipt showing the total amount and date.';
    documents.findById = jest
      .fn<IDocumentRepository['findById']>()
      .mockResolvedValue({
        ...document(),
        file: {
          ...asset('image/png'),
          kind: 'image',
          originalName: 'photo.png',
        },
      });
    media.describeImage = jest
      .fn<OpenRouterMediaService['describeImage']>()
      .mockResolvedValue(description);

    await service.processDocument('document-1', userId);

    expect(media.describeImage).toHaveBeenCalledWith(file.buffer, 'image/png');
    expect(media.transcribe).not.toHaveBeenCalled();
    expect(documents.saveExtraction).toHaveBeenCalledWith('document-1', {
      imageDescription: description,
    });
    expect(documents.complete).toHaveBeenCalledWith(
      'document-1',
      expect.objectContaining({ imageDescription: description }),
    );
    expect(documents.replaceChunks).toHaveBeenCalledWith('document-1', userId, [
      { chunkIndex: 0, pageNumber: null, content: description },
    ]);
  });

  test('rejects an image without a description as non-retryable', async () => {
    const { service, documents, media } = dependencies();
    documents.findById = jest
      .fn<IDocumentRepository['findById']>()
      .mockResolvedValue({
        ...document(),
        file: {
          ...asset('image/png'),
          kind: 'image',
          originalName: 'photo.png',
        },
      });
    media.describeImage = jest
      .fn<OpenRouterMediaService['describeImage']>()
      .mockResolvedValue(null);

    await expect(
      service.processDocument('document-1', userId),
    ).rejects.toBeInstanceOf(NonRetryableDocumentError);
    expect(documents.complete).not.toHaveBeenCalled();
    expect(documents.saveExtraction).not.toHaveBeenCalled();
  });

  test('reuses a stored transcript instead of transcribing again', async () => {
    const { service, documents, media } = dependencies();
    documents.findById = jest
      .fn<IDocumentRepository['findById']>()
      .mockResolvedValue({
        ...document(),
        transcript: 'Halo dari catatan suara.',
        file: {
          ...asset('audio/webm'),
          kind: 'audio',
          originalName: 'voice.webm',
        },
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
        file: {
          ...asset('audio/webm'),
          kind: 'audio',
          originalName: 'voice.webm',
        },
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
          pageNumber: null,
          embedded: true,
          embeddingModel: 'test-model',
          embeddingVersion: 'test-version',
        },
      ]);

    await service.processDocument('document-1', userId);

    expect(documents.replaceChunks).not.toHaveBeenCalled();
    expect(embeddings.embedMany).not.toHaveBeenCalled();
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

describe('DocumentService processing deletion races', () => {
  test('removes the checkpoint when deletion races with a failed embedding', async () => {
    const { service, documents, embeddings, extraction } = dependencies();
    extraction.extract.mockResolvedValue({
      text: 'Invoice SYD12345 total 125000',
      chunks: [
        {
          chunkIndex: 0,
          pageNumber: 1,
          content: 'Invoice SYD12345 total 125000',
        },
      ],
      methods: ['native'],
      warnings: [],
    });
    const failure = new Error('Embedding temporarily unavailable');
    jest.mocked(embeddings.embedMany).mockImplementation(() => {
      jest.mocked(documents.findById).mockResolvedValue(null);

      return Promise.reject(failure);
    });

    await expect(service.processDocument('document-1', userId)).rejects.toBe(
      failure,
    );

    expect(extraction.deleteCheckpoint).toHaveBeenCalledWith('user-1/blob');
    expect(documents.complete).not.toHaveBeenCalled();
  });

  test('keeps the checkpoint for an embedding retry when the document survives', async () => {
    const { service, documents, embeddings, extraction } = dependencies();
    extraction.extract.mockResolvedValue({
      text: 'Invoice SYD12345 total 125000',
      chunks: [
        {
          chunkIndex: 0,
          pageNumber: 1,
          content: 'Invoice SYD12345 total 125000',
        },
      ],
      methods: ['native'],
      warnings: [],
    });
    jest
      .mocked(embeddings.embedMany)
      .mockRejectedValue(new Error('Embedding temporarily unavailable'));

    await expect(service.processDocument('document-1', userId)).rejects.toThrow(
      'Embedding temporarily unavailable',
    );

    expect(extraction.deleteCheckpoint).not.toHaveBeenCalled();
    expect(documents.complete).not.toHaveBeenCalled();
  });
});

describe('DocumentService removal lifecycle', () => {
  test('cleans the checkpoint after record deletion so a worker cannot leave a late sidecar', async () => {
    const { service, documents, extraction } = dependencies();
    let deleted = false;
    jest.mocked(documents.delete).mockImplementation(() => {
      deleted = true;

      return Promise.resolve('user-1/blob');
    });
    extraction.deleteCheckpoint.mockImplementation(() => {
      expect(deleted).toBe(true);

      return Promise.resolve();
    });

    await expect(service.remove(userId, 'document-1')).resolves.toBe(true);

    expect(extraction.deleteCheckpoint).toHaveBeenCalledWith('user-1/blob');
  });
});

describe('DocumentService chunk provenance on retry', () => {
  test('updates a changed PDF page reference while preserving a matching embedding', async () => {
    const { service, documents, embeddings, extraction } = dependencies();
    extraction.extract.mockResolvedValue({
      text: 'Invoice total 125000',
      chunks: [
        { chunkIndex: 0, pageNumber: 2, content: 'Invoice total 125000' },
      ],
      methods: ['native'],
      warnings: [],
    });
    jest.mocked(documents.listChunkEmbeddings).mockResolvedValue([
      {
        id: 'previous-chunk',
        chunkIndex: 0,
        pageNumber: 1,
        content: 'Invoice total 125000',
        embedded: true,
        embeddingModel: 'test-model',
        embeddingVersion: 'test-version',
      },
    ]);

    await service.processDocument('document-1', userId);

    expect(documents.updateChunkPage).toHaveBeenCalledWith('previous-chunk', 2);
    expect(documents.replaceChunks).not.toHaveBeenCalled();
    expect(embeddings.embedMany).not.toHaveBeenCalled();
    expect(documents.complete).toHaveBeenCalled();
  });

  test.each([
    { model: 'old-model', version: 'test-version' },
    { model: 'test-model', version: 'old-version' },
    { model: null, version: null },
  ])(
    'refreshes embeddings with incompatible provenance %p',
    async ({ model, version }) => {
      const { service, documents, embeddings } = dependencies();
      jest.mocked(documents.listChunkEmbeddings).mockResolvedValue([
        {
          id: 'previous-chunk',
          chunkIndex: 0,
          pageNumber: null,
          content: 'hello world',
          embedded: true,
          embeddingModel: model,
          embeddingVersion: version,
        },
      ]);

      await service.processDocument('document-1', userId);

      expect(embeddings.embedMany).toHaveBeenCalledWith(['hello world']);
      expect(documents.setChunkEmbedding).toHaveBeenCalledWith(
        'previous-chunk',
        [0.1, 0.2],
        'test-model',
        'test-version',
      );
      expect(documents.replaceChunks).not.toHaveBeenCalled();
      expect(documents.updateChunkPage).not.toHaveBeenCalled();
    },
  );
});

describe('DocumentService officeparser ingress validation', () => {
  test.each([
    ['invoice.docx', 'image/png', 'hello', 'FORMAT_MISMATCH'],
    ['invoice.pdf', 'audio/mpeg', 'hello', 'FORMAT_MISMATCH'],
    ['old.doc', 'image/jpeg', 'hello', 'UNSUPPORTED_FORMAT'],
    ['photo.png', 'image/png', '%PDF-1.7', 'FORMAT_MISMATCH'],
    ['voice.mp3', 'audio/mpeg', '504b0304', 'FORMAT_MISMATCH'],
    ['photo.jpg', 'image/jpeg', 'd0cf11e0a1b11ae1', 'FORMAT_MISMATCH'],
    ['photo.png', 'image/png', '{\\rtf1', 'FORMAT_MISMATCH'],
    ['invoice.docx', 'application/pdf', 'hello', 'FORMAT_MISMATCH'],
    ['empty.txt', 'text/plain', '', 'EMPTY_DOCUMENT'],
  ])(
    'rejects %s declared as %s before side effects',
    async (originalname, mimetype, bytes, parserCode) => {
      const deps = dependencies();
      const buffer = /^[0-9a-f]{8,16}$/.test(bytes)
        ? Buffer.from(bytes, 'hex')
        : Buffer.from(bytes);

      const result = deps.service.ingest(
        userId,
        { originalname, mimetype, buffer, size: buffer.length },
        { hint: 'Name this upload' },
      );

      await expect(result).rejects.toMatchObject({
        message: expect.not.stringContaining('Api Exception'),
        cause: { code: parserCode },
      });
      expect(deps.storage.put).not.toHaveBeenCalled();
      expect(deps.documents.createWithFile).not.toHaveBeenCalled();
      expect(deps.queue.documents.add).not.toHaveBeenCalled();
      expect(deps.languageModel.generate).not.toHaveBeenCalled();
      expect(deps.media.describeImage).not.toHaveBeenCalled();
      expect(deps.media.transcribe).not.toHaveBeenCalled();
      expect(deps.storage.delete).not.toHaveBeenCalled();
    },
  );

  test.each([
    ['photo.png', ' IMAGE/PNG; charset=binary ', 'image'],
    ['voice.mp3', 'Audio/Mpeg', 'audio'],
    ['invoice.docx', 'application/octet-stream', 'document'],
    ['invoice.docx', 'application/zip', 'document'],
    ['notes.md', 'text/plain; charset=UTF-8', 'document'],
    ['sheet.csv', 'application/vnd.ms-excel', 'document'],
  ])(
    'retains routing for %s declared as %s',
    async (originalname, mimetype, kind) => {
      const deps = dependencies();
      await deps.service.ingest(userId, { ...file, originalname, mimetype });
      expect(deps.documents.createWithFile).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ file: expect.objectContaining({ kind }) }),
      );
      expect(deps.queue.documents.add).toHaveBeenCalledTimes(1);
    },
  );
});

describe('DocumentService existing media validation', () => {
  test.each(['image', 'audio'] as const)(
    'rejects disguised documents on %s retries before provider calls',
    async (kind) => {
      const deps = dependencies();
      const record = document();
      record.file = {
        ...record.file,
        kind,
        originalName: 'upload.bin',
        mimeType: kind === 'image' ? 'image/png' : 'audio/mpeg',
      };
      jest.mocked(deps.documents.findById).mockResolvedValue(record);
      jest.mocked(deps.storage.get).mockResolvedValue(Buffer.from('%PDF-1.7'));
      await expect(
        deps.service.processDocument(record.id, userId),
      ).rejects.toThrow(NonRetryableDocumentError);
      expect(deps.media.describeImage).not.toHaveBeenCalled();
      expect(deps.media.transcribe).not.toHaveBeenCalled();
      expect(deps.languageModel.generate).not.toHaveBeenCalled();
      expect(deps.embeddings.embedMany).not.toHaveBeenCalled();
      expect(deps.documents.complete).not.toHaveBeenCalled();
    },
  );
});

describe('DocumentService pending channel wait', () => {
  test('a wait timeout leaves the queued document recoverable', async () => {
    const deps = dependencies();
    await expect(
      deps.service.waitUntilReady(userId, 'document-1', 0),
    ).rejects.toMatchObject({
      name: 'DocumentProcessingPendingError',
      documentId: 'document-1',
    });
    await expect(
      deps.service.waitUntilReady(userId, 'document-1', 0),
    ).rejects.toBeInstanceOf(DocumentProcessingPendingError);
    expect(deps.documents.fail).not.toHaveBeenCalled();
    expect(deps.documents.restart).not.toHaveBeenCalled();
    expect(deps.queue.documents.add).not.toHaveBeenCalled();
    jest.mocked(deps.documents.findById).mockResolvedValue(document('ready'));
    await expect(
      deps.service.waitUntilReady(userId, 'document-1'),
    ).resolves.toMatchObject({ status: 'ready' });
  });
});

describe('DocumentService wait deadline state', () => {
  test('returns a document that becomes ready at the deadline', async () => {
    const deps = dependencies();
    jest.mocked(deps.documents.findById).mockResolvedValue(document('ready'));
    await expect(
      deps.service.waitUntilReady(userId, 'document-1', 0),
    ).resolves.toMatchObject({ status: 'ready' });
  });
  test('reports a known failure instead of claiming the document is still processing', async () => {
    const deps = dependencies();
    jest.mocked(deps.documents.findById).mockResolvedValue({
      ...document('failed'),
      errorMessage: 'File rusak.',
    });
    await expect(
      deps.service.waitUntilReady(userId, 'document-1', 0),
    ).rejects.toThrow('File rusak.');
  });
  test('reports deletion at the deadline', async () => {
    const deps = dependencies();
    jest.mocked(deps.documents.findById).mockResolvedValue(null);
    await expect(
      deps.service.waitUntilReady(userId, 'document-1', 0),
    ).rejects.toThrow('Dokumen tidak ditemukan.');
  });
});
