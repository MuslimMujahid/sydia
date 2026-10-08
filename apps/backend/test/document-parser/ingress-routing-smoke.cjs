const assert = require('node:assert/strict');
const { readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const {
  DocumentService,
  NonRetryableDocumentError,
} = require('../../dist/src/modules/documents/document.service');

async function main() {
  const directory = process.argv[3];
  if (!directory)
    throw new Error(
      'Provide the pre-generated document fixture directory as the third argument.',
    );
  const results = [];
  for (const [fixture, originalname, mimetype, expected] of [
    ['invoice.docx', 'invoice.docx', 'image/png', 'FORMAT_MISMATCH'],
    ['digital.pdf', 'photo.png', 'image/png', 'FORMAT_MISMATCH'],
    ['digital.pdf', 'voice.mp3', 'audio/mpeg', 'FORMAT_MISMATCH'],
    ['invoice.docx', 'photo.png', 'image/png', 'FORMAT_MISMATCH'],
    ['invoice.rtf', 'photo.png', 'image/png', 'FORMAT_MISMATCH'],
    ['invoice.docx', 'invoice.docx', 'application/pdf', 'FORMAT_MISMATCH'],
    ['scan.png', 'invoice.docx', 'image/png', 'FORMAT_MISMATCH'],
    ['scan.png', 'old.doc', 'image/png', 'UNSUPPORTED_FORMAT'],
    ['scan.png', 'scan.png', ' IMAGE/PNG; charset=binary ', 'image'],
    ['invoice.docx', 'invoice.docx', 'application/octet-stream', 'document'],
    ['invoice.csv', 'invoice.csv', 'application/vnd.ms-excel', 'document'],
  ]) {
    const buffer = await readFile(join(directory, fixture));
    const calls = [];
    let created;
    const documents = {
      createWithFile: async (_owner, input) => {
        calls.push('database');
        created = {
          id: 'fixture',
          status: 'processing',
          file: input.file,
          title: input.title,
        };
        return created;
      },
      findById: async () => created,
      storageKey: async () => 'fixture/source',
    };
    const storage = {
      put: async () => calls.push('storage'),
      get: async () => buffer,
    };
    const media = {
      describeImage: async () => {
        calls.push('vision');
        throw new Error('Unexpected vision call');
      },
      transcribe: async () => {
        calls.push('transcription');
        throw new Error('Unexpected transcription call');
      },
    };
    const service = new DocumentService(
      documents,
      storage,
      {},
      media,
      { documents: { add: async () => calls.push('queue') } },
      {
        generate: async () => {
          calls.push('naming');
          throw new Error('Unexpected naming call');
        },
      },
      new ConfigService({ BACKEND_AUTH_URL: 'http://localhost:5000' }),
      {},
    );
    const file = { originalname, mimetype, size: buffer.length, buffer };
    if (expected.endsWith('MISMATCH') || expected === 'UNSUPPORTED_FORMAT') {
      await assert.rejects(
        service.ingest('fixture-user', file, { hint: 'Name this upload' }),
        (error) => {
          assert.equal(error.getStatus(), 400);
          assert.equal(error.cause.code, expected);
          assert.notEqual(error.message, 'Api Exception');
          return true;
        },
      );
      assert.deepEqual(calls, []);
      created = {
        id: 'fixture',
        status: 'processing',
        file: {
          originalName: originalname,
          mimeType: mimetype,
          size: buffer.length,
          kind: mimetype.trim().toLowerCase().startsWith('audio/')
            ? 'audio'
            : 'image',
        },
      };
      await assert.rejects(
        service.processDocument('fixture', 'fixture-user'),
        NonRetryableDocumentError,
      );
      assert.deepEqual(calls, []);
    } else {
      const document = await service.ingest('fixture-user', file);
      assert.equal(document.file.kind, expected);
      assert.deepEqual(calls, ['storage', 'database', 'queue']);
    }
    results.push({ fixture, originalname, mimetype, outcome: expected });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    passed: true,
    scope:
      'Compiled shared ingestion and existing-upload processing with real document/image bytes; controlled storage, repository, queue, and provider dependencies',
    paidProviderCalls: 0,
    channelEndToEnd: false,
    results,
  };
  if (process.argv[2])
    await writeFile(process.argv[2], `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
