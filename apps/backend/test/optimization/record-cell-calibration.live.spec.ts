import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_DECISION_THRESHOLDS,
  DecisionSettings,
  type DecisionGateway,
  type DecisionResult,
} from '../../src/infra/decision-gateway';
import type { DecisionCapacityService } from '../../src/infra/decision-gateway/decision-capacity.service';
import { TypeSafeDecisionGateway } from '../../src/infra/decision-gateway/typesafe-decision.gateway';
import { ObservabilityService } from '../../src/infra/observability';
import type { IConversationRepository } from '../../src/database/interfaces';
import { RecordCellReviewService } from '../../src/modules/conversations/services/record-cell-review.service';

/**
 * Records Jev's scores for owner-reviewed table values and checks the
 * cellStated cutoff against them, through the production review (one decision
 * per row write, every free-text cell in it).
 *
 *   RECORD_CELL_CALIBRATION_ENABLED=true \
 *     node --env-file=.env --experimental-vm-modules node_modules/jest/bin/jest.js \
 *     --config ./jest.config.mjs --runInBand --testPathPatterns=record-cell-calibration
 *
 * Expectations reviewed by the owner on 8 November 2026. "stated" values must
 * never be refused (a refusal blocks a legitimate write); "unstated" values
 * (placeholders and guesses) must be refused in most runs. A value in the
 * wrong column is out of scope: this question does not judge column meaning.
 */
const enabled = process.env.RECORD_CELL_CALIBRATION_ENABLED === 'true';
const RUNS = Number(process.env.RECORD_CELL_CALIBRATION_RUNS ?? 3);

type Expect = 'stated' | 'unstated';
type Column = { id: string; name: string; type: string };
type Table = { title: string; description: string; columns: Column[] };
type Fixture = {
  id: string;
  /** The owner's messages, oldest first; the last one is the current turn. */
  messages: string[];
  table: Table;
  cells: Array<{ column: string; value: string; expect: Expect }>;
};

const text = (id: string, name: string): Column => ({ id, name, type: 'text' });

const ORDERS: Table = {
  title: 'Catatan Pemesanan',
  description:
    'Pesanan masuk dari pelanggan, termasuk barang, jumlah, alamat kirim, dan metode pembayaran.',
  columns: [
    { id: 'tanggal', name: 'Tanggal', type: 'date' },
    text('pemesan', 'Pemesan'),
    text('barang', 'Barang'),
    { id: 'jumlah', name: 'Jumlah', type: 'number' },
    text('alamat', 'Alamat Kirim'),
    text('pembayaran', 'Pembayaran'),
  ],
};

const STOCK: Table = {
  title: 'Stok Barang',
  description: 'Barang masuk ke gudang.',
  columns: [text('barang', 'Barang'), text('satuan', 'Satuan')],
};

const EXPENSES: Table = {
  title: 'Pengeluaran',
  description: 'Pengeluaran harian.',
  columns: [
    text('keterangan', 'Keterangan'),
    text('kategori', 'Kategori'),
    text('metode', 'Metode Bayar'),
  ],
};

const HEALTH: Table = {
  title: 'Catatan Kesehatan',
  description: 'Berat badan dan aktivitas harian.',
  columns: [text('aktivitas', 'Aktivitas'), text('catatan', 'Catatan')],
};

const FIXTURES: Fixture[] = [
  {
    id: 'order-forwarded-placeholder',
    messages: [
      '[Diteruskan dari Pak Dedi] Mbak, mau order sambal roa 4 botol, ambil sendiri sore ini ya. --- tambah ini',
    ],
    table: ORDERS,
    cells: [
      { column: 'pemesan', value: 'Pak Dedi', expect: 'stated' },
      { column: 'barang', value: 'Sambal roa', expect: 'stated' },
      // Owner: acceptable under Alamat Kirim.
      { column: 'alamat', value: 'Ambil sendiri', expect: 'stated' },
      { column: 'pembayaran', value: 'Belum disebut', expect: 'unstated' },
    ],
  },
  {
    id: 'order-forwarded-complete',
    messages: [
      '[Diteruskan dari Bu Rina] Kak, pesan sambal roa 2 botol ya. Kirim ke Jl. Melati 12, bayar transfer. --- masukkan pesanan ini',
    ],
    table: ORDERS,
    cells: [
      { column: 'pemesan', value: 'Bu Rina', expect: 'stated' },
      { column: 'alamat', value: 'Jl. Melati 12', expect: 'stated' },
      { column: 'pembayaran', value: 'Transfer', expect: 'stated' },
    ],
  },
  {
    id: 'order-paraphrase-and-missing-address',
    messages: ['Bu Ani pesan 3 kue lapis, dibayar nanti pas ambil'],
    table: ORDERS,
    cells: [
      { column: 'pemesan', value: 'Bu Ani', expect: 'stated' },
      { column: 'barang', value: 'Kue lapis', expect: 'stated' },
      { column: 'pembayaran', value: 'Bayar saat ambil', expect: 'stated' },
      { column: 'alamat', value: 'Tidak ada', expect: 'unstated' },
    ],
  },
  {
    id: 'order-detail-from-earlier-message',
    messages: [
      'Pesanan Bu Sari: 5 bungkus keripik pisang',
      'bayarnya tunai ya, tolong masukkan',
    ],
    table: ORDERS,
    cells: [
      { column: 'pemesan', value: 'Bu Sari', expect: 'stated' },
      { column: 'barang', value: 'Keripik pisang', expect: 'stated' },
      { column: 'pembayaran', value: 'Tunai', expect: 'stated' },
    ],
  },
  {
    id: 'stock-purchase',
    messages: ['Tambah stok gula 20 kg, belinya dari Toko Makmur'],
    table: STOCK,
    cells: [
      { column: 'barang', value: 'Gula', expect: 'stated' },
      { column: 'satuan', value: 'kg', expect: 'stated' },
    ],
  },
  {
    id: 'expense-guessed-category',
    messages: ['Isi bensin 150rb tadi pagi'],
    table: EXPENSES,
    cells: [
      { column: 'keterangan', value: 'Isi bensin', expect: 'stated' },
      // Owner: the note-capture skill forbids inventing categories.
      { column: 'kategori', value: 'Transportasi', expect: 'unstated' },
      { column: 'metode', value: '-', expect: 'unstated' },
    ],
  },
  {
    id: 'expense-guessed-method',
    messages: ['Beli galon 20rb'],
    table: EXPENSES,
    cells: [
      { column: 'keterangan', value: 'Beli galon', expect: 'stated' },
      { column: 'metode', value: 'Tunai', expect: 'unstated' },
    ],
  },
  {
    id: 'health-empty-note',
    messages: ['Berat badan pagi ini 62,5 kg, habis lari 5 km'],
    table: HEALTH,
    cells: [
      { column: 'aktivitas', value: 'Lari 5 km', expect: 'stated' },
      { column: 'catatan', value: 'Tidak ada catatan', expect: 'unstated' },
    ],
  },
];

function conversation(messages: string[]): IConversationRepository {
  const records = messages.map((content, index) => ({
    id: `m${index}`,
    conversationId: 'calibration',
    role: 'user',
    content,
    createdAt: new Date(index * 60_000),
  }));

  return {
    findContext: () =>
      Promise.resolve({
        conversation: {
          id: 'calibration',
          rollingSummary: null,
          summaryThroughMessageId: null,
        },
        messages: records,
      }),
  } as unknown as IConversationRepository;
}

(enabled ? describe : describe.skip)('Record cell review calibration', () => {
  test('refuses placeholders and guesses without refusing stated values', async () => {
    const config = new ConfigService({
      BACKEND_DECISION_API_KEY:
        process.env.BACKEND_DECISION_API_KEY?.trim() ||
        process.env.BACKEND_MODEL_API_KEY,
      BACKEND_RECORD_CELL_REVIEW_MODE: 'enabled',
      BACKEND_DECISION_COHORT: '*',
      BACKEND_DECISION_CALIBRATION_VERSION: 'record-cell-calibration',
      BACKEND_DECISION_TIMEOUT_MS: 5000,
    });

    const live = new TypeSafeDecisionGateway(
      config,
      {
        reserve: () => Promise.resolve(() => Promise.resolve()),
      } as unknown as DecisionCapacityService,
      ObservabilityService.disabled(),
    );

    // The first call of a process often hits a connect timeout on this
    // network; warm the connection so it is not counted as a result.
    await live.decide({
      stage: 'record-cells-warmup',
      version: 'record-cell-calibration',
      lane: 'interactive',
      state: '{}',
      questions: { ready: { type: 'noul', instructions: 'Is this ready?' } },
    });

    const cutoff = DEFAULT_DECISION_THRESHOLDS.cellStated;
    const rows: string[] = [];
    const problems: string[] = [];

    for (const fixture of FIXTURES)
      for (let run = 0; run < RUNS; run++) {
        let result: DecisionResult | null = null;
        const recorder: DecisionGateway = {
          decide: async (request) => (result = await live.decide(request)),
        };

        const service = new RecordCellReviewService(
          recorder,
          new DecisionSettings(config),
          conversation(fixture.messages),
        );

        await service.review({
          userId: 'calibration',
          sourceMessageId: `m${fixture.messages.length - 1}`,
          context: { conversationId: 'calibration', trigger: 'user' },
          table: fixture.table,
          rows: [
            {
              values: Object.fromEntries(
                fixture.cells.map(({ column, value }) => [column, value]),
              ),
            },
          ],
        });

        const outcome = result as DecisionResult | null;

        if (outcome?.status !== 'ok') {
          problems.push(`${fixture.id} run ${run}: classifier unavailable`);
          continue;
        }

        fixture.cells.forEach((cell, index) => {
          const answer = outcome.answers[`cell_${index}`];
          const score = answer?.type === 'noul' ? answer.noul : Number.NaN;
          const refused = score < cutoff;
          rows.push(
            JSON.stringify({
              id: fixture.id,
              column: cell.column,
              value: cell.value,
              expect: cell.expect,
              score: Number(score.toFixed(2)),
              latencyMs: Math.round(outcome.latencyMs),
            }),
          );
          if (cell.expect === 'stated' && refused)
            problems.push(
              `${fixture.id} run ${run}: stated ${cell.column} refused (${score.toFixed(2)})`,
            );
          if (cell.expect === 'unstated' && !refused)
            problems.push(
              `${fixture.id} run ${run}: unstated ${cell.column} allowed (${score.toFixed(2)})`,
            );
        });
      }

    console.log(rows.join('\n'));
    const falseRefusals = problems.filter((p) => p.includes('refused'));
    const unavailable = problems.filter((p) => p.includes('unavailable'));
    const missed = problems.filter((p) => p.includes('allowed'));
    const unstatedChecks =
      RUNS *
      FIXTURES.flatMap(({ cells }) => cells).filter(
        ({ expect }) => expect === 'unstated',
      ).length;

    console.log(problems.join('\n') || 'no problems');
    expect(unavailable).toEqual([]);
    expect(falseRefusals).toEqual([]);
    // Placeholders slipping through is the old behaviour; allow rare misses.
    expect(missed.length).toBeLessThanOrEqual(Math.floor(unstatedChecks / 6));
  }, 900_000);
});
