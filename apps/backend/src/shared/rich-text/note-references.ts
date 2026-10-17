import type { RichTextDocument } from './document';

export type NoteReference = { target: string | null; label: string };

/** Walk only JSON node content, with the same bounded shape as the editor. */
export function noteReferences(document: RichTextDocument): NoteReference[] {
  const references: NoteReference[] = [];
  const pending: Array<{ value: unknown; depth: number }> = [
    { value: document, depth: 0 },
  ];

  let count = 0;

  while (pending.length) {
    const entry = pending.pop()!;
    if (++count > 4000 || entry.depth > 24)
      throw new Error('Note document exceeds reference traversal limits.');
    const node = entry.value;
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;

    if ('type' in node && node.type === 'noteLink') {
      if (!('attrs' in node) || !node.attrs || typeof node.attrs !== 'object')
        throw new Error('Invalid note reference.');
      const attrs = node.attrs;
      if (
        !('label' in attrs) ||
        typeof attrs.label !== 'string' ||
        !('target' in attrs) ||
        !(attrs.target === null || typeof attrs.target === 'string')
      )
        throw new Error('Invalid note reference attributes.');
      references.push({ target: attrs.target, label: attrs.label });
    }

    if ('content' in node && Array.isArray(node.content))
      for (const child of node.content)
        pending.push({ value: child, depth: entry.depth + 1 });
  }

  return references;
}
