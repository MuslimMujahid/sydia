import { createFactReviewer } from '../hindsight/create-fact-reviewer';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { ConfigService } from '@nestjs/config';
import { describe, expect, test } from '@jest/globals';
import {
  DecisionSettings,
  type DecisionGateway,
  type DecisionResult,
} from '../../src/infra/decision-gateway';
import { DecisionCapacityService } from '../../src/infra/decision-gateway/decision-capacity.service';
import { TypeSafeDecisionGateway } from '../../src/infra/decision-gateway/typesafe-decision.gateway';
import { ObservabilityService } from '../../src/infra/observability';
import { HttpHindsightGateway } from '../../src/infra/hindsight/http-hindsight.gateway';
import { OpenRouterLanguageModel } from '../../src/infra/model-gateway';
import { MemoryEligibilityService } from '../../src/modules/memories/memory-eligibility.service';
import {
  MemoryPolicyService,
  MEMORY_POLICY_VERSION,
} from '../../src/modules/memories/memory-policy.service';
import { HINDSIGHT_RETAIN_MISSION } from '../../src/modules/memories/hindsight-delivery.service';
import { TurnDecisionService } from '../../src/modules/conversations/services/turn-decision.service';
import { toolNamesForGroups } from '../../src/modules/conversations/services/tool-groups';
import {
  EXTRACTOR_FIXTURES,
  MEMORY_ELIGIBILITY_FIXTURES,
  OPTIMIZATION_FIXTURE_VERSION,
  TURN_DECISION_FIXTURES,
} from './optimization.fixtures';
import { retainCounters, retainCounterDelta } from './optimization.metrics';
import {
  chargeSnapshot,
  totalExtractionCost,
} from './optimization.usage-relay';
import { ReviewUsage, totalReviewCost } from './optimization.review-usage';

const enabled = process.env.OPTIMIZATION_LIVE_ENABLED === 'true';
const reportPath =
  process.env.OPTIMIZATION_REPORT_PATH ??
  `/tmp/sydia-optimization-${randomUUID()}.json`;

const reportRelative = relative(resolve(process.cwd(), '../..'), reportPath);
if (enabled && (!isAbsolute(reportPath) || !reportRelative.startsWith('..')))
  throw new Error(
    'OPTIMIZATION_REPORT_PATH must be absolute and outside the repository',
  );
if (
  enabled &&
  (!process.env.BACKEND_MODEL_API_KEY || !process.env.BACKEND_REDIS_URL)
)
  throw new Error(
    'Synthetic optimization evaluation requires configured OpenRouter and Redis',
  );
const extractorEnabled =
  enabled && process.env.OPTIMIZATION_EXTRACTOR_ENABLED === 'true';

const decisionsEnabled = process.env.OPTIMIZATION_DECISIONS_ENABLED !== 'false';
const turnsOnly = process.env.OPTIMIZATION_TURNS_ONLY === 'true';
const relayAdminUrl = process.env.OPTIMIZATION_RELAY_ADMIN_URL;
const repeats = Number(process.env.OPTIMIZATION_EXTRACTOR_REPEATS ?? 1);
if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 30)
  throw new Error('OPTIMIZATION_EXTRACTOR_REPEATS must be 1–30');
if (enabled && !decisionsEnabled && !extractorEnabled)
  throw new Error('Enable at least one synthetic optimization experiment');

const baselineUrl = process.env.OPTIMIZATION_BASELINE_URL;
const candidateUrl = process.env.OPTIMIZATION_CANDIDATE_URL;
if (
  extractorEnabled &&
  (!baselineUrl ||
    !candidateUrl ||
    baselineUrl === candidateUrl ||
    !process.env.BACKEND_HINDSIGHT_API_KEY)
)
  throw new Error(
    'Extractor comparison requires distinct isolated baseline/candidate URLs and a Hindsight key',
  );

(enabled ? describe : describe.skip)(
  'Synthetic optimization measurements',
  () => {
    test('measures Jev decisions and optional isolated extractor arms without changing application flags', async () => {
      const config = new ConfigService({
        ...process.env,
        BACKEND_DECISION_PROVIDER: 'openrouter',
        BACKEND_DECISION_MODEL: 'typesafe/jev-1.13',
        BACKEND_DECISION_TIMEOUT_MS: Number(
          process.env.OPTIMIZATION_DECISION_TIMEOUT_MS ?? 600,
        ),
        BACKEND_DECISION_COHORT: 'synthetic-optimization',
        BACKEND_DECISION_CALIBRATION_VERSION: OPTIMIZATION_FIXTURE_VERSION,
        BACKEND_MEMORY_ELIGIBILITY_MODE: 'enabled',
        BACKEND_TOOL_GROUP_SELECTION_MODE: 'enabled',
        BACKEND_MEMORY_RECALL_DECISION_MODE: 'enabled',
        BACKEND_DECISION_THRESHOLDS_JSON:
          process.env.OPTIMIZATION_TURN_THRESHOLDS_JSON ?? '{}',
      });

      const observability = ObservabilityService.disabled();
      const capacity = new DecisionCapacityService(config);
      const adapter = new TypeSafeDecisionGateway(
        config,
        capacity,
        observability,
      );

      let fixtureId: string | null = null;
      const decisions: Array<{
        fixtureId: string | null;
        stage: string;
        result: DecisionResult;
      }> = [];

      const gateway: DecisionGateway = {
        decide: async (request) => {
          const result = await adapter.decide(request);
          decisions.push({ fixtureId, stage: request.stage, result });

          return result;
        },
      };

      const settings = new DecisionSettings(config);
      const turns = new TurnDecisionService(gateway, settings);
      const eligibility = new MemoryEligibilityService(gateway, settings);
      const turnRows: unknown[] = [];
      const eligibilityRows: unknown[] = [];
      const extractorRows: unknown[] = [];

      try {
        await sleep(500); // allow the isolated capacity connection to become ready

        for (const fixture of decisionsEnabled ? TURN_DECISION_FIXTURES : []) {
          fixtureId = fixture.id;
          const decision = await turns.decide(
            'synthetic-optimization',
            fixture.input,
          );

          const required = toolNamesForGroups(fixture.expected.groups);
          turnRows.push({
            id: fixture.id,
            expectedRecall: fixture.expected.recall,
            recall: decision.recall,
            recallMatchesDraft: decision.recall === fixture.expected.recall,
            requiredTools: required,
            missingRequiredTools:
              decision.toolNames === undefined
                ? []
                : required.filter(
                    (name) => !decision.toolNames?.includes(name),
                  ),
            advertisedToolNames: decision.toolNames ?? null,
            requiredToolsCovered:
              decision.toolNames === undefined ||
              required.every((name) => decision.toolNames?.includes(name)),
            advertisedToolCount: decision.toolNames?.length ?? 37,
          });
        }

        for (const fixture of decisionsEnabled && !turnsOnly
          ? MEMORY_ELIGIBILITY_FIXTURES
          : []) {
          fixtureId = fixture.id;
          eligibilityRows.push({
            id: fixture.id,
            expectedEligible: fixture.eligible,
            reviewed: await eligibility.shouldReview(
              'synthetic-optimization',
              fixture.content,
            ),
          });
        }

        if (extractorEnabled) {
          const reviewUsage = new ReviewUsage();
          const policy = new MemoryPolicyService(
            new OpenRouterLanguageModel(config, reviewUsage),
            createFactReviewer(),
          );

          const arms = [
            ['baseline', baselineUrl],
            ['gpt-oss-20b', candidateUrl],
          ] as const;

          for (const { arm, url, trial } of Array.from(
            { length: repeats },
            (_, trial) => arms.map(([arm, url]) => ({ arm, url, trial })),
          ).flat()) {
            const hindsight = new HttpHindsightGateway(
              new ConfigService({
                ...process.env,
                BACKEND_HINDSIGHT_URL: url,
                BACKEND_HINDSIGHT_TIMEOUT_MS: 30000,
                BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS: 20000,
              }),
            );

            const bankId = `synthetic-optimization-${randomUUID()}`;
            await hindsight.ready();
            await hindsight.configureBank(bankId, HINDSIGHT_RETAIN_MISSION);

            try {
              for (const fixture of EXTRACTOR_FIXTURES) {
                const content = JSON.stringify({
                  sydiaSource: 1,
                  policyVersion: MEMORY_POLICY_VERSION,
                  userEvidence: fixture.evidence,
                  approvedEvidence: [fixture.evidence],
                  permissionQuotes: [],
                  role: 'user',
                  eventAt: '2026-09-01T00:00:00.000Z',
                  userTimezone: 'Asia/Makassar',
                });

                const chargeBefore = relayAdminUrl
                  ? await chargeSnapshot(relayAdminUrl)
                  : null;

                const countersBefore = await retainCounters(url!);
                const started = performance.now();
                const operationId = randomUUID();
                await hindsight.retain(bankId, {
                  documentId: fixture.id,
                  content,
                  operationId,
                  timestamp: '2026-09-01T00:00:00.000Z',
                });
                let status = await hindsight.operation(bankId, operationId);

                while (
                  status.status === 'pending' ||
                  status.status === 'processing'
                ) {
                  if (performance.now() - started > 120000)
                    throw new Error(
                      'Synthetic retain operation exceeded deadline',
                    );
                  await sleep(500);
                  status = await hindsight.operation(bankId, operationId);
                }

                const retainMs = performance.now() - started;
                const extractionUsage = retainCounterDelta(
                  countersBefore,
                  await retainCounters(url!),
                );

                const charges =
                  relayAdminUrl && chargeBefore
                    ? (
                        await chargeSnapshot(
                          relayAdminUrl,
                          chargeBefore.sequence,
                        )
                      ).rows.filter((row) => row.arm === arm)
                    : [];

                const facts = await hindsight.listFacts(bankId, fixture.id);
                let admissible: boolean | null = null;
                let reviewError: string | null = null;
                const reviewStart = reviewUsage.charges.length;

                try {
                  admissible =
                    status.status === 'completed' &&
                    facts.total > 0 &&
                    (await policy.approveFacts(
                      'synthetic-optimization',
                      content,
                      facts.items,
                    ));
                } catch (error) {
                  reviewError =
                    error instanceof Error ? error.name : 'UnknownError';
                }

                const recallStarted = performance.now();
                const reviewCharges = reviewUsage.charges.slice(reviewStart);
                const admissionCostUsd = totalReviewCost(reviewCharges);
                const extractionCostUsd = totalExtractionCost(charges);
                const recalled = await hindsight.recall(bankId, {
                  query: fixture.query,
                  timestamp: '2026-09-02T00:00:00.000Z',
                  maxTokens: 800,
                });

                extractorRows.push({
                  arm,
                  trial,
                  id: fixture.id,
                  status: status.status,
                  retainMs,
                  factCount: facts.total,
                  admittedByIncumbent: admissible,
                  reviewError,
                  syntheticFactTexts: facts.items.map(({ text }) => text),
                  recallMs: performance.now() - recallStarted,
                  recallFactCount: recalled.results.length,
                  extractionCostUsd,
                  admissionCostUsd,
                  admissionCharges: reviewCharges,
                  extractionAndAdmissionCostUsd:
                    extractionCostUsd === null || admissionCostUsd === null
                      ? null
                      : extractionCostUsd + admissionCostUsd,
                  extractionCharges: charges,
                  extractionUsage,
                  usageAttribution: 'dedicated-instance-retain-counter-delta',
                });
                // Synthetic inspection only: these remote facts are not admitted
                // into an application bank or served to a real user.
              }
            } finally {
              await hindsight.deleteBank(bankId);
            }
          }
        }
      } finally {
        await turns.onModuleDestroy();
        capacity.onModuleDestroy();
        writeFileSync(
          reportPath,
          JSON.stringify(
            {
              version: OPTIMIZATION_FIXTURE_VERSION,
              generatedAt: new Date().toISOString(),
              labelsStatus: 'draft-needs-human-review',
              broadRolloutAuthorized: false,
              turnSelectionRule: 'independent-inclusion-no-forcing-v2',
              thresholds: settings.thresholds,
              decisions,
              turns: turnRows,
              eligibility: eligibilityRows,
              extractors: extractorRows,
            },
            null,
            2,
          ),
          { mode: 0o600 },
        );
      }

      if (decisionsEnabled) {
        expect(decisions.length).toBeGreaterThan(0);
        expect(decisions.some(({ result }) => result.status === 'ok')).toBe(
          true,
        );
      } else expect(extractorRows.length).toBeGreaterThan(0);
    }, 600000);
  },
);
