const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const { Queue } = require('bullmq');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { PrismaService } = require('../../dist/src/infra/prisma');
const { StorageService } = require('../../dist/src/infra/storage');
const {
  DocumentParserService,
  DocumentParserSettings,
} = require('../../dist/src/infra/document-parser');
const {
  PrismaDocumentRepository,
} = require('../../dist/src/database/repositories/prisma-document.repository.js');
const {
  DocumentService,
} = require('../../dist/src/modules/documents/document.service.js');
const {
  DocumentExtractionService,
} = require('../../dist/src/modules/documents/document-extraction.service.js');
const {
  DocumentReprocessingService,
} = require('../../dist/src/modules/documents/document-reprocessing.service.js');
const { extractionKey } = require('../../dist/src/shared/documents');
const { createFixtures } = require('./fixtures.cjs');

async function main() {
  const [databaseUrl, redisUrl] = process.argv.slice(2);
  const database = new URL(databaseUrl);
  assert.equal(database.hostname, '127.0.0.1');
  assert.equal(database.pathname, '/parser_fixture');
  assert.match(redisUrl, /^redis:\/\/127\.0\.0\.1:\d+$/);
  const root = await mkdtemp(join(tmpdir(), 'sydia-parser-database-'));
  const config = new ConfigService({
    BACKEND_DB_URL: databaseUrl,
    BACKEND_STORAGE_LOCAL_ROOT: join(root, 'storage'),
    BACKEND_AUTH_URL: 'http://127.0.0.1:5000',
  });
  const prisma = new PrismaService(config);
  const storage = new StorageService(config);
  const repository = new PrismaDocumentRepository(prisma);
  const parser = new DocumentParserService(new DocumentParserSettings(config));
  const queue = new Queue('sydia-parser-database-smoke', {
    connection: { url: redisUrl },
  });
  let parserCalls = 0;
  const localParse = parser.parse.bind(parser);
  parser.parse = async (file) => {
    parserCalls++;
    return localParse(file);
  };
  const media = {
    interpretDocumentImage: async () => {
      throw new Error('Unexpected vision request');
    },
  };
  const extraction = new DocumentExtractionService(parser, media, storage);
  let failEmbedding = true;
  let embeddingCalls = 0;
  const vector = [1, ...Array(1535).fill(0)];
  const embeddings = {
    embed: async () => vector,
    embedMany: async (contents) => {
      embeddingCalls++;
      if (failEmbedding) {
        failEmbedding = false;
        throw new Error('Simulated embedding outage');
      }
      return contents.map(() => vector);
    },
    modelName: () => 'parser-fixture-embedding',
    version: 'fixture-v1',
  };
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
  const maintenance = new DocumentReprocessingService(
    repository,
    documents,
    extraction,
    { documents: queue },
  );
  const owner = 'parser-fixture-owner';
  try {
    await prisma.user.create({
      data: {
        id: owner,
        name: 'Parser fixture',
        email: 'parser-fixture@example.invalid',
      },
    });
    await queue.pause();
    const fixtures = await createFixtures(join(root, 'fixtures'));
    const bytes = fixtures['mixed.pdf'];
    const record = await documents.ingest(owner, {
      originalname: 'mixed.pdf',
      mimetype: 'application/pdf',
      size: bytes.length,
      buffer: bytes,
    });
    const key = await repository.storageKey(owner, record.id);
    await assert.rejects(
      documents.processDocument(record.id, owner),
      /Simulated embedding outage/,
    );
    await documents.markProcessingFailed(
      record.id,
      new Error('Simulated embedding outage'),
    );
    assert.equal(await repository.readChunks(owner, record.id, 0, 8), null);
    const checkpoint = JSON.parse(
      (await storage.get(extractionKey(key))).toString('utf8'),
    );
    assert(checkpoint.result.methods.includes('ocr'));
    assert.equal(parserCalls, 1);

    const recovered = await maintenance.batch(owner, [record.id], {
      dryRun: false,
    });
    assert.equal(recovered.outcomes[0].outcome, 'ready');
    assert.equal(
      parserCalls,
      1,
      'Embedding recovery must reuse successful OCR',
    );
    const firstChunks = await repository.listChunkEmbeddings(record.id);
    assert(
      firstChunks.every(
        (chunk) =>
          chunk.embedded &&
          chunk.embeddingModel === embeddings.modelName() &&
          chunk.embeddingVersion === embeddings.version,
      ),
    );
    const read = await documents.read(owner, record.id);
    assert(
      read.chunks.some(
        (chunk) =>
          chunk.pageNumber === 1 && chunk.content.includes('SYD-12345'),
      ),
    );
    assert(
      read.chunks.some(
        (chunk) => chunk.pageNumber === 2 && chunk.content.includes('250.000'),
      ),
    );
    assert.equal(await documents.read('different-owner', record.id), null);
    const search = await documents.search(owner, 'SYD-12345');
    assert(
      search.some(
        (chunk) => chunk.documentId === record.id && chunk.pageNumber === 1,
      ),
    );
    assert.deepEqual(
      await documents.search('different-owner', 'SYD-12345'),
      [],
    );

    const beforeReuse = embeddingCalls;
    await maintenance.batch(owner, [record.id], { dryRun: false });
    assert.equal(embeddingCalls, beforeReuse);
    assert.equal(parserCalls, 1);
    await repository.updateChunkPage(firstChunks[0].id, 99);
    await maintenance.batch(owner, [record.id], { dryRun: false });
    assert.equal(
      (await repository.listChunkEmbeddings(record.id))[0].pageNumber,
      firstChunks[0].pageNumber,
    );
    assert.equal(
      embeddingCalls,
      beforeReuse,
      'Page-only corrections must preserve embeddings',
    );

    await prisma.documentChunk.updateMany({
      where: { documentId: record.id },
      data: { embeddingVersion: 'obsolete' },
    });
    await maintenance.batch(owner, [record.id], { dryRun: false });
    assert.equal(embeddingCalls, beforeReuse + 1);
    assert.deepEqual(
      (await repository.listChunkEmbeddings(record.id)).map(
        (chunk) => chunk.id,
      ),
      firstChunks.map((chunk) => chunk.id),
    );

    const changed = await PDFDocument.create();
    const font = await changed.embedFont(StandardFonts.Helvetica);
    changed.addPage().drawText('Revised invoice SYD-99999 Total Rp 375.000', {
      x: 40,
      y: 700,
      font,
      size: 14,
    });
    await storage.put(
      key,
      Buffer.from(await changed.save()),
      'application/pdf',
    );
    await maintenance.batch(owner, [record.id], { dryRun: false });
    assert.equal(
      parserCalls,
      2,
      'Changed source bytes must invalidate the extraction checkpoint',
    );
    const revised = await documents.read(owner, record.id);
    assert(revised.chunks.some((chunk) => chunk.content.includes('SYD-99999')));
    assert(
      revised.chunks.every((chunk) => !chunk.content.includes('SYD-12345')),
    );

    await documents.remove(owner, record.id);
    assert.equal(await repository.findById(owner, record.id), null);
    await assert.rejects(storage.get(key), { code: 'ENOENT' });
    await assert.rejects(storage.get(extractionKey(key)), { code: 'ENOENT' });
    assert.equal(
      await prisma.documentChunk.count({ where: { documentId: record.id } }),
      0,
    );
    await repository.complete(record.id, { textContent: 'Late completion' });
    await repository.fail(record.id, 'Late failure');
    assert.equal(await repository.findById(owner, record.id), null);
    process.stdout.write(
      `${JSON.stringify({ passed: true, parserCalls, embeddingCalls, checks: ['real-mixed-PDF-OCR', 'private-failed-content', 'checkpoint-retry', 'tenant-scoped-read-search', 'unchanged-embedding-reuse', 'page-provenance-correction', 'embedding-version-refresh', 'changed-source-reprocessing', 'cascade-and-artifact-deletion', 'late-worker-writes'] })}\n`,
    );
  } finally {
    await parser.onModuleDestroy();
    await queue.obliterate({ force: true });
    await queue.close();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.onModuleDestroy();
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `Parser database smoke failed: ${error.name}: ${error.message}\n`,
  );
  process.exitCode = 1;
});
