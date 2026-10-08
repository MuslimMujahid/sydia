const assert = require('node:assert/strict');
const { ConfigService } = require('@nestjs/config');
const {
  DocumentParserService,
  DocumentParserSettings,
  DOCUMENT_PARSER_VERSION,
  DOCUMENT_POLICY_VERSION,
} = require('../../dist/src/infra/document-parser');
const {
  DocumentExtractionService,
  extractionKey,
} = require('../../dist/src/modules/documents/document-extraction.service');
const { StorageService } = require('../../dist/src/infra/storage');
const { createVisualFixtures } = require('./visual-fixtures.cjs');
const { writeFile, mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function main() {
  const parser = new DocumentParserService(
    new DocumentParserSettings(new ConfigService({})),
  );
  const fixtures = await createVisualFixtures();
  const results = [];
  const storageRoot = await mkdtemp(join(tmpdir(), 'sydia-visual-storage-'));
  try {
    for (const [name, buffer] of Object.entries(fixtures)) {
      const started = Date.now();
      if (name === 'broken-flowchart.docx') {
        await assert.rejects(
          parser.parse({
            originalname: name,
            mimetype: 'application/octet-stream',
            buffer,
          }),
          { code: 'IMAGE_EXTRACTION_FAILED' },
        );
        results.push({
          name,
          rejected: 'IMAGE_EXTRACTION_FAILED',
          durationMs: Date.now() - started,
        });
        continue;
      }
      const parsed = await parser.parse({
        originalname: name,
        mimetype: 'application/octet-stream',
        buffer,
      });
      const expected = [
        'bordered-table.pdf',
        'decorative-rule.pdf',
        'decorative-logo.docx',
      ].includes(name)
        ? 0
        : 1;
      assert.equal(
        parsed.visuals.length,
        expected,
        `${name}: required visual count`,
      );
      if (expected) {
        assert.equal(parsed.visuals[0].mimeType, 'image/png');
        assert(parsed.visuals[0].buffer.length > 100);
        assert.equal(parsed.visuals[0].sectionIndex, 0);
      }
      if (name === 'flowchart.pdf') {
        assert.equal(parsed.visuals[0].label, 'Page 1');
        assert.equal(parsed.visuals[0].reason, 'visual');
        assert(!parsed.sections[0].methods.includes('ocr'));
      }
      if (name === 'unreadable-raster.pdf') {
        assert.equal(parsed.visuals[0].reason, 'unreadable');
        assert(parsed.warnings.includes('OCR_LOW_CONFIDENCE'));
      } else assert(parsed.sections[0].text.includes('SYD-12345'));
      results.push({
        name,
        durationMs: Date.now() - started,
        requiredVisuals: parsed.visuals.length,
        methods: parsed.sections.flatMap((section) => section.methods),
        warnings: parsed.warnings,
      });
    }
    // Real parsing and local storage; the controlled vision response tests orchestration,
    // payload/context and retry persistence, not model accuracy.
    const storage = new StorageService(
      new ConfigService({ BACKEND_STORAGE_LOCAL_ROOT: storageRoot }),
    );
    let parserCalls = 0;
    let visionCalls = 0;
    let visionResponse =
      'Approval workflow: Manager sends the invoice to Finance.';
    const extraction = new DocumentExtractionService(
      {
        settings: parser.settings,
        parse: async (file) => {
          parserCalls++;
          return parser.parse(file);
        },
      },
      {
        interpretDocumentImage: async (buffer, mimeType, label, timeoutMs) => {
          visionCalls++;
          assert.equal(
            buffer.subarray(0, 8).toString('hex'),
            '89504e470d0a1a0a',
          );
          assert.equal(mimeType, 'image/png');
          assert.equal(label, 'Page 1');
          assert(timeoutMs > 0 && timeoutMs <= 20_000);
          return visionResponse;
        },
      },
      storage,
    );
    const file = {
      originalname: 'flowchart.pdf',
      mimetype: 'application/pdf',
      buffer: fixtures['flowchart.pdf'],
    };
    const key = 'owner/flowchart.pdf';
    const first = await extraction.extract(file, key);
    assert(first.text.includes('Manager sends the invoice to Finance'));
    assert(first.text.includes('[Vision interpretation: Page 1]'));
    assert(first.chunks.every((chunk) => chunk.pageNumber === 1));
    assert(first.methods.includes('vision'));
    const checkpoint = JSON.parse(
      (await storage.get(extractionKey(key))).toString(),
    );
    assert.equal(checkpoint.policyVersion, DOCUMENT_POLICY_VERSION);
    assert.deepEqual(await extraction.extract(file, key), first);
    assert.equal(parserCalls, 1, 'retry must reuse extraction');
    assert.equal(visionCalls, 1, 'retry must reuse visual interpretation');
    for (const [suffix, response, code] of [
      ['missing-provider', null, 'VISION_NOT_CONFIGURED'],
      ['unreadable-provider', '[unreadable]', 'VISION_UNREADABLE'],
    ]) {
      visionResponse = response;
      const rejectedKey = `owner/${suffix}.pdf`;
      await assert.rejects(extraction.extract(file, rejectedKey), { code });
      await assert.rejects(storage.get(extractionKey(rejectedKey)), {
        code: 'ENOENT',
      });
    }
    await extraction.deleteCheckpoint(key);
    await assert.rejects(storage.get(extractionKey(key)), { code: 'ENOENT' });
    const orchestration = {
      storage: 'real local storage',
      parser: 'real compiled subprocess',
      vision: 'controlled response',
      parserCalls,
      controlledVisionCalls: visionCalls,
      checkpointReuse: true,
      incompleteResultsRejected: true,
      checkpointDeleted: true,
    };
    const report = {
      generatedAt: new Date().toISOString(),
      parserVersion: DOCUMENT_PARSER_VERSION,
      policyVersion: DOCUMENT_POLICY_VERSION,
      passed: true,
      paidProviderCalls: 0,
      results,
      orchestration,
    };
    if (process.argv[2])
      await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify(report) + '\n');
  } finally {
    await parser.onModuleDestroy();
    await rm(storageRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `Visual parser smoke failed: ${error.name}: ${error.message}\n`,
  );
  process.exitCode = 1;
});
