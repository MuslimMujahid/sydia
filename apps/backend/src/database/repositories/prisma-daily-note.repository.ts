import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { DailyNote as PrismaDailyNote } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import { indexSignature, parseRichTextDocument } from '../../shared/rich-text';
import type {
  DailyNote,
  DailyNoteChunk,
  DailyNoteChunkMatch,
  DailyNoteSource,
  DailyNoteSummary,
  DailyNoteWrite,
} from '../entities';
import type { DailyNoteRange, IDailyNoteRepository } from '../interfaces';

const noteSelect = {
  id: true,
  date: true,
  content: true,
  text: true,
  sourceType: true,
  createdAt: true,
  updatedAt: true,
} as const;

const EXCERPT_LENGTH = 160;

type NoteRow = Pick<PrismaDailyNote, keyof typeof noteSelect>;

function excerptOf(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= EXCERPT_LENGTH) return collapsed;

  // Cut on a word boundary so the preview never ends mid-word.
  const clipped = collapsed.slice(0, EXCERPT_LENGTH);
  const lastSpace = clipped.lastIndexOf(' ');

  return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

function vectorLiteral(values: number[]): string {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('Embedding must contain only finite values.');
  }

  return `[${values.join(',')}]`;
}

function dateFilter(range?: DailyNoteRange): Prisma.StringFilter | undefined {
  if (!range?.from && !range?.to) return undefined;

  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {}),
  };
}

/**
 * The `content` column holds the whole Tiptap document, not just its node list,
 * so it is read back through the same parser the write path used. A row that
 * somehow fails to parse is surfaced as an empty document rather than thrown,
 * because a note that cannot be parsed must still be openable and fixable.
 */
function present(row: NoteRow): DailyNote {
  return {
    id: row.id,
    date: row.date,
    content: parseRichTextDocument(row.content) ?? { type: 'doc', content: [] },
    text: row.text,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    source: { type: row.sourceType as DailyNoteSource, label: null },
  };
}

/** The date bound is applied in SQL so the owner filter and window both apply. */
function dateClause(range?: DailyNoteRange): Prisma.Sql {
  const parts: Prisma.Sql[] = [];

  if (range?.from) parts.push(Prisma.sql`AND "date" >= ${range.from}`);
  if (range?.to) parts.push(Prisma.sql`AND "date" <= ${range.to}`);

  return parts.length === 0 ? Prisma.empty : Prisma.join(parts, ' ');
}

@Injectable()
export class PrismaDailyNoteRepository implements IDailyNoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    range?: DailyNoteRange,
  ): Promise<DailyNoteSummary[]> {
    const date = dateFilter(range);
    const rows = await this.prisma.dailyNote.findMany({
      where: { userId, ...(date ? { date } : {}) },
      orderBy: { date: 'desc' },
      select: { date: true, text: true, updatedAt: true },
    });

    return rows.map((row) => ({
      date: row.date,
      excerpt: excerptOf(row.text),
      updatedAt: row.updatedAt,
    }));
  }

  async findByDate(userId: string, date: string): Promise<DailyNote | null> {
    const row = await this.prisma.dailyNote.findUnique({
      where: { userId_date: { userId, date } },
      select: noteSelect,
    });

    return row ? present(row) : null;
  }

  async upsert(userId: string, input: DailyNoteWrite): Promise<DailyNote> {
    const row = await this.prisma.dailyNote.upsert({
      where: { userId_date: { userId, date: input.date } },
      create: {
        userId,
        date: input.date,
        timezone: input.timezone,
        content: input.content,
        text: input.text,
        sourceType: input.sourceType,
        sourceMessageId: input.sourceMessageId,
      },
      update: {
        timezone: input.timezone,
        content: input.content,
        text: input.text,
        sourceType: input.sourceType,
        sourceMessageId: input.sourceMessageId,
      },
      select: noteSelect,
    });

    return present(row);
  }

  async delete(userId: string, date: string): Promise<boolean> {
    const deleted = await this.prisma.dailyNote.deleteMany({
      where: { userId, date },
    });

    return deleted.count > 0;
  }

  async replaceChunks(
    userId: string,
    date: string,
    input: { signature: string; chunks: string[] },
  ): Promise<DailyNoteChunk[]> {
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.dailyNote.findUnique({
        where: { userId_date: { userId, date } },
        select: { id: true, text: true },
      });

      if (!note) return [];

      await tx.dailyNoteChunk.deleteMany({ where: { dailyNoteId: note.id } });

      if (input.chunks.length > 0)
        await tx.dailyNoteChunk.createMany({
          data: input.chunks.map((content, chunkIndex) => ({
            dailyNoteId: note.id,
            userId,
            date,
            chunkIndex,
            content,
          })),
        });

      // The note's text is read in this transaction, so a concurrent save either
      // lands before this read (and is indexed here) or after it (and leaves the
      // flag set for the recovery sweep). Either way the flag never claims a
      // stale index is current.
      const stillCurrent = indexSignature(note.text) === input.signature;

      await tx.dailyNote.update({
        where: { id: note.id },
        data: {
          indexSignature: input.signature,
          indexPending: !stillCurrent,
        },
      });

      return tx.dailyNoteChunk.findMany({
        where: { dailyNoteId: note.id },
        orderBy: { chunkIndex: 'asc' },
        select: { id: true, chunkIndex: true, content: true },
      });
    });
  }

  async markIndexPending(userId: string, date: string): Promise<void> {
    await this.prisma.dailyNote.updateMany({
      where: { userId, date },
      data: { indexPending: true },
    });
  }

  async indexState(userId: string, date: string) {
    const note = await this.prisma.dailyNote.findUnique({
      where: { userId_date: { userId, date } },
      select: { id: true, indexPending: true, indexSignature: true },
    });

    if (!note) return null;

    const [chunkCount, embeddedCount] = await Promise.all([
      this.prisma.dailyNoteChunk.count({ where: { dailyNoteId: note.id } }),
      this.prisma.$queryRaw<Array<{ count: number }>>(
        Prisma.sql`SELECT COUNT(*)::int AS "count" FROM daily_note_chunk WHERE "dailyNoteId" = ${note.id} AND "embedding" IS NOT NULL`,
      ),
    ]);

    return {
      pending: note.indexPending,
      signature: note.indexSignature,
      chunkCount,
      embeddedCount: Number(embeddedCount[0]?.count ?? 0),
    };
  }

  async setChunkEmbedding(
    id: string,
    embedding: number[],
    model: string,
    version: string,
  ): Promise<void> {
    const vector = vectorLiteral(embedding);

    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE daily_note_chunk SET "embedding" = ${vector}::vector, "embeddingModel" = ${model}, "embeddingVersion" = ${version} WHERE "id" = ${id}`,
    );
  }

  async searchKeyword(
    userId: string,
    query: string,
    limit: number,
    range?: DailyNoteRange,
  ): Promise<DailyNoteChunkMatch[]> {
    const date = dateFilter(range);

    return this.prisma.dailyNoteChunk.findMany({
      where: {
        userId,
        content: { contains: query, mode: 'insensitive' },
        ...(date ? { date } : {}),
      },
      orderBy: [{ date: 'desc' }, { chunkIndex: 'asc' }],
      take: limit,
      select: { date: true, chunkIndex: true, content: true },
    });
  }

  async searchVector(
    userId: string,
    embedding: number[],
    limit: number,
    range: DailyNoteRange | undefined,
  ): Promise<DailyNoteChunkMatch[]> {
    const vector = vectorLiteral(embedding);

    // No distance ceiling: the ranking itself is the filter. A fixed cutoff
    // silently drops a note whose wording merely differs from the question, and
    // the consumer is a model that can judge a weak passage for itself.
    return this.prisma.$queryRaw<DailyNoteChunkMatch[]>(
      Prisma.sql`SELECT "date", "chunkIndex", "content" FROM daily_note_chunk WHERE "userId" = ${userId} AND "embedding" IS NOT NULL ${dateClause(range)} ORDER BY "embedding" <=> ${vector}::vector LIMIT ${limit}`,
    );
  }

  async listPendingIndex(
    limit: number,
  ): Promise<Array<{ userId: string; date: string }>> {
    const rows = await this.prisma.dailyNote.findMany({
      where: { indexPending: true, text: { not: '' } },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: { userId: true, date: true },
    });

    return rows;
  }
}
