import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Document as PrismaDocument,
  type DocumentChunk as PrismaDocumentChunk,
  type FileAsset as PrismaFileAsset,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type {
  Document,
  DocumentChunk,
  DocumentCreate,
  FileAsset,
  FileKind,
} from '../entities';
import type { IDocumentRepository } from '../interfaces';

const fileSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  size: true,
  kind: true,
  createdAt: true,
} as const;

const chunkSelect = {
  id: true,
  chunkIndex: true,
  pageNumber: true,
  content: true,
} as const;

const documentSelect = {
  id: true,
  title: true,
  status: true,
  textContent: true,
  transcript: true,
  imageDescription: true,
  structuredData: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
  fileAsset: { select: fileSelect },
} as const;

type DocumentRow = Pick<
  PrismaDocument,
  | 'id'
  | 'title'
  | 'status'
  | 'textContent'
  | 'transcript'
  | 'imageDescription'
  | 'structuredData'
  | 'errorMessage'
  | 'createdAt'
  | 'updatedAt'
> & {
  fileAsset: Pick<PrismaFileAsset, keyof typeof fileSelect>;
  chunks?: Pick<PrismaDocumentChunk, keyof typeof chunkSelect>[];
};

function presentFile(
  row: Pick<PrismaFileAsset, keyof typeof fileSelect>,
): FileAsset {
  return { ...row, kind: row.kind as FileKind };
}

function present(row: DocumentRow): Document {
  return {
    id: row.id,
    title: row.title,
    status: row.status as Document['status'],
    textContent: row.textContent,
    transcript: row.transcript,
    imageDescription: row.imageDescription,
    structuredData: row.structuredData,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    file: presentFile(row.fileAsset),
    ...(row.chunks ? { chunks: row.chunks } : {}),
  };
}

function vectorLiteral(values: number[]): string {
  return `[${values.map((value) => (Number.isFinite(value) ? value : 0)).join(',')}]`;
}

@Injectable()
export class PrismaDocumentRepository implements IDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createFile(
    userId: string,
    input: {
      originalName: string;
      mimeType: string;
      size: number;
      checksum: string;
      storageKey: string;
      kind: FileKind;
    },
  ): Promise<FileAsset> {
    return presentFile(
      await this.prisma.fileAsset.create({
        data: { userId, ...input },
        select: fileSelect,
      }),
    );
  }

  async create(userId: string, input: DocumentCreate): Promise<Document> {
    return present(
      await this.prisma.document.create({
        data: { userId, ...input },
        select: documentSelect,
      }),
    );
  }

  async list(userId: string): Promise<Document[]> {
    return (
      await this.prisma.document.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: documentSelect,
      })
    ).map(present);
  }

  async findById(
    userId: string,
    id: string,
    chunks = false,
  ): Promise<Document | null> {
    const row = await this.prisma.document.findFirst({
      where: { id, userId },
      select: {
        ...documentSelect,
        ...(chunks
          ? {
              chunks: {
                select: chunkSelect,
                orderBy: { chunkIndex: 'asc' as const },
              },
            }
          : {}),
      },
    });

    return row ? present(row) : null;
  }

  async findByMessageId(
    userId: string,
    messageId: string,
  ): Promise<Document[]> {
    return (
      await this.prisma.document.findMany({
        where: { userId, fileAsset: { messages: { some: { messageId } } } },
        select: {
          ...documentSelect,
          chunks: { select: chunkSelect, orderBy: { chunkIndex: 'asc' } },
        },
      })
    ).map(present);
  }

  async findByAssetIds(
    userId: string,
    assetIds: string[],
  ): Promise<Document[]> {
    return (
      await this.prisma.document.findMany({
        where: { userId, fileAssetId: { in: assetIds } },
        select: {
          ...documentSelect,
          chunks: { select: chunkSelect, orderBy: { chunkIndex: 'asc' } },
        },
      })
    ).map(present);
  }

  async storageKey(userId: string, id: string): Promise<string | null> {
    return (
      (
        await this.prisma.document.findFirst({
          where: { id, userId },
          select: { fileAsset: { select: { storageKey: true } } },
        })
      )?.fileAsset.storageKey ?? null
    );
  }

  async complete(
    id: string,
    input: {
      textContent?: string | null;
      transcript?: string | null;
      imageDescription?: string | null;
      structuredData?: Prisma.InputJsonValue | null;
    },
  ): Promise<void> {
    await this.prisma.document.update({
      where: { id },
      data: {
        status: 'ready',
        errorMessage: null,
        textContent: input.textContent,
        transcript: input.transcript,
        imageDescription: input.imageDescription,
        ...(input.structuredData === null
          ? { structuredData: Prisma.JsonNull }
          : input.structuredData === undefined
            ? {}
            : { structuredData: input.structuredData }),
      },
    });
  }

  async fail(id: string, message: string): Promise<void> {
    await this.prisma.document.update({
      where: { id },
      data: { status: 'failed', errorMessage: message },
    });
  }

  async replaceChunks(
    documentId: string,
    userId: string,
    chunks: Array<{
      chunkIndex: number;
      pageNumber?: number | null;
      content: string;
    }>,
  ): Promise<DocumentChunk[]> {
    await this.prisma.$transaction([
      this.prisma.documentChunk.deleteMany({ where: { documentId } }),
      this.prisma.documentChunk.createMany({
        data: chunks.map((chunk) => ({ documentId, userId, ...chunk })),
      }),
    ]);

    return this.prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: 'asc' },
      select: chunkSelect,
    });
  }

  async searchKeyword(
    userId: string,
    query: string,
    limit: number,
    documentIds?: string[],
  ): Promise<Array<DocumentChunk & { documentId: string; title: string }>> {
    const rows = await this.prisma.documentChunk.findMany({
      where: {
        userId,
        ...(documentIds?.length ? { documentId: { in: documentIds } } : {}),
        content: { contains: query, mode: 'insensitive' },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        ...chunkSelect,
        documentId: true,
        document: { select: { title: true } },
      },
    });

    return rows.map(({ document, ...row }) => ({
      ...row,
      title: document.title,
    }));
  }

  async setChunkEmbedding(
    id: string,
    embedding: number[],
    model: string,
    version: string,
  ): Promise<void> {
    const vector = vectorLiteral(embedding);
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE document_chunk SET embedding = ${vector}::vector, "embeddingModel" = ${model}, "embeddingVersion" = ${version} WHERE id = ${id}`,
    );
  }

  async searchVector(
    userId: string,
    embedding: number[],
    limit: number,
    documentIds?: string[],
  ): Promise<Array<DocumentChunk & { documentId: string; title: string }>> {
    const vector = vectorLiteral(embedding);
    const ids = documentIds?.length
      ? Prisma.sql`AND dc."documentId" IN (${Prisma.join(documentIds)})`
      : Prisma.empty;

    return this.prisma.$queryRaw<
      Array<DocumentChunk & { documentId: string; title: string }>
    >(
      Prisma.sql`SELECT dc.id, dc."documentId", dc."chunkIndex", dc."pageNumber", dc.content, d.title FROM document_chunk dc JOIN document d ON d.id = dc."documentId" WHERE dc."userId" = ${userId} AND dc.embedding IS NOT NULL ${ids} ORDER BY dc.embedding <=> ${vector}::vector LIMIT ${limit}`,
    );
  }

  async delete(userId: string, id: string): Promise<string | null> {
    const row = await this.prisma.document.findFirst({
      where: { id, userId },
      select: { fileAsset: { select: { storageKey: true } } },
    });

    if (!row) return null;
    await this.prisma.fileAsset.delete({
      where: { storageKey: row.fileAsset.storageKey },
    });

    return row.fileAsset.storageKey;
  }
}
