import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Topic, TopicClaim } from '../../src/database/entities';
import type { ITopicRepository } from '../../src/database/interfaces';
import { DecisionSettings } from '../../src/infra/decision-gateway';
import type { DecisionCapacityService } from '../../src/infra/decision-gateway/decision-capacity.service';
import { TypeSafeDecisionGateway } from '../../src/infra/decision-gateway/typesafe-decision.gateway';
import { EmbeddingsService } from '../../src/infra/embeddings';
import { ObservabilityService } from '../../src/infra/observability';
import { TopicRecognitionService } from '../../src/modules/topics/topic-recognition.service';

/**
 * Labeled recognition calibration (docs/TOPIC_CONTEXT_SPEC.md, section 14),
 * standing in for a shadow period: one household account with eight ongoing
 * topics and labeled messages, run through the production recognition
 * service with real embeddings and the real decision gateway.
 *
 *   TOPIC_RECOGNITION_CALIBRATION=true [TOPIC_CALIBRATION_RUNS=2] \
 *   [TOPIC_CALIBRATION_REPORT=/path/report.json] \
 *     node --experimental-vm-modules node_modules/jest/bin/jest.js \
 *     --config ./jest.config.mjs test/topics/topic-recognition-calibration.live.spec.ts
 *
 * Labels reviewed and approved by the owner on 21 November 2026; the
 * topicChoice cutoff of 0.7 comes from this set. Rules must not quote these
 * messages, so keep them held out of prompts and skill text.
 *
 * Traps on purpose: two birthdays, two school efforts, one child with both a
 * birthday and dentist visits, English phrasings, and messages that mention a
 * family member without belonging to any topic.
 */
const enabled = process.env.TOPIC_RECOGNITION_CALIBRATION === 'true';
const RUNS = Number(process.env.TOPIC_CALIBRATION_RUNS ?? 1);
const TARGETS = { precision: 0.9, recallAt3: 0.85 };

type TopicFixture = {
  key: string;
  label: string;
  aliases: string[];
  claims: Array<[TopicClaim['kind'], string]>;
  salience?: number;
};

const TOPICS: TopicFixture[] = [
  {
    key: 'study-tour',
    label: 'Study tour anak ke Bandung',
    aliases: ['karyawisata'],
    claims: [
      ['next_step', 'Bayar iuran Rp350 rb paling lambat Jumat'],
      ['open_question', 'Bekal apa yang perlu dibawa?'],
    ],
    salience: 4,
  },
  {
    key: 'raka-birthday',
    label: 'Pesta ulang tahun Raka',
    aliases: ['ultah Raka'],
    claims: [
      ['decision', 'Pesta kecil di rumah hari Minggu'],
      ['next_step', 'Beli kue hari Sabtu jam 9'],
    ],
    salience: 2,
  },
  {
    key: 'mom-birthday',
    label: 'Ulang tahun Ibu',
    aliases: [],
    claims: [['decision', 'Makan malam keluarga tanggal 12 bulan depan']],
  },
  {
    key: 'kitchen',
    label: 'Renovasi dapur',
    aliases: [],
    claims: [
      ['decision', 'Tukang mulai kerja Senin depan'],
      ['open_question', 'Keramik warna apa?'],
    ],
    salience: 3,
  },
  {
    key: 'smp',
    label: 'Pendaftaran SMP Nadia',
    aliases: ['daftar sekolah Nadia'],
    claims: [
      ['next_step', 'Siapkan akta kelahiran dan rapor'],
      ['next_step', 'Tes masuk tanggal 3'],
    ],
  },
  {
    key: 'raka-dentist',
    label: 'Perawatan behel Raka',
    aliases: ['kontrol gigi Raka'],
    claims: [['decision', 'Kontrol tiap bulan di Klinik Senyum']],
  },
  {
    key: 'vehicle-tax',
    label: 'Pajak motor',
    aliases: ['STNK'],
    claims: [['next_step', 'Bayar pajak motor sebelum tanggal 20']],
  },
  {
    key: 'jogja-holiday',
    label: 'Liburan akhir tahun ke Yogyakarta',
    aliases: ['liburan Jogja'],
    claims: [
      ['next_step', 'Pesan tiket kereta'],
      ['open_question', 'Hotel di mana?'],
    ],
  },
];

type Case = {
  message: string;
  expect: string;
  recent?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

const CASES: Case[] = [
  // Direct and paraphrased.
  {
    message: 'Iuran study tour udah aku transfer tadi siang',
    expect: 'study-tour',
  },
  {
    message: 'Karyawisata itu berangkatnya jam berapa ya?',
    expect: 'study-tour',
  },
  { message: 'The school trip fee is paid already', expect: 'study-tour' },
  {
    message: 'Bandung minggu depan dingin nggak ya, anak perlu bawa jaket?',
    expect: 'study-tour',
  },
  {
    message: 'Undangan pesta Raka udah aku sebar ke teman sekelasnya',
    expect: 'raka-birthday',
  },
  {
    message: 'Kue ultah Raka jadi pesan yang coklat aja',
    expect: 'raka-birthday',
  },
  {
    message: 'Dekorasi balon buat hari Minggu beli di mana ya?',
    expect: 'raka-birthday',
  },
  {
    message: 'Restoran buat makan malam ultah ibu enaknya di mana?',
    expect: 'mom-birthday',
  },
  {
    message: 'Kado buat Ibu bulan depan apa ya, tas atau perhiasan?',
    expect: 'mom-birthday',
  },
  {
    message: 'Tukangnya minta DP 5 juta buat beli semen dan keramik',
    expect: 'kitchen',
  },
  { message: 'Keramik dapur jadi pilih yang abu-abu', expect: 'kitchen' },
  {
    message: 'How long does a kitchen renovation usually take?',
    expect: 'kitchen',
  },
  {
    message: 'Akta kelahiran Nadia udah aku fotokopi buat daftar sekolah',
    expect: 'smp',
  },
  { message: 'Nadia keterima di SMP 3!', expect: 'smp' },
  {
    message: 'Raka sakit gigi lagi, kayaknya behelnya longgar',
    expect: 'raka-dentist',
  },
  {
    message: 'Jadwal kontrol behel bulan ini jatuh hari Kamis',
    expect: 'raka-dentist',
  },
  {
    message: 'STNK motor jatuh tempo tanggal 20, bayarnya bisa online?',
    expect: 'vehicle-tax',
  },
  {
    message: 'Tiket kereta ke Jogja udah dapet buat tanggal 26',
    expect: 'jogja-holiday',
  },
  {
    message: 'Hotel dekat Malioboro yang ramah anak ada rekomendasi?',
    expect: 'jogja-holiday',
  },
  {
    message: 'Our year-end trip to Yogyakarta, should we rent a car?',
    expect: 'jogja-holiday',
  },
  // Follow-ups that only make sense with the conversation.
  {
    message: 'Berapa lama biasanya?',
    recent: [
      { role: 'user', content: 'Tukang renovasi dapur mulai Senin' },
      { role: 'assistant', content: 'Baik, sudah saya catat.' },
    ],
    expect: 'kitchen',
  },
  {
    message: 'Oke, yang itu aja',
    recent: [
      { role: 'user', content: 'Hotel buat liburan Jogja enaknya di mana?' },
      {
        role: 'assistant',
        content: 'Ada dua pilihan: dekat Malioboro atau dekat Prawirotaman.',
      },
    ],
    expect: 'jogja-holiday',
  },
  // Not about any topic, including hard negatives that share a name or theme.
  { message: 'makasih ya', expect: 'none' },
  { message: 'Ibukota Australia apa sih?', expect: 'none' },
  { message: 'Resep nasi goreng yang enak gimana?', expect: 'none' },
  { message: 'Besok aku mau potong rambut', expect: 'none' },
  { message: 'Ingatkan aku minum air putih tiap 2 jam ya', expect: 'none' },
  { message: 'Raka hari ini rewel banget, capek aku', expect: 'none' },
  { message: 'Nadia juara lomba mewarnai di sekolah hari ini', expect: 'none' },
  { message: 'Ibu tadi telepon, kangen katanya', expect: 'none' },
  { message: 'Bayar listrik bulan ini berapa ya kira-kira?', expect: 'none' },
  { message: 'Cuaca Makassar hari ini gimana?', expect: 'none' },
  { message: 'Kulkas di dapur bunyi aneh dari semalam', expect: 'none' },
  {
    message: 'Rekomendasi film keluarga buat malam minggu dong',
    expect: 'none',
  },
];

type Row = {
  run: number;
  message: string;
  expect: string;
  got: string;
  choice: string | null;
  confidence: number | null;
  inTop3: boolean | null;
  expectedSimilarity: number | null;
  bestOtherSimilarity: number;
  gateFailed: boolean;
};

function topicText(topic: TopicFixture): string {
  return [
    topic.label,
    topic.aliases.join(', '),
    ...topic.claims.map(([, text]) => text),
  ]
    .filter(Boolean)
    .join('\n');
}

(enabled ? describe : describe.skip)('Topic recognition calibration', () => {
  test('recognizes the labeled topic or none, within the section 14 targets', async () => {
    const config = new ConfigService({
      ...process.env,
      BACKEND_TOPIC_RECOGNITION_MODE: 'shadow',
    });

    const embeddings = new EmbeddingsService(config);
    const gateway = new TypeSafeDecisionGateway(
      config,
      {
        reserve: () => Promise.resolve(() => Promise.resolve()),
      } as unknown as DecisionCapacityService,
      ObservabilityService.disabled(),
    );

    const recognition = new TopicRecognitionService(
      {
        topicsLinkedTo: () => Promise.resolve([]),
      } as unknown as ITopicRepository,
      embeddings,
      gateway,
      new DecisionSettings(config),
    );

    const vectors = await embeddings.embedMany(TOPICS.map(topicText));
    const topics: Topic[] = TOPICS.map((fixture, index) => ({
      id: fixture.key,
      userId: 'calibration',
      label: fixture.label,
      aliases: fixture.aliases,
      embedding: vectors[index] ?? [],
      status: 'active',
      salience: fixture.salience ?? 1,
      salienceAtActiveDay: 10,
      gateCutoffOffset: 0,
      gateOffsetAtActiveDay: 0,
      episodeCount: 2,
      lastEpisodeKey: null,
      lastActiveAt: new Date(),
      createdAt: new Date(),
    }));

    const claims: TopicClaim[] = TOPICS.flatMap((fixture) =>
      fixture.claims.map(([kind, text], index) => ({
        id: `${fixture.key}-${index}`,
        topicId: fixture.key,
        kind,
        text,
        explicit: true,
        messageId: null,
        createdAt: new Date(),
      })),
    );

    const rows: Row[] = [];

    for (let run = 0; run < RUNS; run += 1)
      for (const item of CASES) {
        const result = await recognition.recognize({
          userId: 'calibration',
          activeDay: 10,
          latest: item.message,
          recent: item.recent ?? [],
          anchors: [],
          stickyTopicId: null,
          topics,
          claims,
          mode: 'shadow',
        });

        const offered = result.candidates.filter((c) => c.offered);
        const similarity = (key: string) =>
          result.candidates.find((c) => c.topicId === key)?.similarity ?? null;

        const bestOther = Math.max(
          0,
          ...result.candidates
            .filter((c) => c.topicId !== item.expect)
            .map((c) => c.similarity),
        );

        rows.push({
          run,
          message: item.message,
          expect: item.expect,
          got: result.topicId ?? 'none',
          choice: result.choice,
          confidence: result.confidence,
          inTop3:
            item.expect === 'none'
              ? null
              : offered.some((c) => c.topicId === item.expect),
          expectedSimilarity:
            item.expect === 'none' ? null : similarity(item.expect),
          bestOtherSimilarity: bestOther,
          gateFailed: result.choice === null && offered.length > 0,
        });
      }

    const topicRows = rows.filter((row) => row.expect !== 'none');
    const accepted = rows.filter((row) => row.got !== 'none');
    const correct = accepted.filter((row) => row.got === row.expect);
    const summary = {
      runs: RUNS,
      cases: CASES.length,
      precision: accepted.length ? correct.length / accepted.length : 1,
      recallAt3:
        topicRows.filter((row) => row.inTop3).length / topicRows.length,
      gateRecall: correct.length / topicRows.length,
      wrongTopic: accepted.filter(
        (row) => row.expect !== 'none' && row.got !== row.expect,
      ).length,
      falseAcceptOfNone: accepted.filter((row) => row.expect === 'none').length,
      gateFailures: rows.filter((row) => row.gateFailed).length,
    };

    const pad = (value: string | number | boolean | null, width: number) =>
      String(value ?? '')
        .slice(0, width)
        .padEnd(width);

    process.stdout.write(
      [
        `${pad('result', 7)} ${pad('expect', 14)} ${pad('got', 14)} ${pad('conf', 5)} ${pad('top3', 5)} ${pad('simExp', 6)} ${pad('simOth', 6)} message`,
        ...rows.map(
          (row) =>
            `${pad(row.got === row.expect ? 'ok' : row.gateFailed ? 'GATE' : 'WRONG', 7)} ${pad(row.expect, 14)} ${pad(row.got, 14)} ${pad(typeof row.confidence === 'number' ? row.confidence.toFixed(2) : '-', 5)} ${pad(row.inTop3 ?? '-', 5)} ${pad(typeof row.expectedSimilarity === 'number' ? row.expectedSimilarity.toFixed(2) : '-', 6)} ${pad(row.bestOtherSimilarity.toFixed(2), 6)} ${row.message}`,
        ),
        JSON.stringify(summary),
      ].join('\n') + '\n',
    );

    if (process.env.TOPIC_CALIBRATION_REPORT)
      writeFileSync(
        process.env.TOPIC_CALIBRATION_REPORT,
        JSON.stringify({ summary, rows }, null, 2),
      );

    expect(summary.precision).toBeGreaterThanOrEqual(TARGETS.precision);
    expect(summary.recallAt3).toBeGreaterThanOrEqual(TARGETS.recallAt3);
  }, 900_000);
});
