import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Memory as PrismaMemory,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type { Memory, MemoryWrite } from '../entities';
import type { IMemoryRepository, MemoryFilters } from '../interfaces';

const memorySelect = {
  id: true,
  content: true,
  category: true,
  status: true,
  pinned: true,
  sourceType: true,
  sourceMessageId: true,
  sourceDocumentId: true,
  supersedesId: true,
  supersededById: true,
  createdAt: true,
  updatedAt: true,
} as const;

type MemoryRow = Pick<PrismaMemory, keyof typeof memorySelect>;

function present(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    category: row.category,
    status: row.status as Memory['status'],
    pinned: row.pinned,
    supersedesId: row.supersedesId,
    supersededById: row.supersededById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    source: {
      type: row.sourceType as Memory['source']['type'],
      label: row.sourceMessageId
        ? 'Disimpan dari percakapan'
        : 'Disimpan di dasbor',
      messageId: row.sourceMessageId,
      documentId: row.sourceDocumentId,
    },
  };
}

function vectorLiteral(values: number[]): string {
  return `[${values.map((value) => (Number.isFinite(value) ? value : 0)).join(',')}]`;
}

@Injectable()
export class PrismaMemoryRepository implements IMemoryRepository {
  constructor(private readonly prisma: PrismaService) {}
  async list(userId: string, filters: MemoryFilters = {}): Promise<Memory[]> {
    const rows = await this.prisma.memory.findMany({
      where: {
        userId,
        status: filters.status ?? { in: ['active', 'archived'] },
        pinned: filters.pinned,
      },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      select: memorySelect,
    });

    return rows.map(present);
  }

  async findById(userId: string, id: string): Promise<Memory | null> {
    const row = await this.prisma.memory.findFirst({
      where: { id, userId },
      select: memorySelect,
    });

    return row ? present(row) : null;
  }

  async create(userId: string, input: MemoryWrite): Promise<Memory> {
    const row = await this.prisma.memory.create({
      data: {
        userId,
        content: input.content,
        category: input.category,
        status: input.status,
        pinned: input.pinned,
        sourceType: input.sourceType,
        sourceMessageId: input.sourceMessageId,
        sourceDocumentId: input.sourceDocumentId,
        confidence: input.confidence,
        extractorVersion: input.extractorVersion,
        supersedesId: input.supersedesId,
      },
      select: memorySelect,
    });

    return present(row);
  }

  async update(
    userId: string,
    id: string,
    input: Partial<MemoryWrite>,
  ): Promise<Memory | null> {
    if (
      !(await this.prisma.memory.findFirst({
        where: { id, userId },
        select: { id: true },
      }))
    )
      return null;
    const row = await this.prisma.memory.update({
      where: { id },
      data: input,
      select: memorySelect,
    });

    return present(row);
  }

  async supersede(
    userId: string,
    id: string,
    input: MemoryWrite,
  ): Promise<Memory | null> {
    if (
      !(await this.prisma.memory.findFirst({
        where: { id, userId, status: 'active' },
        select: { id: true },
      }))
    )
      return null;
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.memory.create({
        data: {
          userId,
          content: input.content,
          category: input.category,
          status: 'active',
          pinned: input.pinned,
          sourceType: input.sourceType,
          sourceMessageId: input.sourceMessageId,
          sourceDocumentId: input.sourceDocumentId,
          confidence: input.confidence,
          extractorVersion: input.extractorVersion,
          supersedesId: id,
        },
        select: memorySelect,
      });

      await tx.memory.update({
        where: { id },
        data: {
          status: 'superseded',
          supersededById: created.id,
        },
      });

      return created;
    });

    return present(row);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return (
      (await this.prisma.memory.deleteMany({ where: { id, userId } })).count ===
      1
    );
  }

  async searchKeyword(
    userId: string,
    query: string,
    limit: number,
  ): Promise<Memory[]> {
    const rows = await this.prisma.memory.findMany({
      where: {
        userId,
        status: 'active',
        content: { contains: query, mode: 'insensitive' },
      },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      select: memorySelect,
    });

    return rows.map(present);
  }

  async searchVector(
    userId: string,
    embedding: number[],
    limit: number,
  ): Promise<Memory[]> {
    const vector = vectorLiteral(embedding);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM memory WHERE "userId" = ${userId} AND status = 'active' AND embedding IS NOT NULL ORDER BY embedding <=> ${vector}::vector LIMIT ${limit}`,
    );

    const results = await Promise.all(
      rows.map((row) => this.findById(userId, row.id)),
    );

    return results.filter((memory): memory is Memory => memory !== null);
  }

  async setEmbedding(
    id: string,
    embedding: number[],
    model: string,
    version: string,
  ): Promise<void> {
    const vector = vectorLiteral(embedding);
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE memory SET embedding = ${vector}::vector, "embeddingModel" = ${model}, "embeddingVersion" = ${version}, "updatedAt" = NOW() WHERE id = ${id}`,
    );
  }
}
