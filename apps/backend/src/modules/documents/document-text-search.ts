import { RE2JS, RE2JSCompileException, RE2JSSyntaxException } from 're2js';

export const DOCUMENT_PATTERN_LIMIT = 256;
export const DOCUMENT_MATCH_LIMIT = 20;
/** Matches without excerpts are small, so a compact page can be larger. */
export const DOCUMENT_COMPACT_MATCH_LIMIT = 200;
const MATCH_PREVIEW_CHARS = 200;
const SURROUNDING_CHARS = 60;
const SEARCH_TIMEOUT_MS = 500;
const MATCH_COUNT_ENTRIES = 20;
const TRACKED_MATCH_TEXTS = 1000;

export type DocumentTextSearch = {
  pattern: string;
  mode: 'literal' | 'regex';
  caseSensitive: boolean;
  /** Skip matches that start or end inside a longer word. */
  wholeWord: boolean;
  /** Without excerpts, each match is only its position and text. */
  excerpts: boolean;
  offset: number;
  /** 0 returns counts only. */
  limit: number;
};

type DocumentTextMatch = {
  line: number;
  column: number;
  section?: string;
  inImageDescription?: true;
  match: string;
  excerpt?: string;
};

type MatchCount = { text: string; count: number };

export type DocumentTextSearchResult = {
  matches: DocumentTextMatch[];
  totalMatches: number;
  nextOffset: number | null;
  /** Counts per exact matched text, most frequent first, when spellings differ. */
  matchCounts?: MatchCount[];
  otherMatchCount?: number;
  imageDescriptionMatches?: number;
  /** The search stopped at its time limit; totals are lower bounds. */
  countIsPartial?: true;
};

type Marker = { index: number; end: number } & (
  { kind: 'section'; label: string } | { kind: 'image' }
);

const normalizeLineEndings = (text: string) => text.replace(/\r\n?/g, '\n');

// Extraction joins sections as "[Page 3]\n…" and appends image descriptions
// as "[Vision interpretation: Page 3]\n…", each after a blank line. A body line
// with the same shape would be read as a boundary; that only mislabels matches.
const MARKER =
  /(?:^|\n\n)\[(?:((?:Page|Slide|Sheet) [^\]\n]+)|Vision interpretation(?:: [^\]\n]*)?)\]\n/g;

function markers(content: string): Marker[] {
  return [...content.matchAll(MARKER)].map((found) => {
    const index = found.index + found[0].indexOf('[');
    const end = found.index + found[0].length - 1;

    return found[1]
      ? { index, end, kind: 'section', label: found[1] }
      : { index, end, kind: 'image' };
  });
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/** Moves a slice start forward so it never begins inside a surrogate pair. */
function safeStart(content: string, index: number) {
  return index > 0 && isLowSurrogate(content.charCodeAt(index))
    ? index + 1
    : index;
}

/** Moves a slice end back so it never ends inside a surrogate pair. */
function safeEnd(content: string, index: number) {
  return index < content.length &&
    isHighSurrogate(content.charCodeAt(index - 1))
    ? index - 1
    : index;
}

const WORD_CHARACTER = /[\p{L}\p{M}\p{N}_]/u;

function isWordCharacter(codePoint: number | undefined) {
  return (
    codePoint !== undefined &&
    WORD_CHARACTER.test(String.fromCodePoint(codePoint))
  );
}

/** The code point that ends just before index, reading a whole surrogate pair. */
function codePointBefore(content: string, index: number) {
  if (index <= 0) return undefined;
  const position =
    index > 1 &&
    isLowSurrogate(content.charCodeAt(index - 1)) &&
    isHighSurrogate(content.charCodeAt(index - 2))
      ? index - 2
      : index - 1;

  return content.codePointAt(position);
}

/**
 * Unicode-aware whole-word check. RE2's \b only knows ASCII letters, so a
 * match is kept unless a word character continues across either edge.
 */
function isWholeWord(content: string, start: number, end: number) {
  if (end === start) return true;

  const first = content.codePointAt(start);
  const last = codePointBefore(content, end);

  return !(
    (isWordCharacter(first) &&
      isWordCharacter(codePointBefore(content, start))) ||
    (isWordCharacter(last) && isWordCharacter(content.codePointAt(end)))
  );
}

function compilePattern(input: DocumentTextSearch): RE2JS {
  if (!input.pattern.length || input.pattern.length > DOCUMENT_PATTERN_LIMIT)
    throw new Error(
      `Pattern must be 1 to ${DOCUMENT_PATTERN_LIMIT} characters.`,
    );

  try {
    return RE2JS.compile(
      input.mode === 'literal'
        ? RE2JS.quote(normalizeLineEndings(input.pattern))
        : input.pattern,
      RE2JS.MULTILINE | (input.caseSensitive ? 0 : RE2JS.CASE_INSENSITIVE),
    );
  } catch (error) {
    if (
      error instanceof RE2JSSyntaxException ||
      error instanceof RE2JSCompileException
    )
      throw new Error(
        'Invalid or unsupported RE2 pattern. Check the regex syntax.',
        {
          cause: error,
        },
      );
    throw error;
  }
}

export function searchDocumentText(
  text: string,
  input: DocumentTextSearch,
): DocumentTextSearchResult {
  const maxLimit = input.excerpts
    ? DOCUMENT_MATCH_LIMIT
    : DOCUMENT_COMPACT_MATCH_LIMIT;

  if (
    !Number.isSafeInteger(input.offset) ||
    input.offset < 0 ||
    !Number.isSafeInteger(input.limit) ||
    input.limit < 0 ||
    input.limit > maxLimit
  )
    throw new Error(
      `Invalid match offset or limit. Limit is 0 to ${DOCUMENT_MATCH_LIMIT} with excerpts, or up to ${DOCUMENT_COMPACT_MATCH_LIMIT} without.`,
    );

  const deadline = performance.now() + SEARCH_TIMEOUT_MS;
  const content = normalizeLineEndings(text);
  const matcher = compilePattern(input).matcher(content);
  const boundaries = markers(content);
  const matches: DocumentTextMatch[] = [];
  const counts = new Map<string, number>();
  let untrackedMatches = 0;
  let imageDescriptionMatches = 0;
  let totalMatches = 0;
  let countIsPartial = false;
  let line = 1;
  let lineStart = 0;
  let lineEnd = content.indexOf('\n');
  let nextBoundary = 0;
  let section: string | undefined;
  let inImageDescription = false;
  let headerEnd = 0;

  while (matcher.find()) {
    // Each RE2 step is linear in the text, so checking between matches bounds
    // the whole scan. Stopping early keeps what was counted, marked partial.
    if (performance.now() > deadline) {
      countIsPartial = true;
      break;
    }

    const start = matcher.start();
    const end = matcher.end();

    for (
      let boundary = boundaries[nextBoundary];
      boundary && boundary.index <= start;
      boundary = boundaries[++nextBoundary]
    ) {
      if (boundary.kind === 'section') section = boundary.label;
      inImageDescription = boundary.kind === 'image';
      headerEnd = boundary.end;
    }

    // Boundary lines are added by extraction, not text from the file.
    if (start < headerEnd) continue;
    if (input.wholeWord && !isWholeWord(content, start, end)) continue;

    const previewEnd = safeEnd(
      content,
      Math.min(end, start + MATCH_PREVIEW_CHARS),
    );

    const match =
      content.slice(start, previewEnd) + (previewEnd < end ? '…' : '');

    if (counts.has(match) || counts.size < TRACKED_MATCH_TEXTS)
      counts.set(match, (counts.get(match) ?? 0) + 1);
    else untrackedMatches++;
    if (inImageDescription) imageDescriptionMatches++;

    const matchIndex = totalMatches++;
    if (matchIndex < input.offset || matches.length === input.limit) continue;

    while (lineEnd !== -1 && lineEnd < start) {
      line++;
      lineStart = lineEnd + 1;
      lineEnd = content.indexOf('\n', lineStart);
    }

    const position = {
      line,
      column: start - lineStart + 1,
      ...(section ? { section } : {}),
      ...(inImageDescription ? { inImageDescription: true as const } : {}),
      match,
    };

    if (!input.excerpts) {
      matches.push(position);
      continue;
    }

    const prefix = content.slice(
      safeStart(content, Math.max(0, start - SURROUNDING_CHARS)),
      start,
    );

    const suffix = content.slice(
      end,
      safeEnd(content, end + SURROUNDING_CHARS),
    );

    matches.push({ ...position, excerpt: `${prefix}${match}${suffix}` });
  }

  const endOffset = input.offset + matches.length;
  const ranked = [...counts]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count);

  const listed = ranked.slice(0, MATCH_COUNT_ENTRIES);
  const otherMatchCount =
    untrackedMatches +
    ranked
      .slice(MATCH_COUNT_ENTRIES)
      .reduce((sum, { count }) => sum + count, 0);

  return {
    matches,
    totalMatches,
    // A counts-only call has no page to continue.
    nextOffset:
      input.limit > 0 &&
      (endOffset < totalMatches ||
        (countIsPartial && matches.length === input.limit))
        ? endOffset
        : null,
    ...(ranked.length > 1 || untrackedMatches
      ? {
          matchCounts: listed,
          ...(otherMatchCount ? { otherMatchCount } : {}),
        }
      : {}),
    ...(imageDescriptionMatches ? { imageDescriptionMatches } : {}),
    ...(countIsPartial ? { countIsPartial: true as const } : {}),
  };
}
