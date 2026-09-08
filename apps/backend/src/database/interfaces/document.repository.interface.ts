import type { Prisma } from '../../generated/prisma/client';
import type {
  Document,
  DocumentCreate,
  DocumentChunk,
  FileAsset,
  FileKind,
} from '../entities';

export interface IDocumentRepository {
  createFile(
    userId: string,
    input: {
      originalName: string;
      mimeType: string;
      size: number;
      checksum: string;
      storageKey: string;
      kind: FileKind;
    },
  ): Promise<FileAsset>;
  create(userId: string, input: DocumentCreate): Promise<Document>;
  list(userId: string): Promise<Document[]>;
  findById(
    userId: string,
    id: string,
    chunks?: boolean,
  ): Promise<Document | null>;
  findByMessageId(userId: string, messageId: string): Promise<Document[]>;
  findByAssetIds(userId: string, assetIds: string[]): Promise<Document[]>;
  storageKey(userId: string, id: string): Promise<string | null>;
  complete(
    id: string,
    input: {
      textContent?: string | null;
      transcript?: string | null;
      imageDescription?: string | null;
      structuredData?: Prisma.InputJsonValue | null;
    },
  ): Promise<void>;
  fail(id: string, message: string): Promise<void>;
  restart(id: string): Promise<void>;
  replaceChunks(
    documentId: string,
    userId: string,
    chunks: Array<{
      chunkIndex: number;
      pageNumber?: number | null;
      content: string;
    }>,
  ): Promise<DocumentChunk[]>;
  searchKeyword(
    userId: string,
    query: string,
    limit: number,
    documentIds?: string[],
  ): Promise<Array<DocumentChunk & { documentId: string; title: string }>>;
  setChunkEmbedding(
    id: string,
    embedding: number[],
    model: string,
    version: string,
  ): Promise<void>;
  searchVector(
    userId: string,
    embedding: number[],
    limit: number,
    documentIds?: string[],
  ): Promise<Array<DocumentChunk & { documentId: string; title: string }>>;
  delete(userId: string, id: string): Promise<string | null>;
}

export const DOCUMENT_REPOSITORY = Symbol('IDocumentRepository');
