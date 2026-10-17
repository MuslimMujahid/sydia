import { HttpStatus } from '@nestjs/common';
import type { WorkspaceCommit, WorkspaceItem } from '../../database/entities';
import { ApiException, ErrorCodes } from '../../shared/errors';
import {
  emptyRichTextDocument,
  richTextToPlainText,
} from '../../shared/rich-text';
import type { RichTextDocument } from '../../shared/rich-text';

export type WorkspaceCommand =
  | {
      action: 'create';
      id: string;
      kind: 'note' | 'folder';
      title?: string;
      parentId: string | null;
      content?: RichTextDocument;
    }
  | {
      action: 'update';
      id: string;
      revision: number;
      title?: string;
      parentId?: string | null;
      content?: RichTextDocument;
    }
  | {
      action: 'trash' | 'restore' | 'delete';
      id: string;
      revision: number;
      parentId?: string | null;
      title?: string;
    };

function reject(
  message: string,
  status: HttpStatus = HttpStatus.BAD_REQUEST,
  reason?: 'REVISION' | 'NAME_COLLISION',
): never {
  throw new ApiException({
    code:
      status === HttpStatus.CONFLICT
        ? ErrorCodes.CONFLICT
        : status === HttpStatus.NOT_FOUND
          ? ErrorCodes.NOT_FOUND
          : ErrorCodes.BAD_REQUEST,
    message,
    status,
    details: reason ? { reason } : {},
  });
}

export function workspacePath(
  item: Pick<WorkspaceItem, 'id' | 'title' | 'parentId'>,
  items: WorkspaceItem[],
): string {
  const parts = [item.title];
  const seen = new Set([item.id]);
  let parent = item.parentId;

  while (parent) {
    const ancestor = items.find((candidate) => candidate.id === parent);
    if (!ancestor || seen.has(parent))
      throw new Error('Invalid stored workspace hierarchy.');
    seen.add(parent);
    parts.unshift(ancestor.title);
    parent = ancestor.parentId;
  }

  return parts.join(' / ');
}

export function descendantIds(id: string, items: WorkspaceItem[]): Set<string> {
  const ids = new Set([id]);
  const pending = [id];

  while (pending.length) {
    const parentId = pending.pop();

    for (const item of items) {
      if (item.parentId !== parentId) continue;
      if (ids.has(item.id))
        throw new Error('Cycle in stored workspace hierarchy.');
      ids.add(item.id);
      pending.push(item.id);
    }
  }

  return ids;
}

function validateLocation(item: WorkspaceItem, items: WorkspaceItem[]) {
  if (item.parentId !== null) {
    const parent = items.find((candidate) => candidate.id === item.parentId);
    if (!parent || parent.kind !== 'folder' || parent.trashedAt)
      reject(
        'Folder tujuan tidak tersedia. Pilih folder lain.',
        HttpStatus.CONFLICT,
      );
    if (descendantIds(item.id, items).has(item.parentId))
      reject('Folder tidak dapat dipindahkan ke dirinya atau subfoldernya.');
  }

  if (
    items.some(
      (other) =>
        other.id !== item.id &&
        !other.trashedAt &&
        other.kind === item.kind &&
        other.parentId === item.parentId &&
        other.title.toLowerCase() === item.title.toLowerCase(),
    )
  )
    reject(
      'Nama sudah digunakan di folder tujuan. Pilih nama lain.',
      HttpStatus.CONFLICT,
      'NAME_COLLISION',
    );
}

function normalizedTitle(value: string): string {
  const title = value.trim().normalize('NFC');
  if (
    !title ||
    title.length > 240 ||
    Array.from(title).some((character) => character.charCodeAt(0) < 32) ||
    /[/\\]/u.test(title)
  )
    reject('Nama harus berisi 1–240 karakter tanpa garis miring.');

  return title;
}

/** Pure use-case rules, executed against the owner's locked snapshot. */
export function applyWorkspaceCommand(
  items: WorkspaceItem[],
  command: WorkspaceCommand,
  context: { userId: string; now: Date; sourceType: string },
): WorkspaceCommit<WorkspaceItem> {
  const { userId, now, sourceType } = context;
  if (items.some((item) => item.userId !== userId))
    throw new Error('Unscoped workspace snapshot.');

  if (command.action === 'create') {
    const replay = items.find((item) => item.id === command.id);
    if (replay) return { writes: [], deletes: [], result: replay };
    let title =
      command.title === undefined ? 'Untitled' : normalizedTitle(command.title);

    if (command.title === undefined) {
      let suffix = 1;

      while (
        items.some(
          (item) =>
            !item.trashedAt &&
            item.parentId === command.parentId &&
            item.kind === command.kind &&
            item.title.toLowerCase() === title.toLowerCase(),
        )
      ) {
        suffix += 1;
        title = `Untitled ${suffix}`;
      }
    }

    const content =
      command.kind === 'note' && command.content
        ? command.content
        : emptyRichTextDocument();

    const item: WorkspaceItem = {
      id: command.id,
      userId,
      kind: command.kind,
      title,
      parentId: command.parentId,
      content,
      text: richTextToPlainText(content),
      revision: 1,
      indexPending: command.kind === 'note',
      indexSignature: null,
      trashedAt: null,
      trashBatchId: null,
      sourceType,
      createdAt: now,
      updatedAt: now,
    };

    validateLocation(item, items);

    return { writes: [item], deletes: [], result: item };
  }

  const before = items.find((item) => item.id === command.id);
  if (!before)
    reject('Catatan atau folder tidak ditemukan.', HttpStatus.NOT_FOUND);
  if (before.revision !== command.revision)
    reject(
      'Catatan telah berubah. Draf Anda tetap disimpan; pilih versi yang ingin digunakan.',
      HttpStatus.CONFLICT,
      'REVISION',
    );
  const changed = {
    ...before,
    revision: before.revision + 1,
    updatedAt: now,
    sourceType,
  };

  if (command.action === 'update') {
    if (before.trashedAt)
      reject(
        'Pulihkan item dari Sampah sebelum mengubahnya.',
        HttpStatus.CONFLICT,
      );
    if (command.title !== undefined)
      changed.title = normalizedTitle(command.title);
    if (command.parentId !== undefined) changed.parentId = command.parentId;

    if (command.content !== undefined) {
      if (before.kind !== 'note')
        reject('Folder tidak dapat memiliki isi catatan.');
      changed.content = command.content;
      changed.text = richTextToPlainText(command.content);
    }

    validateLocation(changed, items);
    if (changed.title !== before.title || changed.text !== before.text)
      changed.indexPending = changed.kind === 'note';

    return { writes: [changed], deletes: [], result: changed };
  }

  const descendants = descendantIds(before.id, items);

  if (command.action === 'trash') {
    if (before.trashedAt) return { writes: [], deletes: [], result: before };
    const writes = items
      .filter((item) => descendants.has(item.id) && !item.trashedAt)
      .map((item) => ({
        ...item,
        trashedAt: now,
        trashBatchId: `${before.id}:${before.revision}`,
        revision: item.revision + 1,
        updatedAt: now,
        sourceType,
      }));

    return {
      writes,
      deletes: [],
      result: writes.find((item) => item.id === before.id)!,
    };
  }

  if (!before.trashedAt) reject('Pindahkan ke Sampah terlebih dahulu.');

  if (command.action === 'delete') {
    const subtree = items.filter((item) => descendants.has(item.id));
    if (subtree.some((item) => !item.trashedAt))
      reject('Folder masih memiliki catatan aktif.', HttpStatus.CONFLICT);
    const deletes = subtree
      .sort(
        (a, b) =>
          workspacePath(b, items).split(' / ').length -
          workspacePath(a, items).split(' / ').length,
      )
      .map((item) => item.id);

    return { writes: [], deletes, result: before };
  }

  changed.parentId =
    command.parentId === undefined ? before.parentId : command.parentId;
  if (command.title !== undefined)
    changed.title = normalizedTitle(command.title);
  changed.trashedAt = null;
  changed.trashBatchId = null;
  if (changed.title !== before.title)
    changed.indexPending = changed.kind === 'note';
  validateLocation(changed, items);
  const writes = [
    changed,
    ...items
      .filter(
        (item) =>
          item.id !== before.id &&
          descendants.has(item.id) &&
          item.trashBatchId === before.trashBatchId,
      )
      .map((item) => ({
        ...item,
        trashedAt: null,
        trashBatchId: null,
        revision: item.revision + 1,
        updatedAt: now,
        sourceType,
      })),
  ];

  const restored = new Map(writes.map((item) => [item.id, item]));
  const after = items.map((item) => restored.get(item.id) ?? item);
  for (const item of writes) validateLocation(item, after);

  return { writes, deletes: [], result: changed };
}
