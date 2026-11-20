import { marked, type Token, type Tokens } from "marked";
import {
  entityKey,
  matchEntityText,
  type ChatEntity,
} from "@/components/chat/chat-entities";

/**
 * A render tree for assistant Markdown, built from marked's lexer. Entity
 * mentions follow the web's rehype enrichment (entity-mentions.ts): only
 * confirmed tool records become pills, code and ordinary links are never
 * rewritten, and an explicit "Tugas:" style label narrows same-title matches.
 */

export type Mark = "strong" | "em" | "del";

export type InlineNode =
  | { type: "text"; text: string; marks: Mark[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: InlineNode[] }
  | { type: "entity"; entity: ChatEntity; label: string; marks: Mark[] }
  | { type: "break" };

export type ListItemNode = {
  task: boolean;
  checked: boolean;
  children: BlockNode[];
};

export type TableAlign = "left" | "center" | "right" | null;

export type BlockNode =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "heading"; depth: number; children: InlineNode[] }
  | { type: "list"; ordered: boolean; start: number; items: ListItemNode[] }
  | { type: "blockquote"; children: BlockNode[] }
  | { type: "code"; text: string; lang: string | null }
  | {
      type: "table";
      align: TableAlign[];
      header: InlineNode[][];
      rows: InlineNode[][][];
    }
  | { type: "hr" };

export type MarkdownDocument = {
  blocks: BlockNode[];
  /** Entity keys rendered as pills, inline or appended. */
  mentioned: Set<string>;
};

type TextAtom = { kind: "text"; text: string; marks: Mark[] };
type Atom =
  | TextAtom
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; tokens: Token[]; marks: Mark[] }
  | { kind: "break" };

type Context = {
  entities: ChatEntity[];
  mentioned: Set<string>;
  reportUnconfirmed: boolean;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** marked keeps HTML entities in text tokens; show the characters instead. */
export function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, code: string) => {
      if (code.startsWith("#x") || code.startsWith("#X"))
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      if (code.startsWith("#"))
        return String.fromCodePoint(Number(code.slice(1)));

      return ENTITIES[code.toLowerCase()] ?? match;
    }
  );
}

function hasTokens(token: Token): token is Token & { tokens: Token[] } {
  return "tokens" in token && Array.isArray(token.tokens);
}

function flatten(tokens: Token[], marks: Mark[], out: Atom[]) {
  for (const token of tokens) {
    switch (token.type) {
      case "strong":
      case "em":
      case "del":
        flatten((token as Tokens.Strong).tokens, [...marks, token.type], out);
        break;
      case "codespan":
        out.push({
          kind: "code",
          text: decodeEntities((token as Tokens.Codespan).text),
        });
        break;
      case "br":
        out.push({ kind: "break" });
        break;
      case "link": {
        const link = token as Tokens.Link;
        out.push({ kind: "link", href: link.href, tokens: link.tokens, marks });
        break;
      }
      case "image": {
        const image = token as Tokens.Image;
        out.push({
          kind: "link",
          href: image.href,
          tokens: [
            { type: "text", raw: image.text, text: image.text || image.href },
          ],
          marks,
        });
        break;
      }
      case "html":
        // Raw HTML is skipped like the web's `skipHtml`; a line break survives.
        if (/^<br\s*\/?>$/i.test((token as Tokens.HTML).text.trim()))
          out.push({ kind: "break" });
        break;
      case "checkbox":
        break;
      default:
        if (hasTokens(token) && token.tokens.length)
          flatten(token.tokens, marks, out);
        else if ("text" in token && typeof token.text === "string")
          out.push({ kind: "text", text: decodeEntities(token.text), marks });
    }
  }
}

function sameMarks(left: Mark[], right: Mark[]) {
  return (
    left.length === right.length &&
    left.every((mark, index) => right[index] === mark)
  );
}

function pushText(out: InlineNode[], text: string, marks: Mark[]) {
  if (!text) return;
  const previous = out.at(-1);
  if (previous?.type === "text" && sameMarks(previous.marks, marks))
    previous.text += text;
  else out.push({ type: "text", text, marks });
}

/** Text of `run` between two offsets, keeping each piece's emphasis. */
function sliceRun(
  run: TextAtom[],
  start: number,
  end: number,
  out: InlineNode[]
) {
  let offset = 0;

  for (const atom of run) {
    const from = Math.max(0, start - offset);
    const to = Math.min(atom.text.length, end - offset);
    if (from < to) pushText(out, atom.text.slice(from, to), atom.marks);
    offset += atom.text.length;
  }
}

/** Emphasis shared by every atom covering [start, end), so a pill keeps it. */
function commonMarks(run: TextAtom[], start: number, end: number): Mark[] {
  let offset = 0;
  let shared: Mark[] | null = null;

  for (const atom of run) {
    const from = Math.max(0, start - offset);
    const to = Math.min(atom.text.length, end - offset);
    if (from < to)
      shared = shared
        ? shared.filter((mark) => atom.marks.includes(mark))
        : [...atom.marks];
    offset += atom.text.length;
  }

  return shared ?? [];
}

const KIND_LABEL =
  /^\s*(tugas|task|pengingat|reminder|acara|agenda|event)\s*:/i;

function labelKind(value: string): ChatEntity["kind"] | undefined {
  const label = KIND_LABEL.exec(value)?.[1]?.toLowerCase();
  if (label === "tugas" || label === "task") return "task";
  if (label === "pengingat" || label === "reminder") return "reminder";
  if (label === "acara" || label === "agenda" || label === "event")
    return "event";

  return undefined;
}

function enrichRun(run: TextAtom[], context: Context, out: InlineNode[]) {
  const value = run.map((atom) => atom.text).join("");

  if (!context.entities.length) {
    sliceRun(run, 0, value.length, out);
    return;
  }

  // Older replies lack IDs. Only an explicit type label can narrow a
  // same-title collision; never infer identity from list position.
  const kind = labelKind(value);
  const candidates = kind
    ? context.entities.filter((entity) => entity.kind === kind)
    : context.entities;
  let offset = 0;

  for (const part of matchEntityText(value, candidates)) {
    const end = offset + part.text.length;

    if (part.entity) {
      context.mentioned.add(entityKey(part.entity));
      out.push({
        type: "entity",
        entity: part.entity,
        label: part.text,
        marks: commonMarks(run, offset, end),
      });
    } else sliceRun(run, offset, end, out);
    offset = end;
  }
}

function plainText(tokens: Token[], marks: Mark[]): InlineNode[] {
  const atoms: Atom[] = [];
  flatten(tokens, marks, atoms);
  const out: InlineNode[] = [];

  for (const atom of atoms) {
    if (atom.kind === "text") pushText(out, atom.text, atom.marks);
    else if (atom.kind === "code") out.push({ type: "code", text: atom.text });
    else if (atom.kind === "break") out.push({ type: "break" });
    else out.push(...plainText(atom.tokens, atom.marks));
  }

  return out;
}

function linkNodes(
  atom: Extract<Atom, { kind: "link" }>,
  context: Context,
  out: InlineNode[]
) {
  const reference = /^#(task|note|event|reminder)\//.exec(atom.href);

  if (reference) {
    const kind = reference[1];
    const entity = context.entities.find(
      (candidate) =>
        candidate.kind === kind &&
        atom.href === `#${kind}/${encodeURIComponent(candidate.id)}`
    );

    if (entity) {
      context.mentioned.add(entityKey(entity));
      // The confirmed title wins over a possibly misleading link label.
      out.push({
        type: "entity",
        entity,
        label: entity.title,
        marks: atom.marks,
      });
    } else {
      // Degraded display: keep the label, never expose an unverified link.
      if (context.reportUnconfirmed)
        console.warn(`Unconfirmed ${kind} reference in assistant response`);
      out.push(...plainText(atom.tokens, atom.marks));
    }

    return;
  }

  const file = context.entities.find(
    (candidate) =>
      candidate.kind === "file" && candidate.url && candidate.url === atom.href
  );

  if (file) {
    context.mentioned.add(entityKey(file));
    out.push({
      type: "entity",
      entity: file,
      label: file.title,
      marks: atom.marks,
    });

    return;
  }

  out.push({
    type: "link",
    href: atom.href,
    children: plainText(atom.tokens, atom.marks),
  });
}

function inline(tokens: Token[], context: Context): InlineNode[] {
  const atoms: Atom[] = [];
  flatten(tokens, [], atoms);
  const out: InlineNode[] = [];

  for (let index = 0; index < atoms.length;) {
    const atom = atoms[index]!;

    if (atom.kind === "text") {
      const run: TextAtom[] = [];
      while (index < atoms.length && atoms[index]!.kind === "text")
        run.push(atoms[index++] as TextAtom);
      enrichRun(run, context, out);
      continue;
    }

    if (atom.kind === "link") linkNodes(atom, context, out);
    else if (atom.kind === "code") out.push({ type: "code", text: atom.text });
    else out.push({ type: "break" });
    index += 1;
  }

  return out;
}

function inlineOf(token: Token, context: Context): InlineNode[] {
  if (hasTokens(token)) return inline(token.tokens, context);
  if ("text" in token && typeof token.text === "string")
    return inline(
      [{ type: "text", raw: token.text, text: token.text }],
      context
    );

  return [];
}

function blocks(tokens: Token[], context: Context): BlockNode[] {
  const out: BlockNode[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "heading":
        out.push({
          type: "heading",
          depth: (token as Tokens.Heading).depth,
          children: inlineOf(token, context),
        });
        break;
      case "paragraph":
      case "text":
        out.push({ type: "paragraph", children: inlineOf(token, context) });
        break;
      case "list": {
        const list = token as Tokens.List;
        out.push({
          type: "list",
          ordered: list.ordered,
          start: typeof list.start === "number" ? list.start : 1,
          items: list.items.map((item) => ({
            task: item.task,
            checked: Boolean(item.checked),
            children: blocks(
              item.tokens.filter((child) => child.type !== "checkbox"),
              context
            ),
          })),
        });
        break;
      }
      case "blockquote":
        out.push({
          type: "blockquote",
          children: blocks((token as Tokens.Blockquote).tokens, context),
        });
        break;
      case "code": {
        const code = token as Tokens.Code;
        out.push({ type: "code", text: code.text, lang: code.lang || null });
        break;
      }
      case "table": {
        const table = token as Tokens.Table;
        out.push({
          type: "table",
          align: table.align,
          header: table.header.map((cell) => inline(cell.tokens, context)),
          rows: table.rows.map((row) =>
            row.map((cell) => inline(cell.tokens, context))
          ),
        });
        break;
      }
      case "hr":
        out.push({ type: "hr" });
        break;
      default:
        // space, html (skipped like the web), def
        break;
    }
  }

  return out;
}

/**
 * Parses assistant Markdown. With `appendUnmentioned`, mutated records the
 * reply never names ("Task created.") are appended as a final row of pills;
 * streaming text passes `false` because its tool snapshots are incomplete.
 */
export function parseAssistantMarkdown(
  content: string,
  entities: ChatEntity[] = [],
  appendUnmentioned = true
): MarkdownDocument {
  const context: Context = {
    entities,
    mentioned: new Set(),
    reportUnconfirmed: appendUnmentioned,
  };
  const parsed = blocks(marked.lexer(content, { gfm: true }), context);
  const unmentioned = entities.filter(
    (entity) => entity.mutation && !context.mentioned.has(entityKey(entity))
  );

  if (appendUnmentioned && unmentioned.length) {
    const children: InlineNode[] = [];

    unmentioned.forEach((entity, index) => {
      if (index) children.push({ type: "text", text: " ", marks: [] });
      context.mentioned.add(entityKey(entity));
      children.push({ type: "entity", entity, label: entity.title, marks: [] });
    });
    parsed.push({ type: "paragraph", children });
  }

  return { blocks: parsed, mentioned: context.mentioned };
}

/** Plain text of a message for copying and sharing. */
export function markdownToPlainText(content: string): string {
  const { blocks: parsed } = parseAssistantMarkdown(content, [], false);
  const inlineText = (nodes: InlineNode[]): string =>
    nodes
      .map((node) =>
        node.type === "break"
          ? "\n"
          : node.type === "link"
            ? inlineText(node.children)
            : node.type === "entity"
              ? node.label
              : node.text
      )
      .join("");
  const blockText = (node: BlockNode, prefix = ""): string => {
    switch (node.type) {
      case "paragraph":
      case "heading":
        return prefix + inlineText(node.children);
      case "list":
        return node.items
          .map((item, index) => {
            const marker = item.task
              ? item.checked
                ? "[x] "
                : "[ ] "
              : node.ordered
                ? `${node.start + index}. `
                : "• ";

            return item.children
              .map((child, childIndex) =>
                blockText(
                  child,
                  childIndex === 0 ? prefix + marker : `${prefix}   `
                )
              )
              .join("\n");
          })
          .join("\n");
      case "blockquote":
        return node.children
          .map((child) => blockText(child, `${prefix}> `))
          .join("\n");
      case "code":
        return node.text;
      case "table":
        return [node.header, ...node.rows]
          .map((row) => row.map(inlineText).join("\t"))
          .join("\n");
      case "hr":
        return "———";
    }
  };

  return parsed.map((node) => blockText(node)).join("\n\n");
}
