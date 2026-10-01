import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/infra/prisma';
import { HttpHindsightGateway } from '../../src/infra/hindsight/http-hindsight.gateway';
import {
  HINDSIGHT_API_VERSION,
  validateHindsightEnvironment,
} from '../../src/infra/hindsight';
import { EmbeddingsService } from '../../src/infra/embeddings';
import { OpenRouterLanguageModel } from '../../src/infra/model-gateway';
import { ObservabilityService } from '../../src/infra/observability';
import type { QueueService } from '../../src/infra/queue';
import {
  PrismaConversationRepository,
  PrismaHindsightRepository,
  PrismaMemoryRepository,
  PrismaUserRepository,
} from '../../src/database/repositories';
import { MemoryService } from '../../src/modules/memories/memory.service';
import { MemoryEngineService } from '../../src/modules/memories/memory-engine.service';
import { MemoryAccessService } from '../../src/modules/memories/memory-access.service';
import type { MemorySearchHit } from '../../src/modules/memories/memory-access.types';
import { MemoryPolicyService } from '../../src/modules/memories/memory-policy.service';
import { HindsightBackfillService } from '../../src/modules/memories/hindsight-backfill.service';
import { HindsightDeliveryService } from '../../src/modules/memories/hindsight-delivery.service';
import { ContextBuilderService } from '../../src/modules/conversations/services/context-builder.service';
import {
  MEMORY_EVALUATION_FACTS,
  MEMORY_EVALUATION_QUERIES,
  MEMORY_EVALUATION_PROBE_QUERIES,
  MEMORY_EVALUATION_VERSION,
  percentile,
  retrievalScore,
  type MemoryEvaluationQuery,
} from './memory-evaluation.fixtures';

describe('Memory comparison measurements', () => {
  test('irrelevant sources and unknown queries cannot inflate precision or recall', () => {
    expect(retrievalScore(['language'], ['language', 'city', 'city'])).toEqual({
      precision: 0.5,
      recall: 1,
      exact: false,
    });
    expect(retrievalScore(['language'], [])).toEqual({
      precision: 0,
      recall: 0,
      exact: false,
    });
    expect(retrievalScore([], ['city'])).toEqual({
      precision: 0,
      recall: 0,
      exact: false,
    });
    expect(retrievalScore([], [])).toEqual({
      precision: 1,
      recall: 1,
      exact: true,
    });
  });
  test('nearest-rank percentiles preserve outliers rather than averaging them away', () => {
    expect(percentile([100, 1, 3, 2], 0.95)).toBe(100);
    expect(percentile([100, 1, 3, 2], 0.5)).toBe(2);
    expect(percentile([], 0.95)).toBeNull();
  });
});

const databaseUrl = process.env.HINDSIGHT_LEDGER_CONTRACT_URL;
const url = process.env.HINDSIGHT_CONTRACT_URL;
const key = process.env.HINDSIGHT_CONTRACT_KEY;
const policyKey = process.env.HINDSIGHT_POLICY_CONTRACT_KEY;
const enabled = process.env.HINDSIGHT_EVALUATION_ENABLED === 'true';
if (
  enabled &&
  (!databaseUrl ||
    !new URL(databaseUrl).pathname.startsWith(
      '/sydia_hindsight_ledger_contract',
    ) ||
    !url ||
    !key ||
    !policyKey)
)
  throw new Error(
    'Memory evaluation requires dedicated synthetic database and explicit contract credentials',
  );
const reportPath = process.env.HINDSIGHT_EVALUATION_REPORT_PATH;
const similaritySettings = validateHindsightEnvironment({
  BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY:
    process.env.HINDSIGHT_EVALUATION_MIN_SIMILARITY,
});

const includeProbes = process.env.HINDSIGHT_EVALUATION_PROBES === 'true';
const queries = includeProbes
  ? [...MEMORY_EVALUATION_QUERIES, ...MEMORY_EVALUATION_PROBE_QUERIES]
  : MEMORY_EVALUATION_QUERIES;

if (reportPath && !isAbsolute(reportPath))
  throw new Error('Evaluation report path must be absolute');
type Row = {
  stage: string;
  queryId: string;
  dimension: string;
  engine: 'legacy' | 'hindsight';
  sample: number;
  latencyMs: number;
  error: boolean;
  expectedKeys: readonly string[];
  returnedKeys: string[];
  precision: number;
  recall: number;
  exact: boolean;
  resultTokens: number;
  results: Array<{ content: string; keys: string[] }>;
  answer?: {
    text: string;
    matchedTerms: boolean | null;
    forbiddenTerms: boolean;
    latencyMs: number;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
  };
};

(enabled ? describe : describe.skip)(
  'Synthetic memory engine comparison',
  () => {
    test('records paired retrieval, controlled answers, correction, forgetting, and operational deadlines', async () => {
      const runId = randomUUID();
      const hsUser = `synthetic-eval-hs-${runId}`;
      const legacyUser = `synthetic-eval-legacy-${runId}`;
      const owners = [hsUser, legacyUser];
      const namespace = `eval-${runId}`;
      const config = new ConfigService({
        BACKEND_DB_URL: databaseUrl,
        BACKEND_HINDSIGHT_URL: url,
        BACKEND_HINDSIGHT_API_KEY: key,
        BACKEND_HINDSIGHT_NAMESPACE: namespace,
        BACKEND_MEMORY_ENGINE: 'hindsight',
        BACKEND_HINDSIGHT_TIMEOUT_MS: 30000,
        BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS: 20000,
        BACKEND_HINDSIGHT_RECALL_TOKENS: 800,
        BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY:
          similaritySettings.BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY,
      });

      const prisma = new PrismaService(config);
      const ledger = new PrismaHindsightRepository(prisma);
      const memories = new PrismaMemoryRepository(prisma);
      const conversations = new PrismaConversationRepository(prisma);
      const users = new PrismaUserRepository(prisma);
      const gateway = new HttpHindsightGateway(config);
      const engine = new MemoryEngineService(config);
      const bankId = engine.bankId(hsUser);
      const embeddings = new EmbeddingsService(
        new ConfigService({
          BACKEND_MODEL_API_KEY: policyKey,
          BACKEND_MODEL_BASE_URL:
            process.env.HINDSIGHT_EMBEDDING_CONTRACT_BASE_URL,
          BACKEND_EMBEDDING_CONCURRENCY: 2,
        }),
      );

      const legacy = new MemoryService(memories, embeddings, config);
      const model = new OpenRouterLanguageModel(
        new ConfigService({
          BACKEND_MODEL_API_KEY: policyKey,
          BACKEND_MODEL_NAME: 'qwen/qwen3.8-flash',
          BACKEND_MODEL_BASE_URL:
            process.env.HINDSIGHT_POLICY_CONTRACT_BASE_URL,
        }),
        ObservabilityService.disabled(),
      );

      const reviewCalls: Array<{
        durationMs: number;
        inputTokens: number | null;
        outputTokens: number | null;
        costUsd: number | null;
      }> = [];

      const policy = new MemoryPolicyService({
        provider: model.provider,
        model: model.model,
        generate: async (request) => {
          const started = performance.now();
          const result = await model.generate(request);
          reviewCalls.push({
            durationMs: performance.now() - started,
            inputTokens: result.usage.inputTokens ?? null,
            outputTokens: result.usage.outputTokens ?? null,
            costUsd: result.usage.costUsd ?? null,
          });

          return result;
        },
      });

      const delivery = new HindsightDeliveryService(
        ledger,
        gateway,
        config,
        policy,
      );

      const queues = {
        memoryDeliveries: { add: () => Promise.resolve() },
      } as unknown as QueueService;

      const access = new MemoryAccessService(
        engine,
        legacy,
        memories,
        ledger,
        gateway,
        conversations,
        queues,
        users,
        policy,
      );

      const backfill = new HindsightBackfillService(
        memories,
        ledger,
        users,
        engine,
        conversations,
        policy,
      );

      const defaultFloorAccess = new MemoryAccessService(
        engine,
        legacy,
        memories,
        ledger,
        new HttpHindsightGateway(
          new ConfigService({
            BACKEND_HINDSIGHT_URL: url,
            BACKEND_HINDSIGHT_API_KEY: key,
            BACKEND_HINDSIGHT_TIMEOUT_MS: 30000,
            BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS: 20000,
          }),
        ),
        conversations,
        queues,
        users,
        policy,
      );

      const compareDefault =
        config.get<number>('BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY') !==
        undefined;

      const ids = new Map<string, string>();
      const sourceKeys = new Map<string, string>();
      const legacyIds = new Map<string, string>();
      const rows: Row[] = [];
      const answers = process.env.HINDSIGHT_EVALUATION_ANSWERS !== 'false';
      const outputPath =
        reportPath ?? `/tmp/sydia-hindsight-evaluation-${runId}.json`;

      let importMs = 0;
      let admittedSources = 0;
      let phase = 'seed';
      let importOutcomes: Array<{ key: string; status: string }> = [];

      try {
        expect(await gateway.version()).toBe(HINDSIGHT_API_VERSION);

        for (const owner of owners) {
          await prisma.user.create({
            data: {
              id: owner,
              name: 'Synthetic evaluation user',
              email: `${owner}@example.invalid`,
              locale: 'en',
              timezone: 'Asia/Makassar',
            },
          });
          const conversation = await prisma.conversation.create({
            data: { userId: owner },
          });

          for (const fixture of MEMORY_EVALUATION_FACTS) {
            const message = await prisma.message.create({
              data: {
                userId: owner,
                conversationId: conversation.id,
                role: 'user',
                content: fixture.evidence,
                createdAt: new Date(fixture.eventAt),
              },
            });

            const saved = await legacy.create(owner, {
              content: fixture.fact,
              sourceType: 'chat',
              sourceMessageId: message.id,
              sourceMessageIds: [message.id],
            });

            ids.set(saved.id, fixture.key);
            if (owner === legacyUser) legacyIds.set(fixture.key, saved.id);
          }
        }

        // Fail setup if legacy silently degraded to keyword-only indexing.
        const indexed = await prisma.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*)::bigint AS count FROM memory WHERE "userId" IN (${hsUser}, ${legacyUser}) AND embedding IS NOT NULL`;

        expect(Number(indexed[0]!.count)).toBe(
          MEMORY_EVALUATION_FACTS.length * 2,
        );
        process.stdout.write(
          'Evaluation: identical saved-fact corpora indexed; importing through policy/admission.\n',
        );
        const importedAt = performance.now();
        phase = 'backfill';
        const batch = await backfill.batch(hsUser, {
          dryRun: false,
          limit: 100,
        });

        importOutcomes = batch.outcomes.map(({ legacyId, status }) => ({
          key: ids.get(legacyId) ?? 'unmapped',
          status,
        }));

        expect(batch.interrupted).toBe(false);
        expect(batch.outcomes).toHaveLength(MEMORY_EVALUATION_FACTS.length);

        for (const outcome of batch.outcomes) {
          expect(outcome.status).toBe('written');
          sourceKeys.set(outcome.sourceId!, ids.get(outcome.legacyId)!);
        }

        await settle();
        importMs = performance.now() - importedAt;
        admittedSources = await prisma.hindsightDelivery.count({
          where: { source: { bankId }, state: 'admitted' },
        });
        expect(admittedSources).toBe(MEMORY_EVALUATION_FACTS.length);
        phase = 'retrieval-and-controlled-answers';
        process.stdout.write(
          `Evaluation: ${admittedSources} sources admitted in ${Math.round(importMs)}ms; running paired queries.\n`,
        );

        for (let sample = 0; sample < 2; sample++) {
          for (const item of queries) {
            if (compareDefault && sample === 0)
              await measure(
                'default-floor',
                item,
                sample,
                sample === 0 && answers,
                'hindsight',
                defaultFloorAccess,
              );
            await compare('initial', item, sample, sample === 0 && answers);
            if (compareDefault && sample !== 0)
              await measure(
                'default-floor',
                item,
                sample,
                false,
                'hindsight',
                defaultFloorAccess,
              );
          }
        }

        const operationalConfig = new ConfigService({
          ...Object.fromEntries(
            [
              'BACKEND_DB_URL',
              'BACKEND_HINDSIGHT_URL',
              'BACKEND_HINDSIGHT_API_KEY',
              'BACKEND_HINDSIGHT_NAMESPACE',
              'BACKEND_MEMORY_ENGINE',
              'BACKEND_HINDSIGHT_RECALL_TOKENS',
              'BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY',
            ].map((name) => [name, config.get<unknown>(name)]),
          ),
          BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS: 1500,
        });

        phase = 'operational-deadline';

        const operational = new MemoryAccessService(
          engine,
          legacy,
          memories,
          ledger,
          new HttpHindsightGateway(operationalConfig),
          conversations,
          queues,
          users,
          policy,
        );

        for (const item of queries)
          await measure(
            'operational-1500ms',
            item,
            0,
            false,
            'hindsight',
            operational,
          );

        const languageSource = [...sourceKeys].find(
          ([, value]) => value === 'language',
        )![0];

        phase = 'correction';

        const correctionConversation = await prisma.conversation.create({
          data: { userId: hsUser },
        });

        const correction = await prisma.message.create({
          data: {
            userId: hsUser,
            conversationId: correctionConversation.id,
            role: 'user',
            content: 'I now prefer replies in English. Remember that instead.',
          },
        });

        const languageSnapshot = (await ledger.snapshot(
          hsUser,
          languageSource,
        ))!;

        await access.update(
          hsUser,
          `hs:${languageSource}:${languageSnapshot.source.generation}`,
          { content: 'The user now prefers replies in English.' },
          { idempotencyKey: randomUUID(), sourceMessageId: correction.id },
        );
        const updated = (await legacy.update(
          legacyUser,
          legacyIds.get('language')!,
          { content: 'The user now prefers replies in English.' },
        ))!;

        ids.set(updated.id, 'language');
        await settle();
        await compare(
          'corrected',
          {
            id: 'language-current',
            query: 'Which language do I prefer for replies now?',
            expectedKeys: ['language'],
            dimension: 'correction',
            answerTerms: ['english|inggris'],
            forbiddenTerms: ['indonesian|indonesia'],
          },
          0,
          answers,
        );
        const bikingSource = [...sourceKeys].find(
          ([, value]) => value === 'biking',
        )![0];

        phase = 'forgetting';

        const bikingSnapshot = (await ledger.snapshot(hsUser, bikingSource))!;
        await access.delete(
          hsUser,
          `hs:${bikingSource}:${bikingSnapshot.source.generation}`,
        );
        await memories.delete(legacyUser, legacyIds.get('biking')!);
        await settle();
        await compare(
          'forgotten',
          {
            id: 'biking-forgotten',
            query: 'What is my usual weekend exercise?',
            expectedKeys: [],
            dimension: 'forgetting',
            answerTerms: [],
            forbiddenTerms: ['bicycle|cycling|sepeda'],
          },
          0,
          answers,
        );
        const groups = [
          ...new Set(rows.map((row) => `${row.stage}:${row.engine}`)),
        ].map((group) => {
          const selected = rows.filter(
            (row) => `${row.stage}:${row.engine}` === group,
          );

          const successful = selected.filter((row) => !row.error);

          return {
            group,
            samples: selected.length,
            errors: selected.filter((row) => row.error).length,
            recallMean:
              selected.reduce((sum, row) => sum + row.recall, 0) /
              selected.length,
            precisionMean:
              selected.reduce((sum, row) => sum + row.precision, 0) /
              selected.length,
            exactMatches: selected.filter((row) => row.exact).length,
            latencyP50Ms: percentile(
              selected.map((row) => row.latencyMs),
              0.5,
            ),
            latencyP95Ms: percentile(
              selected.map((row) => row.latencyMs),
              0.95,
            ),
            successfulLatencyP95Ms: percentile(
              successful.map((row) => row.latencyMs),
              0.95,
            ),
          };
        });

        const report = {
          version: MEMORY_EVALUATION_VERSION,
          runId,
          recordedAt: new Date().toISOString(),
          fixtureStatus: 'synthetic draft; not reviewed release ground truth',
          conditions: {
            savedFacts: MEMORY_EVALUATION_FACTS.length,
            pairedQueries: queries.length,
            includesDraftProbes: includeProbes,
            semanticMinSimilarity:
              config.get<number>('BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY') ??
              null,
            comparesDefaultFloor: compareDefault,
            samplesPerInitialQuery: 2,
            searchLimit: 5,
            recallTokens: 800,
            qualityRecallDeadlineMs: 20000,
            operationalRecallDeadlineMs: 1500,
            apiVersion: HINDSIGHT_API_VERSION,
            embeddingModel: embeddings.modelName(),
            model: model.model,
            sourceEvents: MEMORY_EVALUATION_FACTS.map(({ key, eventAt }) => ({
              key,
              eventAt,
            })),
          },
          import: { durationMs: importMs, admittedSources, reviewCalls },
          cost: {
            providerReportedReviewUsd: reviewCalls.every(
              ({ costUsd }) => costUsd !== null,
            )
              ? reviewCalls.reduce((sum, row) => sum + row.costUsd!, 0)
              : null,
            providerReportedAnswersUsd: rows
              .filter(({ answer }) => answer)
              .every(({ answer }) => answer!.costUsd !== null)
              ? rows.reduce((sum, row) => sum + (row.answer?.costUsd ?? 0), 0)
              : null,
            embeddingUsd: null,
            hindsightExtractionEmbeddingRerankingUsd: null,
            totalUsd: null,
          },
          scope:
            'Saved-fact retrieval and controlled answers through the existing context builder; excludes legacy extraction quality, autonomous tool selection, load/capacity, and production traffic.',
          groups,
          rows,
        };

        writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
          mode: 0o600,
        });
        process.stdout.write(
          `Evaluation report: ${outputPath}\n${JSON.stringify(groups)}\n`,
        );

        phase = 'final-invariants';

        for (const row of rows.filter(
          ({ stage }) => stage === 'corrected' || stage === 'forgotten',
        )) {
          expect(row.error).toBe(false);
          const forbidden =
            row.stage === 'corrected'
              ? /indonesian|indonesia/i
              : /bicycle|cycling|sepeda/i;

          expect(
            row.results.some(({ content }) => forbidden.test(content)),
          ).toBe(false);
        }
      } catch (error: unknown) {
        writeFileSync(
          `${outputPath}.failed.json`,
          `${JSON.stringify({ version: MEMORY_EVALUATION_VERSION, runId, phase, failed: true, errorType: error instanceof Error ? error.name : 'unknown', importOutcomes, reviewCalls, rows }, null, 2)}\n`,
          { mode: 0o600 },
        );
        throw error;
      } finally {
        await gateway.deleteBank(bankId);
        await prisma.hindsightReference.deleteMany({
          where: { delivery: { source: { bankId } } },
        });
        await prisma.hindsightDelivery.deleteMany({
          where: { source: { bankId } },
        });
        await prisma.hindsightSource.deleteMany({ where: { bankId } });
        await prisma.hindsightBank.deleteMany({ where: { id: bankId } });
        await prisma.hindsightSuppression.deleteMany({
          where: { userId: { in: owners } },
        });
        await prisma.user.deleteMany({ where: { id: { in: owners } } });
        await prisma.$disconnect();
      }

      async function settle(): Promise<void> {
        const deadline = Date.now() + 180000;

        while (Date.now() < deadline) {
          await delivery.flushBank(bankId);
          const pending = await prisma.hindsightDelivery.count({
            where: {
              source: { bankId },
              state: { notIn: ['admitted', 'erased'] },
            },
          });

          if (!pending) return;
          await sleep(1000);
        }

        throw new Error(
          'Evaluation admission/erasure did not drain before its deadline',
        );
      }

      async function compare(
        stage: string,
        item: MemoryEvaluationQuery,
        sample: number,
        withAnswer: boolean,
      ): Promise<void> {
        const engines =
          sample % 2
            ? (['hindsight', 'legacy'] as const)
            : (['legacy', 'hindsight'] as const);

        for (const current of engines)
          await measure(stage, item, sample, withAnswer, current, access);
        process.stdout.write(
          `Evaluation: ${stage}/${item.id} sample=${sample} recorded\n`,
        );
      }

      async function measure(
        stage: string,
        item: MemoryEvaluationQuery,
        sample: number,
        withAnswer: boolean,
        current: 'legacy' | 'hindsight',
        candidate: MemoryAccessService,
      ): Promise<void> {
        const started = performance.now();
        let hits: MemorySearchHit[] = [];
        let error = false;

        try {
          hits =
            current === 'legacy'
              ? await legacy.search(legacyUser, item.query, 5)
              : await candidate.search(hsUser, item.query, 5);
        } catch {
          error = true;
        }

        const latencyMs = performance.now() - started;
        const results = hits.map((hit) => ({
          content: hit.content,
          keys:
            current === 'legacy'
              ? [ids.get(hit.id) ?? 'unmapped']
              : [
                  ...new Set(
                    hit.evidence?.map(
                      ({ sourceId }) => sourceKeys.get(sourceId) ?? 'unmapped',
                    ) ?? [],
                  ),
                ],
        }));

        const returnedKeys = [...new Set(results.flatMap(({ keys }) => keys))];
        const row: Row = {
          stage,
          queryId: item.id,
          dimension: item.dimension,
          engine: current,
          sample,
          latencyMs,
          error,
          expectedKeys: item.expectedKeys,
          returnedKeys,
          ...retrievalScore(item.expectedKeys, returnedKeys),
          resultTokens: Math.ceil(
            results.reduce((sum, { content }) => sum + content.length, 0) / 4,
          ),
          results,
        };

        if (error) {
          row.precision = 0;
          row.recall = 0;
          row.exact = false;
        }

        if (withAnswer && !error) {
          const conversation = await prisma.conversation.create({
            data: { userId: hsUser },
          });

          const message = await prisma.message.create({
            data: {
              userId: hsUser,
              conversationId: conversation.id,
              role: 'user',
              content: item.query,
            },
          });

          const user = (await users.findById(hsUser))!;
          const contextEngine = new MemoryEngineService(
            new ConfigService({
              BACKEND_MEMORY_ENGINE: 'hindsight',
              BACKEND_MEMORY_AUTO_RECALL_ENABLED: true,
              BACKEND_HINDSIGHT_RECALL_TOKENS: 800,
            }),
          );

          // Same real prompt/context assembly for both result sets; no extra answer prompt.
          const builder = new ContextBuilderService(
            conversations,
            new ConfigService({ BACKEND_ASSISTANT_CONTEXT_TOKENS: 6000 }),
            undefined,
            memories,
            {
              search: () => Promise.resolve(hits),
            } as unknown as MemoryAccessService,
            contextEngine,
          );

          const context = await builder.build(
            user,
            conversation.id,
            message.id,
          );

          const answerAt = performance.now();
          const answer = await model.generate({
            messages: context.messages,
            userId: hsUser,
            temperature: 0,
            maxOutputTokens: 256,
            maxSteps: 1,
            traceContent: false,
            traceName: 'memory-evaluation.controlled-answer',
          });

          row.answer = {
            text: answer.text,
            matchedTerms: item.answerTerms.length
              ? item.answerTerms.every((term) =>
                  new RegExp(term, 'i').test(answer.text),
                )
              : null,
            forbiddenTerms: (item.forbiddenTerms ?? []).some((term) =>
              new RegExp(term, 'i').test(answer.text),
            ),
            latencyMs: performance.now() - answerAt,
            inputTokens: answer.usage.inputTokens ?? null,
            outputTokens: answer.usage.outputTokens ?? null,
            costUsd: answer.usage.costUsd ?? null,
          };
        }

        rows.push(row);
      }
    }, 900000);
  },
);
