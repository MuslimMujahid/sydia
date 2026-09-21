import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';

/** Guards against a hostile or corrupt payload exhausting the walker. */
const MAX_DEPTH = 24;
const MAX_NODES = 4000;
const MAX_TEXT_LENGTH = 40_000;

/** Block-level nodes own a line; everything else flows inside one. */
const BLOCK_NODES: Record<string, true> = {
  paragraph: true,
  heading: true,
  listItem: true,
  blockquote: true,
  codeBlock: true,
  tableCell: true,
  tableHeader: true,
};

const BULLET_LINE = /^\s*[-*•]\s+(.*)$/;
const ORDERED_LINE = /^\s*\d+[.)]\s+(.*)$/;
const HEADING_LINE = /^\s*(#{1,6})\s+(.*)$/;

/**
 * The editor exposes heading levels 1–3, so a deeper marker clamps to the
 * deepest real level instead of producing a node it cannot render.
 */
const MAX_HEADING_LEVEL = 3;

/**
 * A Tiptap document as the editor serialises it. The node vocabulary belongs to
 * the editor, so this is a structurally validated container — not a schema the
 * server would have to keep in step with the toolbar.
 */
export type RichTextDocument = {
  type: 'doc';
  content: Prisma.InputJsonValue[];
};

type JsonNode = Record<string, unknown>;

export function emptyRichTextDocument(): RichTextDocument {
  return { type: 'doc', content: [] };
}

function isNode(value: unknown): value is JsonNode {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function paragraphOf(line: string): Prisma.InputJsonValue {
  return { type: 'paragraph', content: [{ type: 'text', text: line }] };
}

function headingOf(level: number, line: string): Prisma.InputJsonValue {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text: line }],
  };
}

/**
 * Accepts a document only in the shape the editor actually serialises. Nodes
 * are stored verbatim and only the container is validated: refusing a document
 * because it uses a node the server has never heard of would break the editor
 * the first time a toolbar item is added.
 */
export function parseRichTextDocument(value: unknown): RichTextDocument | null {
  if (!isNode(value) || value.type !== 'doc') return null;
  if (value.content !== undefined && !Array.isArray(value.content)) return null;

  return {
    type: 'doc',
    content: (Array.isArray(value.content)
      ? value.content
      : []) as Prisma.InputJsonValue[],
  };
}

function collectText(
  node: JsonNode,
  depth: number,
  budget: { nodes: number },
): string {
  if (depth > MAX_DEPTH || budget.nodes-- <= 0) return '';

  if (node.type === 'text')
    return typeof node.text === 'string' ? node.text : '';

  if (node.type === 'hardBreak') return '\n';

  const inner = (Array.isArray(node.content) ? node.content : [])
    .map((child) =>
      isNode(child) ? collectText(child, depth + 1, budget) : '',
    )
    .join('');

  if (node.type === 'listItem') return `${inner}\n`;

  return BLOCK_NODES[String(node.type)] ? `${inner}\n` : inner;
}

/**
 * Flattens a stored document to the plain text that gets embedded and shown in
 * list previews. Marks (bold, links, font size) carry no retrievable meaning,
 * so only text and block boundaries survive.
 */
export function richTextToPlainText(document: RichTextDocument): string {
  const budget = { nodes: MAX_NODES };

  return document.content
    .map((child) => (isNode(child) ? collectText(child, 1, budget) : ''))
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

/**
 * Serialises a stored document back to the same marked-up text
 * `plainTextToRichText` accepts, so the assistant can read a note and rewrite it
 * without silently flattening its headings and lists. The two functions are
 * deliberate inverses: reading a note through this and writing it back with the
 * same markers reproduces the original structure.
 */
export function richTextToMarkedText(document: RichTextDocument): string {
  const budget = { nodes: MAX_NODES };

  return document.content
    .map((child) => (isNode(child) ? collectMarkedText(child, 1, budget) : ''))
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

function collectMarkedText(
  node: JsonNode,
  depth: number,
  budget: { nodes: number },
): string {
  if (depth > MAX_DEPTH || budget.nodes-- <= 0) return '';

  if (node.type === 'text')
    return typeof node.text === 'string' ? node.text : '';

  if (node.type === 'hardBreak') return '\n';

  const children = (Array.isArray(node.content) ? node.content : []).filter(
    isNode,
  );

  if (node.type === 'heading') {
    const level = Math.min(
      typeof node.attrs === 'object' && node.attrs !== null
        ? Number((node.attrs as JsonNode).level) || 1
        : 1,
      MAX_HEADING_LEVEL,
    );

    return `${'#'.repeat(level)} ${collectMarkedText(children[0] ?? {}, depth + 1, budget)}\n`;
  }

  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return children
      .map((item, position) => {
        const marker = node.type === 'orderedList' ? `${position + 1}. ` : '- ';
        const body = (Array.isArray(item.content) ? item.content : [])
          .filter(isNode)
          .map((child) => collectMarkedText(child, depth + 1, budget))
          .join('')
          .replace(/\n+$/, '');

        return `${marker}${body}\n`;
      })
      .join('');
  }

  const inner = children
    .map((child) => collectMarkedText(child, depth + 1, budget))
    .join('');

  return BLOCK_NODES[String(node.type)] ? `${inner}\n` : inner;
}

/**
 * Turns writer input into a document the editor can open. Consecutive bulleted
 * or numbered lines collapse into a real list so a dictated list does not
 * arrive as literal dash-prefixed paragraphs.
 */
export function plainTextToRichText(text: string): RichTextDocument {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const content: Prisma.InputJsonValue[] = [];
  let pending: string[] = [];
  let pendingKind: 'bulletList' | 'orderedList' | null = null;

  function flush() {
    if (pendingKind)
      content.push({
        type: pendingKind,
        content: pending.map((item) => ({
          type: 'listItem',
          content: [paragraphOf(item)],
        })),
      });
    else for (const line of pending) content.push(paragraphOf(line));

    pending = [];
    pendingKind = null;
  }

  for (const raw of lines) {
    // A heading owns its line, so it closes any list being accumulated rather
    // than being absorbed into it.
    const heading = HEADING_LINE.exec(raw);

    if (heading) {
      if (pendingKind) flush();

      const level = Math.min(heading[1]!.length, MAX_HEADING_LEVEL);
      const title = heading[2]!.trim();

      // `#` alone carries no text; keeping it would store an empty heading.
      if (title !== '') content.push(headingOf(level, title));
      continue;
    }

    const bullet = BULLET_LINE.exec(raw);
    const ordered = bullet ? null : ORDERED_LINE.exec(raw);
    const kind = bullet
      ? ('bulletList' as const)
      : ordered
        ? ('orderedList' as const)
        : null;

    if (kind) {
      if (kind !== pendingKind) {
        flush();
        pendingKind = kind;
      }

      pending.push((bullet?.[1] ?? ordered?.[1] ?? '').trim());
      continue;
    }

    if (pendingKind) flush();
    // A blank line separates paragraphs rather than becoming one.
    if (raw.trim() !== '') pending.push(raw.trim());
  }

  flush();

  return { type: 'doc', content };
}

/**
 * Appends text to an existing document as new trailing blocks, so the assistant
 * can add to a day the user already wrote in without disturbing their prose.
 */
export function appendPlainText(
  document: RichTextDocument,
  text: string,
): RichTextDocument {
  return {
    type: 'doc',
    content: [...document.content, ...plainTextToRichText(text).content],
  };
}

/**
 * Content fingerprint of a note's retrieval text. The indexer compares it with
 * the stored signature so a save that only changed formatting — or a repeated
 * job for the same text — never pays for embedding twice.
 */
export function indexSignature(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
