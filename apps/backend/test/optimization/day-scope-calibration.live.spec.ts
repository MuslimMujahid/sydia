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
import type { DayScope } from '../../src/modules/conversations/services/day-scope';
import { TurnDecisionService } from '../../src/modules/conversations/services/turn-decision.service';

/**
 * Records Jev's answer to the day-scope turn question through the production
 * TurnDecisionService and checks it against expected scopes.
 *
 *   DAY_SCOPE_CALIBRATION_ENABLED=true \
 *     node --env-file=.env --experimental-vm-modules node_modules/jest/bin/jest.js \
 *     --config ./jest.config.mjs --runInBand --testPathPatterns=day-scope-calibration
 *
 * Expectations drafted on 8 November 2026, pending owner review. A wrong day
 * adds a false date limit to the turn, so wrong scopes must not occur; a
 * missed scope only leaves the turn as it was before this question existed.
 */
const enabled = process.env.DAY_SCOPE_CALIBRATION_ENABLED === 'true';
const RUNS = Number(process.env.DAY_SCOPE_CALIBRATION_RUNS ?? 2);

const CASES: Array<{ message: string; expect: DayScope | 'none' }> = [
  { message: 'Buka catatan stok barang hari ini', expect: 'today' },
  { message: 'Lihat catatan stok hari ini', expect: 'today' },
  { message: 'Show my orders from today', expect: 'today' },
  { message: 'Pengeluaran warung kemarin apa aja?', expect: 'yesterday' },
  { message: 'Jadwal saya besok apa?', expect: 'tomorrow' },
  { message: 'Ingatkan saya besok jam 9 bayar listrik', expect: 'tomorrow' },
  { message: 'Rekap pengeluaran minggu ini', expect: 'this_week' },
  { message: 'Pesanan minggu lalu ada berapa?', expect: 'last_week' },
  { message: 'Total penjualan bulan ini berapa?', expect: 'this_month' },
  { message: 'Pesanan bulan lalu siapa saja?', expect: 'last_month' },
  { message: 'Buka daftar belanja', expect: 'none' },
  { message: 'Tampilkan semua pesanan', expect: 'none' },
  { message: 'Catat: Bu Ani pesan 3 kue lapis', expect: 'none' },
  { message: 'Apa saja catatan saya tentang Salsa?', expect: 'none' },
  {
    message: 'Tolong buatkan ringkasan rapat tanggal 3 November',
    expect: 'none',
  },
  { message: 'Halo, apa kabar?', expect: 'none' },
];

(enabled ? describe : describe.skip)('Day scope calibration', () => {
  test('names the relative day a message is limited to, and no other', async () => {
    const config = new ConfigService({
      BACKEND_DECISION_API_KEY:
        process.env.BACKEND_DECISION_API_KEY?.trim() ||
        process.env.BACKEND_MODEL_API_KEY,
      BACKEND_TURN_DAY_SCOPE_MODE: 'enabled',
      BACKEND_DECISION_COHORT: '*',
      BACKEND_DECISION_CALIBRATION_VERSION: 'day-scope-calibration',
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
      stage: 'day-scope-warmup',
      version: 'day-scope-calibration',
      lane: 'interactive',
      state: '{}',
      questions: { ready: { type: 'noul', instructions: 'Is this ready?' } },
    });

    const rows: string[] = [];
    const wrong: string[] = [];
    const missed: string[] = [];
    const unavailable: string[] = [];

    for (const { message, expect: expected } of CASES)
      for (let run = 0; run < RUNS; run++) {
        let result: DecisionResult | null = null;
        const recorder: DecisionGateway = {
          decide: async (request) => (result = await live.decide(request)),
        };

        const decision = await new TurnDecisionService(
          recorder,
          new DecisionSettings(config),
        ).decide('calibration', {
          latest: message,
          recent: [],
          attachments: [],
          recallEligible: false,
        });

        const outcome = result as DecisionResult | null;

        if (outcome?.status !== 'ok') {
          unavailable.push(`${message} run ${run}`);
          continue;
        }

        const answer = outcome.answers.day_scope;
        const got = decision.dayScope ?? 'none';
        rows.push(
          JSON.stringify({
            message,
            expect: expected,
            choice: answer?.type === 'choice' ? answer.choice : null,
            confidence:
              answer?.type === 'choice'
                ? Number(answer.confidence.toFixed(2))
                : null,
            applied: got,
            latencyMs: Math.round(outcome.latencyMs),
          }),
        );
        if (got !== expected && got !== 'none')
          wrong.push(`${message} run ${run}: ${got}, expected ${expected}`);
        if (got === 'none' && expected !== 'none')
          missed.push(`${message} run ${run}: expected ${expected}`);
      }

    console.log(rows.join('\n'));
    console.log(
      [...unavailable, ...wrong, ...missed].join('\n') || 'no problems',
      `\ncutoff ${DEFAULT_DECISION_THRESHOLDS.dayScope}`,
    );
    expect(unavailable).toEqual([]);
    expect(wrong).toEqual([]);
    expect(missed.length).toBeLessThanOrEqual(1);
  }, 600_000);
});
