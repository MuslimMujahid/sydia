// Uses pre-generated fixtures so the production image needs no test dependencies.
const assert = require('node:assert/strict');
const { readFile, readdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const {
  DocumentParserService,
  DocumentParserSettings,
  DOCUMENT_PARSER_VERSION,
  DOCUMENT_POLICY_VERSION,
} = require('../../dist/src/infra/document-parser');

async function runtimeSmoke() {
  const directory = process.argv[2];
  assert(
    directory,
    'Supply a directory containing the generated parser fixtures',
  );
  const parser = new DocumentParserService(
    new DocumentParserSettings(new ConfigService({})),
  );
  const existingTemporaryFiles = new Set(await readdir(tmpdir()));
  try {
    for (const name of [
      'invoice.docx',
      'invoice.xlsx',
      'invoice.pptx',
      'invoice.odt',
      'invoice.ods',
      'invoice.odp',
      'invoice.rtf',
      'invoice.md',
      'invoice.csv',
      'invoice.html',
      'digital.pdf',
      'mixed.pdf',
      'columns.pdf',
      'table.md',
    ]) {
      const start = Date.now();
      const result = await parser.parse({
        originalname: name,
        mimetype: 'application/octet-stream',
        buffer: await readFile(join(directory, name)),
      });
      const text = result.sections.map((section) => section.text).join('\n');
      assert(
        text.includes(name === 'table.md' ? 'SYD-00000' : 'SYD-12345'),
        `${name}: missing invoice identifier`,
      );
      assert(text.includes('125.000'), `${name}: missing amount`);
      if (
        ['invoice.xlsx', 'invoice.ods', 'invoice.csv', 'table.md'].includes(
          name,
        )
      ) {
        const chunks = result.sections.flatMap((section) => section.chunks);
        assert(
          chunks
            .filter((chunk) => chunk.includes('SYD-'))
            .every(
              (chunk) => chunk.includes('Number') && chunk.includes('Total'),
            ),
          `${name}: lost table header context`,
        );
      }
      if (name === 'digital.pdf')
        assert.deepEqual(
          result.sections.map((section) => section.pageNumber),
          [1, 2],
        );
      if (name === 'mixed.pdf') {
        assert(result.sections[1].methods.includes('ocr'), 'scan requires OCR');
        assert(
          result.sections[1].text.includes('250.000'),
          'missing scanned amount',
        );
        assert(
          /Nama\s+Pelanggan/.test(result.sections[1].text),
          'missing Indonesian text',
        );
      }
      assert.equal(
        result.visuals.length,
        0,
        `${name}: unexpected vision fallback`,
      );
      console.log(
        JSON.stringify({
          name,
          durationMs: Date.now() - start,
          methods: result.sections.map((section) => section.methods),
          warnings: result.warnings,
        }),
      );
    }
    const encryptedStarted = Date.now();
    await assert.rejects(
      parser.parse({
        originalname: 'encrypted.pdf',
        mimetype: 'application/pdf',
        buffer: await readFile(join(directory, 'encrypted.pdf')),
      }),
      { code: 'PASSWORD_REQUIRED', retryable: false },
    );
    console.log(
      JSON.stringify({
        name: 'encrypted.pdf',
        rejected: 'PASSWORD_REQUIRED',
        durationMs: Date.now() - encryptedStarted,
      }),
    );
    if (process.argv[3]) {
      for (const name of [
        'flowchart.pdf',
        'bordered-table.pdf',
        'decorative-rule.pdf',
        'embedded-flowchart.docx',
        'repeated-flowchart.docx',
        'decorative-logo.docx',
        'broken-flowchart.docx',
        'unreadable-raster.pdf',
      ]) {
        const start = Date.now();
        const file = {
          originalname: name,
          mimetype: 'application/octet-stream',
          buffer: await readFile(join(process.argv[3], name)),
        };
        if (name === 'broken-flowchart.docx') {
          await assert.rejects(parser.parse(file), {
            code: 'IMAGE_EXTRACTION_FAILED',
          });
          console.log(
            JSON.stringify({ name, rejected: 'IMAGE_EXTRACTION_FAILED' }),
          );
          continue;
        }
        const result = await parser.parse(file);
        const expected = [
          'bordered-table.pdf',
          'decorative-rule.pdf',
          'decorative-logo.docx',
        ].includes(name)
          ? 0
          : 1;
        assert.equal(
          result.visuals.length,
          expected,
          `${name}: required visual count`,
        );
        if (expected) {
          assert.equal(
            result.visuals[0].buffer.subarray(0, 8).toString('hex'),
            '89504e470d0a1a0a',
          );
          assert.equal(result.visuals[0].sectionIndex, 0);
        }
        if (name === 'unreadable-raster.pdf') {
          assert.equal(result.visuals[0].reason, 'unreadable');
          assert(result.warnings.includes('OCR_LOW_CONFIDENCE'));
        } else assert(result.sections[0].text.includes('SYD-12345'));
        console.log(
          JSON.stringify({
            name,
            durationMs: Date.now() - start,
            requiredVisuals: result.visuals.length,
            warnings: result.warnings,
          }),
        );
      }
    }
  } finally {
    await parser.onModuleDestroy();
    const leftover = (await readdir(tmpdir())).filter(
      (name) =>
        name.startsWith('sydia-ocr-') && !existingTemporaryFiles.has(name),
    );
    assert.deepEqual(leftover, [], 'OCR language files remain after shutdown');
    if (process.env.SYDIA_PARSER_RUNTIME_METRICS === '1') {
      // The isolated container cgroup includes parser children and OCR workers.
      // This is a fixture-run peak, not a production capacity estimate.
      console.log(
        JSON.stringify({
          runtime: process.version,
          parserVersion: DOCUMENT_PARSER_VERSION,
          policyVersion: DOCUMENT_POLICY_VERSION,
          containerPeakMemoryBytes: Number(
            (await readFile('/sys/fs/cgroup/memory.peak', 'utf8')).trim(),
          ),
          ocrTemporaryFilesRemoved: true,
        }),
      );
    }
  }
}

runtimeSmoke().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
