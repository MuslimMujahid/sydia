const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const {
  DocumentParserService,
  DocumentParserSettings,
} = require('../../dist/src/infra/document-parser');

// Exercise the actual parent watchdog against a real child with a blocked event
// loop, rather than assuming a timer in the renderer can interrupt synchronous work.
const childSource = `
const mode = process.argv[2];
const send = (value) => new Promise((resolve) => process.send(value, resolve));
process.once('message', () => { void (async () => {
  await send({ stage: 'render', active: true });
  if (mode === 'blocked') { while (true) {} }
  if (mode === 'duplicate') {
    setInterval(() => { process.send({ stage: 'render', active: true }); }, 100);
    return;
  }
  if (mode === 'completed') {
    await send({ stage: 'render', active: false });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await send({ ok: true, result: { sections: [], visuals: [], warnings: [] } });
    return;
  }
  // Render finishes, but the remaining extraction blocks past its total budget.
  await send({ stage: 'render', active: false });
  while (true) {}
})().catch(() => process.exit(1)); });
`;

async function main() {
  const originalFork = childProcess.fork;
  const directory = await mkdtemp(join(tmpdir(), 'sydia-render-deadline-'));
  const entry = join(directory, 'blocked-render.cjs');
  const results = [];
  try {
    await writeFile(entry, childSource);
    for (const mode of ['blocked', 'duplicate', 'completed', 'total']) {
      let child;
      let closed;
      childProcess.fork = (_entry, _args, options) => {
        child = originalFork(entry, [mode], options);
        closed = new Promise((resolve) => child.once('close', resolve));
        return child;
      };
      const service = new DocumentParserService(
        new DocumentParserSettings(
          new ConfigService({
            BACKEND_DOCUMENT_OCR_LANG_PATH: '/unused-for-watchdog-fixture',
            BACKEND_DOCUMENT_TIMEOUT_MS: mode === 'total' ? 1000 : 5000,
            BACKEND_DOCUMENT_RENDER_TIMEOUT_MS: 1000,
          }),
        ),
      );
      const started = Date.now();
      let code;
      try {
        const pending = service.parse({
          originalname: 'synthetic.txt',
          mimetype: 'text/plain',
          buffer: Buffer.from('synthetic fixture'),
        });
        if (mode === 'completed') {
          await pending;
          code = 'completed';
        } else {
          await assert.rejects(pending, (error) => {
            code = error.code;
            return (
              error.retryable === false &&
              error.code ===
                (mode === 'total' ? 'EXTRACTION_TIMEOUT' : 'RENDER_TIMEOUT')
            );
          });
        }
        await closed;
        assert(child.signalCode === 'SIGKILL' || child.exitCode !== null);
        const durationMs = Date.now() - started;
        assert(
          durationMs < 3000,
          `${mode}: watchdog exceeded independent budget`,
        );
        results.push({ mode, code, durationMs, childClosed: true });
      } finally {
        await service.onModuleDestroy();
      }
    }
    const events = [];
    childProcess.fork = (entry, args, options) => {
      const child = originalFork(entry, args, options);
      child.on('message', (message) => {
        if (message.stage === 'render') events.push(message.active);
      });
      return child;
    };
    const files = process.argv[3]
      ? { 'mixed.pdf': await readFile(join(process.argv[3], 'mixed.pdf')) }
      : await require('./fixtures.cjs').createFixtures(directory);
    const parser = new DocumentParserService(
      new DocumentParserSettings(new ConfigService({})),
    );
    const started = Date.now();
    try {
      const result = await parser.parse({
        originalname: 'mixed.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from(files['mixed.pdf']),
      });
      assert(result.sections[1].methods.includes('ocr'));
      assert(result.sections[1].text.includes('250.000'));
      assert.deepEqual(events, [true, false]);
      await parser.onModuleDestroy();
      results.push({
        mode: 'real-mixed-pdf',
        renderEvents: events,
        durationMs: Date.now() - started,
        childClosed: true,
      });
    } finally {
      await parser.onModuleDestroy();
    }
    const report = {
      generatedAt: new Date().toISOString(),
      node: process.version,
      passed: true,
      results,
    };
    if (process.argv[2])
      await writeFile(process.argv[2], `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
  } finally {
    childProcess.fork = originalFork;
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
