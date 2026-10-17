import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import {
  assertLibraryRevision,
  assertLibraryUnlocked,
  FileLibraryError,
  fileFolderName,
  libraryUnavailable,
  type FileBreadcrumb,
  type FileLibraryFilters,
  type FileLibraryItem,
  type FileLibraryRef,
} from '../entities';
import type { IFileLibraryRepository } from '../interfaces';
import {
  lockFileLibrary,
  requireWritableFileFolder,
} from './file-library-lock';

@Injectable()
export class PrismaFileLibraryRepository implements IFileLibraryRepository {
  private readonly logger = new Logger(PrismaFileLibraryRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  withFileMutation<T>(
    userId: string,
    documentId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.write(userId, async (tx) => {
      const row = await tx.document.findFirst({
        where: { userId, id: documentId },
        select: { deletingOperationId: true },
      });

      if (row) assertLibraryUnlocked(row.deletingOperationId);

      return action();
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
      this.logger.warn(
        'File library transaction rejected; changes rolled back.',
        error,
      );
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new FileLibraryError(
          'duplicate_name',
          'Folder dengan nama ini sudah ada di tujuan. Ganti nama terlebih dahulu.',
        );
      throw error;
    }
  }

  private async paths(
    tx: Prisma.TransactionClient,
    userId: string,
    ids: string[],
  ): Promise<Map<string, FileBreadcrumb[]>> {
    if (!ids.length) return new Map();
    const rows = await tx.$queryRaw<
      Array<{ origin: string; id: string; name: string; depth: number }>
    >(Prisma.sql`
      WITH RECURSIVE ancestors AS (
        SELECT id AS origin, id, name, "parentId", 0 AS depth
        FROM file_folder WHERE "userId" = ${userId} AND id IN (${Prisma.join(ids)})
        UNION ALL
        SELECT a.origin, p.id, p.name, p."parentId", a.depth + 1
        FROM ancestors a JOIN file_folder p ON p.id = a."parentId" AND p."userId" = ${userId}
      ) SELECT origin, id, name, depth FROM ancestors ORDER BY depth DESC
    `);

    const result = new Map<string, FileBreadcrumb[]>();

    for (const row of rows) {
      const path = result.get(row.origin) ?? [];
      path.push({ id: row.id, name: row.name });
      result.set(row.origin, path);
    }

    return result;
  }

  async folder(userId: string, id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const folder = await tx.fileFolder.findFirst({ where: { userId, id } });

        if (!folder) {
          const deleted = await tx.$queryRaw<
            Array<{ destinationId: string | null }>
          >(Prisma.sql`
            WITH RECURSIVE deleted AS (
              SELECT DISTINCT ON (i."itemId") i."itemId", i."parentId" FROM file_deletion_item i
              JOIN file_deletion_operation op ON op.id = i."operationId"
              WHERE op."userId" = ${userId} AND i.kind = 'folder' AND i.state = 'completed'
              ORDER BY i."itemId", op."updatedAt" DESC
            ), ancestors AS (
              SELECT "parentId", 0 AS depth FROM deleted WHERE "itemId" = ${id}
              UNION ALL
              SELECT d."parentId", a.depth + 1 FROM ancestors a JOIN deleted d ON d."itemId" = a."parentId"
            ) SELECT (SELECT f.id FROM ancestors a JOIN file_folder f ON f.id = a."parentId" AND f."userId" = ${userId}
              ORDER BY a.depth LIMIT 1) AS "destinationId" WHERE EXISTS (SELECT 1 FROM deleted WHERE "itemId" = ${id})`);

          if (deleted[0])
            throw new FileLibraryError(
              'not_found',
              'Folder telah dihapus. Lokasi induk yang masih tersedia akan dibuka.',
              { deleted: true, destinationId: deleted[0].destinationId },
            );
          libraryUnavailable();
        }

        const paths = await this.paths(tx, userId, [id]);

        return { folder, path: paths.get(id)! };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async list(userId: string, filters: FileLibraryFilters) {
    return this.prisma.$transaction(
      async (tx) => {
        if (
          filters.folderId &&
          filters.query === undefined &&
          !(await tx.fileFolder.findFirst({
            where: { userId, id: filters.folderId },
            select: { id: true },
          }))
        )
          libraryUnavailable();
        const scope =
          filters.query === undefined
            ? Prisma.sql`"parentId" IS NOT DISTINCT FROM ${filters.folderId}`
            : Prisma.sql`strpos(lower(name), lower(${filters.query.normalize('NFC')})) > 0`;

        const files = filters.foldersOnly
          ? Prisma.empty
          : Prisma.sql`
        UNION ALL
        SELECT d.id, 'file' AS kind, d.title AS name, d."folderId" AS "parentId", d."organizationRevision" AS revision,
          d."createdAt", d."deletingOperationId", a.size, a."mimeType", a.kind AS "fileKind", d.status
        FROM document d JOIN file_asset a ON a.id = d."fileAssetId"
        WHERE d."userId" = ${userId}`;

        const listing = Prisma.sql`
        SELECT f.id, 'folder' AS kind, f.name, f."parentId", f.revision, f."createdAt", f."deletingOperationId",
          NULL::int AS size, NULL::text AS "mimeType", NULL::text AS "fileKind", NULL::text AS status
        FROM file_folder f WHERE f."userId" = ${userId} ${files}`;

        const order =
          filters.sort === 'createdAt'
            ? Prisma.sql`"createdAt"`
            : Prisma.sql`lower(name)`;

        const direction =
          filters.direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

        const rows = await tx.$queryRaw<
          Array<Omit<FileLibraryItem, 'path'>>
        >(Prisma.sql`
        WITH items AS (${listing}), page AS MATERIALIZED (
          SELECT * FROM items WHERE ${scope}
          ORDER BY CASE kind WHEN 'folder' THEN 0 ELSE 1 END, ${order} ${direction}, id
          OFFSET ${filters.offset} LIMIT ${filters.limit}
        ) SELECT page.*, CASE WHEN kind = 'folder' THEN
          ((SELECT count(*) FROM file_folder c WHERE c."userId" = ${userId} AND c."parentId" = page.id)
           + (SELECT count(*) FROM document d WHERE d."userId" = ${userId} AND d."folderId" = page.id))::int
          ELSE NULL::int END AS "childCount"
        FROM page ORDER BY CASE kind WHEN 'folder' THEN 0 ELSE 1 END, ${order} ${direction}, id`);

        const counts = await tx.$queryRaw<Array<{ total: number }>>(Prisma.sql`
        WITH items AS (${listing}) SELECT count(*)::int AS total FROM items WHERE ${scope}`);

        const paths = await this.paths(tx, userId, [
          ...new Set(
            rows.flatMap((row) => (row.parentId ? [row.parentId] : [])),
          ),
        ]);

        return {
          items: rows.map((row) => ({
            ...row,
            path: row.parentId ? paths.get(row.parentId)! : [],
          })),
          total: counts[0]!.total,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  createFolder(userId: string, input: string, parentId: string | null) {
    const name = fileFolderName(input);

    return this.write(userId, async (tx) => {
      if (parentId) await requireWritableFileFolder(tx, userId, parentId);

      return tx.fileFolder.create({ data: { userId, parentId, ...name } });
    });
  }

  renameFolder(userId: string, id: string, input: string, revision: number) {
    const name = fileFolderName(input);

    return this.write(userId, async (tx) => {
      const folder = await requireWritableFileFolder(tx, userId, id);
      assertLibraryRevision(folder.revision, revision);

      return tx.fileFolder.update({
        where: { userId, id },
        data: { ...name, revision: { increment: 1 } },
      });
    });
  }

  async assertUploadDestination(
    userId: string,
    folderId: string,
  ): Promise<void> {
    await this.write(userId, async (tx) => {
      await requireWritableFileFolder(tx, userId, folderId);
    });
  }

  async move(
    userId: string,
    items: FileLibraryRef[],
    destinationId: string | null,
  ): Promise<void> {
    await this.write(userId, async (tx) => {
      if (destinationId)
        await requireWritableFileFolder(tx, userId, destinationId);
      const unique = [
        ...new Map(
          items.map((item) => [`${item.kind}:${item.id}`, item]),
        ).values(),
      ];

      const folderIds = unique
        .filter((item) => item.kind === 'folder')
        .map((item) => item.id);

      const files = await tx.document.findMany({
        where: {
          userId,
          id: {
            in: unique
              .filter((item) => item.kind === 'file')
              .map((item) => item.id),
          },
        },
        select: {
          id: true,
          folderId: true,
          organizationRevision: true,
          deletingOperationId: true,
        },
      });

      const folders = await tx.fileFolder.findMany({
        where: { userId, id: { in: folderIds } },
      });

      if (files.length + folders.length !== unique.length) libraryUnavailable();
      const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
      const fileMap = new Map(files.map((file) => [file.id, file]));

      for (const ref of unique) {
        const row =
          ref.kind === 'folder' ? folderMap.get(ref.id)! : fileMap.get(ref.id)!;

        assertLibraryUnlocked(row.deletingOperationId);
        assertLibraryRevision(
          'revision' in row ? row.revision : row.organizationRevision,
          ref.revision,
        );
      }

      const parentIds = [
        ...new Set([
          ...folders.flatMap((f) => (f.parentId ? [f.parentId] : [])),
          ...files.flatMap((f) => (f.folderId ? [f.folderId] : [])),
          ...(destinationId ? [destinationId] : []),
        ]),
      ];

      const paths = await this.paths(tx, userId, parentIds);
      const insideSelection = (parent: string | null) =>
        parent !== null &&
        paths.get(parent)!.some((ancestor) => folderMap.has(ancestor.id));

      if (
        destinationId &&
        (folderMap.has(destinationId) || insideSelection(destinationId))
      )
        throw new FileLibraryError(
          'cycle',
          'Folder tidak dapat dipindahkan ke dirinya sendiri atau subfoldernya.',
        );
      const effectiveFolders = folders.filter(
        (folder) =>
          !insideSelection(folder.parentId) &&
          folder.parentId !== destinationId,
      );

      const effectiveFiles = files.filter(
        (file) =>
          !insideSelection(file.folderId) && file.folderId !== destinationId,
      );

      if (effectiveFolders.length) {
        const roots = effectiveFolders.map((folder) => folder.id);
        const locked = await tx.$queryRaw<
          Array<{ locked: boolean }>
        >(Prisma.sql`
          WITH RECURSIVE tree AS (
            SELECT id, "deletingOperationId" FROM file_folder
            WHERE "userId" = ${userId} AND id = ANY(${roots}::text[])
            UNION ALL
            SELECT child.id, child."deletingOperationId" FROM file_folder child
            JOIN tree parent ON child."parentId" = parent.id WHERE child."userId" = ${userId}
          ) SELECT EXISTS (
            SELECT 1 FROM tree WHERE "deletingOperationId" IS NOT NULL
            UNION ALL
            SELECT 1 FROM document d JOIN tree t ON d."folderId" = t.id
            WHERE d."userId" = ${userId} AND d."deletingOperationId" IS NOT NULL
          ) AS locked`);

        if (locked[0]?.locked)
          throw new FileLibraryError(
            'operation_in_progress',
            'Folder berisi item yang sedang dihapus. Tunggu hingga proses selesai.',
          );
      }

      const destinationNames = new Set(
        (
          await tx.fileFolder.findMany({
            where: { userId, parentId: destinationId },
            select: { normalizedName: true },
          })
        ).map((folder) => folder.normalizedName),
      );

      for (const folder of effectiveFolders) {
        if (destinationNames.has(folder.normalizedName))
          throw new FileLibraryError(
            'duplicate_name',
            `Folder “${folder.name}” sudah ada di tujuan. Ganti nama terlebih dahulu.`,
          );
        destinationNames.add(folder.normalizedName);
      }

      for (const folder of effectiveFolders)
        await tx.fileFolder.update({
          where: { userId, id: folder.id },
          data: { parentId: destinationId, revision: { increment: 1 } },
        });
      if (effectiveFiles.length)
        await tx.document.updateMany({
          where: { userId, id: { in: effectiveFiles.map((file) => file.id) } },
          data: {
            folderId: destinationId,
            organizationRevision: { increment: 1 },
          },
        });
    });
  }
}
