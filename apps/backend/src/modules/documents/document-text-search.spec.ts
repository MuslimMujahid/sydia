import { expect, test } from '@jest/globals';
import {
  searchDocumentText,
  type DocumentTextSearch,
} from './document-text-search';

function options(
  pattern: string,
  overrides: Partial<DocumentTextSearch> = {},
): DocumentTextSearch {
  return {
    pattern,
    mode: 'literal',
    caseSensitive: true,
    limit: 10,
    offset: 0,
    ...overrides,
  };
}

test('literal search preserves spaces and treats regex characters literally', () => {
  const result = searchDocumentText('A+B  A+B\nAAB', options(' A+B'));

  expect(result).toEqual({
    totalMatches: 1,
    nextOffset: null,
    matches: [{ line: 1, column: 5, match: ' A+B', excerpt: 'A+B  A+B\nAAB' }],
  });
});

test('case-insensitive search preserves the original spelling of a match', () => {
  const result = searchDocumentText(
    'Résumé RÉSUMÉ',
    options('résumé', { caseSensitive: false }),
  );

  expect(result.matches.map(({ match }) => match)).toEqual([
    'Résumé',
    'RÉSUMÉ',
  ]);
});

test('paginated regex results include a count for the whole document', () => {
  const result = searchDocumentText(
    'INV-101\r\nINV-202\nInvalid: INV-303\nINV-404',
    options('^INV-\\d{3}$', { mode: 'regex', limit: 1, offset: 1 }),
  );

  expect(result).toMatchObject({
    totalMatches: 3,
    nextOffset: 2,
    matches: [{ line: 2, column: 1, match: 'INV-202' }],
  });
});

test('a long regex match returns a bounded preview', () => {
  const result = searchDocumentText(
    'A'.repeat(900),
    options('A+', { mode: 'regex' }),
  );

  expect(result.matches).toEqual([
    {
      line: 1,
      column: 1,
      match: `${'A'.repeat(200)}…`,
      excerpt: `${'A'.repeat(200)}…`,
    },
  ]);
  expect(result.totalMatches).toBe(1);
});

test('a successful search with no occurrences returns an exact count of zero', () => {
  const result = searchDocumentText('invoice', options('Invoice'));

  expect(result).toEqual({ matches: [], totalMatches: 0, nextOffset: null });
});

test.each(['[', '(?=invoice)', '(invoice)\\1'])(
  'unsupported regex %s returns a validation error',
  (pattern) => {
    expect(() =>
      searchDocumentText('invoice', options(pattern, { mode: 'regex' })),
    ).toThrow('Invalid or unsupported RE2 pattern.');
  },
);
