import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  createHash,
  randomUUID,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import {
  RECORD_NOTES_REPOSITORY,
  WORKSPACE_REPOSITORY,
  type IRecordNotesRepository,
  type IWorkspaceRepository,
} from '../../database/interfaces';
import { applyWorkspaceCommand } from '../notes';
import {
  applyRecordChange,
  columnSchema,
  columnsSchema,
  interpretCell,
  createRecordSchema,
  mutationSchema,
  pageSchema,
  parseRecord,
  recordFailure,
  recordStats,
  serializeRecordCsv,
} from './record-contract';
import {
  executeRecordQuery,
  querySchema,
  assertRecordQueryBounds,
} from './record-query';

const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

@Injectable()
export class RecordNotesService {
  private readonly secret: string;
  private readonly publicUrl: string;
  constructor(
    @Inject(RECORD_NOTES_REPOSITORY)
    private readonly repository: IRecordNotesRepository,
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspace: IWorkspaceRepository,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('BACKEND_AUTH_SECRET');
    this.publicUrl = config
      .getOrThrow<string>('BACKEND_AUTH_URL')
      .replace(/\/$/, '');
  }

  private async boundary<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      Logger.warn(
        'Record operation failed; saved data was not replaced.',
        { errorName: error instanceof Error ? error.name : 'UnknownError' },
        'RecordNotes',
      );

      if (error instanceof Error) {
        if (error.message === 'RECORD_NOT_FOUND')
          recordFailure(
            'NOT_FOUND',
            'Catatan tabel tidak ditemukan.',
            HttpStatus.NOT_FOUND,
          );
        if (error.message === 'RECORD_EXECUTION_LIMIT')
          recordFailure('EXECUTION_LIMIT', 'Tabel melebihi batas operasi ini.');
        if (error.message === 'RECORD_LEASE_EXPIRED')
          recordFailure(
            'LEASE_EXPIRED',
            'Perlindungan editor berakhir. Draf tetap tersedia; sambungkan kembali.',
            HttpStatus.CONFLICT,
          );
      }

      throw error;
    }
  }

  cursor(value: unknown): string {
    const data = Buffer.from(JSON.stringify(value)).toString('base64url');

    return `${data}.${createHmac('sha256', this.secret).update(data).digest('base64url')}`;
  }

  decodeCursor(token: string): unknown {
    const [data, signature, ...extra] = token.split('.');
    if (!data || !signature || extra.length)
      recordFailure('INVALID_CURSOR', 'Cursor tidak valid.');
    const expected = createHmac('sha256', this.secret).update(data).digest();
    const supplied = Buffer.from(signature, 'base64url');
    if (
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied)
    )
      recordFailure('INVALID_CURSOR', 'Cursor tidak valid.');

    try {
      return JSON.parse(Buffer.from(data, 'base64url').toString());
    } catch {
      recordFailure('INVALID_CURSOR', 'Cursor tidak valid.');
    }
  }

  create(userId: string, raw: unknown, sourceType = 'dashboard') {
    const input = parseRecord(createRecordSchema, raw);
    const id = fingerprint([userId, input.requestKey]);

    return this.boundary(() =>
      this.repository.locked(userId, async () => {
        const replay = await this.repository.receipt(userId, input.requestKey);
        const signature = fingerprint(input);

        if (replay) {
          if (replay.fingerprint !== signature)
            recordFailure(
              'IDEMPOTENCY_MISMATCH',
              'Operation key was reused for different input.',
            );

          return replay.result;
        }

        await this.workspace.transact(userId, (items) =>
          applyWorkspaceCommand(
            items,
            {
              action: 'create',
              id,
              kind: 'note',
              format: 'record',
              title: input.title,
              parentId: input.parentId,
            },
            { userId, now: new Date(), sourceType },
          ),
        );
        await this.repository.insert({
          noteId: id,
          description: input.description,
          columns: input.columns,
          stats: recordStats(input.columns, []),
          nextPosition: 1,
        });
        const snapshot = await this.repository.get(userId, id);
        // Save discovery text in the same commit; no cell values enter the index.
        await this.repository.save(
          userId,
          { ...snapshot, rows: [] },
          [],
          sourceType,
        );
        const result = this.metadataValue(snapshot);
        await this.repository.remember(
          userId,
          input.requestKey,
          signature,
          result,
        );

        return result;
      }),
    );
  }

  private metadataValue(
    snapshot: Awaited<ReturnType<IRecordNotesRepository['get']>>,
  ) {
    return {
      id: snapshot.table.noteId,
      ref: `custom:${snapshot.table.noteId}`,
      kind: 'note',
      format: 'record',
      title: snapshot.title,
      path: snapshot.path,
      parentId: snapshot.parentId,
      description: snapshot.table.description,
      columns: snapshot.table.columns,
      revision: snapshot.revision,
      updatedAt: snapshot.updatedAt.toISOString(),
      ...snapshot.table.stats,
    };
  }

  metadata(userId: string, id: string) {
    return this.boundary(() =>
      this.repository.locked(userId, async () =>
        this.metadataValue(await this.repository.get(userId, id)),
      ),
    );
  }

  content(userId: string, id: string, raw: unknown) {
    const input = parseRecord(pageSchema, raw);

    return this.boundary(() =>
      this.repository.locked(userId, async () => {
        const snapshot = await this.repository.get(userId, id);
        const meta = this.metadataValue(snapshot);
        const columns =
          input.columns ?? snapshot.table.columns.map((c) => c.id);

        if (
          new Set(columns).size !== columns.length ||
          columns.some((id) => !snapshot.table.columns.some((c) => c.id === id))
        )
          recordFailure('UNKNOWN_COLUMN', 'Proyeksi kolom tidak valid.');
        const shape = fingerprint({ columns, limit: input.limit });
        let offset =
          input.navigation === 'last'
            ? Math.max(
                0,
                Math.floor((Math.max(1, meta.rowCount) - 1) / input.limit) *
                  input.limit,
              )
            : (input.offset ?? 0);

        if (input.cursor) {
          const cursor = parseRecord(
            z.object({
              userId: z.string(),
              id: z.string(),
              revision: z.number(),
              shape: z.string(),
              offset: z.number().int().nonnegative(),
            }),
            this.decodeCursor(input.cursor),
          );

          if (
            cursor.userId !== userId ||
            cursor.id !== id ||
            cursor.shape !== shape
          )
            recordFailure('INVALID_CURSOR', 'Cursor tidak sesuai permintaan.');
          if (cursor.revision !== meta.revision)
            recordFailure(
              'STALE_CURSOR',
              'Tabel telah berubah. Mulai kembali dari halaman pertama.',
              HttpStatus.CONFLICT,
            );
          offset = cursor.offset;
        }

        const rows = (
          await this.repository.page(userId, id, offset, input.limit)
        ).map((row) => ({
          ...row,
          cells: Object.fromEntries(
            columns.flatMap((id) =>
              row.cells[id] ? [[id, row.cells[id]]] : [],
            ),
          ),
        }));

        const cursor = (at: number) =>
          this.cursor({
            userId,
            id,
            revision: meta.revision,
            shape,
            offset: at,
          });

        return {
          id,
          revision: meta.revision,
          columns,
          rowCount: meta.rowCount,
          columnCount: meta.columnCount,
          bounds: meta.bounds,
          rows,
          page: {
            offset,
            limit: input.limit,
            from: rows.length ? offset + 1 : 0,
            to: offset + rows.length,
            first: cursor(0),
            last: cursor(
              Math.max(
                0,
                Math.floor((Math.max(1, meta.rowCount) - 1) / input.limit) *
                  input.limit,
              ),
            ),
            next:
              offset + rows.length < meta.rowCount
                ? cursor(offset + input.limit)
                : null,
            previous:
              offset > 0 ? cursor(Math.max(0, offset - input.limit)) : null,
          },
        };
      }),
    );
  }

  mutate(userId: string, id: string, raw: unknown, sourceType = 'dashboard') {
    const input = parseRecord(mutationSchema, raw);

    const work = async () => {
      const signature = fingerprint({ id, ...input });
      const replay = await this.repository.receipt(userId, input.requestKey);

      if (replay) {
        if (replay.fingerprint !== signature)
          recordFailure(
            'IDEMPOTENCY_MISMATCH',
            'Operation key was reused for different input.',
          );

        return replay.result;
      }

      const [snapshot] = await this.repository.snapshots(userId, [id], 100000);
      if (!snapshot) throw new Error('RECORD_NOT_FOUND');
      if (snapshot.revision !== input.revision)
        recordFailure(
          'REVISION',
          'Tabel telah berubah. Draf Anda tetap tersedia.',
          HttpStatus.CONFLICT,
        );
      let change = input.change;
      const removed =
        change.action === 'schema'
          ? snapshot.table.columns.flatMap((column, index) =>
              change.action === 'schema' &&
              !change.columns.some((c) => c.id === column.id)
                ? [{ column, index }]
                : [],
            )
          : [];

      let restoredRows: Array<{ id: string; values: Record<string, string> }> =
        [];

      if (change.action === 'restore_columns') {
        if (sourceType !== 'dashboard')
          recordFailure('FORBIDDEN', 'Column restoration requires the editor.');
        const receipt = await this.repository.receipt(
          userId,
          `column-undo:${id}:${change.undoKey}`,
        );

        const backup = parseRecord(
          z.object({
            columns: z.array(
              z.object({
                column: columnSchema,
                index: z.number().int().nonnegative(),
              }),
            ),
            rows: z.array(
              z.object({
                id: z.string(),
                values: z.record(z.string(), z.string()),
              }),
            ),
          }),
          receipt?.result,
        );

        const columns = [...snapshot.table.columns];

        for (const saved of backup.columns) {
          if (columns.some((c) => c.id === saved.column.id))
            recordFailure('CONFLICT', 'Restored column already exists.', 409);
          columns.splice(
            Math.min(saved.index, columns.length),
            0,
            saved.column,
          );
        }

        change = {
          action: 'schema',
          columns: parseRecord(columnsSchema, columns),
          confirmed: true,
        };
        restoredRows = backup.rows;
      }

      const changed = applyRecordChange(
        { ...snapshot.table, rows: snapshot.rows },
        change,
        { newId: randomUUID, assistant: sourceType !== 'dashboard' },
      );

      if (restoredRows.length) {
        const values = new Map(restoredRows.map((row) => [row.id, row.values]));

        for (const row of changed.rows) {
          for (const [columnId, raw] of Object.entries(
            values.get(row.id) ?? {},
          )) {
            row.cells[columnId] = interpretCell(
              changed.columns.find((c) => c.id === columnId)!,
              raw,
            );
          }
        }

        changed.stats = recordStats(changed.columns, changed.rows);
      }

      if (removed.length) {
        const ids = new Set(removed.map((item) => item.column.id));
        await this.repository.remember(
          userId,
          `column-undo:${id}:${input.requestKey}`,
          signature,
          {
            columns: removed,
            rows: snapshot.rows.map((row) => ({
              id: row.id,
              values: Object.fromEntries(
                Object.entries(row.cells)
                  .filter(([key]) => ids.has(key))
                  .map(([key, cell]) => [key, cell.raw]),
              ),
            })),
          },
        );
      }

      if (changed.rows.length > 100000)
        recordFailure(
          'EXECUTION_LIMIT',
          'A record table supports at most 100,000 saved rows.',
        );
      const after = {
        ...snapshot,
        table: {
          ...snapshot.table,
          columns: changed.columns,
          description: changed.description,
          nextPosition: changed.nextPosition,
          stats: changed.stats,
        },
        rows: changed.rows,
        revision: snapshot.revision + 1,
        updatedAt: new Date(),
      };

      if (input.change.action === 'title') {
        const renamed = await this.workspace.transact(userId, (items) =>
          applyWorkspaceCommand(
            items,
            {
              action: 'update',
              id,
              revision: input.revision,
              title:
                input.change.action === 'title'
                  ? input.change.title
                  : undefined,
            },
            { userId, now: after.updatedAt, sourceType },
          ),
        );

        after.title = renamed.title;
      }

      await this.repository.save(userId, after, snapshot.rows, sourceType);
      const result = {
        ...this.metadataValue(after),
        ...(removed.length ? { undoKey: input.requestKey } : {}),
        status: 'committed',
        saved: true,
        changedIds: changed.changedIds,
        mismatchedCells: changed.mismatched.slice(0, 200),
        mismatchedCount: changed.mismatched.length,
        mismatchedTruncated: changed.mismatched.length > 200,
      };

      await this.repository.remember(
        userId,
        input.requestKey,
        signature,
        result,
      );

      return result;
    };

    return this.boundary(() => {
      if (sourceType === 'dashboard') {
        if (!input.sessionId)
          recordFailure('LEASE_REQUIRED', 'Buka tabel sebelum menyimpan.');

        return this.repository.editorWrite(userId, id, input.sessionId, work);
      }

      return this.repository.locked(userId, work);
    });
  }

  query(userId: string, raw: unknown) {
    assertRecordQueryBounds(raw);
    const query = parseRecord(querySchema, raw);

    return this.boundary(() =>
      this.repository.locked(userId, async () => {
        const snapshots = await this.repository.snapshots(
          userId,
          query.sources.map((s) => s.id),
          10000,
        );

        return executeRecordQuery(userId, query, snapshots, {
          encode: (v) => this.cursor(v),
          decode: (v) => this.decodeCursor(v),
          now: new Date(),
        });
      }),
    );
  }

  async exportLink(userId: string, id: string) {
    const saved = await this.export(userId, id);
    const expiresAt = Date.now() + 15 * 60_000;
    const token = this.cursor({
      purpose: 'record-csv',
      userId,
      id,
      revision: saved.revision,
      expiresAt,
    });

    return {
      id,
      revision: saved.revision,
      filename: saved.filename,
      scope: 'saved',
      expiresAt: new Date(expiresAt).toISOString(),
      url: `${this.publicUrl}/record-notes/download/${token}`,
    };
  }

  async download(token: string) {
    const grant = parseRecord(
      z.object({
        purpose: z.literal('record-csv'),
        userId: z.string(),
        id: z.string(),
        revision: z.number(),
        expiresAt: z.number(),
      }),
      this.decodeCursor(token),
    );

    if (grant.expiresAt < Date.now())
      recordFailure(
        'EXPIRED_DOWNLOAD',
        'Tautan unduhan kedaluwarsa. Buat unduhan baru.',
      );
    const saved = await this.export(grant.userId, grant.id);
    if (saved.revision !== grant.revision)
      recordFailure('STALE_DOWNLOAD', 'Tabel berubah. Buat unduhan baru.', 409);

    return saved;
  }

  export(userId: string, id: string) {
    return this.boundary(() =>
      this.repository.locked(userId, async () => {
        const [s] = await this.repository.snapshots(userId, [id], 100000);
        if (!s) throw new Error('RECORD_NOT_FOUND');

        return {
          id,
          revision: s.revision,
          title: s.title,
          csv: serializeRecordCsv(s.table.columns, s.rows),
          filename: `${s.title.replace(/[^\p{L}\p{N} _-]/gu, '_')}.csv`,
          scope: 'saved',
        };
      }),
    );
  }
}
