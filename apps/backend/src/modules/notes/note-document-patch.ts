import { isDeepStrictEqual } from 'node:util';
import {
  appendPlainText,
  richTextToPlainText,
  type RichTextDocument,
} from '../../shared/rich-text';

/** Capture exact written lines, including the full line changed by a correction. */
export function addedNoteLines(
  before: RichTextDocument,
  after: RichTextDocument,
): string[] {
  const remaining = richTextToPlainText(before).split('\n');

  return richTextToPlainText(after)
    .split('\n')
    .filter((line) => {
      if (!line.trim()) return false;
      const index = remaining.indexOf(line);
      if (index < 0) return true;
      remaining.splice(index, 1);

      return false;
    });
}

export type NoteDocumentPatch = {
  append: string;
  replacements: Array<{ before: string; after: string }>;
  blockReplacements?: Array<{ before: unknown[]; after: unknown[] }>;
};

/** Replace one unambiguous text occurrence, preserving every mark and link node. */
export function applyNoteDocumentPatch(
  document: RichTextDocument,
  patch: NoteDocumentPatch,
): RichTextDocument {
  const blocks = [...document.content];

  for (const replacement of patch.blockReplacements ?? []) {
    if (!replacement.before.length)
      throw new Error('A structural replacement requires original blocks.');
    const matches = blocks.flatMap((_, index) =>
      isDeepStrictEqual(
        blocks.slice(index, index + replacement.before.length),
        replacement.before,
      )
        ? [index]
        : [],
    );

    if (matches.length !== 1)
      throw new Error(
        'A structural replacement must identify exactly one current block sequence.',
      );
    for (const node of replacement.after) validateNode(node);
    blocks.splice(
      matches[0]!,
      replacement.before.length,
      ...(replacement.after as RichTextDocument['content']),
    );
  }

  let result: unknown = { type: 'doc', content: blocks };

  for (const replacement of patch.replacements) {
    if (!replacement.before)
      throw new Error('A note replacement requires non-empty original text.');
    let matches = 0;

    const visit = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(visit);
      if (!value || typeof value !== 'object') return value;
      const node = value as Record<string, unknown>;

      if (node.type === 'text' && typeof node.text === 'string') {
        matches += node.text.split(replacement.before).length - 1;

        return {
          ...node,
          text: node.text.replace(replacement.before, replacement.after),
        };
      }

      return node.content ? { ...node, content: visit(node.content) } : node;
    };

    result = visit(result);
    if (matches !== 1)
      throw new Error(
        'A note replacement must identify exactly one current text occurrence.',
      );
  }

  const edited = result as RichTextDocument;

  return patch.append.trim() ? appendPlainText(edited, patch.append) : edited;
}

function validateNode(value: unknown, depth = 0): void {
  if (depth > 24 || !value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('A structural note edit requires bounded rich-text nodes.');
  const node = value as Record<string, unknown>;
  if (typeof node.type !== 'string' || !node.type)
    throw new Error('A rich-text node requires its type.');
  if (node.type === 'text' && typeof node.text !== 'string')
    throw new Error('A text node requires text.');

  if (node.content !== undefined) {
    if (!Array.isArray(node.content))
      throw new Error('Rich-text node content must be an array.');
    for (const child of node.content) validateNode(child, depth + 1);
  }
}
