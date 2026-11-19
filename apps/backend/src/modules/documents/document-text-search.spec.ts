import { expect, jest, test } from '@jest/globals';
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
    wholeWord: false,
    excerpts: true,
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

test('counts each spelling separately when a search matches several', () => {
  const result = searchDocumentText(
    'Puskesmas puskesmas PUSKESMAS Puskesmas',
    options('puskesmas', { caseSensitive: false }),
  );

  expect(result).toMatchObject({
    totalMatches: 4,
    matchCounts: [
      { text: 'Puskesmas', count: 2 },
      { text: 'puskesmas', count: 1 },
      { text: 'PUSKESMAS', count: 1 },
    ],
  });
});

test('counts each alternative of a regex separately', () => {
  const result = searchDocumentText(
    'wilayah kerja, Desa, wilayah kerja, Kelurahan',
    options('Desa|Kelurahan|wilayah kerja', { mode: 'regex' }),
  );

  expect(result.matchCounts).toEqual([
    { text: 'wilayah kerja', count: 2 },
    { text: 'Desa', count: 1 },
    { text: 'Kelurahan', count: 1 },
  ]);
});

test('a single spelling needs no per-spelling counts', () => {
  const result = searchDocumentText('UPTD dan UPTD', options('UPTD'));

  expect(result).toEqual(
    expect.not.objectContaining({ matchCounts: expect.anything() }),
  );
  expect(result.totalMatches).toBe(2);
});

test('lists the twenty most frequent spellings and totals the rest', () => {
  const text = Array.from({ length: 25 }, (_, n) => `Pasal ${n + 1}`).join(
    '\n',
  );

  const result = searchDocumentText(
    `${text}\nPasal 1`,
    options('^Pasal \\d+$', { mode: 'regex' }),
  );

  expect(result.matchCounts).toHaveLength(20);
  expect(result.matchCounts?.[0]).toEqual({ text: 'Pasal 1', count: 2 });
  expect(result.otherMatchCount).toBe(5);
  expect(result.totalMatches).toBe(26);
});

test('reports the page of each match and ignores the page labels themselves', () => {
  const result = searchDocumentText(
    '[Page 1]\nIntro\n\n[Page 2]\nPage two mentions the budget',
    options('page', { caseSensitive: false }),
  );

  expect(result.totalMatches).toBe(1);
  expect(result.matches).toEqual([
    expect.objectContaining({ line: 5, column: 1, section: 'Page 2' }),
  ]);
});

test('marks matches inside an image description and counts them', () => {
  const result = searchDocumentText(
    '[Slide 1]\nBudget table\n\n[Vision interpretation: Slide 1]\nA chart of the budget\n\n[Slide 2]\nBudget notes',
    options('budget', { caseSensitive: false }),
  );

  expect(result.imageDescriptionMatches).toBe(1);
  expect(
    result.matches.map(({ section, inImageDescription }) => ({
      section,
      inImageDescription,
    })),
  ).toEqual([
    { section: 'Slide 1', inImageDescription: undefined },
    { section: 'Slide 1', inImageDescription: true },
    { section: 'Slide 2', inImageDescription: undefined },
  ]);
});

test('a body line shaped like a page label without a blank line before it is text', () => {
  const result = searchDocumentText(
    'See\n[Page 9]\nfor details',
    options('Page 9'),
  );

  expect(result.totalMatches).toBe(1);
  expect(result.matches[0]).not.toHaveProperty('section');
});

test('excerpts never split an emoji in half', () => {
  const result = searchDocumentText(
    `${'😀'.repeat(40)}xtargey${'😀'.repeat(40)}`,
    options('targe'),
  );

  expect(result.matches[0]?.excerpt).toBe(
    `${'😀'.repeat(29)}xtargey${'😀'.repeat(29)}`,
  );
});

test('a long match preview never ends inside an emoji', () => {
  const result = searchDocumentText(
    `a${'😀'.repeat(150)}`,
    options('a.+', { mode: 'regex' }),
  );

  expect(result.matches[0]?.match).toBe(`a${'😀'.repeat(99)}…`);
});

test('a search that reaches its time limit returns a partial count', () => {
  const now = jest.spyOn(performance, 'now');
  let calls = 0;
  now.mockImplementation(() => (calls++ < 4 ? 0 : 1_000));

  try {
    const result = searchDocumentText(
      'x x x x x x',
      options('x', { limit: 2 }),
    );

    expect(result).toMatchObject({
      countIsPartial: true,
      totalMatches: 3,
      nextOffset: 2,
    });
    expect(result.matches).toHaveLength(2);
  } finally {
    now.mockRestore();
  }
});

test('a limit of zero returns counts without matches', () => {
  const result = searchDocumentText(
    'Desa desa DESA',
    options('desa', { caseSensitive: false, limit: 0 }),
  );

  expect(result).toEqual({
    matches: [],
    totalMatches: 3,
    nextOffset: null,
    matchCounts: [
      { text: 'Desa', count: 1 },
      { text: 'desa', count: 1 },
      { text: 'DESA', count: 1 },
    ],
  });
});

test('compact matches omit excerpts and allow a larger page', () => {
  const text = Array.from({ length: 150 }, (_, n) => `Pasal ${n + 1}`).join(
    '\n',
  );

  const result = searchDocumentText(
    text,
    options('^Pasal \\d+$', { mode: 'regex', excerpts: false, limit: 200 }),
  );

  expect(result.matches).toHaveLength(150);
  expect(result.matches[52]).toEqual({
    line: 53,
    column: 1,
    match: 'Pasal 53',
  });
  expect(result.nextOffset).toBeNull();
});

test.each<[string, Partial<DocumentTextSearch>]>([
  ['above the excerpt cap', { limit: 21 }],
  ['above the compact cap', { limit: 201, excerpts: false }],
  ['below zero', { limit: -1 }],
])('rejects a page size %s', (_case, overrides) => {
  expect(() => searchDocumentText('x', options('x', overrides))).toThrow(
    'Invalid match offset or limit.',
  );
});

test('whole-word search skips matches inside longer words', () => {
  const result = searchDocumentText(
    'Desa, PEDESAAN, desanya, (desa) desa_1 desa',
    options('desa', { caseSensitive: false, wholeWord: true }),
  );

  expect(result.matches.map(({ column }) => column)).toEqual([1, 27, 40]);
  expect(result.totalMatches).toBe(3);
});

test('whole-word search treats accented and non-Latin letters as word characters', () => {
  const result = searchDocumentText(
    'café cafés écafé café\nдом домик дом',
    options('café', { wholeWord: true }),
  );

  const cyrillic = searchDocumentText(
    'дом домик дом',
    options('дом', { wholeWord: true }),
  );

  expect(result.totalMatches).toBe(2);
  expect(cyrillic.totalMatches).toBe(2);
});

test('whole-word search keeps a match next to an emoji', () => {
  const result = searchDocumentText(
    '😀UPTD😀 UPTDX',
    options('UPTD', { wholeWord: true }),
  );

  expect(result.totalMatches).toBe(1);
});

test('whole-word search only checks edges that are word characters', () => {
  const result = searchDocumentText(
    'Rp.500 Rp.5000',
    options('Rp\\.\\d+', { mode: 'regex', wholeWord: true }),
  );

  expect(result.matches.map(({ match }) => match)).toEqual([
    'Rp.500',
    'Rp.5000',
  ]);
});
