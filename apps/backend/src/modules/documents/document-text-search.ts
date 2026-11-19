import { RE2JS, RE2JSCompileException, RE2JSSyntaxException } from 're2js';

export const DOCUMENT_PATTERN_LIMIT = 256;
export const DOCUMENT_MATCH_LIMIT = 20;
const MATCH_PREVIEW_CHARS = 200;
const SURROUNDING_CHARS = 60;
const SEARCH_TIMEOUT_MS = 500;

export type DocumentTextSearch = {
  pattern: string;
  mode: 'literal' | 'regex';
  caseSensitive: boolean;
  offset: number;
  limit: number;
};

type DocumentTextMatch = {
  line: number;
  column: number;
  match: string;
  excerpt: string;
};

const normalizeLineEndings = (text: string) => text.replace(/\r\n?/g, '\n');

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

export function searchDocumentText(text: string, input: DocumentTextSearch) {
  if (
    !Number.isSafeInteger(input.offset) ||
    input.offset < 0 ||
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > DOCUMENT_MATCH_LIMIT
  )
    throw new Error('Invalid match offset or limit.');

  const deadline = performance.now() + SEARCH_TIMEOUT_MS;
  const content = normalizeLineEndings(text);
  const matcher = compilePattern(input).matcher(content);
  const matches: DocumentTextMatch[] = [];
  let totalMatches = 0;
  let line = 1;
  let lineStart = 0;
  let lineEnd = content.indexOf('\n');

  const checkDeadline = () => {
    if (performance.now() > deadline)
      throw new Error(
        'Document search timed out. Try a more specific pattern.',
      );
  };

  while (matcher.find()) {
    checkDeadline();
    const matchIndex = totalMatches++;
    if (matchIndex < input.offset || matches.length === input.limit) continue;

    const start = matcher.start();
    const end = matcher.end();

    while (lineEnd !== -1 && lineEnd < start) {
      line++;
      lineStart = lineEnd + 1;
      lineEnd = content.indexOf('\n', lineStart);
    }

    const previewEnd = Math.min(end, start + MATCH_PREVIEW_CHARS);
    const match =
      content.slice(start, previewEnd) + (previewEnd < end ? '…' : '');

    const prefix = content.slice(Math.max(0, start - SURROUNDING_CHARS), start);
    const suffix = content.slice(end, end + SURROUNDING_CHARS);

    matches.push({
      line,
      column: start - lineStart + 1,
      match,
      excerpt: `${prefix}${match}${suffix}`,
    });
  }

  checkDeadline();

  const endOffset = input.offset + matches.length;

  return {
    matches,
    totalMatches,
    nextOffset: endOffset < totalMatches ? endOffset : null,
  };
}
