const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const {
  mkdtemp,
  readFile,
  readdir,
  writeFile,
  rm,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const {
  DocumentParserService,
  DocumentParserSettings,
} = require('../../dist/src/infra/document-parser');

// Keep the compiled parser, page rendering, and IPC real. Replace only the OCR
// worker factory to deterministically induce failures at each worker stage.
const childSource = `
const tesseract = require('tesseract.js');
const mode = process.argv[3];
const originalCreateWorker = tesseract.createWorker;
if (mode === 'real-recognition-shutdown') {
  let notified = false;
  tesseract.createWorker = (languages, engine, options) => originalCreateWorker(languages, engine, {
    ...options,
    logger: (update) => {
      options.logger?.(update);
      if (!notified && update.status === 'recognizing text' && update.progress > 0 && update.progress < 1) {
        notified = true;
        process.send({ stage: 'ocr', active: true, phase: 'recognition-progress' });
      }
    },
  });
  require(process.argv[2]);
} else {
// Real OCR workers keep the child alive while initialization/termination waits.
setInterval(() => {}, 1000);
const worker = {
  setParameters: () => Promise.resolve(),
  recognize: () => mode === 'final-cleanup'
    ? Promise.resolve({ data: { text: 'Invoice SYD-67890 Total Rp 250.000', tsv: null, confidence: 99 } })
    : new Promise(() => {}),
  terminate: () => ['termination', 'final-cleanup'].includes(mode)
    ? new Promise(() => {}) : Promise.resolve(),
};
tesseract.createWorker = () => {
  if (['initialization', 'shutdown'].includes(mode)) return new Promise(() => {});
  if (mode === 'late-initialization') return new Promise((resolve) => setTimeout(() => resolve(worker), 1500));
  return Promise.resolve(worker);
};
require(process.argv[2]);
}
`;

async function main() {
  const originalFork = childProcess.fork;
  const directory = await mkdtemp(join(tmpdir(), 'sydia-ocr-deadline-'));
  // Resolve the installed OCR package explicitly for the temporary child shim.
  const entry = join(directory, 'ocr-fault.cjs');
  const results = [];
  try {
    const tesseractPath = require.resolve('tesseract.js');
    await writeFile(
      entry,
      childSource.replace(
        "require('tesseract.js')",
        `require(${JSON.stringify(tesseractPath)})`,
      ),
    );
    const files = process.argv[3]
      ? { 'mixed.pdf': await readFile(join(process.argv[3], 'mixed.pdf')) }
      : await require('./fixtures.cjs').createFixtures(directory);
    for (const mode of [
      'initialization',
      'termination',
      'final-cleanup',
      'recognition',
      'late-initialization',
      'shutdown',
      'real-recognition-shutdown',
    ]) {
      let closed;
      let enteredOcr;
      const startedOcr = new Promise((resolve) => {
        enteredOcr = resolve;
      });
      const events = [];
      const existingAssets = new Set(await readdir(tmpdir()));
      const ocrStageDurationsMs = [];
      let stageStarted;
      childProcess.fork = (parserEntry, _args, options) => {
        const child = originalFork(entry, [parserEntry, mode], options);
        closed = new Promise((resolve) => child.once('close', resolve));
        child.on('message', (message) => {
          if (message.stage === 'ocr') {
            events.push(message.active);
            if (message.active) stageStarted = Date.now();
            else if (stageStarted !== undefined) {
              ocrStageDurationsMs.push(Date.now() - stageStarted);
              stageStarted = undefined;
            }
            if (mode === 'real-recognition-shutdown') {
              if (message.phase === 'recognition-progress') enteredOcr();
            } else if (message.active) enteredOcr();
          }
        });
        return child;
      };
      const service = new DocumentParserService(
        new DocumentParserSettings(
          new ConfigService({
            BACKEND_DOCUMENT_TIMEOUT_MS: 20_000,
            BACKEND_DOCUMENT_OCR_TIMEOUT_MS:
              mode === 'real-recognition-shutdown' ? 15_000 : 1000,
          }),
        ),
      );
      const started = Date.now();
      let outcome;
      try {
        const pending = service
          .parse({
            originalname: 'mixed.pdf',
            mimetype: 'application/pdf',
            buffer: Buffer.from(files['mixed.pdf']),
          })
          .then(
            (result) => ({ result }),
            (error) => ({ error }),
          );
        const shutdown =
          mode === 'shutdown' || mode === 'real-recognition-shutdown';
        if (shutdown) {
          await Promise.race([
            startedOcr,
            pending.then(() => {
              throw new Error(
                'Parser ended before the OCR shutdown checkpoint',
              );
            }),
          ]);
          await service.onModuleDestroy();
        }
        outcome = await pending;
        if (stageStarted !== undefined) {
          ocrStageDurationsMs.push(Date.now() - stageStarted);
          stageStarted = undefined;
        }
        if (['recognition', 'late-initialization'].includes(mode)) {
          assert(outcome.result, `${mode}: expected recoverable fallback`);
          assert.equal(outcome.result.visuals.length, 1);
          assert(outcome.result.warnings.includes('OCR_FAILED'));
          assert.deepEqual(events, [true, false, true, false]);
        } else {
          assert.equal(
            outcome.error?.code,
            shutdown ? 'PARSER_PROCESS_STOPPED' : 'OCR_TIMEOUT',
          );
          assert.equal(outcome.error.retryable, shutdown);
          assert(events.includes(true));
        }
        await closed;
        const durationMs = Date.now() - started;
        assert(
          ocrStageDurationsMs.length > 0,
          `${mode}: missing OCR stage timing`,
        );
        assert(
          ocrStageDurationsMs.every((duration) => duration < 4000),
          `${mode}: independent OCR stage exceeded its budget and scheduling margin`,
        );
        results.push({
          mode,
          code: outcome.error?.code ?? 'vision-fallback',
          durationMs,
          ocrEvents: events,
          ocrStageDurationsMs,
          childClosed: true,
        });
      } finally {
        await service.onModuleDestroy();
        const leftovers = (await readdir(tmpdir())).filter(
          (name) => name.startsWith('sydia-ocr-') && !existingAssets.has(name),
        );
        assert.deepEqual(
          leftovers,
          [],
          `${mode}: OCR assets remain after shutdown`,
        );
        if (results.at(-1)?.mode === mode)
          results.at(-1).ocrAssetsRemoved = true;
      }
    }
    const report = {
      generatedAt: new Date().toISOString(),
      node: process.version,
      passed: true,
      paidProviderCalls: 0,
      workerFactory:
        'controlled failure doubles plus real Tesseract recognition cancellation',
      parserAndRendering: 'real compiled subprocess',
      ocrTimeoutMs: 1000,
      realRecognitionOcrTimeoutMs: 15_000,
      cleanupGraceMs: 1000,
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
