const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const { Queue, QueueEvents, Worker } = require('bullmq');
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
  processDocumentJob,
} = require('../../dist/src/modules/documents');
const {
  DocumentExtractionService,
} = require('../../dist/src/modules/documents/document-extraction.service');
const { extractionKey } = require('../../dist/src/shared/documents');

async function main() {
  const [databaseUrl, redisUrl, fixtureDirectory, reportPath] =
    process.argv.slice(2);
  const database = new URL(databaseUrl);
  assert.equal(database.hostname, '127.0.0.1');
  assert.equal(database.pathname, '/parser_fixture');
  assert.match(redisUrl, /^redis:\/\/127\.0\.0\.1:\d+$/);
  const root = await mkdtemp(join(tmpdir(), 'sydia-worker-retry-'));
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
  const queue = new Queue('sydia-parser-worker-retry-fixture', {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: 'fixed', delay: 50 } },
  });
  const events = new QueueEvents(queue.name, { connection });
  const owner = 'parser-worker-retry-owner';
  const vector = [1, ...Array(1535).fill(0)];
  let current;
  const parse = parser.parse.bind(parser);
  parser.parse = async (...args) => {
    current.parserCalls++;
    return parse(...args);
  };
  const media = {
    interpretDocumentImage: async (buffer, mimeType, label) => {
      assert.equal(current.scenario, 'retry-vision');
      assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(mimeType, 'image/png');
      assert.equal(label, 'Page 1');
      current.visionCalls++;
      return 'Approval workflow: Manager sends the invoice to Finance.';
    },
    transcribe: async () => {
      current.mediaCalls++;
      return 'Invoice SYD-12345 total Rp 125.000 received on 01/02/2026.';
    },
    describeImage: async () => {
      current.mediaCalls++;
      return 'Invoice SYD-12345 total Rp 125.000 received on 01/02/2026.';
    },
  };
  const embeddings = {
    embed: async () => vector,
    embedMany: async (contents) => {
      current.embeddingCalls++;
      if (current.scenario === 'delete-during-embedding') {
        const record = (await repository.list(owner))[0];
        current.deletedKey = await repository.storageKey(owner, record.id);
        await storage.get(extractionKey(current.deletedKey));
        await documents.remove(owner, record.id);
      } else if (
        current.scenario === 'exhaust-transient' ||
        current.embeddingCalls === 1
      ) {
        throw new Error('Controlled embedding outage');
      }
      return contents.map(() => vector);
    },
    modelName: () => 'retry-fixture-embedding',
    version: 'fixture-v1',
  };
  const extraction = new DocumentExtractionService(parser, media, storage);
  const documents = new DocumentService(
    repository,
    storage,
    embeddings,
    media,
    { documents: queue },
    { generate: async () => ({ text: '', usage: {} }) },
    config,
    extraction,
  );
  const workerErrors = [];
  const worker = new Worker(
    queue.name,
    async (job) => {
      current.processorCalls++;
      try {
        await processDocumentJob(documents, job);
      } catch (error) {
        const record = await repository.findById(owner, job.data.documentId);
        current.failureStates.push(record?.status ?? 'deleted');
        assert.equal(await documents.read(owner, job.data.documentId), null);
        assert.deepEqual(
          await documents.search(owner, 'SYD-12345', 6, [job.data.documentId]),
          [],
        );
        // Retryable extraction remains private even after the queue runs out of attempts.
        if (record && current.scenario !== 'encrypted') {
          if (record.file.kind === 'document') {
            const key = await repository.storageKey(owner, record.id);
            const checkpoint = JSON.parse(
              (await storage.get(extractionKey(key))).toString('utf8'),
            );
            assert.equal(checkpoint.policyVersion, DOCUMENT_POLICY_VERSION);
            assert.equal(
              checkpoint.result.methods.includes('ocr'),
              current.fixture === 'mixed.pdf',
            );
            assert.equal(
              checkpoint.result.methods.includes('vision'),
              current.scenario === 'retry-vision',
            );
          } else {
            assert.match(
              record.transcript ?? record.imageDescription,
              /SYD-12345/,
            );
          }
        }
        throw error;
      }
    },
    { connection, concurrency: 1 },
  );
  worker.on('error', (error) => workerErrors.push(error.message));
  const results = [];
  try {
    await prisma.user.create({
      data: {
        id: owner,
        name: 'Worker retry fixture',
        email: 'parser-worker-retry@example.invalid',
      },
    });
    await Promise.all([events.waitUntilReady(), worker.waitUntilReady()]);
    const scenarios = [
      ['retry-native', 'digital.pdf', 'application/pdf'],
      ['retry-ocr', 'mixed.pdf', 'application/pdf'],
      ['retry-vision', 'flowchart.pdf', 'application/pdf'],
      ['retry-audio', 'audio.mp3', 'audio/mpeg'],
      ['retry-image', 'image.png', 'image/png'],
      ['exhaust-transient', 'mixed.pdf', 'application/pdf'],
      ['encrypted', 'encrypted.pdf', 'application/pdf'],
      ['delete-during-embedding', 'digital.pdf', 'application/pdf'],
    ];
    for (const [scenario, fixture, mimetype] of scenarios) {
      current = {
        scenario,
        fixture,
        parserCalls: 0,
        mediaCalls: 0,
        visionCalls: 0,
        embeddingCalls: 0,
        processorCalls: 0,
        failureStates: [],
      };
      const buffer =
        mimetype === 'application/pdf'
          ? await readFile(
              join(
                fixtureDirectory,
                ...(scenario === 'retry-vision' ? ['..', 'visuals'] : []),
                fixture,
              ),
            )
          : Buffer.from(
              'Controlled media provider fixture; no codec validation claimed.',
            );
      const record = await documents.ingest(owner, {
        originalname: fixture,
        mimetype,
        buffer,
        size: buffer.length,
      });
      const key = await repository.storageKey(owner, record.id);
      const job = await queue.getJob(record.id);
      const settled = await job.waitUntilFinished(events, 60_000).then(
        () => 'completed',
        () => 'failed',
      );
      assert.equal(await job.getState(), settled);
      const stored = await repository.findById(owner, record.id);
      if (scenario === 'encrypted') {
        assert.equal(settled, 'failed');
        assert.equal(stored.status, 'failed');
        assert.match(stored.errorMessage, /kata sandi|terenkripsi/i);
        assert.equal(current.processorCalls, 1);
        assert.equal(current.parserCalls, 1);
        assert.equal(current.embeddingCalls, 0);
        assert.deepEqual(current.failureStates, ['failed']);
      } else if (scenario === 'exhaust-transient') {
        assert.equal(settled, 'failed');
        assert.equal(stored.status, 'failed');
        assert.equal(current.processorCalls, 3);
        assert.equal(current.embeddingCalls, 3);
        assert.equal(current.parserCalls, 1);
        assert.deepEqual(current.failureStates, [
          'processing',
          'processing',
          'failed',
        ]);
      } else if (scenario === 'delete-during-embedding') {
        assert.equal(settled, 'completed');
        assert.equal(stored, null);
        assert.equal(current.processorCalls, 2);
        assert.equal(current.parserCalls, 1);
        assert.deepEqual(current.failureStates, ['deleted']);
      } else {
        assert.equal(settled, 'completed');
        assert.equal(stored.status, 'ready');
        assert.equal(current.processorCalls, 2);
        assert.equal(current.embeddingCalls, 2);
        assert.equal(
          current.parserCalls,
          mimetype === 'application/pdf' ? 1 : 0,
        );
        assert.equal(
          current.mediaCalls,
          mimetype === 'application/pdf' ? 0 : 1,
        );
        assert.equal(current.visionCalls, scenario === 'retry-vision' ? 1 : 0);
        assert.deepEqual(current.failureStates, ['processing']);
        const read = await documents.read(owner, record.id);
        const fact =
          scenario === 'retry-vision'
            ? 'Manager sends the invoice to Finance'
            : 'SYD-12345';
        assert(read.chunks.some((chunk) => chunk.content.includes(fact)));
        assert(
          (await documents.search(owner, fact, 6, [record.id])).length > 0,
        );
      }
      if (stored) await documents.remove(owner, record.id);
      await assert.rejects(storage.get(key), { code: 'ENOENT' });
      await assert.rejects(storage.get(extractionKey(key)), { code: 'ENOENT' });
      results.push({
        ...current,
        settled,
        unfinishedExtractionPrivate: true,
        originalAndCheckpointDeleted: true,
      });
    }
    assert.deepEqual(workerErrors, []);
    const report = {
      generatedAt: new Date().toISOString(),
      passed: true,
      node: process.version,
      policyVersion: DOCUMENT_POLICY_VERSION,
      databaseVersion: (await prisma.$queryRawUnsafe('SHOW server_version'))[0]
        .server_version,
      appliedMigrations: (
        await prisma.$queryRawUnsafe(
          'SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
        )
      )[0].count,
      processor: 'Shared production processDocumentJob',
      runtime:
        'Real PostgreSQL, Redis/BullMQ, local storage, compiled parser and OCR',
      providers: 'Controlled embedding failures and media/naming responses',
      realMediaCodecOrProviderVerified: false,
      productionWorkerBootstrapVerified: false,
      paidProviderCalls: 0,
      results,
    };
    if (reportPath)
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
  } finally {
    await worker.close();
    await parser.onModuleDestroy();
    for (const record of await repository.list(owner))
      await documents.remove(owner, record.id);
    await prisma.user.deleteMany({ where: { id: owner } });
    await queue.obliterate({ force: true });
    await Promise.all([queue.close(), events.close()]);
    await prisma.onModuleDestroy();
    await rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
