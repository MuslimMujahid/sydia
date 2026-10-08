const {
  processDocumentJob,
} = require('../../dist/src/modules/documents/document-job.processor');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const { Queue, Worker } = require('bullmq');
const { PrismaService } = require('../../dist/src/infra/prisma');
const { StorageService } = require('../../dist/src/infra/storage');
const {
  DocumentParserService,
  DocumentParserSettings,
  DOCUMENT_POLICY_VERSION,
} = require('../../dist/src/infra/document-parser');
const {
  PrismaDocumentRepository,
} = require('../../dist/src/database/repositories/prisma-document.repository');
const {
  DocumentService,
} = require('../../dist/src/modules/documents/document.service');
const {
  DocumentsController,
} = require('../../dist/src/modules/documents/documents.controller');
const {
  DocumentExtractionService,
} = require('../../dist/src/modules/documents/document-extraction.service');
const {
  TelegramService,
} = require('../../dist/src/modules/telegram/telegram.service');
const {
  WhatsAppService,
} = require('../../dist/src/modules/whatsapp/whatsapp.service');
const {
  createPhaseTools,
} = require('../../dist/src/modules/conversations/services/phase-tools');
const { extractionKey } = require('../../dist/src/shared/documents');

async function main() {
  const [databaseUrl, redisUrl, fixtureDirectory, reportPath, executionMode] =
    process.argv.slice(2);
  assert([undefined, '--execute-answers'].includes(executionMode));
  const database = new URL(databaseUrl);
  assert.equal(database.hostname, '127.0.0.1');
  assert.equal(database.pathname, '/parser_fixture');
  assert.match(redisUrl, /^redis:\/\/127\.0\.0\.1:\d+$/);
  const root = await mkdtemp(join(tmpdir(), 'sydia-channel-fixtures-'));
  const config = new ConfigService({
    BACKEND_DB_URL: databaseUrl,
    BACKEND_STORAGE_LOCAL_ROOT: join(root, 'storage'),
    BACKEND_STORAGE_BUCKET: '',

    BACKEND_AUTH_URL: 'http://127.0.0.1:5000',
  });
  const prisma = new PrismaService(config);
  const storage = new StorageService(config);
  const repository = new PrismaDocumentRepository(prisma);
  const parser = new DocumentParserService(new DocumentParserSettings(config));
  const connection = { url: redisUrl };
  const queue = new Queue('sydia-parser-channel-fixture', { connection });
  const owner = 'parser-channel-fixture-owner';
  const vector = [1, ...Array(1535).fill(0)];
  const embeddings = {
    embed: async () => vector,
    embedMany: async (contents) => contents.map(() => vector),
    modelName: () => 'channel-fixture-embedding',
    version: 'fixture-v1',
  };
  const media = {
    interpretDocumentImage: async () => {
      throw new Error('Unexpected vision request');
    },
  };
  const extraction = new DocumentExtractionService(parser, media, storage);
  const naming = {
    generate: async () => ({ text: 'Invoice fixture.pdf', usage: {} }),
  };
  const documents = new DocumentService(
    repository,
    storage,
    embeddings,
    media,
    { documents: queue },
    naming,
    config,
    extraction,
  );
  const controller = new DocumentsController(repository, documents, storage);
  const workerErrors = [];
  const worker = new Worker(
    queue.name,
    (job) => processDocumentJob(documents, job),
    { connection, concurrency: 1 },
  );
  worker.on('error', (error) => workerErrors.push(error.message));
  const adapters = new Map();
  const messaging = {
    registerAdapter: async (provider, adapter) =>
      adapters.set(provider, adapter),
  };
  let downloadBytes;
  const telegram = new TelegramService(
    { setInboundHandler: () => {}, download: async () => downloadBytes },
    {},
    {},
    {},
    messaging,
    documents,
    media,
    {},
  );
  const whatsapp = new WhatsAppService(
    {
      on: () => {},
      download: async () => {
        const directory = await mkdtemp(join(root, 'download-'));
        const path = join(directory, 'media');
        await writeFile(path, downloadBytes);
        return path;
      },
    },
    {},
    {},
    {},
    {},
    messaging,
    documents,
    media,
    () => new Date(),
    () => 0.5,
    async () => {},
  );
  const readTool = createPhaseTools({ documents }).find(
    (tool) => tool.definition.name === 'read_document',
  );
  const results = [];
  const createdIds = [];
  let conversationAcceptance;
  try {
    await prisma.user.create({
      data: {
        id: owner,
        name: 'Channel fixture',
        email: 'parser-channel-fixture@example.invalid',
        locale: 'en',
        automaticMemoryEnabled: false,
      },
    });
    await worker.waitUntilReady();
    await telegram.onModuleInit();
    await whatsapp.onModuleInit();
    if (executionMode === '--execute-answers') {
      const {
        createConversationAcceptance,
      } = require('./conversation-acceptance.cjs');
      conversationAcceptance = await createConversationAcceptance({
        prisma,
        documents,
        repository,
        connection,
      });
    }
    for (const channel of ['web', 'telegram', 'whatsapp']) {
      for (const fixture of ['digital.pdf', 'mixed.pdf']) {
        downloadBytes = await readFile(join(fixtureDirectory, fixture));
        const started = Date.now();
        let record;
        if (channel === 'web') {
          const uploaded = await controller.upload(
            { user: { id: owner } },
            {
              originalname: fixture,
              mimetype: 'application/pdf',
              buffer: downloadBytes,
              size: downloadBytes.length,
            },
          );
          assert.equal(uploaded.status, 'processing');
          assert.equal(uploaded.title, fixture);
          record = await documents.waitUntilReady(owner, uploaded.id);
        } else {
          const message = {
            provider: channel,
            providerMessageId: `${channel}-${fixture}`,
            senderExternalId: 'fixture-sender',
            chatExternalId: 'fixture-chat',
            isGroup: false,
            isFromMe: false,
            receivedAt: new Date(),
            text: 'What is the invoice total?',
            kind: 'document',
            raw: {},
            mediaMessage: {
              fileId: 'fixture-file',
              fileName: fixture,
              mimeType: 'application/pdf',
              mimetype: 'application/pdf',
            },
          };
          const prepared = await adapters.get(channel).prepare(owner, message);
          assert.equal(prepared.attachmentIds.length, 1);
          record = (await repository.list(owner)).find(
            (item) => item.file.id === prepared.attachmentIds[0],
          );
          assert(
            record,
            'Returned attachment must identify the persisted original file',
          );
        }
        createdIds.push(record.id);
        assert.equal(record.status, 'ready');
        assert.equal(record.title, 'Invoice fixture.pdf');
        const key = await repository.storageKey(owner, record.id);
        assert.deepEqual(await storage.get(key), downloadBytes);
        const checkpoint = JSON.parse(
          (await storage.get(extractionKey(key))).toString('utf8'),
        );
        assert.equal(checkpoint.policyVersion, DOCUMENT_POLICY_VERSION);
        assert(
          checkpoint.result.methods.includes(
            fixture === 'mixed.pdf' ? 'ocr' : 'native',
          ),
        );
        const read = await readTool.execute({
          userId: owner,
          arguments: { documentId: record.id, limit: 10 },
        });
        assert.equal(read.status, 'ready');
        assert(
          read.chunks.some(
            (chunk) =>
              chunk.page === 1 &&
              chunk.content.includes('SYD-12345') &&
              chunk.content.includes('125.000'),
          ),
        );
        if (fixture === 'mixed.pdf')
          assert(
            read.chunks.some(
              (chunk) => chunk.page === 2 && chunk.content.includes('250.000'),
            ),
          );
        const search = await documents.search(owner, 'SYD-12345', 6, [
          record.id,
        ]);
        assert(
          search.some(
            (chunk) => chunk.documentId === record.id && chunk.pageNumber === 1,
          ),
        );
        assert.deepEqual(
          await documents.search('other-owner', 'SYD-12345', 6, [record.id]),
          [],
        );
        await assert.rejects(
          readTool.execute({
            userId: 'other-owner',
            arguments: { documentId: record.id },
          }),
          /Document not found/,
        );
        if (conversationAcceptance)
          await conversationAcceptance.run(owner, record, channel, fixture);
        const job = await queue.getJob(record.id);
        // Document readiness precedes BullMQ acknowledgement by a small interval.
        for (
          let attempt = 0;
          (await job.getState()) !== 'completed' && attempt < 20;
          attempt++
        )
          await new Promise((resolve) => setTimeout(resolve, 50));
        assert.equal(await job.getState(), 'completed');
        await documents.remove(owner, record.id);
        assert.equal(await repository.findById(owner, record.id), null);
        await assert.rejects(storage.get(key), { code: 'ENOENT' });
        await assert.rejects(storage.get(extractionKey(key)), {
          code: 'ENOENT',
        });
        results.push({
          channel,
          fixture,
          durationMs: Date.now() - started,
          ready: true,
          attachmentIdentityVerified: channel !== 'web',
          sourcePageFactsVerified: true,
          searchAndConversationReadToolVerified: true,
          titleUpdated: true,
          originalAndCheckpointDeleted: true,
        });
      }
    }
    for (const channel of ['web', 'telegram', 'whatsapp']) {
      downloadBytes = await readFile(join(fixtureDirectory, 'digital.pdf'));
      const before = await prisma.document.count({ where: { userId: owner } });
      const jobsBefore = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
      );
      const operation =
        channel === 'web'
          ? controller.upload(
              { user: { id: owner } },
              {
                originalname: 'photo.png',
                mimetype: 'image/png',
                buffer: downloadBytes,
                size: downloadBytes.length,
              },
            )
          : adapters.get(channel).prepare(owner, {
              provider: channel,
              providerMessageId: `${channel}-disguised-document`,
              senderExternalId: 'fixture-sender',
              chatExternalId: 'fixture-chat',
              isGroup: false,
              isFromMe: false,
              receivedAt: new Date(),
              text: 'Name this image',
              kind: 'image',
              raw: {},
              mediaMessage: {
                fileId: 'fixture-file',
                fileName: 'photo.png',
                mimeType: 'image/png',
                mimetype: 'image/png',
              },
            });
      await assert.rejects(operation, (error) => {
        assert.equal(error.getStatus(), 400);
        assert.equal(error.cause.code, 'FORMAT_MISMATCH');
        return true;
      });
      assert.equal(
        await prisma.document.count({ where: { userId: owner } }),
        before,
      );
      assert.deepEqual(
        await queue.getJobCounts('waiting', 'active', 'completed', 'failed'),
        jobsBefore,
      );
      results.push({
        channel,
        scenario: 'disguised-PDF-media-upload',
        localizedValidationRejected: true,
        noDocumentOrJobCreated: true,
      });
    }
    assert.deepEqual(workerErrors, []);
    const report = {
      generatedAt: new Date().toISOString(),
      passed:
        !conversationAcceptance ||
        conversationAcceptance.results.every(({ passed }) => passed),
      extractionAndRetrievalPassed: true,
      node: process.version,
      policyVersion: DOCUMENT_POLICY_VERSION,
      databaseVersion: (await prisma.$queryRawUnsafe('SHOW server_version'))[0]
        .server_version,
      appliedMigrations: (
        await prisma.$queryRawUnsafe(
          'SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
        )
      )[0].count,
      queue: 'Real BullMQ Queue/Worker and disposable Redis',
      processor: 'Shared production processDocumentJob',
      productionWorkerBootstrapVerified: false,
      storage: 'Real local storage',
      parser: 'Real compiled parser subprocess and OCR',
      transports:
        'Controlled Telegram/WhatsApp download and adapter registration; web controller invoked directly',
      embeddingsAndNaming: 'Controlled provider responses',
      liveProviderMessagesSent: 0,
      conversationAnswerVerified:
        Boolean(conversationAcceptance) &&
        conversationAcceptance.results.every(({ passed }) => passed),
      conversationAcceptance: conversationAcceptance
        ? {
            model: conversationAcceptance.model,
            results: conversationAcceptance.results,
            toolScope:
              'Production document list/read/search tools; other domains omitted',
            liveConnectorDeliveryVerified: false,
          }
        : null,
      httpAuthenticationAndMultipartVerified: false,
      results,
    };
    if (reportPath)
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
    if (conversationAcceptance)
      assert(
        report.conversationAnswerVerified,
        'Conversation answer acceptance failed; inspect the saved report.',
      );
  } finally {
    await worker.close();
    if (conversationAcceptance) await conversationAcceptance.close();
    await parser.onModuleDestroy();
    for (const id of createdIds)
      if (await repository.findById(owner, id))
        await documents.remove(owner, id);
    await prisma.auditEvent.deleteMany({ where: { userId: owner } });
    await prisma.user.deleteMany({ where: { id: owner } });
    await queue.obliterate({ force: true });
    await queue.close();
    await prisma.onModuleDestroy();
    await rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
