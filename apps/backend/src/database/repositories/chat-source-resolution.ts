import type { Prisma } from '../../generated/prisma/client';
import {
  ChatSourceUnavailableError,
  type ChatSegment,
} from '../entities/conversation.entity';

/** Resolve identities in the accepting transaction; labels never authorize reads. */
export async function resolveChatSources(
  tx: Prisma.TransactionClient,
  userId: string,
  segments: readonly ChatSegment[],
) {
  const documentIds = new Set<string>();
  const resolved: ChatSegment[] = [];

  for (const segment of segments) {
    if (segment.type === 'text') {
      resolved.push(segment);
      continue;
    }

    const { kind, id } = segment.source;
    let label: string;
    if (kind === 'file') {
      const file = await tx.document.findFirst({
        where: { id, userId, deletingOperationId: null, status: 'ready' },
        select: { id: true, title: true },
      });

      if (!file)
        throw new ChatSourceUnavailableError(
          'File sumber tidak tersedia. Hapus sumber tersebut lalu coba lagi.',
        );
      label = file.title;
      documentIds.add(file.id);
    } else if (kind === 'folder') {
      const folder = await tx.fileFolder.findFirst({
        where: { id, userId, deletingOperationId: null },
        select: { name: true },
      });

      if (!folder)
        throw new ChatSourceUnavailableError(
          'Folder sumber tidak tersedia. Hapus sumber tersebut lalu coba lagi.',
        );
      label = folder.name;
      const descendants = await tx.$queryRaw<Array<{ id: string }>>`
        WITH RECURSIVE subtree AS (
          SELECT id FROM file_folder WHERE id = ${id} AND "userId" = ${userId} AND "deletingOperationId" IS NULL
          UNION ALL SELECT f.id FROM file_folder f JOIN subtree p ON f."parentId" = p.id
          WHERE f."userId" = ${userId} AND f."deletingOperationId" IS NULL
        ) SELECT d.id FROM document d JOIN subtree s ON d."folderId" = s.id
        WHERE d."userId" = ${userId} AND d."deletingOperationId" IS NULL`;

      for (const file of descendants) documentIds.add(file.id);
    } else if (id.startsWith('custom:')) {
      const note = await tx.workspaceItem.findFirst({
        where: { id: id.slice(7), userId, kind: 'note', trashedAt: null },
        select: { title: true },
      });

      if (!note)
        throw new ChatSourceUnavailableError(
          'Catatan sumber tidak tersedia. Hapus sumber tersebut lalu coba lagi.',
        );
      label = note.title;
    } else if (/^daily:\d{4}-\d{2}-\d{2}$/.test(id)) {
      const note = await tx.dailyNote.findUnique({
        where: { userId_date: { userId, date: id.slice(6) } },
        select: { date: true },
      });

      if (!note)
        throw new ChatSourceUnavailableError(
          'Catatan harian sumber tidak tersedia.',
        );
      label = note.date;
    } else
      throw new ChatSourceUnavailableError(
        'Identitas sumber catatan tidak valid.',
      );
    resolved.push({
      type: 'source',
      source: {
        kind,
        id,
        label,
        ...(segment.source.path ? { path: segment.source.path } : {}),
      },
    });
  }

  return { segments: resolved, documentIds: [...documentIds] };
}

export function chatSourceSignature(segments: readonly ChatSegment[]): string {
  return JSON.stringify(
    segments.map((s) =>
      s.type === 'text'
        ? s
        : { type: s.type, kind: s.source.kind, id: s.source.id },
    ),
  );
}
