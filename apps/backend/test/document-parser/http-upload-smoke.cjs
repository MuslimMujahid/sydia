const {
  processDocumentJob,
} = require('../../dist/src/modules/documents/document-job.processor');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { AuthModule } = require('@thallesp/nestjs-better-auth');
const request = require('supertest');
const { Queue, Worker } = require('bullmq');
const { PrismaService } = require('../../dist/src/infra/prisma');
const { StorageService } = require('../../dist/src/infra/storage');
const { createAuth } = require('../../dist/src/infra/auth/auth');
const {
  DocumentParserService,
  DocumentParserSettings,
} = require('../../dist/src/infra/document-parser');
const {
  PrismaDocumentRepository,
} = require('../../dist/src/database/repositories/prisma-document.repository');
const {
  PrismaAuditEventRepository,
} = require('../../dist/src/database/repositories/prisma-audit-event.repository');
const {
  PrismaCategoryRepository,
} = require('../../dist/src/database/repositories/prisma-category.repository');
const { DOCUMENT_REPOSITORY } = require('../../dist/src/database/interfaces');
const {
  DocumentService,
} = require('../../dist/src/modules/documents/document.service');
const {
  DocumentsController,
} = require('../../dist/src/modules/documents/documents.controller');
const {
  DocumentUploadInterceptor,
} = require('../../dist/src/modules/documents/document-upload.interceptor');
const {
  DocumentExtractionService,
} = require('../../dist/src/modules/documents/document-extraction.service');
const { AllExceptionsFilter } = require('../../dist/src/shared/errors');
const { ResponseInterceptor } = require('../../dist/src/shared/response');
const { extractionKey } = require('../../dist/src/shared/documents');

async function main() {
  const [databaseUrl, redisUrl, fixtureDirectory, reportPath] =
    process.argv.slice(2);
  const database = new URL(databaseUrl);
  assert.equal(database.hostname, '127.0.0.1');
  assert.equal(database.pathname, '/parser_fixture');
  assert.match(redisUrl, /^redis:\/\/127\.0\.0\.1:\d+$/);
  const root = await mkdtemp(join(tmpdir(), 'sydia-http-upload-'));
  const origin = 'http://127.0.0.1:56001';
  const config = new ConfigService({
    BACKEND_DB_URL: databaseUrl,
    BACKEND_STORAGE_LOCAL_ROOT: join(root, 'storage'),
    BACKEND_STORAGE_BUCKET: '',

    BACKEND_AUTH_URL: origin,
  });
  const prisma = new PrismaService(config);
  const repository = new PrismaDocumentRepository(prisma);
  const storage = new StorageService(config);
  const parser = new DocumentParserService(new DocumentParserSettings(config));
  const vector = [1, ...Array(1535).fill(0)];
  const embeddings = {
    embed: async () => vector,
    embedMany: async (contents) => contents.map(() => vector),
    modelName: () => 'http-fixture-embedding',
    version: 'fixture-v1',
  };
  const media = {
    interpretDocumentImage: async () => {
      throw new Error('Unexpected vision');
    },
  };
  const extraction = new DocumentExtractionService(parser, media, storage);
  const connection = { url: redisUrl };
  const queue = new Queue('sydia-parser-http-fixture', { connection });
  const documents = new DocumentService(
    repository,
    storage,
    embeddings,
    media,
    { documents: queue },
    { generate: async () => ({ text: 'Invoice fixture.pdf', usage: {} }) },
    config,
    extraction,
  );
  const worker = new Worker(
    queue.name,
    (job) => processDocumentJob(documents, job),
    { connection },
  );
  worker.on('error', (error) => console.error(error));
  const categories = new PrismaCategoryRepository(prisma);
  const auth = createAuth(prisma, {
    secret: 'document-http-fixture-secret-at-least-thirty-two-characters',
    baseURL: origin,
    trustedOrigins: [origin],
    auditEventRepository: new PrismaAuditEventRepository(prisma),
    provisionDefaultCategories: (id) => categories.provisionDefaults(id),
  });
  let app;
  const owners = [];
  const results = [];
  try {
    const module = await Test.createTestingModule({
      imports: [AuthModule.forRoot({ auth, bodyParser: { rawBody: true } })],
      controllers: [DocumentsController],
      providers: [
        DocumentUploadInterceptor,
        { provide: DOCUMENT_REPOSITORY, useValue: repository },
        { provide: DocumentService, useValue: documents },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    app = module.createNestApplication({ bodyParser: false, logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    await worker.waitUntilReady();
    const agent = request.agent(app.getHttpServer());
    const other = request.agent(app.getHttpServer());
    for (const [client, email] of [
      [agent, 'parser-http-owner@example.invalid'],
      [other, 'parser-http-other@example.invalid'],
    ]) {
      const signup = await client
        .post('/api/auth/sign-up/email')
        .set('Origin', origin)
        .send({
          name: 'HTTP fixture',
          email,
          password: 'ParserFixturePass2026!',
        })
        .expect(200);
      owners.push(signup.body.user.id);
      assert(signup.headers['set-cookie']);
    }
    const bytes = await readFile(join(fixtureDirectory, 'mixed.pdf'));
    const unsigned = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', bytes, {
        filename: 'mixed.pdf',
        contentType: 'application/pdf',
      })
      .expect(401);
    assert.equal(typeof unsigned.body.error.code, 'string');
    results.push({
      scenario: 'unsigned-multipart',
      status: unsigned.status,
      code: unsigned.body.error.code,
    });
    const missing = await agent.post('/documents').expect(400);
    assert.equal(missing.body.error.message, 'File wajib dipilih.');
    results.push({ scenario: 'missing-file', status: missing.status });
    const mismatch = await agent
      .post('/documents')
      .attach('file', bytes, {
        filename: 'photo.png',
        contentType: 'image/png',
      })
      .expect(400);
    assert.equal(mismatch.body.error.details.parserCode, 'FORMAT_MISMATCH');
    assert.match(mismatch.body.error.message, /Ekspor ulang/);
    results.push({
      scenario: 'document-disguised-as-image',
      status: mismatch.status,
    });
    const oversized = await agent
      .post('/documents')
      .attach('file', Buffer.alloc(25 * 1024 * 1024 + 1, 65), {
        filename: 'large.txt',
        contentType: 'text/plain',
      })
      .expect(413);
    assert.equal(oversized.body.error.code, 'BAD_REQUEST');
    assert.equal(oversized.body.error.details.parserCode, 'FILE_TOO_LARGE');
    assert.match(oversized.body.error.message, /25 MiB/);
    results.push({
      scenario: 'oversized-multipart',
      status: oversized.status,
      code: oversized.body.error.code,
      message: oversized.body.error.message,
    });
    assert.equal(await prisma.document.count(), 0);
    assert.equal(await prisma.fileAsset.count(), 0);
    await worker.pause();
    const boundary = await agent
      .post('/documents')
      .attach('file', Buffer.alloc(25 * 1024 * 1024, 65), {
        filename: 'boundary.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    assert.equal(boundary.body.data.status, 'processing');
    assert.equal(boundary.body.data.file.size, 25 * 1024 * 1024);
    await agent.delete(`/documents/${boundary.body.data.id}`).expect(204);
    await worker.resume();
    results.push({
      scenario: 'exact-25-MiB-upload-boundary',
      status: boundary.status,
      acceptedAndDeletedBeforeParsing: true,
    });
    const upload = await agent
      .post('/documents')
      .attach('file', bytes, {
        filename: 'mixed.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    assert.equal(upload.body.data.status, 'processing');
    const id = upload.body.data.id;
    const ready = await documents.waitUntilReady(owners[0], id);
    assert.equal(ready.status, 'ready');
    const metadata = await agent.get(`/documents/${id}`).expect(200);
    assert.equal(metadata.body.data.title, 'Invoice fixture.pdf');
    assert(metadata.body.data.textContent.includes('250.000'));
    const content = await agent.get(`/documents/${id}/content`).expect(200);
    assert.deepEqual(content.body, bytes);
    assert.match(
      content.headers['content-disposition'],
      /Invoice%20fixture.pdf/,
    );
    await other.get(`/documents/${id}`).expect(404);
    await other.get(`/documents/${id}/content`).expect(404);
    const listed = await agent.get('/documents').expect(200);
    assert.equal(listed.body.data.length, 1);
    const key = await repository.storageKey(owners[0], id);
    await agent.delete(`/documents/${id}`).expect(204);
    await agent.get(`/documents/${id}`).expect(404);
    await assert.rejects(storage.get(key), { code: 'ENOENT' });
    await assert.rejects(storage.get(extractionKey(key)), { code: 'ENOENT' });
    results.push({
      scenario: 'authenticated-mixed-PDF-lifecycle',
      status: 'passed',
      ready: true,
      downloadedOriginal: true,
      tenantIsolation: true,
      titleUpdated: true,
      artifactsDeleted: true,
    });
    await prisma.user.update({
      where: { id: owners[1] },
      data: { role: 'admin' },
    });
    const adminClient = request.agent(app.getHttpServer());
    await adminClient
      .post('/api/auth/sign-in/email')
      .set('Origin', origin)
      .send({
        email: 'parser-http-other@example.invalid',
        password: 'ParserFixturePass2026!',
      })
      .expect(200);
    const deniedRole = await adminClient
      .post('/documents')
      .attach('file', bytes, {
        filename: 'mixed.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);
    results.push({
      scenario: 'non-user-role-denied',
      status: deniedRole.status,
    });
    assert.equal(await prisma.document.count(), 0);
    const report = {
      generatedAt: new Date().toISOString(),
      passed: true,
      node: process.version,
      authentication:
        'Actual repository createAuth, Prisma adapter, signup, signed session cookie, Nest Better Auth guard and role policy',
      transport:
        'Actual HTTP multipart FileInterceptor and global response/error contracts in a focused Nest app',
      storageAndQueue:
        'Real local storage, PostgreSQL, Redis, BullMQ queue/worker',
      parser: 'Real compiled document parser and OCR',
      embeddingsAndNaming: 'Controlled responses',
      fullAppBootstrap: false,
      processor: 'Shared production processDocumentJob',
      productionWorkerBootstrapVerified: false,
      modelAnswerVerified: false,
      externalMessagesSent: 0,
      results,
    };
    if (reportPath)
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
  } finally {
    await worker.close();
    await app?.close();
    await parser.onModuleDestroy();
    await queue.obliterate({ force: true });
    await queue.close();
    await prisma.user.deleteMany({ where: { id: { in: owners } } });
    await prisma.onModuleDestroy();
    await rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
