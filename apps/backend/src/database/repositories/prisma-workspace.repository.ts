import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { WorkspaceItem as Row } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import { parseRichTextDocument } from '../../shared/rich-text';
import { indexSignature } from '../../shared/rich-text';
import type { WorkspaceCommit, WorkspaceItem } from '../entities';
import type { IWorkspaceRepository } from '../interfaces';

function present(row: Row): WorkspaceItem {
  const content = parseRichTextDocument(row.content);
  if (!content || (row.kind !== 'note' && row.kind !== 'folder'))
    throw new Error(
      `Corrupt workspace item ${row.id}; content was not replaced.`,
    );

  return { ...row, kind: row.kind, content };
}

@Injectable()
export class PrismaWorkspaceRepository implements IWorkspaceRepository {
  private readonly logger = new Logger(PrismaWorkspaceRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.workspaceItem.findMany({
      where: { userId },
    });

    return rows.map(present);
  }

  async dailyDocuments(userId: string) {
    const rows = await this.prisma.dailyNote.findMany({
      where: { userId },
      select: {
        id: true,
        date: true,
        content: true,
        text: true,
        updatedAt: true,
      },
    });

    return rows.map((row) => {
      const content = parseRichTextDocument(row.content);
      if (!content) throw new Error(`Corrupt daily note ${row.id}.`);

      return { ...row, content };
    });
  }

  pendingIndex(limit: number) {
    return this.prisma.workspaceItem.findMany({
      where: { kind: 'note', trashedAt: null, indexPending: true },
      take: limit,
      orderBy: { updatedAt: 'asc' },
      select: { id: true, userId: true },
    });
  }

  private vector(values: number[]): string {
    if (
      values.length !== 1536 ||
      values.some((value) => !Number.isFinite(value))
    )
      throw new Error(
        'Notes retrieval requires a finite 1536-dimensional embedding.',
      );

    return `[${values.join(',')}]`;
  }

  async replaceIndex(
    userId: string,
    id: string,
    input: {
      signature: string;
      model: string;
      version: string;
      chunks: string[];
      embeddings: number[][];
    },
  ): Promise<boolean> {
    if (input.chunks.length !== input.embeddings.length)
      throw new Error('Every note chunk must have an embedding.');
    const vectors = input.embeddings.map((embedding) => this.vector(embedding));

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`notes:${userId}`}, 0))::text`,
      );
      const item = await tx.workspaceItem.findFirst({
        where: { id, userId, kind: 'note', trashedAt: null },
      });

      if (!item) return false;
      if (
        indexSignature(
          `${input.model}\n${input.version}\n${item.title}\n${item.text}`,
        ) !== input.signature
      )
        return false;
      await tx.workspaceNoteChunk.deleteMany({
        where: { userId, workspaceItemId: id },
      });

      for (
        let chunkIndex = 0;
        chunkIndex < input.chunks.length;
        chunkIndex += 1
      ) {
        const row = await tx.workspaceNoteChunk.create({
          data: {
            userId,
            workspaceItemId: id,
            chunkIndex,
            content: input.chunks[chunkIndex]!,
            signature: input.signature,
            embeddingModel: input.model,
            embeddingVersion: input.version,
          },
          select: { id: true },
        });

        await tx.$executeRaw(
          Prisma.sql`UPDATE workspace_note_chunk SET embedding = ${vectors[chunkIndex]}::vector WHERE id = ${row.id} AND "userId" = ${userId}`,
        );
      }

      await tx.workspaceItem.update({
        where: { id, userId },
        data: {
          indexPending: false,
          indexSignature: input.signature,
          updatedAt: item.updatedAt,
        },
      });

      return true;
    });
  }

  searchVector(
    userId: string,
    embedding: number[],
    model: string,
    version: string,
    limit: number,
  ) {
    const vector = this.vector(embedding);

    return this.prisma.$queryRaw<
      Array<{ id: string; passage: string }>
    >(Prisma.sql`
      SELECT item.id, chunk.content AS passage FROM workspace_note_chunk chunk
      JOIN workspace_item item ON item.id = chunk."workspaceItemId" AND item."userId" = chunk."userId"
      WHERE item."userId" = ${userId} AND item."trashedAt" IS NULL AND item."indexPending" = false
        AND chunk.signature = item."indexSignature" AND chunk.embedding IS NOT NULL
        AND chunk."embeddingModel" = ${model} AND chunk."embeddingVersion" = ${version}
      ORDER BY chunk.embedding <=> ${vector}::vector LIMIT ${limit}
    `);
  }

  async transact<T>(
    userId: string,
    change: (items: WorkspaceItem[]) => WorkspaceCommit<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // The lock is held by PostgreSQL until commit/rollback. All custom-note
        // mutations use it, including folder validation and subtree operations.
        await tx.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`notes:${userId}`}, 0))::text`,
        );
        const rows = await tx.workspaceItem.findMany({ where: { userId } });
        const before = new Set(rows.map((row) => row.id));
        const commit = change(rows.map(present));

        for (const item of commit.writes) {
          if (item.userId !== userId)
            throw new Error('Workspace commit attempted a cross-owner write.');
          const data = {
            kind: item.kind,
            title: item.title,
            parentId: item.parentId,
            content: item.content,
            text: item.text,
            revision: item.revision,
            indexPending: item.indexPending,
            indexSignature: item.indexSignature,
            trashedAt: item.trashedAt,
            trashBatchId: item.trashBatchId,
            sourceType: item.sourceType,
            updatedAt: item.updatedAt,
          };

          if (before.has(item.id)) {
            await tx.workspaceItem.update({
              where: { id: item.id, userId },
              data,
            });
          } else {
            await tx.workspaceItem.create({
              data: { ...data, id: item.id, userId, createdAt: item.createdAt },
            });
          }
        }

        // Rules emit descendants before their parent to satisfy restrictive FKs.
        for (const id of commit.deletes)
          await tx.workspaceItem.delete({ where: { id, userId } });

        return commit.result;
      });
    } catch (error) {
      this.logger.warn(
        'Workspace transaction rejected; changes rolled back.',
        error,
      );
      throw error;
    }
  }
}
