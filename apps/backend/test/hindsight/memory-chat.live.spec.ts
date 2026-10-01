import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/infra/prisma';
import { HttpHindsightGateway } from '../../src/infra/hindsight/http-hindsight.gateway';
import { HINDSIGHT_API_VERSION } from '../../src/infra/hindsight';
import { EmbeddingsService } from '../../src/infra/embeddings';
import {
  OpenRouterLanguageModel,
  OpenRouterMediaService,
} from '../../src/infra/model-gateway';
import type { LanguageModelGateway } from '../../src/infra/model-gateway';
import { ObservabilityService } from '../../src/infra/observability';
import type { QueueService } from '../../src/infra/queue';
import { SecretCipher, TokenCipher } from '../../src/infra/crypto';
import { GoogleCalendarService } from '../../src/infra/calendar';
import { StorageService } from '../../src/infra/storage';
import {
  PrismaAuditEventRepository,
  PrismaCalendarRepository,
  PrismaCategoryRepository,
  PrismaContactGroupRepository,
  PrismaContactRepository,
  PrismaConversationRepository,
  PrismaDailyNoteRepository,
  PrismaDocumentRepository,
  PrismaHindsightRepository,
  PrismaMemoryRepository,
  PrismaReminderRepository,
  PrismaSecretRepository,
  PrismaTaskRepository,
  PrismaUserRepository,
} from '../../src/database/repositories';
import { MemoryService } from '../../src/modules/memories/memory.service';
import { MemoryEngineService } from '../../src/modules/memories/memory-engine.service';
import { MemoryAccessService } from '../../src/modules/memories/memory-access.service';
import { MemoryPolicyService } from '../../src/modules/memories/memory-policy.service';
import { HindsightBackfillService } from '../../src/modules/memories/hindsight-backfill.service';
import { HindsightDeliveryService } from '../../src/modules/memories/hindsight-delivery.service';
import { MemoryDreamSchedulerService } from '../../src/modules/memories/memory-dream-scheduler.service';
import { CalendarService } from '../../src/modules/calendar/calendar.service';
import { DailyNoteService } from '../../src/modules/daily-notes/daily-note.service';
import { DocumentService } from '../../src/modules/documents/document.service';
import { ReminderSchedulerService } from '../../src/modules/reminders/reminder-scheduler.service';
import { SecretsService } from '../../src/modules/secrets/secrets.service';
import { AssistantOrchestratorService } from '../../src/modules/conversations/services/assistant-orchestrator.service';
import { ContextBuilderService } from '../../src/modules/conversations/services/context-builder.service';
import { ConversationSummarizerService } from '../../src/modules/conversations/services/conversation-summarizer.service';
import { DomainToolsProvider } from '../../src/modules/conversations/services/domain-tools.provider';
import { ToolExecutorService } from '../../src/modules/conversations/services/tool-executor.service';
import { MEMORY_EVALUATION_FACTS } from './memory-evaluation.fixtures';
import type { MemorySearchHit } from '../../src/modules/memories/memory-access.types';

const enabled = process.env.HINDSIGHT_CHAT_CONTRACT_ENABLED === 'true';
const databaseUrl = process.env.HINDSIGHT_LEDGER_CONTRACT_URL;
const url = process.env.HINDSIGHT_CONTRACT_URL;
const key = process.env.HINDSIGHT_CONTRACT_KEY;
const policyKey = process.env.HINDSIGHT_POLICY_CONTRACT_KEY;
const reportPath = process.env.HINDSIGHT_CHAT_CONTRACT_REPORT_PATH;
const mutationsOnly =
  process.env.HINDSIGHT_CHAT_CONTRACT_MUTATIONS_ONLY === 'true';

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
    'Chat contract requires dedicated synthetic services and explicit credentials',
  );
if (reportPath && !isAbsolute(reportPath))
  throw new Error('Chat contract report path must be absolute');

type Turn = {
  id: string;
  autoRecall: boolean;
  query: string;
  text: string | null;
  status: string;
  latencyMs: number;
  tools: Array<{
    name: string;
    arguments: unknown;
    result: unknown;
    errorType?: string;
  }>;
  persistedTools: Array<{ name: string; status: string }>;
  expectedTerms: readonly string[];
  matchedTerms: boolean | null;
  literalToolMarkup: boolean;
  currentRequestLast: boolean;
};

(enabled ? describe : describe.skip)(
  'Synthetic Hindsight chat orchestration',
  () => {
    test('measures actual tool flow and verifies save/correction/forget state', async () => {
      const runId = randomUUID();
      const owner = `synthetic-chat-${runId}`;
      const namespace = `chat-${runId}`;
      const root = mkdtempSync(join(tmpdir(), 'sydia-memory-chat-'));
      const outputPath = reportPath ?? join(root, 'report.json');
      const config = new ConfigService({
        BACKEND_DB_URL: databaseUrl,
        BACKEND_HINDSIGHT_URL: url,
        BACKEND_HINDSIGHT_API_KEY: key,
        BACKEND_HINDSIGHT_NAMESPACE: namespace,
        BACKEND_MEMORY_ENGINE: 'hindsight',
        BACKEND_HINDSIGHT_TIMEOUT_MS: 30000,
        BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS: 1500,
        BACKEND_HINDSIGHT_RECALL_TOKENS: 800,
        BACKEND_ASSISTANT_CONTEXT_TOKENS: 6000,
        BACKEND_MODEL_API_KEY: policyKey,
        BACKEND_MODEL_NAME: 'qwen/qwen3.8-flash',
        BACKEND_MODEL_BASE_URL: process.env.HINDSIGHT_POLICY_CONTRACT_BASE_URL,
        BACKEND_AUTH_URL: 'http://127.0.0.1:1',
        FRONTEND_URL: 'http://127.0.0.1:1',
        BACKEND_AUTH_SECRET: randomUUID(),
        BACKEND_SECRET_ENCRYPTION_KEY: randomUUID(),
        BACKEND_STORAGE_LOCAL_ROOT: root,
      });

      const prisma = new PrismaService(config);
      const ledger = new PrismaHindsightRepository(prisma);
      const memories = new PrismaMemoryRepository(prisma);
      const conversations = new PrismaConversationRepository(prisma);
      const users = new PrismaUserRepository(prisma);
      const documents = new PrismaDocumentRepository(prisma);
      const audit = new PrismaAuditEventRepository(prisma);
      const gateway = new HttpHindsightGateway(config);
      const engine = new MemoryEngineService(config);
      const bankId = engine.bankId(owner);
      const embeddings = new EmbeddingsService(
        new ConfigService({
          BACKEND_MODEL_API_KEY: policyKey,
          BACKEND_MODEL_BASE_URL:
            process.env.HINDSIGHT_EMBEDDING_CONTRACT_BASE_URL,
        }),
      );

      const legacy = new MemoryService(memories, embeddings, config);
      const model = new OpenRouterLanguageModel(
        config,
        ObservabilityService.disabled(),
      );

      const usage: Array<{
        purpose: string;
        inputTokens: number | null;
        outputTokens: number | null;
        costUsd: number | null;
      }> = [];

      const policyDiagnostics: Array<{
        candidates: unknown;
        verdicts: unknown;
      }> = [];

      let currentRequestIsLast = false;
      let currentQuery = '';

      const privateModel: LanguageModelGateway = {
        provider: model.provider,
        model: model.model,
        generate: async (request) => {
          if (request.runId)
            currentRequestIsLast =
              request.messages.at(-1)?.content === currentQuery;
          const result = await model.generate({
            ...request,
            traceContent: false,
          });

          // Synthetic local report only; raw evidence/verdicts never enter traces.
          if (request.traceName?.startsWith('memory-policy.facts.')) {
            const input = request.messages.at(-1)?.content;

            if (typeof input === 'string') {
              const parsed = JSON.parse(input) as { candidates?: unknown };
              policyDiagnostics.push({
                candidates: parsed.candidates,
                verdicts: JSON.parse(result.text) as unknown,
              });
            }
          }

          usage.push({
            purpose: request.traceName ?? 'assistant',
            inputTokens: result.usage.inputTokens ?? null,
            outputTokens: result.usage.outputTokens ?? null,
            costUsd: result.usage.costUsd ?? null,
          });

          return result;
        },
      };

      const policy = new MemoryPolicyService(privateModel);
      const delivery = new HindsightDeliveryService(
        ledger,
        gateway,
        config,
        policy,
      );

      // Queue boundary is deliberately inert: delivery is drained explicitly below.
      // No real Redis jobs, reminder notifications, or summary/dream workers run.
      const queues = {
        memoryDeliveries: { add: () => Promise.resolve() },
        conversationSummaries: { add: () => Promise.resolve() },
        memoryDreams: {
          add: () => Promise.resolve(),
          getJobs: () => Promise.resolve([]),
        },
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

      const reminders = new PrismaReminderRepository(prisma);
      const calendars = new PrismaCalendarRepository(
        prisma,
        new TokenCipher(config),
      );

      const provider = new DomainToolsProvider(
        new PrismaTaskRepository(prisma),
        new PrismaCategoryRepository(prisma),
        reminders,
        access,
        new ReminderSchedulerService(reminders, users, queues),
        users,
        new PrismaContactRepository(prisma),
        new PrismaContactGroupRepository(prisma),
        new DocumentService(
          documents,
          new StorageService(config),
          embeddings,
          new OpenRouterMediaService(config),
          queues,
          privateModel,
          config,
        ),
        calendars,
        new CalendarService(calendars, new GoogleCalendarService(config)),
        new SecretsService(
          new PrismaSecretRepository(prisma),
          conversations,
          audit,
          new SecretCipher(config),
          config,
        ),
        new DailyNoteService(
          new PrismaDailyNoteRepository(prisma),
          users,
          embeddings,
          queues,
        ),
      );

      let calls: Turn['tools'] = [];
      const toolExecutor = new ToolExecutorService(
        conversations,
        provider.tools.map((tool) => ({
          ...tool,
          execute: async (input) => {
            try {
              const result = await tool.execute(input);
              calls.push({
                name: tool.definition.name,
                arguments: input.arguments,
                result,
              });

              return result;
            } catch (error: unknown) {
              calls.push({
                name: tool.definition.name,
                arguments: input.arguments,
                result: null,
                errorType: error instanceof Error ? error.name : 'unknown',
              });
              throw error;
            }
          },
        })),
      );

      const turns: Turn[] = [];
      const stateChecks: Array<{
        stage: string;
        results: MemorySearchHit[];
        retiredDocuments?: Array<{
          generation: number;
          remainingFacts: number;
        }>;
      }> = [];

      let phase = 'seed';
      let failure: string | null = null;

      try {
        expect(await gateway.version()).toBe(HINDSIGHT_API_VERSION);
        await prisma.user.create({
          data: {
            id: owner,
            name: 'Synthetic chat user',
            email: `${owner}@example.invalid`,
            locale: 'en',
            timezone: 'Asia/Makassar',
            automaticMemoryEnabled: false,
          },
        });
        const seed = await prisma.conversation.create({
          data: { userId: owner },
        });

        for (const fixture of MEMORY_EVALUATION_FACTS) {
          const message = await prisma.message.create({
            data: {
              userId: owner,
              conversationId: seed.id,
              role: 'user',
              content: fixture.evidence,
              createdAt: new Date(fixture.eventAt),
            },
          });

          await legacy.create(owner, {
            content: fixture.fact,
            sourceType: 'chat',
            sourceMessageId: message.id,
            sourceMessageIds: [message.id],
          });
        }

        const imported = await backfill.batch(owner, {
          dryRun: false,
          limit: 100,
        });

        expect(imported.interrupted).toBe(false);
        expect(imported.outcomes).toHaveLength(10);
        expect(
          imported.outcomes.every(({ status }) => status === 'written'),
        ).toBe(true);
        await settle();
        expect(
          await prisma.hindsightDelivery.count({
            where: { source: { bankId }, state: 'admitted' },
          }),
        ).toBe(10);
        phase = 'chat-probes';

        // The production prompt, complete tool set, model defaults, actual 1.5s recall
        // deadline, and orchestration are preserved. Expectations are draft probes.
        for (const autoRecall of mutationsOnly ? [] : [false, true]) {
          await turn(
            `language-vague-${autoRecall}`,
            'preferred language',
            ['indonesian|bahasa indonesia'],
            autoRecall,
          );
          await turn(
            `biking-id-${autoRecall}`,
            'Apa kebiasaan saya pada akhir pekan?',
            ['bicycle|cycling|bersepeda'],
            autoRecall,
          );
          await turn(
            `mentor-${autoRecall}`,
            'What does my mentor Rina do?',
            ['ceramic|keramik'],
            autoRecall,
          );
          await turn(
            `course-${autoRecall}`,
            'What course did I complete in June 2020?',
            ['woodwork|pertukangan|kayu'],
            autoRecall,
          );
          await turn(
            `unknown-${autoRecall}`,
            'What is the name of my dog?',
            [],
            autoRecall,
          );
          await turn(
            `current-statement-${autoRecall}`,
            'I live in Bandung now. For this reply only, what city do I live in?',
            ['bandung'],
            autoRecall,
          );
        }

        phase = 'explicit-save';
        const saved = await turn(
          'save',
          'Please remember that my favorite board game is chess.',
          [],
          true,
        );

        expect(saved.persistedTools).toContainEqual({
          name: 'save_memory',
          status: 'completed',
        });
        expect(saved.text?.trim() ?? '').not.toBe('');
        expect(saved.text).not.toMatch(/processing|queued|diproses|antrean/i);
        await settle();
        expect(
          (await access.search(owner, 'favorite board game chess', 5)).some(
            ({ content }) => /chess/i.test(content),
          ),
        ).toBe(true);
        await turn(
          'saved-query',
          'What is my favorite board game?',
          ['chess|catur'],
          true,
        );
        phase = 'explicit-correction';
        const corrected = await turn(
          'correct',
          'Correct the saved preference for reply language: I now prefer English instead of Indonesian.',
          [],
          true,
        );

        expect(corrected.persistedTools).toContainEqual({
          name: 'update_memory',
          status: 'completed',
        });
        expect(corrected.text?.trim() ?? '').not.toBe('');
        expect(corrected.text).not.toMatch(
          /processing|queued|diproses|antrean/i,
        );
        await settle();
        const current = await access.search(
          owner,
          'preferred reply language',
          5,
        );

        const retired = await prisma.hindsightDelivery.findMany({
          where: { source: { bankId }, state: 'erased' },
        });

        const retiredDocuments = await Promise.all(
          retired.map(async (item) => ({
            generation: item.generation,
            remainingFacts: (await gateway.listFacts(bankId, item.documentId))
              .items.length,
          })),
        );

        stateChecks.push({
          stage: 'corrected',
          results: current,
          retiredDocuments,
        });

        expect(current.some(({ content }) => /english/i.test(content))).toBe(
          true,
        );
        // Historical wording may name the old language while correctly describing
        // its replacement. Verify retired evidence and the current answer instead
        // of treating every occurrence of the old word as an active preference.
        expect(retiredDocuments.length).toBeGreaterThan(0);
        expect(
          retiredDocuments.every(({ remainingFacts }) => remainingFacts === 0),
        ).toBe(true);
        const correctedAnswer = await turn(
          'corrected-query',
          'Which language do I prefer for replies now?',
          ['english|inggris'],
          true,
        );

        expect(correctedAnswer.matchedTerms).toBe(true);
        phase = 'explicit-forgetting';
        const forgotten = await turn(
          'forget',
          'Please forget the saved fact that I ride a bicycle every weekend.',
          [],
          true,
        );

        expect(forgotten.persistedTools).toContainEqual({
          name: 'forget_memory',
          status: 'completed',
        });
        expect(forgotten.text?.trim() ?? '').not.toBe('');
        expect(forgotten.text).not.toMatch(
          /processing|queued|diproses|antrean/i,
        );
        expect(
          (await access.search(owner, 'weekend bicycle', 5)).some(
            ({ content }) => /bicycle|cycling|bersepeda/i.test(content),
          ),
        ).toBe(false);
        await settle();
        const erased = await prisma.hindsightDelivery.findMany({
          where: { source: { bankId }, state: 'erased' },
        });

        expect(erased.length).toBeGreaterThan(0);
        for (const source of erased)
          expect(
            (await gateway.listFacts(bankId, source.documentId)).items,
          ).toHaveLength(0);
        await turn(
          'forgotten-query',
          'What is my usual weekend exercise?',
          [],
          true,
        );
        phase = 'complete';
      } catch (error: unknown) {
        failure = error instanceof Error ? error.name : 'unknown';
        throw error;
      } finally {
        writeFileSync(
          outputPath,
          `${JSON.stringify(
            {
              version: 'chat-tool-flow-v0',
              runId,
              recordedAt: new Date().toISOString(),
              phase,
              failure,
              fixtureStatus:
                'Synthetic draft probes; not reviewed release ground truth',
              conditions: {
                apiVersion: HINDSIGHT_API_VERSION,
                model: model.model,
                toolNames: provider.tools.map(
                  ({ definition }) => definition.name,
                ),
                semanticFloor: 'server default; no override',
                recallDeadlineMs: 1500,
                recallTokens: 800,
                contextTokens: 6000,
                sourceFacts: 10,
                automaticMemoryEnabled: false,
                mutationsOnly,
              },
              scope:
                'Actual sendAndWait orchestrator, context builder, full production tool provider, tool executor and persistence, policy, Hindsight gateway and admission. Inert queue boundary; no authentication HTTP/transport, worker scheduling, load, production traffic, or reviewed answer-quality gate.',
              usage,
              turns,
              stateChecks,
              policyDiagnostics,
            },
            null,
            2,
          )}\n`,
          { mode: 0o600 },
        );
        process.stdout.write(
          `Chat contract phase=${phase}; report=${outputPath}\n`,
        );

        try {
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
            where: { userId: owner },
          });
          await prisma.user.deleteMany({ where: { id: owner } });
        } finally {
          await prisma.$disconnect();
          if (reportPath) rmSync(root, { recursive: true, force: true });
        }
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

        throw new Error('Chat contract delivery did not drain');
      }

      async function turn(
        id: string,
        query: string,
        expectedTerms: readonly string[],
        autoRecall: boolean,
      ): Promise<Turn> {
        const contextEngine = new MemoryEngineService(
          new ConfigService({
            BACKEND_MEMORY_ENGINE: 'hindsight',
            BACKEND_HINDSIGHT_NAMESPACE: namespace,
            BACKEND_MEMORY_AUTO_RECALL_ENABLED: autoRecall,
            BACKEND_HINDSIGHT_RECALL_TOKENS: 800,
          }),
        );

        const builder = new ContextBuilderService(
          conversations,
          config,
          documents,
          memories,
          access,
          contextEngine,
        );

        const orchestrator = new AssistantOrchestratorService(
          conversations,
          privateModel,
          builder,
          new ConversationSummarizerService(
            conversations,
            privateModel,
            config,
          ),
          toolExecutor,
          queues,
          new MemoryDreamSchedulerService(conversations, queues, config, users),
          audit,
        );

        const user = (await users.findById(owner))!;
        calls = [];
        currentQuery = query;
        currentRequestIsLast = false;
        const started = performance.now();
        const result = await orchestrator.sendAndWait(user, {
          content: query,
          idempotencyKey: randomUUID(),
        });

        const text = result.assistantMessage?.content ?? null;
        const row: Turn = {
          id,
          autoRecall,
          query,
          text,
          status: result.assistantRun.status,
          latencyMs: performance.now() - started,
          tools: calls,
          persistedTools: result.toolInvocations.map(({ name, status }) => ({
            name,
            status,
          })),
          expectedTerms,
          matchedTerms: expectedTerms.length
            ? expectedTerms.every((term) =>
                new RegExp(term, 'i').test(text ?? ''),
              )
            : null,
          literalToolMarkup: /<tool_call>|<function=|\[TOOL_CALLS\]/i.test(
            text ?? '',
          ),
          currentRequestLast: currentRequestIsLast,
        };

        turns.push(row);
        process.stdout.write(
          `Chat contract: ${id}; status=${row.status}; tools=${calls.map(({ name }) => name).join(',') || 'none'}\n`,
        );
        expect(currentRequestIsLast).toBe(true);
        expect(result.assistantRun.status).toBe('completed');
        expect(text).toBeTruthy();

        return row;
      }
    }, 900000);
  },
);
