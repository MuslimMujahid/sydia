import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import {
  DecisionSettings,
  type DecisionGateway,
  type DecisionResult,
} from '../../src/infra/decision-gateway';
import { DecisionCapacityService } from '../../src/infra/decision-gateway/decision-capacity.service';
import { TypeSafeDecisionGateway } from '../../src/infra/decision-gateway/typesafe-decision.gateway';
import { ObservabilityService } from '../../src/infra/observability';
import { OpenRouterLanguageModel } from '../../src/infra/model-gateway';
import { MemoryFactDecisionService } from '../../src/modules/memories/memory-fact-decision.service';
import { MemoryPolicyService } from '../../src/modules/memories/memory-policy.service';
import {
  FACT_FIXTURES,
  FACT_FIXTURE_VERSION,
} from './optimization.fact-fixtures';
import { ReviewUsage, totalReviewCost } from './optimization.review-usage';

const enabled = process.env.OPTIMIZATION_FACTS_ENABLED === 'true';
const modes = ['off', 'shadow', 'reject-only', 'enabled'] as const;
const reportPath =
  process.env.OPTIMIZATION_REPORT_PATH ??
  `/tmp/sydia-fact-review-${randomUUID()}.json`;

const reportRelative = relative(resolve(process.cwd(), '../..'), reportPath);
if (enabled && (!isAbsolute(reportPath) || !reportRelative.startsWith('..')))
  throw new Error('Fact report must be absolute and outside the repository');

(enabled ? describe : describe.skip)('Synthetic fact-review comparison', () => {
  test('measures Jev-only decisions and charges in each mode', async () => {
    for (const key of ['BACKEND_MODEL_API_KEY', 'BACKEND_REDIS_URL'])
      if (!process.env[key]) throw new Error(`Fact comparison requires ${key}`);
    const config = new ConfigService({
      ...process.env,
      BACKEND_DECISION_PROVIDER: 'openrouter',
      BACKEND_DECISION_MODEL: 'typesafe/jev-1.13',
      BACKEND_MEMORY_FACT_REVIEW_MODE: 'shadow',
      BACKEND_DECISION_BACKGROUND_TIMEOUT_MS: 5000,
      BACKEND_DECISION_COHORT: 'synthetic-facts',
      BACKEND_DECISION_CALIBRATION_VERSION: FACT_FIXTURE_VERSION,
      BACKEND_DECISION_SHADOW_SAMPLE_PERCENT: 100,
      BACKEND_DECISION_THRESHOLDS_JSON: '{}',
    });

    const capacity = new DecisionCapacityService(config);
    const adapter = new TypeSafeDecisionGateway(
      config,
      capacity,
      ObservabilityService.disabled(),
    );

    const rows: Array<{
      id: string;
      mode: (typeof modes)[number];
      admitted: boolean | null;
      error: string | null;
      durationMs: number;
      decisionResults: DecisionResult[];
      factVerdicts: string[];
      reviewCharges: ReviewUsage['charges'];
      decisionCostUsd: number | null;
      admissionCostUsd: number | null;
      combinedCostUsd: number | null;
      leaseRenewals: number;
    }> = [];

    try {
      await sleep(500);

      for (const [index, fixture] of FACT_FIXTURES.entries()) {
        // Rotate arm order to avoid assigning every cold request to one mode.
        for (const mode of [
          ...modes.slice(index % modes.length),
          ...modes.slice(0, index % modes.length),
        ]) {
          const results: DecisionResult[] = [];
          const gateway: DecisionGateway = {
            decide: async (request) => {
              const result = await adapter.decide({
                ...request,
                environment: 'test',
              });

              results.push(result);

              return result;
            },
          };

          const settings = new DecisionSettings(
            new ConfigService({
              BACKEND_MEMORY_FACT_REVIEW_MODE: mode,
              BACKEND_DECISION_COHORT: 'synthetic-facts',
              BACKEND_DECISION_CALIBRATION_VERSION: FACT_FIXTURE_VERSION,
              BACKEND_DECISION_SHADOW_SAMPLE_PERCENT: 100,
            }),
          );

          const factService = new MemoryFactDecisionService(gateway, settings);
          const realReview = factService.review.bind(factService);
          const verdicts: string[] = [];
          jest
            .spyOn(factService, 'review')
            .mockImplementation(async (...args) => {
              const verdict = await realReview(...args);
              verdicts.push(verdict.status);

              return verdict;
            });
          const usage = new ReviewUsage();
          const policy = new MemoryPolicyService(
            new OpenRouterLanguageModel(config, usage),
            factService,
          );

          let admitted: boolean | null = null;
          let error: string | null = null;
          let leaseRenewals = 0;
          const started = performance.now();

          try {
            admitted = await policy.approveFacts(
              'synthetic-facts',
              JSON.stringify({
                sydiaSource: 1,
                userEvidence: fixture.evidence.join('\n'),
                approvedEvidence: fixture.evidence,
                permissionQuotes: fixture.permissions,
              }),
              fixture.candidates.map((text, candidateIndex) => ({
                id: `fact-${candidateIndex}`,
                text,
                type: 'world',
                documentId: fixture.id,
                sourceFactIds: [],
                metadata: {},
                occurredStart: null,
                mentionedAt: null,
              })),
              () => {
                leaseRenewals++;

                return Promise.resolve();
              },
            );
          } catch (cause) {
            error = cause instanceof Error ? cause.name : 'UnknownError';
          }

          const decisionCostUsd = results.some(
            (result) => result.status !== 'ok' || result.costUsd === null,
          )
            ? null
            : results.reduce(
                (sum, result) =>
                  sum + (result.status === 'ok' ? result.costUsd! : 0),
                0,
              );

          const admissionCostUsd = usage.charges.length
            ? totalReviewCost(usage.charges)
            : 0;

          rows.push({
            id: fixture.id,
            mode,
            admitted,
            error,
            durationMs: performance.now() - started,
            decisionResults: results,
            factVerdicts: verdicts,
            reviewCharges: usage.charges,
            decisionCostUsd,
            admissionCostUsd,
            combinedCostUsd:
              decisionCostUsd === null || admissionCostUsd === null
                ? null
                : decisionCostUsd + admissionCostUsd,
            leaseRenewals,
          });
          // Contract checks only; proposed labels are intentionally not a release gate.
          if (mode === 'off') expect(results).toHaveLength(0);
          if (mode === 'shadow')
            expect(verdicts.every((verdict) => verdict === 'unavailable')).toBe(
              true,
            );
          if (mode === 'reject-only') expect(verdicts).not.toContain('allow');
          if (
            (fixture.category === 'sensitive' && !fixture.permissions.length) ||
            fixture.category === 'permission-mismatch'
          )
            expect(verdicts).not.toContain('allow');

          if (fixture.category === 'credential') {
            expect(admitted).toBe(false);
            expect(results).toHaveLength(0);
            expect(usage.charges).toHaveLength(0);
          }
        }
      }
    } finally {
      capacity.onModuleDestroy();
      writeFileSync(
        reportPath,
        JSON.stringify(
          {
            version: FACT_FIXTURE_VERSION,
            generatedAt: new Date().toISOString(),
            labelsStatus: 'draft-needs-human-review',
            broadRolloutAuthorized: false,
            fixtures: FACT_FIXTURES,
            rows,
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
    }

    expect(rows).toHaveLength(FACT_FIXTURES.length * modes.length);
    expect(
      rows.some(({ decisionResults }) =>
        decisionResults.some((result) => result.status === 'ok'),
      ),
    ).toBe(true);
  }, 600000);
});
