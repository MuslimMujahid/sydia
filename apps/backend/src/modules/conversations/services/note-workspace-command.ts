import { createHash } from 'node:crypto';
import { plainTextToRichText } from '../../../shared/rich-text';
import type { NotesService } from '../../notes/notes.service';
import type { WorkspaceCommand } from '../../notes/workspace-rules';

function text(input: Record<string, unknown>, key: string, required = true) {
  const value = input[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${key} must be non-empty text.`);

  return value.trim();
}

function parent(input: Record<string, unknown>) {
  return input.parentId === null ? null : text(input, 'parentId', false);
}

/** Shared argument semantics for actual workspace writes and provisional previews. */
export function prepareNoteWorkspaceCommand(
  notes: Pick<NotesService, 'document'>,
  tool: string,
  input: Record<string, unknown>,
  identity: { userId: string; requestKey: string },
): WorkspaceCommand {
  if (
    tool === 'create_custom_note' ||
    (tool === 'manage_notes_item' && input.action === 'create_folder')
  ) {
    const body = text(input, 'text', false);

    return {
      action: 'create',
      id: createHash('sha256')
        .update(`${identity.userId}:${identity.requestKey}`)
        .digest('hex'),
      kind: tool === 'create_custom_note' ? 'note' : 'folder',
      title: text(input, 'title')!,
      parentId: parent(input) ?? null,
      ...(tool !== 'create_custom_note'
        ? {}
        : input.content !== undefined
          ? { content: notes.document(input.content) }
          : body === undefined
            ? {}
            : { content: plainTextToRichText(body) }),
    };
  }

  if (tool !== 'update_custom_note' && tool !== 'manage_notes_item')
    throw new Error('Unknown workspace note tool.');
  const id = text(input, 'id')!;
  if (!Number.isInteger(input.revision) || Number(input.revision) < 1)
    throw new Error(
      'Read the current item and pass its revision before editing it.',
    );
  const revision = input.revision as number;

  if (tool === 'update_custom_note')
    return {
      action: 'update',
      id,
      revision,
      title: text(input, 'title', false),
      parentId: parent(input),
      ...(input.content === undefined
        ? {}
        : { content: notes.document(input.content) }),
    };

  const action = text(input, 'action');
  if (action === 'rename')
    return { action: 'update', id, revision, title: text(input, 'title')! };

  if (action === 'move') {
    const destination = parent(input);
    if (destination === undefined)
      throw new Error('Choose parentId explicitly; null moves to the root.');

    return { action: 'update', id, revision, parentId: destination };
  }

  if (action !== 'trash' && action !== 'restore' && action !== 'delete')
    throw new Error('Unknown workspace operation.');
  if (action === 'delete' && input.permanentDeletionRequested !== true)
    throw new Error(
      'Ordinary deletion moves to Trash. Permanent deletion requires an explicit user request.',
    );

  return {
    action,
    id,
    revision,
    title: text(input, 'title', false),
    parentId: parent(input),
  };
}
