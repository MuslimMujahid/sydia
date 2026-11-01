import { Injectable, Logger } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type { IRecordNotesRepository } from '../interfaces';
import type {
  RecordRow,
  RecordTable,
  RecordSnapshot,
  RecordColumn,
  RecordStats,
} from '../entities';

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class PrismaRecordNotesRepository implements IRecordNotesRepository {
  private readonly logger = new Logger(PrismaRecordNotesRepository.name);
  constructor(private readonly prisma: PrismaService) {}
  async locked<T>(userId: string, work: () => Promise<T>): Promise<T> {
    try {
      return await this.prisma.inTransaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`notes:${userId}`},0))::text`,
        );

        return work();
      });
    } catch (error) {
      this.logger.warn(
        'Record transaction rejected; no partial changes committed.',
        { errorName: error instanceof Error ? error.name : 'UnknownError' },
      );
      throw error;
    }
  }

  editorWrite<T>(
    userId: string,
    noteId: string,
    sessionId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    return this.prisma.inTransaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`note-presence:${userId}`},0))::text`,
      );
      const lease = await tx.$queryRaw<Array<{ ref: string }>>(
        Prisma.sql`SELECT ref FROM note_editor_presence WHERE "userId"=${userId} AND ref=${`custom:${noteId}`} AND "sessionId"=${sessionId} AND "expiresAt">clock_timestamp()`,
      );

      if (!lease.length) throw new Error('RECORD_LEASE_EXPIRED');

      return this.locked(userId, work);
    });
  }

  async get(
    userId: string,
    noteId: string,
  ): Promise<Omit<RecordSnapshot, 'rows'>> {
    const item = await this.prisma.client.workspaceItem.findFirst({
      where: {
        id: noteId,
        userId,
        kind: 'note',
        format: 'record',
        trashedAt: null,
      },
      include: { recordTable: true },
    });

    if (!item?.recordTable) throw new Error('RECORD_NOT_FOUND');
    const t = item.recordTable;
    if (!Array.isArray(t.columns) || !t.stats || typeof t.stats !== 'object')
      throw new Error('Corrupt record schema or statistics.');
    const parts = [item.title];
    const seen = new Set([item.id]);
    let parent = item.parentId;

    while (parent) {
      if (seen.has(parent)) throw new Error('Corrupt workspace hierarchy.');
      seen.add(parent);
      const folder = await this.prisma.client.workspaceItem.findFirst({
        where: { id: parent, userId, kind: 'folder', trashedAt: null },
        select: { title: true, parentId: true },
      });

      if (!folder) throw new Error('RECORD_NOT_FOUND');
      parts.unshift(folder.title);
      parent = folder.parentId;
    }

    return {
      table: {
        ...t,
        columns: t.columns as unknown as RecordColumn[],
        stats: t.stats as unknown as RecordStats,
      },
      revision: item.revision,
      title: item.title,
      parentId: item.parentId,
      updatedAt: item.updatedAt,
      path: parts.join(' / '),
    };
  }

  async page(
    userId: string,
    noteId: string,
    offset: number,
    limit: number,
  ): Promise<RecordRow[]> {
    await this.get(userId, noteId);
    const rows = await this.prisma.client.recordRow.findMany({
      where: { noteId },
      orderBy: { position: 'asc' },
      skip: offset,
      take: limit,
    });

    return rows.map((r) => ({
      ...r,
      cells: r.cells as unknown as RecordRow['cells'],
      sources: r.sources as RecordRow['sources'],
    }));
  }

  async snapshots(
    userId: string,
    ids: string[],
    maxRows: number,
  ): Promise<RecordSnapshot[]> {
    const results: RecordSnapshot[] = [];
    let count = 0;

    for (const id of ids) {
      const meta = await this.get(userId, id);
      count += meta.table.stats.rowCount;
      if (count > maxRows) throw new Error('RECORD_EXECUTION_LIMIT');
      const rows = await this.page(userId, id, 0, maxRows + 1);
      if (rows.length !== meta.table.stats.rowCount)
        throw new Error('Record statistics do not match saved rows.');
      results.push({ ...meta, rows });
    }

    return results;
  }

  async insert(table: RecordTable) {
    await this.prisma.client.recordTable.create({
      data: {
        ...table,
        columns: json(table.columns),
        stats: json(table.stats),
      },
    });
  }

  async save(
    userId: string,
    snapshot: RecordSnapshot,
    before: RecordRow[],
    sourceType: string,
  ) {
    const t = snapshot.table;
    const beforeById = new Map(before.map((row) => [row.id, row]));
    const afterIds = new Set(snapshot.rows.map((r) => r.id));
    const removed = before.filter((r) => !afterIds.has(r.id)).map((r) => r.id);
    if (removed.length)
      await this.prisma.client.recordRow.deleteMany({
        where: { noteId: t.noteId, id: { in: removed } },
      });
    const moved = snapshot.rows.filter(
      (r) =>
        beforeById.has(r.id) && beforeById.get(r.id)!.position !== r.position,
    );

    for (const row of moved)
      await this.prisma.client.recordRow.update({
        where: { id: row.id, noteId: t.noteId },
        data: { position: -row.position },
      });

    for (const row of snapshot.rows) {
      const old = beforeById.get(row.id);
      if (isDeepStrictEqual(old, row)) continue;
      const data = {
        position: row.position,
        cells: json(row.cells),
        sources: json(row.sources),
      };

      if (old)
        await this.prisma.client.recordRow.update({
          where: { id: row.id, noteId: t.noteId },
          data,
        });
      else
        await this.prisma.client.recordRow.create({
          data: { ...data, id: row.id, noteId: t.noteId },
        });
    }

    await this.prisma.client.recordTable.update({
      where: { noteId: t.noteId },
      data: {
        description: t.description,
        columns: json(t.columns),
        stats: json(t.stats),
        nextPosition: t.nextPosition,
      },
    });
    await this.prisma.client.workspaceItem.update({
      where: { id: t.noteId, userId },
      data: {
        revision: snapshot.revision,
        text: [t.description, ...t.columns.map((c) => c.name)].join('\n'),
        sourceType,
        updatedAt: snapshot.updatedAt,
        indexPending: true,
      },
    });
  }

  async receipt(userId: string, key: string) {
    return this.prisma.client.recordReceipt.findUnique({
      where: { userId_key: { userId, key } },
      select: { fingerprint: true, result: true },
    });
  }

  async remember(
    userId: string,
    key: string,
    fingerprint: string,
    result: unknown,
  ) {
    await this.prisma.client.recordReceipt.create({
      data: { userId, key, fingerprint, result: json(result) },
    });
  }
}
