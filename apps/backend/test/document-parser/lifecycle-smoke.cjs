const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
const {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const {
  DocumentParserService,
  DocumentParserSettings,
} = require('../../dist/src/infra/document-parser');

async function main() {
  const originalFork = childProcess.fork;
  const results = [];
  const file = {
    originalname: 'invoice.txt',
    mimetype: 'text/plain',
    buffer: Buffer.from('Invoice SYD-12345'),
  };
  try {
    // Delaying close independently of exit makes the ordering requirement deterministic.
    for (const phase of ['active-parser', 'completed-parser']) {
      const child = new EventEmitter();
      let killed = false;
      child.kill = () => {
        if (killed) return false;
        killed = true;
        queueMicrotask(() => child.emit('exit', null, 'SIGKILL'));
        return true;
      };
      child.send = (_, callback) => {
        callback(null);
        if (phase === 'completed-parser')
          queueMicrotask(() =>
            child.emit('message', {
              ok: true,
              result: {
                sections: [
                  {
                    label: '',
                    pageNumber: null,
                    text: 'Invoice SYD-12345',
                    chunks: ['Invoice SYD-12345'],
                    methods: ['native'],
                  },
                ],
                visuals: [],
                warnings: [],
              },
            }),
          );
      };
      let spawned;
      const started = new Promise((resolve) => {
        spawned = resolve;
      });
      childProcess.fork = () => {
        spawned();
        return child;
      };
      const service = new DocumentParserService(
        new DocumentParserSettings(
          new ConfigService({
            BACKEND_DOCUMENT_OCR_LANG_PATH: '/unused-in-child-double',
          }),
        ),
      );
      const outcome = service.parse(file).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await started;
      if (phase === 'completed-parser')
        assert((await outcome).value.sections.length === 1);
      let shutdownResolved = false;
      const shutdown = service.onModuleDestroy().then(() => {
        shutdownResolved = true;
      });
      try {
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(
          shutdownResolved,
          false,
          `${phase}: shutdown returned before child close`,
        );
        if (phase === 'active-parser') {
          const result = await outcome;
          assert.equal(result.error.code, 'PARSER_PROCESS_STOPPED');
          assert.equal(result.error.retryable, true);
        }
        results.push({ phase, waitsForClose: true, killed });
      } finally {
        child.emit('close', null, 'SIGKILL');
        await shutdown;
      }
    }
    const directory = await mkdtemp(join(tmpdir(), 'sydia-shutdown-fixture-'));
    const before = new Set(await readdir(tmpdir()));
    const service = new DocumentParserService(
      new DocumentParserSettings(new ConfigService({})),
    );
    let realClosed = false;
    let spawned;
    const started = new Promise((resolve) => {
      spawned = resolve;
    });
    childProcess.fork = (...args) => {
      const child = originalFork(...args);
      child.once('close', () => {
        realClosed = true;
      });
      spawned();
      return child;
    };
    try {
      const fixtures = process.argv[3]
        ? { 'mixed.pdf': await readFile(join(process.argv[3], 'mixed.pdf')) }
        : await require('./fixtures.cjs').createFixtures(directory);
      const outcome = service
        .parse({
          originalname: 'mixed.pdf',
          mimetype: 'application/pdf',
          buffer: fixtures['mixed.pdf'],
        })
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
      await started;
      await service.onModuleDestroy();
      assert.equal(
        realClosed,
        true,
        'real parser is still alive after shutdown',
      );
      assert.equal((await outcome).error.code, 'PARSER_PROCESS_STOPPED');
      assert.deepEqual(
        (await readdir(tmpdir())).filter(
          (name) => name.startsWith('sydia-ocr-') && !before.has(name),
        ),
        [],
      );
      results.push({
        phase: 'real-subprocess-cancellation',
        childClosedBeforeShutdownReturned: true,
        ocrAssetsRemoved: true,
      });
    } finally {
      await service.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
    }
    const report = {
      generatedAt: new Date().toISOString(),
      passed: true,
      paidProviderCalls: 0,
      results,
    };
    if (process.argv[2])
      await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify(report) + '\n');
  } finally {
    childProcess.fork = originalFork;
  }
}

main().catch((error) => {
  process.stderr.write(`Parser shutdown check failed: ${error.message}\n`);
  process.exitCode = 1;
});
