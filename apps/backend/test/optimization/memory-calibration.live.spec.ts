import { writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_DECISION_THRESHOLDS,
  DecisionSettings,
  type DecisionGateway,
  type DecisionRequest,
  type DecisionResult,
} from '../../src/infra/decision-gateway';
import { DecisionCapacityService } from '../../src/infra/decision-gateway/decision-capacity.service';
import { TypeSafeDecisionGateway } from '../../src/infra/decision-gateway/typesafe-decision.gateway';
import { ObservabilityService } from '../../src/infra/observability';
import type {
  IConversationRepository,
  IHindsightRepository,
  IUserRepository,
} from '../../src/database/interfaces';
import { MemoryEligibilityService } from '../../src/modules/memories/memory-eligibility.service';
import { MemoryFactDecisionService } from '../../src/modules/memories/memory-fact-decision.service';
import {
  FACT_FIXTURES,
  FACT_FIXTURE_VERSION,
} from './optimization.fact-fixtures';
import { MEMORY_ELIGIBILITY_FIXTURES } from './optimization.fixtures';

/**
 * Records Jev's raw scores for the owner-approved memory examples and checks
 * the calibrated cutoffs against them. Every stage runs (cutoffs near zero);
 * the cutoffs are then applied offline, so the report also shows what any
 * other cutoff would decide.
 *
 *   MEMORY_CALIBRATION_ENABLED=true MEMORY_CALIBRATION_REPORT=/tmp/x.json \
 *     node --env-file=.env --experimental-vm-modules node_modules/jest/bin/jest.js \
 *     --config ./jest.config.mjs --runInBand --testPathPatterns=memory-calibration
 */
const enabled = process.env.MEMORY_CALIBRATION_ENABLED === 'true';
const RUNS = Number(process.env.MEMORY_CALIBRATION_RUNS ?? 3);
const reportPath = process.env.MEMORY_CALIBRATION_REPORT ?? '';
const COHORT = 'memory-calibration';
/** Junk facts admitted at most once per this many reject decisions. */
const JUNK_TOLERANCE = 12;

type Recorded = { stage: string; result: DecisionResult };
type Stages = {
  grounded: number | null;
  durable: number | null;
  support: number | null;
  coverage: number | null;
};
type EligibilityRow = {
  id: string;
  run: number;
  expected: boolean;
  score: number | null;
};
type FactRow = {
  id: string;
  run: number;
  expected: boolean;
  candidates: Stages[];
};

function noul(result: DecisionResult | undefined, key: string): number | null {
  if (result?.status !== 'ok') return null;
  const answer = result.answers[key];

  return answer?.type === 'noul' ? answer.noul : null;
}

/** Mirrors MemoryEligibilityService: no score (a fallback) keeps the review. */
function reviewed(row: EligibilityRow): boolean {
  return (
    row.score === null ||
    row.score > DEFAULT_DECISION_THRESHOLDS.eligibilitySkip
  );
}

/** Mirrors MemoryFactDecisionService: every check of every candidate passes. */
function admitted(row: FactRow): boolean {
  const { factEvidence, factDurable } = DEFAULT_DECISION_THRESHOLDS;

  return row.candidates.every(
    ({ grounded, durable, support, coverage }) =>
      grounded !== null &&
      support !== null &&
      coverage !== null &&
      durable !== null &&
      Math.min(grounded, support, coverage) >= factEvidence &&
      durable >= factDurable,
  );
}

(enabled ? describe : describe.skip)('Memory decision calibration', () => {
  test('the calibrated cutoffs lose no approved memory', async () => {
    if (
      !isAbsolute(reportPath) ||
      !relative(resolve(process.cwd(), '../..'), reportPath).startsWith('..')
    )
      throw new Error(
        'MEMORY_CALIBRATION_REPORT must be an absolute path outside the repository',
      );

    const config = new ConfigService({
      ...process.env,
      BACKEND_DECISION_PROVIDER: 'openrouter',
      BACKEND_DECISION_MODEL: 'typesafe/jev-1.13',
      BACKEND_DECISION_BACKGROUND_TIMEOUT_MS: 15000,
    });

    const capacity = new DecisionCapacityService(config);

    try {
      const adapter = new TypeSafeDecisionGateway(
        config,
        capacity,
        ObservabilityService.disabled(),
      );

      let recorded: Recorded[] = [];
      const gateway: DecisionGateway = {
        decide: async (request: DecisionRequest) => {
          const result = await adapter.decide({
            ...request,
            environment: 'test',
          });

          recorded.push({ stage: request.stage, result });

          return result;
        },
      };

      const settings = new DecisionSettings(
        new ConfigService({
          BACKEND_MEMORY_ELIGIBILITY_MODE: 'enabled',
          BACKEND_MEMORY_FACT_REVIEW_MODE: 'enabled',
          BACKEND_DECISION_COHORT: COHORT,
          BACKEND_DECISION_CALIBRATION_VERSION: FACT_FIXTURE_VERSION,
          // Let every stage run; cutoffs are applied offline.
          BACKEND_DECISION_THRESHOLDS_JSON: JSON.stringify({
            eligibilitySkip: 0.0001,
            factEvidence: 0.0001,
            factDurable: 0.0001,
          }),
        }),
      );

      const eligibility = new MemoryEligibilityService(gateway, settings);
      const facts = new MemoryFactDecisionService(
        gateway,
        settings,
        {
          findById: () =>
            Promise.resolve({
              name: 'Rina',
              preferredAddress: null,
              locale: 'id',
              timezone: 'Asia/Jakarta',
            }),
        } as unknown as IUserRepository,
        {} as IConversationRepository,
        {} as IHindsightRepository,
      );

      await sleep(500);
      const eligibilityRows: EligibilityRow[] = [];
      const factRows: FactRow[] = [];

      for (let run = 0; run < RUNS; run++) {
        for (const fixture of MEMORY_ELIGIBILITY_FIXTURES) {
          recorded = [];
          await eligibility.shouldReview(COHORT, fixture.content);
          const result = recorded.find(
            ({ stage }) => stage === 'memory-eligibility',
          )?.result;

          eligibilityRows.push({
            id: fixture.id,
            run,
            expected: fixture.eligible,
            score: noul(result, 'eligible'),
          });
        }

        for (const fixture of FACT_FIXTURES) {
          recorded = [];
          await facts.review(
            COHORT,
            fixture.candidates.map((text, index) => ({
              id: `fact-${index}`,
              text,
            })),
            fixture.evidence,
            fixture.permissions,
          );
          const review = recorded.find(
            ({ stage }) => stage === 'memory-facts',
          )?.result;

          const coverage = recorded.find(
            ({ stage }) => stage === 'memory-facts-evidence',
          )?.result;

          factRows.push({
            id: fixture.id,
            run,
            expected: fixture.expectedAdmitted,
            candidates: fixture.candidates.map((_, index) => {
              const supports = fixture.evidence.map((__, span) =>
                noul(review, `support_${index}_${span}`),
              );

              return {
                grounded: noul(review, `grounded_${index}`),
                durable: noul(review, `durable_${index}`),
                support: supports.some((value) => value === null)
                  ? null
                  : Math.max(...(supports as number[])),
                coverage: noul(coverage, `coverage_${index}`),
              };
            }),
          });
        }
      }

      const summary = {
        thresholds: DEFAULT_DECISION_THRESHOLDS,
        missedMemories: eligibilityRows
          .filter((row) => row.expected && !reviewed(row))
          .map(({ id, run }) => `${id}#${run}`),
        needlessReviews: eligibilityRows
          .filter((row) => !row.expected && reviewed(row))
          .map(({ id, run }) => `${id}#${run}`),
        lostFacts: factRows
          .filter((row) => row.expected && !admitted(row))
          .map(({ id, run }) => `${id}#${run}`),
        junkFacts: factRows
          .filter((row) => !row.expected && admitted(row))
          .map(({ id, run }) => `${id}#${run}`),
      };

      writeFileSync(
        reportPath,
        JSON.stringify(
          {
            fixtureVersion: FACT_FIXTURE_VERSION,
            runs: RUNS,
            summary,
            eligibility: eligibilityRows,
            facts: factRows,
          },
          null,
          2,
        ),
      );
      console.log(JSON.stringify(summary, null, 2));

      expect(summary.missedMemories).toEqual([]);
      expect(summary.lostFacts).toEqual([]);
      expect(summary.junkFacts.length).toBeLessThanOrEqual(
        Math.ceil(
          factRows.filter(({ expected }) => !expected).length / JUNK_TOLERANCE,
        ),
      );
    } finally {
      capacity.onModuleDestroy();
    }
  }, 1_800_000);
});
