import { describe, expect, jest, test } from '@jest/globals';
import type { Document, DocumentStatus, FileAsset } from '../../database/entities';
import type { IDocumentRepository } from '../../database/interfaces';
import type { EmbeddingsService } from '../../infra/embeddings';
import type { OpenRouterMediaService } from '../../infra/model-gateway';
import type { QueueService } from '../../infra/queue';
import type { StorageService } from '../../infra/storage';
import { DocumentService } from './document.service';

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
    put: jest.fn<(key: string, value: Buffer, contentType: string) => Promise<void>>().mockResolvedValue(undefined),
    get: jest.fn<(key: string) => Promise<Buffer>>().mockResolvedValue(file.buffer),
    delete: jest.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as StorageService;
  const documents = {
    createFile: jest.fn<(id: string, input: { originalName: string; mimeType: string; size: number; checksum: string; storageKey: string; kind: 'document' | 'image' | 'audio' }) => Promise<FileAsset>>().mockResolvedValue(asset()),
    create: jest.fn<(id: string, input: { fileAssetId: string; title: string }) => Promise<Document>>().mockResolvedValue(document()),
    replaceChunks: jest.fn<(documentId: string, id: string, chunks: Array<{ chunkIndex: number; pageNumber?: number | null; content: string }>) => Promise<never[]>>().mockResolvedValue([]),
    complete: jest.fn<(id: string, input: { textContent?: string | null; transcript?: string | null; imageDescription?: string | null; structuredData?: unknown }) => Promise<void>>().mockResolvedValue(undefined),
    fail: jest.fn<(id: string, message: string) => Promise<void>>().mockResolvedValue(undefined),
    findById: jest.fn<(id: string, documentId: string, chunks?: boolean) => Promise<Document | null>>().mockResolvedValue(document()),
    storageKey: jest.fn<(id: string, documentId: string) => Promise<string | null>>().mockResolvedValue('user-1/blob'),
    delete: jest.fn<(id: string, documentId: string) => Promise<string | null>>().mockResolvedValue('user-1/blob'),
  } as unknown as IDocumentRepository;
  const embeddings = {
    embed: jest.fn<(text: string) => Promise<number[] | null>>().mockResolvedValue(null),
    modelName: jest.fn<() => string>().mockReturnValue('test-model'),
    version: 'test-version',
  } as unknown as EmbeddingsService;
  const media = {} as OpenRouterMediaService;
  const queue = {
    documents: {
      add: jest.fn<(name: string, data: { documentId: string; userId: string }, opts?: { jobId?: string }) => Promise<unknown>>().mockResolvedValue(undefined),
    },
  };
  return { service: new DocumentService(documents, storage, embeddings, media, queue as unknown as QueueService), storage, documents, queue };
}

describe('DocumentService ingest', () => {
  test('deletes the blob and propagates a createFile failure', async () => {
    const { service, storage, documents, queue } = dependencies();
    const error = new Error('database unavailable');
    documents.createFile = jest.fn<(id: string, input: { originalName: string; mimeType: string; size: number; checksum: string; storageKey: string; kind: 'document' | 'image' | 'audio' }) => Promise<FileAsset>>().mockRejectedValue(error);

    await expect(service.ingest(userId, file)).rejects.toBe(error);
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith(expect.stringMatching(/^user-1\//));
    expect(documents.create).not.toHaveBeenCalled();
    expect(queue.documents.add).not.toHaveBeenCalled();
  });

  test('enqueues and returns the processing document without ingesting inline', async () => {
    const { service, documents, queue } = dependencies();

    await expect(service.ingest(userId, file)).resolves.toEqual(document());
    expect(queue.documents.add).toHaveBeenCalledWith('ingest', { documentId: 'document-1', userId }, { jobId: 'document-1' });
    expect(documents.replaceChunks).not.toHaveBeenCalled();
    expect(documents.complete).not.toHaveBeenCalled();
  });

  test('cleans up the blob and document and propagates an enqueue failure', async () => {
    const { service, storage, documents, queue } = dependencies();
    const error = new Error('redis unavailable');
    queue.documents.add = jest.fn<(name: string, data: { documentId: string; userId: string }, opts?: { jobId?: string }) => Promise<unknown>>().mockRejectedValue(error);

    await expect(service.ingest(userId, file)).rejects.toBe(error);
    expect(storage.delete).toHaveBeenCalledWith(expect.stringMatching(/^user-1\//));
    expect(documents.delete).toHaveBeenCalledWith(userId, 'document-1');
  });
});

describe('DocumentService processDocument', () => {
  test('parses, chunks, and completes a processing document', async () => {
    const { service, storage, documents } = dependencies();

    await service.processDocument('document-1', userId);
    expect(storage.get).toHaveBeenCalledWith('user-1/blob');
    expect(documents.replaceChunks).toHaveBeenCalledWith('document-1', userId, [{ chunkIndex: 0, content: 'hello world' }]);
    expect(documents.complete).toHaveBeenCalledWith('document-1', expect.objectContaining({ textContent: 'hello world' }));
    expect(documents.fail).not.toHaveBeenCalled();
  });

  test('marks the document failed when the format is unsupported', async () => {
    const { service, documents } = dependencies();
    documents.findById = jest.fn<(id: string, documentId: string, chunks?: boolean) => Promise<Document | null>>().mockResolvedValue({ ...document(), file: { ...asset(), mimeType: 'application/octet-stream' } });

    await service.processDocument('document-1', userId);
    expect(documents.fail).toHaveBeenCalledWith('document-1', expect.stringContaining('Format dokumen belum didukung'));
    expect(documents.complete).not.toHaveBeenCalled();
  });

  test('is a no-op when the document is already ready', async () => {
    const { service, storage, documents } = dependencies();
    documents.findById = jest.fn<(id: string, documentId: string, chunks?: boolean) => Promise<Document | null>>().mockResolvedValue(document('ready'));

    await service.processDocument('document-1', userId);
    expect(storage.get).not.toHaveBeenCalled();
    expect(documents.complete).not.toHaveBeenCalled();
  });
});
