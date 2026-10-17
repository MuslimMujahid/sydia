import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { FileDeletionOperation as OperationRow } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import {
  assertLibraryRevision,
  assertLibraryUnlocked,
  FileLibraryError,
  libraryUnavailable,
  type FileLibraryRef,
} from '../entities';
import type {
  FileDeletionClaim,
  FileDeletionItem,
  FileDeletionOperation,
} from '../entities/file-deletion.entity';
import type { IFileDeletionRepository } from '../interfaces/file-deletion.repository.interface';
import { lockFileLibrary } from './file-library-lock';

type ManifestItem = Omit<
  FileDeletionItem,
  'operationId' | 'state' | 'error' | 'attempts'
> & { deletingOperationId: string | null };
const PREVIEW_LIFETIME_MS = 10 * 60_000;
const LEASE_MS = 60_000;
const PROCESSING_WAIT_MS = 5_000;
const MAX_PROCESSING_WAITS = 120;
const EXPIRED_PREVIEWS_PER_SWEEP = 5;

function fingerprint(
  items: Array<
    Pick<ManifestItem, 'kind' | 'itemId' | 'parentId' | 'revision' | 'name'>
  >,
) {
  const sorted = [...items].sort((a, b) =>
    `${a.kind}:${a.itemId}`.localeCompare(`${b.kind}:${b.itemId}`),
  );

  return createHash('sha256')
    .update(
      JSON.stringify(
        sorted.map((row) => [
          row.kind,
          row.itemId,
          row.parentId,
          row.revision,
          row.name,
        ]),
      ),
    )
    .digest('hex');
}

function selection(value: Prisma.JsonValue): FileLibraryRef[] {
  if (!Array.isArray(value))
    throw new Error('Invalid persisted deletion selection.');

  return value.map((ref) => {
    if (
      !ref ||
      typeof ref !== 'object' ||
      Array.isArray(ref) ||
      (ref.kind !== 'file' && ref.kind !== 'folder') ||
      typeof ref.id !== 'string' ||
      typeof ref.revision !== 'number'
    )
      throw new Error('Invalid persisted deletion reference.');

    return { kind: ref.kind, id: ref.id, revision: ref.revision };
  });
}

function item(
  row: { kind: string; state: string } & Omit<
    FileDeletionItem,
    'kind' | 'state'
  >,
): FileDeletionItem {
  if (
    (row.kind !== 'file' && row.kind !== 'folder') ||
    !['pending', 'completed', 'failed', 'blocked'].includes(row.state)
  )
    throw new Error('Invalid persisted deletion item state.');

  return {
    ...row,
    kind: row.kind,
    state: row.state as FileDeletionItem['state'],
  };
}

@Injectable()
export class PrismaFileDeletionRepository implements IFileDeletionRepository {
  private readonly logger = new Logger(PrismaFileDeletionRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  async recordClaimFailure(claim: FileDeletionClaim): Promise<void> {
    await this.write(claim.userId, async (tx) => {
      const operation = await tx.fileDeletionOperation.findFirst({
        where: {
          userId: claim.userId,
          id: claim.operationId,
          status: 'running',
          leaseUntil: claim.leaseUntil,
        },
      });

      if (!operation) return;
      const failures = operation.workerFailures + 1;
      await tx.fileDeletionOperation.update({
        where: { id: operation.id },
        data: {
          workerFailures: failures,
          leaseUntil: null,
          ...(failures >= 3 ? { status: 'partial' } : {}),
        },
      });
      if (failures < 3) return;
      await tx.fileDeletionItem.updateMany({
        where: { operationId: operation.id, state: 'pending' },
        data: {
          state: 'failed',
          error:
            'Proses penghapusan terhenti setelah tiga percobaan. Coba ulang atau hubungi administrator.',
        },
      });
      await tx.fileFolder.updateMany({
        where: { userId: claim.userId, deletingOperationId: operation.id },
        data: { deletingOperationId: null },
      });
      await tx.document.updateMany({
        where: { userId: claim.userId, deletingOperationId: operation.id },
        data: { deletingOperationId: null },
      });
      this.logger.error(
        'File deletion stopped after its worker failure budget was exhausted.',
      );
    });
  }

  private async write<T>(
    userId: string,
    change: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await lockFileLibrary(tx, userId);

          return change(tx);
        },
        { timeout: 30_000 },
      );
    } catch (error: unknown) {
      this.logger.warn('File deletion transaction failed.', error);
      throw error;
    }
  }

  private async manifest(
    tx: Prisma.TransactionClient,
    userId: string,
    refs: FileLibraryRef[],
    checkRevisions: boolean,
  ): Promise<ManifestItem[]> {
    const unique = [
      ...new Map(refs.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values(),
    ];

    const folderIds = unique
      .filter((ref) => ref.kind === 'folder')
      .map((ref) => ref.id);

    const fileIds = unique
      .filter((ref) => ref.kind === 'file')
      .map((ref) => ref.id);

    const rows = await tx.$queryRaw<ManifestItem[]>(Prisma.sql`
      WITH RECURSIVE tree AS (
        SELECT f.id, f."parentId", 0 AS depth FROM file_folder f
        WHERE f."userId" = ${userId} AND f.id = ANY(${folderIds}::text[])
        UNION ALL
        SELECT c.id, c."parentId", p.depth + 1 FROM file_folder c JOIN tree p ON c."parentId" = p.id
        WHERE c."userId" = ${userId}
      ), folders AS (SELECT id, max(depth) AS depth FROM tree GROUP BY id)
      SELECT 'folder' AS kind, f.id AS "itemId", f.name, f."parentId", f.revision, t.depth,
        NULL::text AS "storageKey", f."deletingOperationId"
      FROM file_folder f JOIN folders t ON f.id = t.id WHERE f."userId" = ${userId}
      UNION ALL
      SELECT 'file' AS kind, d.id AS "itemId", d.title AS name, d."folderId" AS "parentId", d."organizationRevision" AS revision,
        COALESCE(t.depth + 1, 0) AS depth, a."storageKey", d."deletingOperationId"
      FROM document d JOIN file_asset a ON a.id = d."fileAssetId" LEFT JOIN folders t ON t.id = d."folderId"
      WHERE d."userId" = ${userId} AND (t.id IS NOT NULL OR d.id = ANY(${fileIds}::text[]))
    `);

    const byId = new Map(rows.map((row) => [`${row.kind}:${row.itemId}`, row]));

    for (const ref of unique) {
      const row = byId.get(`${ref.kind}:${ref.id}`);
      if (!row) libraryUnavailable();
      if (checkRevisions) assertLibraryRevision(row.revision, ref.revision);
    }

    return rows;
  }

  private async summary(
    tx: Prisma.TransactionClient,
    row: OperationRow,
  ): Promise<FileDeletionOperation> {
    if (!['preview', 'running', 'completed', 'partial'].includes(row.status))
      throw new Error('Unknown file deletion status.');
    const counts = await tx.fileDeletionItem.groupBy({
      by: ['kind', 'state'],
      where: { operationId: row.id },
      _count: true,
    });

    const files = { total: 0, completed: 0, failed: 0, pending: 0 };
    const folders = { ...files, retained: 0 };

    for (const count of counts) {
      const target = count.kind === 'file' ? files : folders;
      target.total += count._count;
      if (count.state === 'blocked') folders.retained += count._count;
      else if (
        count.state === 'completed' ||
        count.state === 'failed' ||
        count.state === 'pending'
      )
        target[count.state] += count._count;
      else throw new Error('Unknown deletion item state.');
    }

    return {
      id: row.id,
      userId: row.userId,
      status: row.status as FileDeletionOperation['status'],
      selection: selection(row.selection),
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      files,
      folders,
    };
  }

  preview(userId: string, refs: FileLibraryRef[], now: Date) {
    return this.write(userId, async (tx) => {
      const manifest = await this.manifest(tx, userId, refs, true);
      for (const row of manifest)
        assertLibraryUnlocked(row.deletingOperationId);

      return this.savePreview(tx, userId, refs, manifest, now);
    });
  }

  private async savePreview(
    tx: Prisma.TransactionClient,
    userId: string,
    refs: FileLibraryRef[],
    manifest: ManifestItem[],
    now: Date,
  ) {
    const operation = await tx.fileDeletionOperation.create({
      data: {
        userId,
        selection: refs,
        fingerprint: fingerprint(manifest),
        expiresAt: new Date(now.getTime() + PREVIEW_LIFETIME_MS),
      },
    });

    for (let offset = 0; offset < manifest.length; offset += 500)
      await tx.fileDeletionItem.createMany({
        data: manifest.slice(offset, offset + 500).map((row) => ({
          kind: row.kind,
          itemId: row.itemId,
          name: row.name,
          parentId: row.parentId,
          revision: row.revision,
          depth: row.depth,
          storageKey: row.storageKey,
          operationId: operation.id,
        })),
      });

    return this.summary(tx, operation);
  }

  start(userId: string, previewId: string, idempotencyKey: string, now: Date) {
    return this.write(userId, async (tx) => {
      const existing = await tx.fileDeletionOperation.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
      });

      if (existing) return this.summary(tx, existing);
      const operation = await tx.fileDeletionOperation.findFirst({
        where: { userId, id: previewId },
      });

      if (!operation) libraryUnavailable();
      if (operation.status !== 'preview' || operation.expiresAt <= now)
        throw new FileLibraryError(
          'stale_confirmation',
          'Konfirmasi telah kedaluwarsa. Periksa kembali item yang akan dihapus.',
        );
      const manifest = await this.manifest(
        tx,
        userId,
        selection(operation.selection),
        false,
      );

      if (fingerprint(manifest) !== operation.fingerprint)
        throw new FileLibraryError(
          'stale_confirmation',
          'Isi pilihan telah berubah. Periksa jumlah item dan konfirmasi kembali.',
        );
      for (const row of manifest)
        assertLibraryUnlocked(row.deletingOperationId);
      await this.lockManifest(tx, userId, operation.id, manifest);
      const updated = await tx.fileDeletionOperation.update({
        where: { id: operation.id },
        data: { status: 'running', idempotencyKey, leaseUntil: null },
      });

      return this.summary(tx, updated);
    });
  }

  private async lockManifest(
    tx: Prisma.TransactionClient,
    userId: string,
    operationId: string,
    manifest: ManifestItem[],
  ) {
    await tx.fileFolder.updateMany({
      where: {
        userId,
        id: {
          in: manifest
            .filter((row) => row.kind === 'folder')
            .map((row) => row.itemId),
        },
      },
      data: { deletingOperationId: operationId },
    });
    await tx.document.updateMany({
      where: {
        userId,
        id: {
          in: manifest
            .filter((row) => row.kind === 'file')
            .map((row) => row.itemId),
        },
      },
      data: { deletingOperationId: operationId },
    });
  }

  async detail(userId: string, id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.fileDeletionOperation.findFirst({
          where: { userId, id },
        });

        if (!row) libraryUnavailable();

        return this.summary(tx, row);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async list(userId: string, offset: number, limit: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const where = { userId, status: { not: 'preview' } };
        const rows = await tx.fileDeletionOperation.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: [{ status: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        });

        return {
          items: await Promise.all(rows.map((row) => this.summary(tx, row))),
          total: await tx.fileDeletionOperation.count({ where }),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async failures(userId: string, id: string, offset: number, limit: number) {
    return this.prisma.$transaction(
      async (tx) => {
        if (
          !(await tx.fileDeletionOperation.findFirst({
            where: { userId, id },
            select: { id: true },
          }))
        )
          libraryUnavailable();
        const where = { operationId: id, state: { in: ['failed', 'blocked'] } };

        return {
          items: (
            await tx.fileDeletionItem.findMany({
              where,
              skip: offset,
              take: limit,
              orderBy: [{ state: 'asc' }, { itemId: 'asc' }],
            })
          ).map(item),
          total: await tx.fileDeletionItem.count({ where }),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  private async retryRefs(
    tx: Prisma.TransactionClient,
    userId: string,
    operationId: string,
  ) {
    const previous = await tx.fileDeletionItem.findMany({
      where: { operationId, state: { not: 'completed' } },
    });

    const refs: FileLibraryRef[] = [];
    // Fresh identities/revisions are necessary after a partial failure unlocks survivors.
    const folders = await tx.fileFolder.findMany({
      where: {
        userId,
        id: {
          in: previous
            .filter((row) => row.kind === 'folder')
            .map((row) => row.itemId),
        },
      },
    });

    const files = await tx.document.findMany({
      where: {
        userId,
        id: {
          in: previous
            .filter((row) => row.kind === 'file')
            .map((row) => row.itemId),
        },
      },
      select: { id: true, organizationRevision: true },
    });

    for (const row of folders)
      refs.push({ kind: 'folder', id: row.id, revision: row.revision });
    for (const row of files)
      refs.push({
        kind: 'file',
        id: row.id,
        revision: row.organizationRevision,
      });

    const liveIds = new Set(refs.map((ref) => `${ref.kind}:${ref.id}`));
    // Logical removal does not prove that the saved storage/checkpoint cleanup
    // succeeded. Keep those exact identities in every subsequent manifest.
    const missing = previous
      .map(item)
      .filter((row) => !liveIds.has(`${row.kind}:${row.itemId}`))
      .map((row) => ({ ...row, deletingOperationId: null }));

    return { refs, previous: previous.map(item), missing };
  }

  async retryPreview(userId: string, id: string, now: Date) {
    return this.write(userId, async (tx) => {
      const operation = await tx.fileDeletionOperation.findFirst({
        where: { userId, id, status: 'partial' },
      });

      if (!operation) libraryUnavailable();

      const { refs, missing } = await this.retryRefs(tx, userId, id);
      const manifest = refs.length
        ? await this.manifest(tx, userId, refs, false)
        : [];

      manifest.push(...missing);
      for (const row of manifest)
        assertLibraryUnlocked(row.deletingOperationId);

      return this.savePreview(tx, userId, refs, manifest, now);
    });
  }

  retry(userId: string, id: string, previewId: string | undefined, now: Date) {
    return this.write(userId, async (tx) => {
      const operation = await tx.fileDeletionOperation.findFirst({
        where: { userId, id },
      });

      if (!operation) libraryUnavailable();
      if (operation.status === 'running' || operation.status === 'completed')
        return this.summary(tx, operation);
      if (operation.status !== 'partial')
        throw new FileLibraryError(
          'stale_confirmation',
          'Proses ini tidak dapat dicoba ulang.',
        );
      const { refs, previous, missing } = await this.retryRefs(tx, userId, id);
      const manifest = refs.length
        ? await this.manifest(tx, userId, refs, false)
        : [];

      manifest.push(...missing);

      if (fingerprint(manifest) !== fingerprint(previous)) {
        const preview = previewId
          ? await tx.fileDeletionOperation.findFirst({
              where: {
                userId,
                id: previewId,
                status: 'preview',
                expiresAt: { gt: now },
              },
            })
          : null;

        if (!preview || preview.fingerprint !== fingerprint(manifest))
          throw new FileLibraryError(
            'stale_confirmation',
            'Item tersisa telah berubah. Periksa pilihan dan konfirmasi kembali.',
          );
        await tx.fileDeletionItem.deleteMany({
          where: { operationId: id, state: { not: 'completed' } },
        });
        for (let offset = 0; offset < manifest.length; offset += 500)
          await tx.fileDeletionItem.createMany({
            data: manifest.slice(offset, offset + 500).map((row) => ({
              kind: row.kind,
              itemId: row.itemId,
              name: row.name,
              parentId: row.parentId,
              revision: row.revision,
              depth: row.depth,
              storageKey: row.storageKey,
              operationId: id,
            })),
          });
        await tx.fileDeletionOperation.update({
          where: { id: preview.id },
          data: { expiresAt: now },
        });
      } else {
        await tx.fileDeletionItem.updateMany({
          where: { operationId: id, state: { not: 'completed' } },
          data: { state: 'pending', error: null, attempts: 0 },
        });
      }

      for (const row of manifest)
        assertLibraryUnlocked(row.deletingOperationId);
      await this.lockManifest(tx, userId, id, manifest);
      const updated = await tx.fileDeletionOperation.update({
        where: { id },
        data: { status: 'running', leaseUntil: null, workerFailures: 0 },
      });

      return this.summary(tx, updated);
    });
  }

  async claim(now: Date): Promise<FileDeletionClaim | null> {
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; userId: string }>
    >(Prisma.sql`
      UPDATE file_deletion_operation SET "leaseUntil" = ${leaseUntil}, "updatedAt" = ${now}
      WHERE id = (SELECT id FROM file_deletion_operation WHERE status = 'running' AND ("leaseUntil" IS NULL OR "leaseUntil" < ${now})
        ORDER BY "updatedAt", id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id, "userId"`);

    return rows[0]
      ? { operationId: rows[0].id, userId: rows[0].userId, leaseUntil }
      : null;
  }

  async pruneExpiredPreviews(now: Date): Promise<number> {
    const expired = await this.prisma.fileDeletionOperation.findMany({
      where: { status: 'preview', expiresAt: { lte: now } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: EXPIRED_PREVIEWS_PER_SWEEP,
      select: { id: true, userId: true },
    });

    let removed = 0;

    for (const preview of expired) {
      // Share the confirmation lock: a submission that won the race must keep
      // its durable manifest, even when its original preview has expired.
      removed += await this.write(preview.userId, async (tx) => {
        const result = await tx.fileDeletionOperation.deleteMany({
          where: {
            id: preview.id,
            userId: preview.userId,
            status: 'preview',
            expiresAt: { lte: now },
          },
        });

        return result.count;
      });
    }

    return removed;
  }

  async processBatch(
    claim: FileDeletionClaim,
    removeArtifacts: (
      key: string,
      documentId: string,
    ) => Promise<void | 'pending'>,
  ): Promise<boolean> {
    const active = {
      id: claim.operationId,
      userId: claim.userId,
      status: 'running',
      leaseUntil: claim.leaseUntil,
    };

    const prepared = await this.write(claim.userId, async (tx) => {
      if (!(await tx.fileDeletionOperation.findFirst({ where: active })))
        return null;
      const next = await tx.fileDeletionItem.findFirst({
        where: { operationId: claim.operationId, state: 'pending' },
        orderBy: [{ kind: 'asc' }, { depth: 'desc' }, { itemId: 'asc' }],
      });

      if (next) return next;
      const incomplete = await tx.fileDeletionItem.count({
        where: { operationId: claim.operationId, state: { not: 'completed' } },
      });

      await tx.fileDeletionOperation.update({
        where: { id: claim.operationId },
        data: {
          status: incomplete ? 'partial' : 'completed',
          leaseUntil: null,
        },
      });
      await tx.fileFolder.updateMany({
        where: { userId: claim.userId, deletingOperationId: claim.operationId },
        data: { deletingOperationId: null },
      });
      await tx.document.updateMany({
        where: { userId: claim.userId, deletingOperationId: claim.operationId },
        data: { deletingOperationId: null },
      });

      return null;
    });

    if (!prepared) return false;
    let state: FileDeletionItem['state'] = 'completed';
    let message: string | null = null;
    let cleanupPending = false;

    // Storage can be slow. The manifest and item locks are durable; never keep
    // a PostgreSQL transaction open while waiting for remote artifact cleanup.
    if (prepared.kind === 'file') {
      if (!prepared.storageKey)
        throw new Error('Deletion manifest is missing the file storage key.');

      try {
        cleanupPending =
          (await removeArtifacts(prepared.storageKey, prepared.itemId)) ===
          'pending';
      } catch (error: unknown) {
        this.logger.error('Could not delete file artifacts.', error);
        state = 'failed';
        message =
          'Penyimpanan tidak dapat dibersihkan. Coba hapus file ini lagi.';
      }
    }

    return this.write(claim.userId, async (tx) => {
      if (!(await tx.fileDeletionOperation.findFirst({ where: active }))) {
        this.logger.warn(
          'Discarding a stale deletion worker result; a newer lease owns the durable manifest.',
        );

        return false;
      }

      if (cleanupPending && prepared.attempts < MAX_PROCESSING_WAITS) {
        await tx.fileDeletionItem.update({
          where: {
            operationId_kind_itemId: {
              operationId: claim.operationId,
              kind: prepared.kind,
              itemId: prepared.itemId,
            },
          },
          data: { attempts: { increment: 1 } },
        });
        await tx.fileDeletionOperation.update({
          where: { id: claim.operationId },
          data: { leaseUntil: new Date(Date.now() + PROCESSING_WAIT_MS) },
        });

        return false;
      }

      if (cleanupPending) {
        state = 'failed';
        message =
          'Pemrosesan file belum berhenti. Coba hapus lagi atau hubungi administrator.';
        this.logger.warn(
          'File deletion reached its active processing wait budget.',
        );
      }

      if (prepared.kind === 'file') {
        if (state === 'completed')
          await tx.fileAsset.deleteMany({
            where: { userId: claim.userId, storageKey: prepared.storageKey! },
          });
      } else if (prepared.kind === 'folder') {
        const children = await tx.fileFolder.count({
          where: { userId: claim.userId, parentId: prepared.itemId },
        });

        const documents = await tx.document.count({
          where: { userId: claim.userId, folderId: prepared.itemId },
        });

        if (children || documents) {
          state = 'blocked';
          message =
            'Folder dipertahankan karena masih berisi item yang belum dihapus.';
        } else
          await tx.fileFolder.deleteMany({
            where: { userId: claim.userId, id: prepared.itemId },
          });
      } else throw new Error('Unknown deletion manifest kind.');
      await tx.fileDeletionItem.update({
        where: {
          operationId_kind_itemId: {
            operationId: claim.operationId,
            kind: prepared.kind,
            itemId: prepared.itemId,
          },
        },
        data: { state, error: message, attempts: { increment: 1 } },
      });
      await tx.fileDeletionOperation.update({
        where: { id: claim.operationId },
        data: { leaseUntil: null, workerFailures: 0 },
      });

      return true;
    });
  }
}
