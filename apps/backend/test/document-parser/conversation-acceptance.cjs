// Synthetic fixture evaluation only. Called by channel-ingestion-smoke with
// --execute-answers; never registers a live connector or sends user messages.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { ConfigService } = require('@nestjs/config');
const { parse } = require('dotenv');
const { Queue } = require('bullmq');
const {
  PrismaConversationRepository,
  PrismaUserRepository,
  PrismaAuditEventRepository,
} = require('../../dist/src/database/repositories');
const {
  OpenRouterLanguageModel,
} = require('../../dist/src/infra/model-gateway');
const { ObservabilityService } = require('../../dist/src/infra/observability');
const {
  AssistantOrchestratorService,
} = require('../../dist/src/modules/conversations/services/assistant-orchestrator.service');
const {
  ContextBuilderService,
} = require('../../dist/src/modules/conversations/services/context-builder.service');
const {
  ConversationSummarizerService,
} = require('../../dist/src/modules/conversations/services/conversation-summarizer.service');
const {
  ToolExecutorService,
} = require('../../dist/src/modules/conversations/services/tool-executor.service');
const {
  createPhaseTools,
} = require('../../dist/src/modules/conversations/services/phase-tools');
const {
  MemoryDreamSchedulerService,
} = require('../../dist/src/modules/memories/memory-dream-scheduler.service');

async function createConversationAcceptance({
  prisma,
  documents,
  repository,
  connection,
}) {
  const values = {};
  for (const path of ['../../.env', '.env']) {
    try {
      Object.assign(values, parse(await readFile(path)));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const keys = [
    'BACKEND_MODEL_API_KEY',
    'BACKEND_MODEL_NAME',
    'BACKEND_MODEL_BASE_URL',
    'BACKEND_MODEL_PROVIDER_SORT',
    'BACKEND_MODEL_REASONING_EFFORT',
  ];
  const provider = Object.fromEntries(
    keys
      .map((key) => [key, process.env[key] || values[key]])
      .filter(([, value]) => value),
  );
  assert(
    provider.BACKEND_MODEL_API_KEY,
    'Configure BACKEND_MODEL_API_KEY locally before live answer checks.',
  );
  const config = new ConfigService({
    ...provider,
    BACKEND_MODEL_MAX_OUTPUT_TOKENS: 1000,
    BACKEND_MODEL_MAX_STEPS: 5,
    BACKEND_MODEL_MAX_ATTEMPTS: 2,
  });
  const conversations = new PrismaConversationRepository(prisma);
  const users = new PrismaUserRepository(prisma);
  const model = new OpenRouterLanguageModel(
    config,
    ObservabilityService.disabled(),
  );
  const summaries = new Queue('sydia-parser-answer-summary-fixture', {
    connection,
  });
  const dreams = new Queue('sydia-parser-answer-dream-fixture', { connection });
  const queues = { conversationSummaries: summaries, memoryDreams: dreams };
  const results = [];
  let calls = [];
  let generations = [];
  let currentQuery;
  const privateModel = {
    provider: model.provider,
    model: model.model,
    generate: async (request) => {
      assert.equal(request.messages.at(-1).content, currentQuery);
      assert(
        !request.messages.some(
          ({ content }) =>
            typeof content === 'string' && /125\.000|250\.000/.test(content),
        ),
        'Initial context must not supply the expected invoice amounts.',
      );
      const started = Date.now();
      try {
        const result = await model.generate({
          ...request,
          traceContent: false,
        });
        generations.push({
          status: 'completed',
          durationMs: Date.now() - started,
          ...result.usage,
        });
        return result;
      } catch (error) {
        const diagnostics = error.diagnostics ?? {};
        generations.push({
          status: 'failed',
          durationMs: Date.now() - started,
          errorName: diagnostics.errorName ?? error.name,
          statusCode: diagnostics.statusCode ?? null,
          retryable: diagnostics.retryable ?? null,
          attempts: diagnostics.attempts ?? null,
        });
        throw error;
      }
    },
  };
  const allowed = new Set([
    'list_documents',
    'read_document',
    'search_documents',
  ]);
  const executor = new ToolExecutorService(
    conversations,
    createPhaseTools({ documents })
      .filter((tool) => allowed.has(tool.definition.name))
      .map((tool) => ({
        ...tool,
        execute: async (input) => {
          const result = await tool.execute(input);
          calls.push({
            name: tool.definition.name,
            arguments: input.arguments,
            result,
          });
          return result;
        },
      })),
  );
  const orchestrator = new AssistantOrchestratorService(
    conversations,
    privateModel,
    new ContextBuilderService(conversations, config, repository),
    new ConversationSummarizerService(conversations, privateModel, config),
    executor,
    queues,
    new MemoryDreamSchedulerService(conversations, queues, config, users),
    new PrismaAuditEventRepository(prisma),
  );
  return {
    model: model.model,
    results,
    async run(owner, record, channel, fixture) {
      const mixed = fixture === 'mixed.pdf';
      const page = mixed ? 2 : 1;
      currentQuery = `What are the invoice number and total amount on page ${page} of the attached PDF? Include the page reference in your answer.`;
      calls = [];
      generations = [];
      const user = await users.findById(owner);
      const started = Date.now();
      const turn = await orchestrator.sendAndWait(user, {
        content: currentQuery,
        idempotencyKey: randomUUID(),
        attachmentIds: [record.file.id],
        channel,
        abortSignal: AbortSignal.timeout(60_000),
      });
      const answer = turn.assistantMessage?.content ?? '';
      const plainAnswer = answer.replace(/[*_`]/g, '');
      const facts = {
        invoiceNumber: new RegExp(
          mixed ? 'SYD[-\\s]?67890' : 'SYD[-\\s]?12345',
          'i',
        ).test(plainAnswer),
        amount: new RegExp(mixed ? '250[.,\\s]?000' : '125[.,\\s]?000').test(
          plainAnswer,
        ),
        currency: /Rp\b|IDR|rupiah/i.test(plainAnswer),
        sourcePage: new RegExp(`(?:page|halaman)\\s*${page}\\b`, 'i').test(
          plainAnswer,
        ),
      };
      const detail = await conversations.findDetail(
        owner,
        turn.conversation.id,
      );
      const attachment = detail.messages.find(
        ({ id }) => id === turn.userMessage.id,
      ).attachments;
      const persisted = detail.toolInvocations.filter(
        ({ assistantRunId }) => assistantRunId === turn.assistantRun.id,
      );
      const check = {
        channel,
        fixture,
        query: currentQuery,
        answer,
        page,
        facts,
        status: turn.assistantRun.status,
        durationMs: Date.now() - started,
        attachedFileIdentityVerified: attachment.some(
          ({ fileAsset }) => fileAsset.id === record.file.id,
        ),
        persistedAnswerVerified: detail.messages.some(
          ({ id, content }) =>
            id === turn.assistantMessage?.id && content === answer,
        ),
        retrievalToolVerified: persisted.some(
          ({ name, status }) =>
            ['read_document', 'search_documents'].includes(name) &&
            status === 'completed',
        ),
        tools: calls,
        persistedTools: persisted.map(({ name, status }) => ({ name, status })),
        generations,
      };
      check.passed =
        check.status === 'completed' &&
        Object.values(facts).every(Boolean) &&
        check.attachedFileIdentityVerified &&
        check.persistedAnswerVerified &&
        check.retrievalToolVerified;
      results.push(check);
      // Keep each question independent; earlier synthetic answers must not supply facts.
      await prisma.conversation.deleteMany({ where: { userId: owner } });
      return check;
    },
    async close() {
      await Promise.all([
        summaries.obliterate({ force: true }),
        dreams.obliterate({ force: true }),
      ]);
      await Promise.all([summaries.close(), dreams.close()]);
    },
  };
}
module.exports = { createConversationAcceptance };
