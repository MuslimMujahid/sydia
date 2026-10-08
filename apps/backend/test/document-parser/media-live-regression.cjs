// Explicit live-provider regression. Only public/synthetic fixture content.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const { parse } = require('dotenv');
const { Queue, Worker } = require('bullmq');
const { PrismaService } = require('../../dist/src/infra/prisma');
const { StorageService } = require('../../dist/src/infra/storage');
const { EmbeddingsService } = require('../../dist/src/infra/embeddings');
const {
  OpenRouterMediaService,
} = require('../../dist/src/infra/model-gateway');
const {
  PrismaDocumentRepository,
} = require('../../dist/src/database/repositories');
const {
  DocumentParserService,
  DocumentParserSettings,
} = require('../../dist/src/infra/document-parser');
const {
  DocumentService,
  processDocumentJob,
} = require('../../dist/src/modules/documents');
const {
  DocumentExtractionService,
} = require('../../dist/src/modules/documents/document-extraction.service');

async function main() {
  const [execute, databaseUrl, redisUrl, fixtureDirectory, reportPath] =
    process.argv.slice(2);
  assert.equal(execute, '--execute');
  const db = new URL(databaseUrl);
  assert.equal(db.hostname, '127.0.0.1');
  assert.equal(db.pathname, '/parser_fixture');
  assert.match(redisUrl, /^redis:\/\/127\.0\.0\.1:\d+$/);
  const values = parse(await readFile('.env'));
  const keys = [
    'BACKEND_MODEL_API_KEY',
    'BACKEND_MODEL_BASE_URL',
    'BACKEND_VISION_MODEL',
    'BACKEND_STT_MODEL',
    'BACKEND_EMBEDDING_MODEL',
  ];
  const provider = Object.fromEntries(
    keys
      .map((k) => [k, process.env[k] || values[k]])
      .filter(([, value]) => value),
  );
  assert.ok(provider.BACKEND_MODEL_API_KEY);
  const root = await mkdtemp(join(tmpdir(), 'sydia-media-regression-'));
  const config = new ConfigService({
    ...provider,
    BACKEND_DB_URL: databaseUrl,
    BACKEND_STORAGE_LOCAL_ROOT: join(root, 'storage'),
    BACKEND_STORAGE_BUCKET: '',
    BACKEND_AUTH_URL: 'http://127.0.0.1:5000',
  });
  const prisma = new PrismaService(config);
  const storage = new StorageService(config);
  const repository = new PrismaDocumentRepository(prisma);
  const media = new OpenRouterMediaService(config);
  const embeddings = new EmbeddingsService(config);
  const parser = new DocumentParserService(new DocumentParserSettings(config));
  const extraction = new DocumentExtractionService(parser, media, storage);
  const queue = new Queue('sydia-parser-media-regression', {
    connection: { url: redisUrl },
    defaultJobOptions: { attempts: 3, backoff: { type: 'fixed', delay: 250 } },
  });
  // Naming is outside this regression; preserve original fixture names.
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
  const worker = new Worker(
    queue.name,
    (job) => processDocumentJob(documents, job),
    { connection: { url: redisUrl }, concurrency: 1 },
  );
  const owner = 'parser-media-live-fixture';
  const report = {
    generatedAt: new Date().toISOString(),
    passed: false,
    runtime: process.version,
    parser: 'officeparser-8.1.1',
    policyVersion: 3,
    visionModel: provider.BACKEND_VISION_MODEL || 'google/gemini-2.5-flash',
    sttModel: provider.BACKEND_STT_MODEL || 'openai/whisper-large-v3-turbo',
    embeddingModel: embeddings.modelName(),
    providerCalls: [],
    results: [],
    fixtureSources: {
      photo: {
        source:
          'https://commons.wikimedia.org/wiki/File:Felis_catus-cat_on_snow.jpg',
        author: 'Von.grzanka',
        license: 'https://creativecommons.org/licenses/by-sa/3.0/',
        derivative:
          'Wikimedia 960px thumbnail; source photo not committed to the repository',
        reviewedFacts: ['cat', 'snow', 'striped/tabby coat'],
      },
      audio: {
        generator: 'FFmpeg flite, slt voice, 16000Hz mono PCM WAV',
        durationSeconds: 6.115,
        sourceText:
          'The delivery code is Atlas seven. The package contains three blue notebooks. Delivery is on Friday.',
      },
    },
    scope:
      'Compiled document ingestion/read/search with real storage, PostgreSQL, BullMQ worker/shared production retry processor and providers. Naming controlled; no connectors or conversation calls.',
  };
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    const started = Date.now();
    const endpoint = new URL(String(args[0])).pathname;
    let response;
    try {
      response = await nativeFetch(...args);
    } catch (error) {
      report.providerCalls.push({
        endpoint,
        status: null,
        durationMs: Date.now() - started,
        errorName: error.name,
        transportCause: error.cause?.code ?? null,
      });
      throw error;
    }
    const observation = {
      endpoint,
      status: response.status,
      durationMs: Date.now() - started,
    };
    if (response.ok) {
      const body = await response.clone().json();
      observation.model = body.model ?? null;
      observation.usage = body.usage ?? null;
    }
    report.providerCalls.push(observation);
    return response;
  };
  try {
    assert.equal(
      await prisma.user.count(),
      0,
      'Use a fresh disposable database.',
    );
    await prisma.user.create({
      data: {
        id: owner,
        name: 'Media fixture',
        email: 'parser-media@example.invalid',
        automaticMemoryEnabled: false,
      },
    });
    await worker.waitUntilReady();
    const cases = [
      {
        name: 'standalone photo description remains searchable',
        file: 'photo.jpg',
        mime: 'image/jpeg',
        kind: 'image',
        field: 'imageDescription',
        query: 'cat on snow',
        facts: [/\bcat\b/i, /\bsnow\b/i, /tabby|strip/i],
      },
      {
        name: 'voice transcript remains searchable',
        file: 'voice-note.wav',
        mime: 'audio/wav',
        kind: 'audio',
        field: 'transcript',
        query: 'blue notebooks Friday Atlas',
        facts: [
          /atlas\s+(seven|7)/i,
          /\b(three|3)\b/i,
          /blue/i,
          /notebooks/i,
          /friday/i,
        ],
      },
    ];
    for (const fixture of cases) {
      const bytes = await readFile(join(fixtureDirectory, fixture.file));
      const started = Date.now();
      let record;
      try {
        record = await documents.ingest(owner, {
          originalname: fixture.file,
          mimetype: fixture.mime,
          size: bytes.length,
          buffer: bytes,
        });
        assert.equal(record.status, 'processing');
        await documents.waitUntilReady(owner, record.id);
        const completed = await repository.findById(owner, record.id);
        assert.equal(completed.status, 'ready');
        assert.equal(completed.file.kind, fixture.kind);
        const content = completed[fixture.field];
        assert.equal(typeof content, 'string');
        fixture.facts.forEach((fact) => assert.match(content, fact));
        const read = await documents.read(owner, record.id);
        assert.ok(read.chunks.length > 0);
        fixture.facts.forEach((fact) =>
          assert.match(read.chunks.map((c) => c.content).join('\n'), fact),
        );
        const search = await documents.search(owner, fixture.query);
        assert.ok(search.some((c) => c.documentId === record.id));
        assert.equal(
          await documents.read('other-fixture-owner', record.id),
          null,
        );
        assert.deepEqual(
          await documents.search('other-fixture-owner', fixture.query),
          [],
        );
        const indexed = await repository.listChunkEmbeddings(record.id);
        assert.ok(
          indexed.every(
            (c) => c.embedded && c.embeddingModel === embeddings.modelName(),
          ),
        );
        report.results.push({
          name: fixture.name,
          passed: true,
          durationMs: Date.now() - started,
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          content,
          chunkCount: read.chunks.length,
          searchMatched: true,
          tenantIsolated: true,
        });
      } catch (error) {
        report.results.push({
          name: fixture.name,
          passed: false,
          durationMs: Date.now() - started,
          error: {
            name: error.name,
            message: error.message,
            transportCause: error.cause?.code ?? null,
          },
        });
      } finally {
        if (record) await documents.remove(owner, record.id);
      }
    }
    report.passed = report.results.every((r) => r.passed);
  } finally {
    globalThis.fetch = nativeFetch;
    await worker.close();
    await parser.onModuleDestroy();
    await queue.obliterate({ force: true });
    await queue.close();
    await prisma.user.deleteMany({ where: { id: owner } });
    report.cleanup = {
      users: await prisma.user.count(),
      documents: await prisma.document.count(),
      fileAssets: await prisma.fileAsset.count(),
      chunks: await prisma.documentChunk.count(),
    };
    await prisma.$disconnect();
    await rm(root, { recursive: true, force: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(
    JSON.stringify({
      passed: report.passed,
      cases: report.results.length,
      reportPath,
    }),
  );
  if (!report.passed) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
