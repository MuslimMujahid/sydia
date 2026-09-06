import { describe, expect, jest, test } from '@jest/globals';
import type { Document, FileAsset } from '../../database/entities';
import type { IDocumentRepository } from '../../database/interfaces';
import type { EmbeddingsService } from '../../infra/embeddings';
import type { OpenRouterMediaService } from '../../infra/model-gateway';
import type { StorageService } from '../../infra/storage';
import { DocumentService } from './document.service';

const userId = 'user-1';
const file = {
  originalname: 'notes.txt',
  mimetype: 'text/plain',
  size: 11,
  buffer: Buffer.from('hello world'),
};

function asset(): FileAsset {
  return {
    id: 'asset-1',
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    kind: 'document',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function document(): Document {
  return {
    id: 'document-1',
    title: file.originalname,
    textContent: file.buffer.toString('utf8'),
    transcript: null,
    imageDescription: null,
    structuredData: null,
    errorMessage: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    status: 'ready',
    file: asset(),
  };
}

function dependencies() {
  const storage = {
    put: jest.fn<(key: string, value: Buffer, contentType: string) => Promise<void>>().mockResolvedValue(undefined),
    delete: jest.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as StorageService;
  const documents = {
    createFile: jest.fn<(id: string, input: { originalName: string; mimeType: string; size: number; checksum: string; storageKey: string; kind: 'document' | 'image' | 'audio' }) => Promise<FileAsset>>().mockResolvedValue(asset()),
    create: jest.fn<(id: string, input: { fileAssetId: string; title: string }) => Promise<Document>>().mockResolvedValue(document()),
    replaceChunks: jest.fn<(documentId: string, id: string, chunks: Array<{ chunkIndex: number; pageNumber?: number | null; content: string }>) => Promise<never[]>>().mockResolvedValue([]),
    complete: jest.fn<(id: string, input: { textContent?: string | null; transcript?: string | null; imageDescription?: string | null; structuredData?: unknown }) => Promise<void>>().mockResolvedValue(undefined),
    findById: jest.fn<(id: string, documentId: string, chunks?: boolean) => Promise<Document | null>>().mockResolvedValue(document()),
  } as unknown as IDocumentRepository;
  const embeddings = {
    embed: jest.fn<(text: string) => Promise<number[] | null>>().mockResolvedValue(null),
    modelName: jest.fn<() => string>().mockReturnValue('test-model'),
    version: 'test-version',
  } as unknown as EmbeddingsService;
  const media = {} as OpenRouterMediaService;
  return { service: new DocumentService(documents, storage, embeddings, media), storage, documents };
}

describe('DocumentService ingest', () => {
  test('deletes the blob and propagates a createFile failure', async () => {
    const { service, storage, documents } = dependencies();
    const error = new Error('database unavailable');
    documents.createFile = jest.fn<(id: string, input: { originalName: string; mimeType: string; size: number; checksum: string; storageKey: string; kind: 'document' | 'image' | 'audio' }) => Promise<FileAsset>>().mockRejectedValue(error);

    await expect(service.ingest(userId, file)).rejects.toBe(error);
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith(expect.stringMatching(/^user-1\//));
    expect(documents.create).not.toHaveBeenCalled();
  });

  test('returns the completed document for plain text', async () => {
    const { service, documents } = dependencies();

    await expect(service.ingest(userId, file)).resolves.toEqual(document());
    expect(documents.replaceChunks).toHaveBeenCalledWith(
      'document-1',
      userId,
      [{ chunkIndex: 0, content: 'hello world' }],
    );
    expect(documents.complete).toHaveBeenCalledWith(
      'document-1',
      expect.objectContaining({ textContent: 'hello world' }),
    );
  });
});
