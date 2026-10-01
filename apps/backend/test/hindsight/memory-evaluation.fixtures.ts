/** Synthetic v0 fixtures for migration investigation, not reviewed release ground truth. */
export const MEMORY_EVALUATION_VERSION = 'saved-facts-v0';
export const MEMORY_EVALUATION_FACTS = [
  {
    key: 'language',
    evidence: 'I prefer replies in Indonesian.',
    fact: 'The user prefers replies in Indonesian.',
    eventAt: '2026-09-01T00:00:00Z',
  },
  {
    key: 'brief',
    evidence: 'I like short explanations.',
    fact: 'The user likes short explanations.',
    eventAt: '2026-09-02T00:00:00Z',
  },
  {
    key: 'city',
    evidence: 'Saya tinggal di Makassar.',
    fact: 'Pengguna tinggal di Makassar.',
    eventAt: '2026-09-03T00:00:00Z',
  },
  {
    key: 'mentor',
    evidence: 'Rina, my mentor, is a ceramic artist.',
    fact: "Rina, the user's mentor, is a ceramic artist.",
    eventAt: '2026-09-04T00:00:00Z',
  },
  {
    key: 'cousin',
    evidence: 'Rina, my cousin, lives in Surabaya.',
    fact: "Rina, the user's cousin, lives in Surabaya.",
    eventAt: '2026-09-05T00:00:00Z',
  },
  {
    key: 'course',
    evidence: 'In June 2020, I completed a woodworking course.',
    fact: 'The user completed a woodworking course in June 2020.',
    eventAt: '2020-06-15T00:00:00Z',
  },
  {
    key: 'biking',
    evidence: 'I ride a bicycle every weekend.',
    fact: 'The user rides a bicycle every weekend.',
    eventAt: '2026-09-06T00:00:00Z',
  },
  {
    key: 'tea',
    evidence: 'I prefer tea to coffee.',
    fact: 'The user prefers tea to coffee.',
    eventAt: '2026-09-07T00:00:00Z',
  },
  {
    key: 'metric',
    evidence: 'I prefer metric units.',
    fact: 'The user prefers metric units.',
    eventAt: '2026-09-08T00:00:00Z',
  },
  {
    key: 'recipes',
    evidence: 'I like vegetable recipes.',
    fact: 'The user likes vegetable recipes.',
    eventAt: '2026-09-09T00:00:00Z',
  },
] as const;

export type EvaluationFactKey = (typeof MEMORY_EVALUATION_FACTS)[number]['key'];
export type MemoryEvaluationQuery = {
  id: string;
  query: string;
  expectedKeys: readonly EvaluationFactKey[];
  dimension:
    | 'english'
    | 'indonesian'
    | 'mixed'
    | 'ambiguous-entity'
    | 'temporal'
    | 'unrelated'
    | 'correction'
    | 'forgetting';
  answerTerms: readonly string[];
  forbiddenTerms?: readonly string[];
};

export const MEMORY_EVALUATION_QUERIES: readonly MemoryEvaluationQuery[] = [
  {
    id: 'language-en',
    query: 'Which language do I prefer for replies?',
    expectedKeys: ['language'],
    dimension: 'english',
    answerTerms: ['indonesian|bahasa indonesia'],
  },
  {
    id: 'language-id',
    query: 'Bahasa apa yang saya sukai untuk jawaban?',
    expectedKeys: ['language'],
    dimension: 'indonesian',
    answerTerms: ['indonesian|indonesia'],
  },
  {
    id: 'language-vague',
    query: 'preferred language',
    expectedKeys: ['language'],
    dimension: 'english',
    answerTerms: ['indonesian|bahasa indonesia'],
  },
  {
    id: 'city-mixed',
    query: 'What city do I live in, kota tempat tinggal saya?',
    expectedKeys: ['city'],
    dimension: 'mixed',
    answerTerms: ['makassar'],
  },
  {
    id: 'mentor',
    query: 'What does my mentor Rina do?',
    expectedKeys: ['mentor'],
    dimension: 'ambiguous-entity',
    answerTerms: ['ceramic|keramik'],
    forbiddenTerms: ['surabaya'],
  },
  {
    id: 'cousin',
    query: 'Where does my cousin Rina live?',
    expectedKeys: ['cousin'],
    dimension: 'ambiguous-entity',
    answerTerms: ['surabaya'],
    forbiddenTerms: ['makassar'],
  },
  {
    id: 'course',
    query: 'What course did I complete in June 2020?',
    expectedKeys: ['course'],
    dimension: 'temporal',
    answerTerms: ['woodwork|pertukangan|kayu'],
  },
  {
    id: 'biking',
    query: 'Apa kebiasaan saya pada akhir pekan?',
    expectedKeys: ['biking'],
    dimension: 'indonesian',
    answerTerms: ['bicycle|cycling|sepeda'],
  },
  {
    id: 'tea',
    query: 'Do I prefer tea or coffee?',
    expectedKeys: ['tea'],
    dimension: 'english',
    answerTerms: ['tea|teh'],
  },
  {
    id: 'metric',
    query: 'Which measurement units do I prefer?',
    expectedKeys: ['metric'],
    dimension: 'english',
    answerTerms: ['metric|metrik'],
  },
  {
    id: 'recipes',
    query: 'What kind of recipes do I like?',
    expectedKeys: ['recipes'],
    dimension: 'english',
    answerTerms: ['vegetable|sayur'],
  },
  {
    id: 'unrelated',
    query: 'What is my favorite ocean?',
    expectedKeys: [],
    dimension: 'unrelated',
    answerTerms: [],
  },
];

/** Additional synthetic probes written after v0; draft expectations, not a held-out reviewed set. */
export const MEMORY_EVALUATION_PROBE_QUERIES: readonly MemoryEvaluationQuery[] =
  [
    {
      id: 'brief-id',
      query: 'Seberapa panjang penjelasan yang saya sukai?',
      expectedKeys: ['brief'],
      dimension: 'indonesian',
      answerTerms: ['short|brief|singkat|pendek'],
    },
    {
      id: 'mentor-id',
      query: 'Pekerjaan mentor saya, Rina, apa?',
      expectedKeys: ['mentor'],
      dimension: 'ambiguous-entity',
      answerTerms: ['ceramic|keramik'],
      forbiddenTerms: ['surabaya'],
    },
    {
      id: 'cousin-id',
      query: 'Sepupu saya Rina tinggal di kota mana?',
      expectedKeys: ['cousin'],
      dimension: 'ambiguous-entity',
      answerTerms: ['surabaya'],
      forbiddenTerms: ['makassar'],
    },
    {
      id: 'course-id',
      query: 'Kursus apa yang saya selesaikan pada Juni 2020?',
      expectedKeys: ['course'],
      dimension: 'temporal',
      answerTerms: ['woodwork|pertukangan|kayu'],
    },
    {
      id: 'tea-id',
      query: 'Saya lebih memilih teh atau kopi?',
      expectedKeys: ['tea'],
      dimension: 'indonesian',
      answerTerms: ['tea|teh'],
    },
    {
      id: 'metric-id',
      query: 'Satuan ukuran apa yang saya sukai?',
      expectedKeys: ['metric'],
      dimension: 'indonesian',
      answerTerms: ['metric|metrik'],
    },
    {
      id: 'recipes-id',
      query: 'Resep jenis apa yang saya sukai?',
      expectedKeys: ['recipes'],
      dimension: 'indonesian',
      answerTerms: ['vegetable|sayur'],
    },
    {
      id: 'negative-pet-id',
      query: 'Siapa nama anjing peliharaan saya?',
      expectedKeys: [],
      dimension: 'unrelated',
      answerTerms: [],
    },
    {
      id: 'negative-instrument',
      query: 'Which musical instrument do I play?',
      expectedKeys: [],
      dimension: 'unrelated',
      answerTerms: [],
    },
    {
      id: 'negative-color-id',
      query: 'Warna kesukaan saya apa?',
      expectedKeys: [],
      dimension: 'unrelated',
      answerTerms: [],
    },
    {
      id: 'negative-airline',
      query: 'What airline do I prefer?',
      expectedKeys: [],
      dimension: 'unrelated',
      answerTerms: [],
    },
    {
      id: 'negative-running-club',
      query: 'Which running club do I belong to?',
      expectedKeys: [],
      dimension: 'unrelated',
      answerTerms: [],
    },
  ];

export function retrievalScore(
  expected: readonly string[],
  actual: readonly string[],
): { precision: number; recall: number; exact: boolean } {
  const wanted = new Set(expected);
  const returned = new Set(actual);
  const relevant = [...returned].filter((key) => wanted.has(key)).length;

  return {
    precision: returned.size ? relevant / returned.size : wanted.size ? 0 : 1,
    recall: wanted.size ? relevant / wanted.size : returned.size ? 0 : 1,
    exact: wanted.size === returned.size && relevant === wanted.size,
  };
}

export function percentile(
  values: readonly number[],
  quantile: number,
): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)]!;
}
