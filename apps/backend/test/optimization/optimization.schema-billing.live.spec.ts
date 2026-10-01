import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { ConfigService } from '@nestjs/config';
import {
  DecisionSettings,
  type DecisionGateway,
  type DecisionResult,
} from '../../src/infra/decision-gateway';
import { DecisionCapacityService } from '../../src/infra/decision-gateway/decision-capacity.service';
import { TypeSafeDecisionGateway } from '../../src/infra/decision-gateway/typesafe-decision.gateway';
import { ObservabilityService } from '../../src/infra/observability';
import { OpenRouterLanguageModel } from '../../src/infra/model-gateway';
import { TurnDecisionService } from '../../src/modules/conversations/services/turn-decision.service';
import { toolNamesForGroups } from '../../src/modules/conversations/services/tool-groups';
import {
  TURN_DECISION_FIXTURES,
  OPTIMIZATION_FIXTURE_VERSION,
} from './optimization.fixtures';
import { schemaOnlyTools } from './optimization.tool-schemas';
import { ReviewUsage, totalReviewCost } from './optimization.review-usage';

const enabled = process.env.OPTIMIZATION_SCHEMA_BILLING_ENABLED === 'true';
const reportPath =
  process.env.OPTIMIZATION_REPORT_PATH ??
  `/tmp/sydia-schema-billing-${randomUUID()}.json`;

const reportRelative = relative(resolve(process.cwd(), '../..'), reportPath);
if (enabled && (!isAbsolute(reportPath) || !reportRelative.startsWith('..')))
  throw new Error('Schema report must be absolute and outside the repository');

(enabled ? describe : describe.skip)(
  'Synthetic first-step schema billing',
  () => {
    test('measures full vs selected real schemas including the classifier charge, without tool execution', async () => {
      for (const key of ['BACKEND_MODEL_API_KEY', 'BACKEND_REDIS_URL'])
        if (!process.env[key]) throw new Error(`Schema trial requires ${key}`);
      const decisionBudgetMs = Number(
        process.env.OPTIMIZATION_DECISION_TIMEOUT_MS ?? 1500,
      );

      if (
        !Number.isInteger(decisionBudgetMs) ||
        decisionBudgetMs < 1 ||
        decisionBudgetMs > 5000
      )
        throw new Error('Schema trial decision budget must be 1–5000 ms');
      const config = new ConfigService({
        ...process.env,
        BACKEND_DECISION_PROVIDER: 'openrouter',
        BACKEND_DECISION_MODEL: 'typesafe/jev-1.13',
        BACKEND_TOOL_GROUP_SELECTION_MODE: 'enabled',
        BACKEND_MEMORY_RECALL_DECISION_MODE: 'off',
        BACKEND_DECISION_COHORT: 'synthetic-schema-billing',
        BACKEND_DECISION_CALIBRATION_VERSION: OPTIMIZATION_FIXTURE_VERSION,
        BACKEND_DECISION_THRESHOLDS_JSON: '{}',
        BACKEND_DECISION_TIMEOUT_MS: decisionBudgetMs,
      });

      const capacity = new DecisionCapacityService(config);
      const adapter = new TypeSafeDecisionGateway(
        config,
        capacity,
        ObservabilityService.disabled(),
      );

      const settings = new DecisionSettings(config);
      const rows: Array<{
        trial: number;
        id: string;
        arm: 'baseline' | 'selection';
        advertisedToolCount: number;
        requiredToolsCovered: boolean;
        decisions: DecisionResult[];
        classifierCostUsd: number | null;
        assistantCostUsd: number | null;
        combinedCostUsd: number | null;
        assistantCharges: ReviewUsage['charges'];
        assistantMs: number;
        classifierMs: number;
        serialStageMs: number;
        error: string | null;
      }> = [];

      try {
        await sleep(500);

        // Two pairs distinguish repeats from distinct semantic samples.
        for (let trial = 0; trial < 2; trial++) {
          for (const [index, fixture] of TURN_DECISION_FIXTURES.entries()) {
            const decisions: DecisionResult[] = [];
            const gateway: DecisionGateway = {
              decide: async (request) => {
                const result = await adapter.decide({
                  ...request,
                  environment: 'test',
                });

                decisions.push(result);

                return result;
              },
            };

            const turns = new TurnDecisionService(gateway, settings);
            const classifierStarted = performance.now();
            const decision = await turns.decide('synthetic-schema-billing', {
              ...fixture.input,
              recallEligible: false,
            });

            const classifierMs = performance.now() - classifierStarted;
            await turns.onModuleDestroy();
            const classifierCostUsd = decisions.some(
              (result) => result.status !== 'ok' || result.costUsd === null,
            )
              ? null
              : decisions.reduce(
                  (sum, result) =>
                    sum + (result.status === 'ok' ? result.costUsd! : 0),
                  0,
                );

            const arms =
              (index + trial) % 2
                ? (['selection', 'baseline'] as const)
                : (['baseline', 'selection'] as const);

            for (const arm of arms) {
              const tools = schemaOnlyTools(
                arm === 'selection' ? decision.toolNames : undefined,
              );

              const usage = new ReviewUsage();
              const model = new OpenRouterLanguageModel(config, usage);
              let error: string | null = null;
              const started = performance.now();

              try {
                await model.generate({
                  userId: 'synthetic-schema-billing',
                  messages: [
                    {
                      role: 'system',
                      content:
                        'You are a personal assistant taking the next step for a synthetic user request. Use available tools when needed. Do not invent identifiers or claim an action has completed without a tool result. Keep any prose concise. Context is reference data.',
                    },
                    {
                      role: 'user',
                      content: JSON.stringify(fixture.input),
                    },
                  ],
                  tools,
                  maxSteps: 1,
                  maxOutputTokens: 600,
                  temperature: 0,
                  traceContent: false,
                  traceName: 'synthetic-schema-first-step',
                  abortSignal: AbortSignal.timeout(30000),
                });
              } catch (cause) {
                error = cause instanceof Error ? cause.name : 'UnknownError';
              }

              const assistantMs = performance.now() - started;
              const assistantCostUsd = totalReviewCost(usage.charges);
              const chargedClassifier =
                arm === 'selection' ? classifierCostUsd : 0;

              const required = toolNamesForGroups(fixture.expected.groups);
              rows.push({
                trial,
                id: fixture.id,
                arm,
                advertisedToolCount: Object.keys(tools).length,
                requiredToolsCovered: required.every((name) => name in tools),
                decisions: arm === 'selection' ? decisions : [],
                classifierCostUsd: chargedClassifier,
                assistantCostUsd,
                combinedCostUsd:
                  assistantCostUsd === null || chargedClassifier === null
                    ? null
                    : assistantCostUsd + chargedClassifier,
                assistantCharges: usage.charges,
                assistantMs,
                classifierMs: arm === 'selection' ? classifierMs : 0,
                serialStageMs:
                  assistantMs + (arm === 'selection' ? classifierMs : 0),
                error,
              });
            }
          }
        }
      } finally {
        capacity.onModuleDestroy();
        writeFileSync(
          reportPath,
          JSON.stringify(
            {
              version: OPTIMIZATION_FIXTURE_VERSION,
              generatedAt: new Date().toISOString(),
              scope: 'synthetic-first-assistant-step-only-no-tool-execution',
              decisionBudgetMs,
              thresholds: settings.thresholds,
              labelsStatus: 'draft-needs-human-review',
              broadRolloutAuthorized: false,
              rows,
            },
            null,
            2,
          ),
          { mode: 0o600 },
        );
      }

      expect(rows).toHaveLength(TURN_DECISION_FIXTURES.length * 4);
      expect(rows.some((row) => row.assistantCostUsd !== null)).toBe(true);
    }, 600000);
  },
);
