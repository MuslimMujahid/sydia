// Real concurrent parsing in the installed production image; no model calls.
const assert = require('node:assert/strict');
const { readFile, readdir } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { ConfigService } = require('@nestjs/config');
const {
  DocumentParserService,
  DocumentParserSettings,
  DOCUMENT_PARSER_VERSION,
  DOCUMENT_POLICY_VERSION,
} = require('../../dist/src/infra/document-parser');

async function main() {
  const directory = process.argv[2];
  assert.ok(directory);
  const before = new Set(await readdir(tmpdir()));
  const settings = new DocumentParserSettings(
    new ConfigService({
      BACKEND_DOCUMENT_CONCURRENCY: 4,
    }),
  );
  const parser = new DocumentParserService(settings);
  const large = await readFile(join(directory, 'capacity.pdf'));
  const mixed = await readFile(join(directory, 'mixed.pdf'));
  const measurements = [];
  const parse = async (id, originalname, buffer) => {
    const started = performance.now();
    const result = await parser.parse({
      originalname,
      mimetype: 'application/pdf',
      buffer,
    });
    const durationMs = Math.round(performance.now() - started);
    assert.ok(durationMs <= settings.limits.timeoutMs + 2000);
    assert.equal(result.visuals.length, 0);
    const textChars = result.sections.reduce((n, s) => n + s.text.length, 0);
    const chunks = result.sections.reduce((n, s) => n + s.chunks.length, 0);
    assert.ok(textChars <= settings.limits.maxTextChars);
    assert.ok(chunks <= settings.limits.maxChunks);
    if (originalname === 'capacity.pdf') {
      assert.equal(result.sections.length, 100);
      assert.equal(result.sections[0].pageNumber, 1);
      assert.equal(result.sections[99].pageNumber, 100);
      assert.match(result.sections[0].text, /Capacity fixture page 1:/);
      assert.match(result.sections[99].text, /Capacity fixture page 100:/);
      assert.ok(
        result.sections.every(
          (s) => s.methods.length === 1 && s.methods[0] === 'native',
        ),
      );
    } else {
      assert.equal(result.sections.length, 2);
      assert.deepEqual(
        result.sections.map((s) => s.pageNumber),
        [1, 2],
      );
      assert.ok(result.sections[1].methods.includes('ocr'));
      assert.match(result.sections[1].text, /SYD-67890/);
      assert.match(result.sections[1].text, /250\.000/);
    }
    measurements.push({
      id,
      originalname,
      durationMs,
      bytes: buffer.length,
      pages: result.sections.length,
      textChars,
      chunks,
      methods: [...new Set(result.sections.flatMap((s) => s.methods))],
      warnings: result.warnings,
      visionCalls: 0,
    });
  };
  const started = performance.now();
  try {
    await Promise.allSettled([
      parse('large-a', 'capacity.pdf', large),
      parse('large-b', 'capacity.pdf', large),
      parse('mixed-a', 'mixed.pdf', mixed),
      parse('mixed-b', 'mixed.pdf', mixed),
    ]).then((outcomes) =>
      outcomes.forEach((outcome) => {
        if (outcome.status === 'rejected') throw outcome.reason;
      }),
    );
  } finally {
    await parser.onModuleDestroy();
  }
  const leftovers = (await readdir(tmpdir())).filter(
    (name) => !before.has(name) && name.startsWith('sydia-ocr-languages-'),
  );
  assert.deepEqual(leftovers, []);
  const containerPeakBytes = Number(
    await readFile('/sys/fs/cgroup/memory.peak', 'utf8'),
  );
  assert.ok(
    containerPeakBytes > 0 && containerPeakBytes < 2 * 1024 * 1024 * 1024,
  );
  console.log(
    JSON.stringify({
      passed: true,
      node: process.version,
      parserVersion: DOCUMENT_PARSER_VERSION,
      policyVersion: DOCUMENT_POLICY_VERSION,
      concurrentCalls: 4,
      totalDurationMs: Math.round(performance.now() - started),
      containerPeakBytes,
      configuredLimits: settings.limits,
      measurements,
      providerCalls: 0,
      temporaryLanguageDirectoriesRemoved: true,
      scope:
        'Four concurrent calls to the real parser service; two 100-page native PDFs and two mixed PDFs. Does not measure production queue throughput or all supported input worst cases.',
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
