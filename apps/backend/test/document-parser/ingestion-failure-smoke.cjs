const assert = require('node:assert/strict');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const { PrismaService } = require('../../dist/src/infra/prisma');
const { StorageService } = require('../../dist/src/infra/storage');
const {
  PrismaDocumentRepository,
} = require('../../dist/src/database/repositories/prisma-document.repository');
const {
  DocumentService,
} = require('../../dist/src/modules/documents/document.service');
const { extractionKey } = require('../../dist/src/shared/documents');
const { ApiException } = require('../../dist/src/shared/errors');

async function main() {
  const databaseUrl = process.argv[2];
  const database = new URL(databaseUrl);
  assert.equal(database.hostname, '127.0.0.1');
  assert.equal(database.pathname, '/parser_fixture');
  const root = await mkdtemp(join(tmpdir(), 'sydia-ingestion-failure-'));
  const config = new ConfigService({
    BACKEND_DB_URL: databaseUrl,
    BACKEND_STORAGE_LOCAL_ROOT: root,
    BACKEND_STORAGE_BUCKET: '',
    BACKEND_AUTH_URL: 'http://127.0.0.1:5000',
  });
  const prisma = new PrismaService(config);
  const repository = new PrismaDocumentRepository(prisma);
  const storage = new StorageService(config);
  const owner = 'parser-ingestion-owner';
  const other = 'parser-ingestion-other';
  const bytes = Buffer.from('Invoice SYD-12345 Total Rp 125.000');
  const uploaded = {
    originalname: 'invoice.txt',
    mimetype: 'text/plain',
    size: bytes.length,
    buffer: bytes,
  };
  const nativePut = storage.put.bind(storage);
  const nativeDelete = storage.delete.bind(storage);
  const nativeCreate = repository.createWithFile.bind(repository);
  let mode;
  let key;
  let failCleanup = false;
  const results = [];
  storage.put = async (...args) => {
    key = args[0];
    await nativePut(...args);
    if (mode === 'partial-storage-write')
      throw new Error('Simulated disk failure after write');
  };
  storage.delete = async (storageKey) => {
    if (failCleanup && storageKey === extractionKey(key))
      throw new Error('Simulated checkpoint delete outage');
    return nativeDelete(storageKey);
  };
  repository.createWithFile = async (...args) => {
    const record = await nativeCreate(...args);
    if (mode === 'lost-database-ack')
      throw new Error('Simulated lost database acknowledgement');
    return record;
  };
  const extraction = {
    deleteCheckpoint: (storageKey) => storage.delete(extractionKey(storageKey)),
  };
  const queue = {
    documents: {
      add: async () => {
        assert((await prisma.document.count({ where: { userId: owner } })) > 0);
        await nativePut(
          extractionKey(key),
          Buffer.from(
            'Synthetic worker checkpoint before failed queue acknowledgement',
          ),
          'application/json',
        );
        throw new Error('Simulated lost queue acknowledgement');
      },
    },
  };
  const documents = new DocumentService(
    repository,
    storage,
    {},
    {},
    queue,
    {},
    config,
    extraction,
  );
  try {
    await prisma.user.createMany({
      data: [
        {
          id: owner,
          name: 'Ingestion fixture',
          email: 'parser-ingestion@example.invalid',
        },
        {
          id: other,
          name: 'Other fixture',
          email: 'parser-ingestion-other@example.invalid',
        },
      ],
    });
    // A real database failure after the nested file insert proves transaction rollback.
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION parser_fixture_reject_document() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = 'parser-ingestion-owner' AND NEW.title = 'reject-document.txt' THEN RAISE EXCEPTION 'Synthetic document insertion failure'; END IF; RETURN NEW; END $$`,
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER parser_fixture_reject_document BEFORE INSERT ON document FOR EACH ROW EXECUTE FUNCTION parser_fixture_reject_document()',
    );
    await assert.rejects(
      nativeCreate(owner, {
        title: 'reject-document.txt',
        file: {
          originalName: 'reject-document.txt',
          mimeType: 'text/plain',
          size: bytes.length,
          checksum: 'fixture',
          storageKey: `${owner}/atomic-rollback`,
          kind: 'document',
        },
      }),
    );
    assert.equal(await prisma.fileAsset.count({ where: { userId: owner } }), 0);
    assert.equal(await prisma.document.count({ where: { userId: owner } }), 0);
    results.push({
      scenario: 'nested-database-write-rollback',
      noOrphanFileAsset: true,
    });

    for (const scenario of [
      'partial-storage-write',
      'document-insert-failure',
      'lost-database-ack',
      'lost-queue-ack',
    ]) {
      mode = scenario;
      const file =
        scenario === 'document-insert-failure'
          ? { ...uploaded, originalname: 'reject-document.txt' }
          : uploaded;
      await assert.rejects(documents.ingest(owner, file));
      assert.equal(
        await prisma.fileAsset.count({ where: { userId: owner } }),
        0,
      );
      assert.equal(
        await prisma.document.count({ where: { userId: owner } }),
        0,
      );
      await assert.rejects(storage.get(key), { code: 'ENOENT' });
      await assert.rejects(storage.get(extractionKey(key)), { code: 'ENOENT' });
      results.push({
        scenario,
        originalRemoved: true,
        checkpointRemoved: true,
        databaseRowsRemoved: true,
      });
    }
    const keptKey = `${other}/keep`;
    const kept = await nativeCreate(other, {
      title: 'keep.txt',
      file: {
        originalName: 'keep.txt',
        mimeType: 'text/plain',
        size: bytes.length,
        checksum: 'fixture',
        storageKey: keptKey,
        kind: 'document',
      },
    });
    await nativePut(keptKey, bytes, 'text/plain');
    await repository.deleteFileByStorageKey(owner, keptKey);
    assert(await repository.findById(other, kept.id));
    assert.deepEqual(await storage.get(keptKey), bytes);
    results.push({
      scenario: 'owner-scoped-rollback',
      otherOwnerPreserved: true,
    });

    mode = 'lost-queue-ack';
    failCleanup = true;
    await assert.rejects(
      documents.ingest(owner, uploaded),
      (error) =>
        error instanceof ApiException &&
        error.getStatus() === 503 &&
        error.getResponse().error.details.cleanupIncomplete === true &&
        /pembersihan file belum selesai/.test(error.message),
    );
    assert.equal(await prisma.document.count({ where: { userId: owner } }), 0);
    await assert.rejects(storage.get(key), { code: 'ENOENT' });
    assert((await storage.get(extractionKey(key))).length > 0);
    failCleanup = false;
    await nativeDelete(extractionKey(key));
    results.push({
      scenario: 'cleanup-outage-reported',
      incompleteCleanupReported: true,
      apiStatus: 503,
      apiCode: 'SERVICE_UNAVAILABLE',
      manuallyRecovered: true,
    });
    const report = {
      generatedAt: new Date().toISOString(),
      passed: true,
      database: 'Real Prisma/PostgreSQL; disposable parser_fixture database',
      databaseVersion: (await prisma.$queryRawUnsafe('SHOW server_version'))[0]
        .server_version,
      appliedMigrations: (
        await prisma.$queryRawUnsafe(
          'SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE rolled_back_at IS NULL AND finished_at IS NOT NULL',
        )
      )[0].count,
      storage: 'Real local storage',
      queue: 'Controlled failure/acknowledgement double',
      paidProviderCalls: 0,
      durableCleanupRecoveryVerified: false,
      results,
    };
    if (process.argv[3])
      await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify(report) + '\n');
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS parser_fixture_reject_document ON document',
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS parser_fixture_reject_document()',
    );
    await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await prisma.onModuleDestroy();
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`Ingestion failure check failed: ${error.name}\n`);
  process.exitCode = 1;
});
