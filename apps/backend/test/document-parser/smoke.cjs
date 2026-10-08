const assert = require('node:assert/strict');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const {
  DocumentParserService,
  DocumentParserSettings,
} = require('../../dist/src/infra/document-parser');
const { createFixtures } = require('./fixtures.cjs');

async function smoke() {
  const directory = await mkdtemp(join(tmpdir(), 'sydia-parser-fixtures-'));
  const parser = new DocumentParserService(
    new DocumentParserSettings(new ConfigService({})),
  );
  const results = [];
  try {
    const files = await createFixtures(directory);
    for (const [name, buffer] of Object.entries(files)) {
      if (name.endsWith('.png')) continue;
      console.log(`Parsing fixture: ${name}`);
      const started = Date.now();
      const result = await parser.parse({
        originalname: name,
        mimetype: 'application/octet-stream',
        buffer: Buffer.from(buffer),
      });
      const text = result.sections.map((section) => section.text).join('\n');
      const chunks = result.sections.flatMap((section) => section.chunks);
      assert(
        text.includes(name === 'table.md' ? 'SYD-00000' : 'SYD-12345'),
        `${name}: missing invoice number`,
      );
      assert(text.includes('125.000'), `${name}: missing amount`);
      assert(chunks.length > 0, `${name}: no chunks`);
      if (
        [
          'invoice.xlsx',
          'invoice.ods',
          'invoice.csv',
          'invoice.html',
          'invoice.md',
        ].includes(name)
      )
        assert(
          text.includes('Total') && text.includes('Number'),
          `${name}: lost headers`,
        );
      if (name === 'digital.pdf') {
        assert.deepEqual(
          result.sections.map((section) => section.pageNumber),
          [1, 2],
        );
        assert.equal(result.visuals.length, 0);
        assert(result.sections[1].text.includes('SYD-67890'));
      }
      if (name === 'mixed.pdf') {
        assert.equal(result.sections[1].pageNumber, 2);
        assert(
          result.sections[1].methods.includes('ocr'),
          'mixed.pdf: scan did not use OCR',
        );
        assert(
          result.sections[1].text.includes('250.000'),
          'mixed.pdf: missing OCR amount',
        );
        assert(
          /Nama\s+Pelanggan/.test(result.sections[1].text),
          'mixed.pdf: missing Indonesian text',
        );
        assert.equal(
          result.visuals.length,
          0,
          'mixed.pdf: unnecessary vision call',
        );
      }
      if (
        ['table.md', 'invoice.xlsx', 'invoice.ods', 'invoice.csv'].includes(
          name,
        )
      )
        assert(
          chunks
            .filter((chunk) => chunk.includes('SYD-'))
            .every(
              (chunk) => chunk.includes('Number') && chunk.includes('Total'),
            ),
          'table.md: lost repeated headers',
        );
      if (name === 'columns.pdf') {
        assert(
          /Reference\s+SYD-67890/.test(text),
          'columns.pdf: missing right-column reference',
        );
        assert(
          text.includes('250.000'),
          'columns.pdf: missing right-column amount',
        );
        assert.equal(
          result.visuals.length,
          0,
          'columns.pdf: unnecessary vision call',
        );
      }
      results.push({
        name,
        durationMs: Date.now() - started,
        sections: result.sections.length,
        chunkCount: chunks.length,
        methods: [
          ...new Set(result.sections.flatMap((section) => section.methods)),
        ],
        visionCalls: result.visuals.length,
        warnings: result.warnings,
      });
    }
    await assert.rejects(
      parser.parse({
        originalname: 'old.doc',
        mimetype: 'application/msword',
        buffer: Buffer.from('legacy'),
      }),
      (error) => error.code === 'UNSUPPORTED_FORMAT',
    );
    await assert.rejects(
      parser.parse({
        originalname: 'broken.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('broken'),
      }),
      (error) => error.code === 'CORRUPT_DOCUMENT',
    );
    await assert.rejects(
      parser.parse({
        originalname: 'empty.txt',
        mimetype: 'text/plain',
        buffer: Buffer.alloc(0),
      }),
      (error) => error.code === 'EMPTY_DOCUMENT',
    );
    await assert.rejects(
      parser.parse({
        originalname: 'oversized.txt',
        mimetype: 'text/plain',
        buffer: Buffer.alloc(25 * 1024 * 1024 + 1, 65),
      }),
      (error) => error.code === 'FILE_TOO_LARGE',
    );
    for (const [environment, input, expected] of [
      [
        { BACKEND_DOCUMENT_MAX_PAGES: 1 },
        {
          originalname: 'digital.pdf',
          mimetype: 'application/pdf',
          buffer: files['digital.pdf'],
        },
        'PAGE_LIMIT_EXCEEDED',
      ],
      [
        { BACKEND_DOCUMENT_MAX_CHUNKS: 1 },
        {
          originalname: 'long.txt',
          mimetype: 'text/plain',
          buffer: Buffer.from('A'.repeat(3000)),
        },
        'CHUNK_LIMIT_EXCEEDED',
      ],
      [
        { BACKEND_DOCUMENT_MAX_TEXT_CHARS: 100 },
        {
          originalname: 'long.txt',
          mimetype: 'text/plain',
          buffer: Buffer.from('A'.repeat(200)),
        },
        'TEXT_LIMIT_EXCEEDED',
      ],
    ]) {
      const bounded = new DocumentParserService(
        new DocumentParserSettings(new ConfigService(environment)),
      );
      try {
        await assert.rejects(
          bounded.parse(input),
          (error) => error.code === expected,
        );
      } finally {
        await bounded.onModuleDestroy();
      }
    }
    const report = {
      node: process.version,
      parserVersion: '8.1.1',
      generatedAt: new Date().toISOString(),
      results,
    };
    console.log(JSON.stringify(report, null, 2));
    if (process.argv[2])
      await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
  } finally {
    await parser.onModuleDestroy();
    await rm(directory, { recursive: true, force: true });
  }
}

smoke().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
