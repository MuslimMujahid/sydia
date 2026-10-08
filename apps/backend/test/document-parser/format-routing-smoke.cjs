const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const {
  DocumentParserService,
  DocumentParserSettings,
  DOCUMENT_POLICY_VERSION,
} = require('../../dist/src/infra/document-parser');

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'sydia-format-fixtures-'));
  const parser = new DocumentParserService(
    new DocumentParserSettings(new ConfigService({})),
  );
  const results = [];
  try {
    const files = process.argv[3]
      ? Object.fromEntries(
          await Promise.all(
            [
              'invoice.docx',
              'digital.pdf',
              'invoice.md',
              'invoice.csv',
              'invoice.json',
            ].map(async (name) => [
              name,
              await readFile(join(process.argv[3], name)),
            ]),
          ),
        )
      : await require('./fixtures.cjs').createFixtures(directory);
    for (const [fixture, filename, mimetype, expected] of [
      ['invoice.docx', 'invoice.docx', 'application/pdf', 'FORMAT_MISMATCH'],
      ['digital.pdf', 'invoice.pdf', 'image/png', 'FORMAT_MISMATCH'],
      [
        'invoice.docx',
        'invoice.docx',
        'application/vnd.ms-excel',
        'FORMAT_MISMATCH',
      ],
      [
        'invoice.docx',
        'invoice.docx',
        'application/x-custom',
        'FORMAT_MISMATCH',
      ],
      ['invoice.docx', 'invoice.pdf', 'application/pdf', 'FORMAT_MISMATCH'],
      ['invoice.docx', 'invoice.docx', 'application/octet-stream', 'accepted'],
      ['invoice.docx', 'invoice.docx', 'application/zip', 'accepted'],
      [
        'invoice.docx',
        'upload',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'accepted',
      ],
      [
        'invoice.docx',
        'invoice.docx',
        ' APPLICATION/VND.OPENXMLFORMATS-OFFICEDOCUMENT.WORDPROCESSINGML.DOCUMENT ; charset=binary',
        'accepted',
      ],
      ['digital.pdf', 'invoice.pdf', 'application/x-pdf', 'accepted'],
      ['digital.pdf', 'upload', 'application/octet-stream', 'accepted'],
      ['digital.pdf', 'invoice.pdf', 'application/zip', 'FORMAT_MISMATCH'],
      ['invoice.md', 'invoice.md', 'text/plain; charset=UTF-8', 'accepted'],
      ['invoice.csv', 'invoice.csv', 'application/vnd.ms-excel', 'accepted'],
      ['invoice.csv', 'invoice.csv', 'text/comma-separated-values', 'accepted'],
      ['invoice.json', 'invoice.json', 'text/plain', 'accepted'],
      ['invoice.json', 'invoice.json', 'application/pdf', 'FORMAT_MISMATCH'],
    ]) {
      const file = {
        originalname: filename,
        mimetype,
        buffer: Buffer.from(files[fixture]),
      };
      const started = Date.now();
      if (expected === 'accepted') {
        const result = await parser.parse(file);
        assert(
          result.sections.some((section) => section.text.includes('SYD-12345')),
        );
        assert(result.sections.flatMap((section) => section.chunks).length > 0);
        assert.equal(result.visuals.length, 0);
      } else
        await assert.rejects(parser.parse(file), {
          code: expected,
          retryable: false,
        });
      results.push({
        fixture,
        filename,
        mimetype,
        outcome: expected,
        durationMs: Date.now() - started,
      });
    }
    const report = {
      generatedAt: new Date().toISOString(),
      node: process.version,
      passed: true,
      paidProviderCalls: 0,
      policyVersion: DOCUMENT_POLICY_VERSION,
      parser: 'real compiled subprocess',
      results,
    };
    if (process.argv[2])
      await writeFile(process.argv[2], `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
  } finally {
    await parser.onModuleDestroy();
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
