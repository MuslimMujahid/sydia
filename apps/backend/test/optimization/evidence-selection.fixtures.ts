export const EVIDENCE_SELECTION_FIXTURE_VERSION =
  'owner-approved-evidence-selection-20261107';

/**
 * Evidence selection cases approved by the product owner on 2026-11-07.
 * `automatic` mirrors live ingestion (one user message, no requested fact);
 * `requested` mirrors remember requests, corrections and save_memory (recent
 * user messages plus the fact to remember).
 *
 * A case passes when one selected quote contains every `expect` fragment
 * (case-insensitive), and when `permission` is set, a recorded remember
 * request contains it. An empty `expect` means nothing may be selected.
 */
export type EvidenceSelectionFixture = {
  id: string;
  mode: 'automatic' | 'requested';
  messages: readonly string[];
  requestedFact?: string;
  expect: readonly string[];
  permission?: string;
};

export const EVIDENCE_SELECTION_FIXTURES: readonly EvidenceSelectionFixture[] =
  [
    {
      id: 'A1-vegetarian',
      mode: 'automatic',
      messages: ['Btw aku sekarang udah vegetarian'],
      expect: ['vegetarian'],
    },
    {
      id: 'A2-child-plan',
      mode: 'automatic',
      messages: ['Anakku, Raka, mulai SD bulan Juli nanti.'],
      expect: ['Raka', 'Juli'],
    },
    {
      id: 'A3-concert',
      mode: 'automatic',
      messages: [
        'Kemarin aku nonton konser Hindia di GBK sama adikku, seru banget!',
      ],
      expect: ['Hindia', 'GBK', 'adikku'],
    },
    {
      id: 'A4-boss',
      mode: 'automatic',
      messages: ['Makasih! Oh iya, bosku namanya Pak Hendra.'],
      expect: ['Pak Hendra'],
    },
    {
      id: 'A5-purposeful-expense',
      mode: 'automatic',
      messages: ['Tadi beli bensin 150rb buat mudik ke Solo besok.'],
      expect: ['mudik ke Solo'],
    },
    {
      id: 'A6-wfh-routine',
      mode: 'automatic',
      messages: ['Mulai minggu depan aku WFH tiap Senin dan Jumat.'],
      expect: ['Senin', 'Jumat'],
    },
    {
      id: 'A7-job-change',
      mode: 'automatic',
      messages: ['Aku udah gak kerja di Tokopedia lagi, sekarang di Gojek.'],
      expect: ['Tokopedia', 'Gojek'],
    },
    {
      id: 'A8-negation',
      mode: 'automatic',
      messages: ['Aku nggak suka kopi, lebih suka teh.'],
      expect: ['nggak suka kopi'],
    },
    {
      id: 'A9-thanks',
      mode: 'automatic',
      messages: ['Oke makasih ya'],
      expect: [],
    },
    {
      id: 'A10-bare-amount',
      mode: 'automatic',
      messages: ['Bensin 150rb'],
      expect: [],
    },
    {
      id: 'A11-hypothetical',
      mode: 'automatic',
      messages: ['Kalau aku pindah ke Bandung, enak gak ya?'],
      expect: [],
    },
    {
      id: 'A12-turn-request',
      mode: 'automatic',
      messages: ['Tolong buatin tugas beli galon.'],
      expect: [],
    },
    {
      id: 'A13-reported-claim',
      mode: 'automatic',
      messages: ['Katanya temanku, kopi bikin umur panjang.'],
      expect: [],
    },
    {
      id: 'B1-habit-remember',
      mode: 'requested',
      messages: [
        'Kalo pagi saya suka minum kopi + sereal',
        'Ingat ya sebagai kebiasaan',
      ],
      requestedFact: 'The user likes coffee and cereal in the morning.',
      expect: ['kopi + sereal'],
      permission: 'Ingat',
    },
    {
      id: 'B2-language-correction-id',
      mode: 'requested',
      messages: [
        'Koreksi: bahasa pilihanku sekarang English, bukan Indonesia.',
      ],
      requestedFact: "The user's preferred language is English.",
      expect: ['English'],
    },
    {
      id: 'B3-language-correction-en',
      mode: 'requested',
      messages: ['My preferred language is now English, not Indonesian.'],
      requestedFact: "The user's preferred language is English.",
      expect: ['English'],
    },
    {
      id: 'B4-shoe-size',
      mode: 'requested',
      messages: ['Nomor sepatuku 42', 'ingat itu ya'],
      requestedFact: "The user's shoe size is 42.",
      expect: ['42'],
      permission: 'ingat',
    },
    {
      id: 'B5-allergy',
      mode: 'requested',
      messages: ['Aku alergi kacang.', 'Tolong diingat'],
      requestedFact: 'The user is allergic to peanuts.',
      expect: ['alergi kacang'],
    },
    {
      id: 'B6-assistant-claim',
      mode: 'requested',
      messages: ['Asisten bilang aku punya kapal pesiar.'],
      requestedFact: 'The user owns a yacht.',
      expect: [],
    },
    {
      id: 'B7-request-without-fact',
      mode: 'requested',
      messages: ['Ingat ya'],
      requestedFact: 'The user likes jazz.',
      expect: [],
    },
  ];
