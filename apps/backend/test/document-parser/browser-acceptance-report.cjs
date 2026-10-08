const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFile, readdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const { PrismaService } = require('../../dist/src/infra/prisma');

// Evaluates captures from agent-browser against the isolated production API's
// persisted records. Never reads model credentials, session cookies, or tokens.
async function main() {
  const [
    databaseUrl,
    fixtureDirectory,
    captureDirectory,
    storageRoot,
    reportPath,
    imageId,
  ] = process.argv.slice(2);
  const database = new URL(databaseUrl);
  assert.equal(database.hostname, '127.0.0.1');
  assert.equal(database.pathname, '/parser_fixture');
  assert.match(storageRoot, /^\/tmp\/sydia-parser-browser-storage$/);
  assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
  const capture = async (name) =>
    JSON.parse(
      await readFile(
        join(captureDirectory, `sydia-parser-browser-${name}.json`),
        'utf8',
      ),
    );
  const [
    answer,
    directUpload,
    library,
    mobile,
    removal,
    downloads,
    deletion,
    missing,
  ] = await Promise.all(
    [
      'answer',
      'chat-upload',
      'library-title',
      'mobile',
      'remove',
      'download',
      'after-delete',
      'missing',
    ].map(capture),
  );
  const original = await readFile(join(fixtureDirectory, 'mixed.pdf'));
  const checksum = createHash('sha256').update(original).digest('hex');
  assert.equal(downloads.length, 2);
  for (const file of downloads) {
    assert.equal(file.downloadStatus, 200);
    assert.equal(file.sha256, checksum);
    assert.equal(file.size, original.length);
    assert.equal(file.status, 'ready');
    assert.notEqual(file.title, 'mixed.pdf');
    assert.match(file.title, /SYD-67890/);
  }
  for (const attachment of [directUpload, library, mobile]) {
    assert.match(attachment.attachment, /SYD-67890/);
    assert.match(attachment.attachment, /Ready/);
    assert.equal(attachment.sendDisabled, false);
  }
  assert.equal(mobile.width, 390);
  assert.ok(mobile.documentWidth <= mobile.width);
  assert.equal(removal.attachmentsRemaining, false);
  assert.equal(removal.sendDisabled, true);
  assert.equal(missing.sendDisabled, true);
  assert.match(missing.attachment, /Failed/);
  assert.equal(missing.retryAvailable, true);
  assert.equal(missing.removeAvailable, true);
  assert.match(answer.attachmentName, /SYD-67890/);
  assert.match(answer.answer, /SYD-67890/);
  assert.match(answer.answer, /Rp 250\.000/);
  assert.match(answer.sources, /page 2/);
  assert.equal(deletion.status, 200);
  assert.equal(deletion.documents.length, 1);
  assert.equal(deletion.actionButtons, 1);
  const survivingId = deletion.documents[0].id;
  const deletedId = downloads.find((d) => d.id !== survivingId).id;
  const prisma = new PrismaService(
    new ConfigService({ BACKEND_DB_URL: databaseUrl }),
  );
  try {
    assert.equal(await prisma.user.count(), 1);
    const owner = await prisma.user.findFirst();
    assert.equal(owner.email, 'parser-browser@example.invalid');
    assert.equal(owner.automaticMemoryEnabled, false);
    assert.equal(await prisma.document.count(), 1);
    assert.equal(await prisma.fileAsset.count(), 1);
    assert.equal(
      await prisma.documentChunk.count({ where: { documentId: deletedId } }),
      0,
    );
    const document = await prisma.document.findUnique({
      where: { id: survivingId },
      include: { fileAsset: true, chunks: true },
    });
    assert.equal(document.status, 'ready');
    assert.equal(document.fileAsset.checksum, checksum);
    assert.deepEqual(document.chunks.map((c) => c.pageNumber).sort(), [1, 2]);
    const run = await prisma.assistantRun.findFirst({
      include: { toolInvocations: true },
    });
    assert.equal(await prisma.assistantRun.count(), 1);
    assert.equal(run.status, 'completed');
    const read = run.toolInvocations.find((t) => t.name === 'read_document');
    assert.ok(read);
    assert.equal(read.status, 'completed');
    assert.equal(read.arguments.documentId, survivingId);
    const page2 = read.result.chunks.find((c) => c.page === 2);
    assert.match(page2.content, /SYD-67890/);
    assert.match(page2.content, /Rp 250\.000/);
    const messages = await prisma.message.findMany({
      where: { conversationId: run.conversationId },
      include: { attachments: true },
    });
    const input = messages.find((m) => m.id === run.inputMessageId);
    assert.equal(input.attachments.length, 1);
    assert.equal(input.attachments[0].fileAssetId, document.fileAsset.id);
    assert.match(
      messages.find((m) => m.id === run.assistantMessageId).content,
      /Rp 250\.000/,
    );
    const storedFiles = await readdir(join(storageRoot, owner.id));
    const basename = document.fileAsset.storageKey.split('/').at(-1);
    assert.deepEqual(
      storedFiles.sort(),
      [basename, `${basename}.extraction-v1.json`].sort(),
    );
    const checkpoint = JSON.parse(
      await readFile(
        join(
          storageRoot,
          `${document.fileAsset.storageKey}.extraction-v1.json`,
        ),
        'utf8',
      ),
    );
    assert.equal(checkpoint.checksum, checksum);
    assert.equal(checkpoint.parserVersion, 'officeparser-8.1.1');
    assert.equal(checkpoint.policyVersion, 3);
    const report = {
      date: new Date().toISOString(),
      passed: true,
      environment: {
        imageId,
        productionApiAndWorker: true,
        frontend: 'Vite development server; real TanStack Start application',
        database: 'isolated PostgreSQL/pgvector; 32 migrations',
        redis: 'isolated Redis',
        browser: 'agent-browser isolated Chromium session',
        transportsEnabled: false,
        tracingEnabled: false,
        automaticMemoryEnabled: false,
      },
      cases: [
        {
          name: 'library upload and polling',
          passed: true,
          status: document.status,
          title: document.title,
          pages: [1, 2],
          checksum,
        },
        { name: 'library attachment metadata', passed: true, ...library },
        {
          name: 'streamed answer and persisted source',
          passed: true,
          ...answer,
          tool: read.name,
          toolPages: read.result.chunks.map((c) => c.page),
          model: run.model,
          inputTokens: run.inputTokens,
          outputTokens: run.outputTokens,
          assistantRunReportedCostUsd: Number(run.costUsd),
          latencyMs: run.completedAt - run.startedAt,
        },
        { name: 'direct chat upload', passed: true, ...directUpload },
        { name: 'mobile attachment', passed: true, ...mobile },
        { name: 'remove draft attachment', passed: true, ...removal },
        { name: 'original authenticated download', passed: true, downloads },
        {
          name: 'delete file and checkpoint',
          passed: true,
          deletedId,
          survivingFiles: storedFiles.length,
          ...deletion,
        },
        { name: 'unavailable library attachment', passed: true, ...missing },
      ],
      scope: {
        providerCalls:
          'Real embeddings, naming and conversation requests; cost above only covers the persisted assistant run.',
        capacityVerified: false,
        stagingVerified: false,
        externalConnectorDeliveryVerified: false,
        screenshots:
          'Inspected desktop answer and 390px mobile attachment; temporary local captures.',
        observations:
          'Library and direct chat initially displayed processing filename and disabled chat send; readiness updated their extracted titles.',
      },
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      JSON.stringify({ passed: true, cases: report.cases.length, reportPath }),
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
