import 'dotenv/config';
import { describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { ObservabilityService } from '../../src/infra/observability';
import { OpenRouterLanguageModel } from '../../src/infra/model-gateway';
import {
  TOPIC_EXTRACTION_OUTPUT_TOKENS,
  TOPIC_EXTRACTION_PROMPT,
  TOPIC_EXTRACTION_SCHEMA,
  parseTopicExtraction,
  type TopicExtraction,
} from '../../src/modules/topics/topic-extraction';

/**
 * The formation prompt against the configured chat model
 * (docs/TOPIC_CONTEXT_SPEC.md, TOPIC-FORM-03). Checks outcomes only: which
 * action, which topic, which items. Opt in with TOPIC_EXTRACTION_LIVE=true;
 * it calls the real provider and costs a few cents.
 */
const enabled = process.env.TOPIC_EXTRACTION_LIVE === 'true';

const studyTour = {
  id: 'topic-study-tour',
  label: 'Study tour anak',
  aliases: ['karyawisata'],
  state: [{ kind: 'open_question', text: 'Iuran Rp350 rb belum dibayar' }],
};

type Scenario = {
  name: string;
  topics: unknown[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  items?: Array<{ type: string; title: string }>;
  check(result: TopicExtraction): void;
};

const SCENARIOS: Scenario[] = [
  {
    name: 'a new ongoing effort links the item made for it',
    topics: [],
    messages: [
      {
        role: 'user',
        content:
          'Anak saya ada study tour ke Bandung Selasa depan, iurannya 350rb harus dibayar paling lambat Jumat. Ingatkan aku Kamis malam ya',
      },
      {
        role: 'assistant',
        content: 'Siap, pengingat Kamis 19.00 sudah dibuat.',
      },
    ],
    items: [{ type: 'reminder', title: 'Bayar iuran study tour' }],
    check(result) {
      expect(result.action).toBe('new');
      if (result.action === 'none') return;
      expect(result.linkedItems).toEqual([0]);
    },
  },
  {
    name: 'a synonym continues the existing topic',
    topics: [studyTour],
    messages: [
      {
        role: 'user',
        content: 'Karyawisata nanti anak perlu bawa bekal apa aja ya?',
      },
    ],
    check(result) {
      expect(result.action).toBe('existing');
      if (result.action === 'none') return;
      expect(result.topicId).toBe(studyTour.id);
    },
  },
  {
    name: 'thanks is no topic',
    topics: [studyTour],
    messages: [{ role: 'user', content: 'makasih ya' }],
    check(result) {
      expect(result.action).toBe('none');
    },
  },
  {
    name: 'a one-off question is no topic',
    topics: [studyTour],
    messages: [{ role: 'user', content: 'Ibukota Australia apa sih?' }],
    check(result) {
      expect(result.action).toBe('none');
    },
  },
  {
    name: 'similar names stay apart',
    topics: [
      { id: 'topic-mom', label: 'Ulang tahun ibu', aliases: [], state: [] },
      {
        id: 'topic-raka',
        label: 'Ulang tahun Raka',
        aliases: ['ultah Raka'],
        state: [{ kind: 'decision', text: 'Pesta di rumah hari Minggu' }],
      },
    ],
    messages: [
      { role: 'user', content: 'Kue ultah Raka jadi pesan yang coklat aja' },
    ],
    check(result) {
      expect(result.action).toBe('existing');
      if (result.action === 'none') return;
      expect(result.topicId).toBe('topic-raka');
    },
  },
  {
    name: 'an errand in the same message is not linked',
    topics: [studyTour],
    messages: [
      {
        role: 'user',
        content:
          'Soal study tour, iurannya sudah aku bayar tadi. Oh iya, ingatkan beli susu besok pagi',
      },
      { role: 'assistant', content: 'Siap, pengingat beli susu besok 07.00.' },
    ],
    items: [{ type: 'reminder', title: 'Beli susu' }],
    check(result) {
      expect(result.action).toBe('existing');
      if (result.action === 'none') return;
      expect(result.topicId).toBe(studyTour.id);
      expect(result.linkedItems).toEqual([]);
      expect(result.claims.length).toBeGreaterThan(0);
    },
  },
];

(enabled ? describe : describe.skip)('topic extraction prompt', () => {
  const model = new OpenRouterLanguageModel(
    new ConfigService(process.env),
    ObservabilityService.disabled(),
  );

  test.each(SCENARIOS)(
    '$name',
    async (scenario) => {
      let userIndex = 0;
      const items = scenario.items ?? [];
      const result = await model.generate({
        traceName: 'topic-formation',
        outputSchema: TOPIC_EXTRACTION_SCHEMA,
        maxOutputTokens: TOPIC_EXTRACTION_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: TOPIC_EXTRACTION_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              topics: scenario.topics,
              messages: scenario.messages.map((message) => ({
                ...(message.role === 'user'
                  ? { userMessageIndex: userIndex++ }
                  : {}),
                ...message,
              })),
              items: items.map((item, index) => ({ index, ...item })),
            }),
          },
        ],
      });

      const parsed = parseTopicExtraction(result.text, {
        items: items.length,
        userMessages: userIndex,
      });

      process.stdout.write(`${scenario.name}: ${JSON.stringify(parsed)}\n`);
      scenario.check(parsed);
    },
    60_000,
  );
});
