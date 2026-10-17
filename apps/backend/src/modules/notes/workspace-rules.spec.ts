import { describe, expect, test } from '@jest/globals';
import type { WorkspaceItem } from '../../database/entities';
import { plainTextToRichText } from '../../shared/rich-text';
import { applyWorkspaceCommand } from './workspace-rules';

const now = new Date('2026-10-18T00:00:00Z');
const context = { userId: 'owner', now, sourceType: 'dashboard' };

function item(id: string, changes: Partial<WorkspaceItem> = {}): WorkspaceItem {
  return {
    id,
    userId: 'owner',
    kind: 'note',
    title: id,
    parentId: null,
    content: plainTextToRichText('Original text'),
    text: 'Original text',
    revision: 1,
    indexPending: false,
    indexSignature: null,
    trashedAt: null,
    trashBatchId: null,
    sourceType: 'dashboard',
    createdAt: now,
    updatedAt: now,
    ...changes,
  };
}

function apiFailure(message: string) {
  return expect.objectContaining({
    response: expect.objectContaining({
      error: expect.objectContaining({
        message: expect.stringContaining(message),
      }),
    }),
  });
}

describe('Notes workspace rules', () => {
  test('new empty notes remain saved documents', () => {
    const result = applyWorkspaceCommand(
      [],
      { action: 'create', id: 'new', kind: 'note', parentId: null },
      context,
    );

    expect(result.result).toMatchObject({
      title: 'Untitled',
      text: '',
      content: { type: 'doc', content: [] },
    });
    expect(result.writes).toHaveLength(1);
  });

  test('new notes receive distinct placeholder titles in the same folder', () => {
    const result = applyWorkspaceCommand(
      [item('existing', { title: 'Untitled' })],
      { action: 'create', id: 'new', kind: 'note', parentId: null },
      context,
    );

    expect(result.result.title).toBe('Untitled 2');
  });

  test('replaying a create request returns the same item without another write', () => {
    const existing = item('request-id');
    const result = applyWorkspaceCommand(
      [existing],
      { action: 'create', id: 'request-id', kind: 'note', parentId: null },
      context,
    );

    expect(result).toEqual({ writes: [], deletes: [], result: existing });
  });

  test('identical titles are allowed in different folders', () => {
    const result = applyWorkspaceCommand(
      [
        item('folder', { kind: 'folder' }),
        item('root-note', { title: 'Meeting' }),
      ],
      {
        action: 'create',
        id: 'new',
        kind: 'note',
        parentId: 'folder',
        title: 'Meeting',
      },
      context,
    );

    expect(result.result.parentId).toBe('folder');
  });

  test('moving into a sibling title collision rejects the whole change', () => {
    const snapshot = [
      item('folder', { kind: 'folder' }),
      item('a', { title: 'Meeting' }),
      item('b', { title: 'meeting', parentId: 'folder' }),
    ];

    expect(() =>
      applyWorkspaceCommand(
        snapshot,
        { action: 'update', id: 'a', revision: 1, parentId: 'folder' },
        context,
      ),
    ).toThrow(apiFailure('Nama sudah digunakan'));
    expect(snapshot[1]!.parentId).toBeNull();
  });

  test('a folder cannot move into its descendant', () => {
    const snapshot = [
      item('parent', { kind: 'folder' }),
      item('child', { kind: 'folder', parentId: 'parent' }),
    ];

    expect(() =>
      applyWorkspaceCommand(
        snapshot,
        { action: 'update', id: 'parent', revision: 1, parentId: 'child' },
        context,
      ),
    ).toThrow(apiFailure('subfoldernya'));
  });

  test('a destination outside the owner snapshot cannot receive a note', () => {
    expect(() =>
      applyWorkspaceCommand(
        [item('note')],
        {
          action: 'update',
          id: 'note',
          revision: 1,
          parentId: 'another-owner-folder',
        },
        context,
      ),
    ).toThrow(apiFailure('Folder tujuan tidak tersedia'));
  });

  test('stale edits preserve the existing document', () => {
    const existing = item('note', { revision: 2 });
    expect(() =>
      applyWorkspaceCommand(
        [existing],
        {
          action: 'update',
          id: 'note',
          revision: 1,
          content: plainTextToRichText('Stale replacement'),
        },
        context,
      ),
    ).toThrow(apiFailure('Catatan telah berubah'));
    expect(existing.text).toBe('Original text');
  });

  test('trashing a folder includes all live descendants in the same batch', () => {
    const result = applyWorkspaceCommand(
      [
        item('folder', { kind: 'folder' }),
        item('child', { kind: 'folder', parentId: 'folder' }),
        item('note', { parentId: 'child' }),
      ],
      { action: 'trash', id: 'folder', revision: 1 },
      context,
    );

    expect(result.writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'folder',
          trashedAt: now,
          trashBatchId: 'folder:1',
        }),
        expect.objectContaining({
          id: 'child',
          trashedAt: now,
          trashBatchId: 'folder:1',
        }),
        expect.objectContaining({
          id: 'note',
          trashedAt: now,
          trashBatchId: 'folder:1',
        }),
      ]),
    );
  });

  test('restoring a folder restores its original hierarchy', () => {
    const snapshot = [
      item('folder', { kind: 'folder', trashedAt: now, trashBatchId: 'batch' }),
      item('note', {
        parentId: 'folder',
        trashedAt: now,
        trashBatchId: 'batch',
      }),
    ];

    const result = applyWorkspaceCommand(
      snapshot,
      { action: 'restore', id: 'folder', revision: 1 },
      context,
    );

    expect(result.writes).toEqual([
      expect.objectContaining({
        id: 'folder',
        trashedAt: null,
        parentId: null,
      }),
      expect.objectContaining({
        id: 'note',
        trashedAt: null,
        parentId: 'folder',
      }),
    ]);
  });

  test('restoring a note with a trashed parent requires a destination', () => {
    const snapshot = [
      item('folder', { kind: 'folder', trashedAt: now, trashBatchId: 'batch' }),
      item('note', {
        parentId: 'folder',
        trashedAt: now,
        trashBatchId: 'batch',
      }),
    ];

    expect(() =>
      applyWorkspaceCommand(
        snapshot,
        { action: 'restore', id: 'note', revision: 1 },
        context,
      ),
    ).toThrow(apiFailure('Folder tujuan tidak tersedia'));
  });

  test('a restore can choose a new name to resolve an active sibling collision', () => {
    const snapshot = [
      item('deleted', {
        title: 'Meeting',
        trashedAt: now,
        trashBatchId: 'batch',
      }),
      item('active', { title: 'Meeting' }),
    ];

    const result = applyWorkspaceCommand(
      snapshot,
      {
        action: 'restore',
        id: 'deleted',
        revision: 1,
        title: 'Meeting restored',
      },
      context,
    );

    expect(result.result).toMatchObject({
      title: 'Meeting restored',
      trashedAt: null,
    });
  });

  test('permanent deletion requires moving an item to Trash first', () => {
    expect(() =>
      applyWorkspaceCommand(
        [item('note')],
        { action: 'delete', id: 'note', revision: 1 },
        context,
      ),
    ).toThrow(apiFailure('Pindahkan ke Sampah'));
  });

  test('permanent folder deletion emits descendants before their parent', () => {
    const snapshot = [
      item('folder', { kind: 'folder', trashedAt: now }),
      item('note', { parentId: 'folder', trashedAt: now }),
    ];

    const result = applyWorkspaceCommand(
      snapshot,
      { action: 'delete', id: 'folder', revision: 1 },
      context,
    );

    expect(result.deletes).toEqual(['note', 'folder']);
  });

  test('moving a note preserves resolved link identities in its document', () => {
    const content = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'noteLink',
              attrs: { target: 'daily:2026-10-17', label: 'Yesterday' },
            },
          ],
        },
      ],
    };

    const result = applyWorkspaceCommand(
      [item('folder', { kind: 'folder' }), item('note', { content })],
      {
        action: 'update',
        id: 'note',
        revision: 1,
        parentId: 'folder',
        title: 'Renamed',
      },
      context,
    );

    expect(result.result.content).toEqual(content);
  });
});
