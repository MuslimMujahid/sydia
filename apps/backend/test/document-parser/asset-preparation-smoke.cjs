const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs/promises');
const { mkdtemp, rm, stat, writeFile } = fs;
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const {
  DocumentParserService,
  DocumentParserSettings,
} = require('../../dist/src/infra/document-parser');
const {
  documentParserFailureMessage,
} = require('../../dist/src/modules/documents/document-parser-errors');

const file = {
  originalname: 'invoice.txt',
  mimetype: 'text/plain',
  buffer: Buffer.from('Invoice SYD-12345 Total Rp 125.000'),
};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

async function main() {
  const copyFile = fs.copyFile;
  const fork = childProcess.fork;
  const root = await mkdtemp(join(tmpdir(), 'sydia-assets-fixture-'));
  const results = [];
  let forks = 0;
  childProcess.fork = (...args) => {
    forks++;
    return fork(...args);
  };
  const makeService = (timeoutMs = 5000) =>
    new DocumentParserService(
      new DocumentParserSettings(
        new ConfigService({ BACKEND_DOCUMENT_TIMEOUT_MS: timeoutMs }),
      ),
    );
  try {
    // One copy fails while the other is still writing. Both callers must wait
    // for the remaining copy, then share the failure and a later successful cache.
    {
      const gate = deferred();
      const copyStarted = deferred();
      const directories = new Set();
      let copies = 0;
      fs.copyFile = async (source, destination) => {
        copies++;
        directories.add(dirname(destination));
        if (copies <= 2) {
          if (destination.endsWith('eng.traineddata.gz')) {
            await writeFile(destination, 'partial failed copy');
            throw Object.assign(new Error('Synthetic copy outage'), {
              code: 'EIO',
            });
          }
          copyStarted.resolve();
          await gate.promise;
        }
        await copyFile(source, destination);
      };
      const service = makeService();
      let settled = false;
      const pending = Promise.all(
        [service.parse(file), service.parse(file)].map((promise) =>
          promise.then(
            (result) => ({ result }),
            (error) => ({ error }),
          ),
        ),
      ).then((values) => {
        settled = true;
        return values;
      });
      try {
        await copyStarted.promise;
        assert.equal(settled, false);
        const failedDirectory = [...directories][0];
        assert((await stat(failedDirectory)).isDirectory());
        gate.resolve();
        const outcomes = await pending;
        assert.equal(copies, 2);
        for (const outcome of outcomes) {
          assert.equal(outcome.error.code, 'OCR_ASSETS_PREPARATION_FAILED');
          assert.equal(outcome.error.retryable, true);
          assert(outcome.error.cause instanceof AggregateError);
          assert.match(
            documentParserFailureMessage(outcome.error.code),
            /Coba kembali/,
          );
        }
        await assert.rejects(stat(failedDirectory), { code: 'ENOENT' });
        const recovered = await Promise.all([
          service.parse(file),
          service.parse(file),
        ]);
        assert(
          recovered.every((result) =>
            result.sections[0].text.includes('SYD-12345'),
          ),
        );
        assert.equal(
          copies,
          4,
          'concurrent recovery must share two language copies',
        );
        await service.onModuleDestroy();
        for (const directory of directories)
          await assert.rejects(stat(directory), { code: 'ENOENT' });
        results.push({
          phase: 'partial-copy-failure-and-concurrent-recovery',
          retryable: true,
          preparationWaitedForBothCopies: true,
          sharedRecoveryCopies: 2,
          assetsRemoved: true,
        });
      } finally {
        gate.resolve();
        await service.onModuleDestroy();
      }
    }

    // A temporary cleanup outage must retain ownership of the failed directory
    // so shutdown can remove it along with a later healthy preparation.
    {
      const directories = new Set();
      let failCopy = true;
      let failCleanup = true;
      fs.copyFile = async (source, destination) => {
        directories.add(dirname(destination));
        await copyFile(source, destination);
        if (failCopy && destination.endsWith('eng.traineddata.gz')) {
          failCopy = false;
          throw new Error('Synthetic first-copy failure');
        }
      };
      fs.rm = async (path, options) => {
        if (failCleanup && directories.has(path)) {
          failCleanup = false;
          throw new Error('Synthetic cleanup outage');
        }
        await rm(path, options);
      };
      const service = makeService();
      try {
        await assert.rejects(service.parse(file), {
          code: 'OCR_ASSETS_PREPARATION_FAILED',
          retryable: true,
        });
        const failedDirectory = [...directories][0];
        assert((await stat(failedDirectory)).isDirectory());
        const recovered = await service.parse(file);
        assert(recovered.sections[0].text.includes('SYD-12345'));
        await service.onModuleDestroy();
        for (const directory of directories)
          await assert.rejects(stat(directory), { code: 'ENOENT' });
        results.push({
          phase: 'cleanup-outage-retained-for-shutdown',
          recovered: true,
          assetsRemoved: true,
        });
      } finally {
        fs.rm = rm;
        await service.onModuleDestroy();
      }
    }

    for (const mode of ['deadline', 'shutdown']) {
      const gate = deferred();
      const copiesStarted = deferred();
      const directories = new Set();
      let copies = 0;
      fs.copyFile = async (source, destination) => {
        directories.add(dirname(destination));
        if (++copies === 2) copiesStarted.resolve();
        await gate.promise;
        await copyFile(source, destination);
      };
      const service = makeService(mode === 'deadline' ? 1000 : 5000);
      const previousForks = forks;
      const started = Date.now();
      const pending = service.parse(file).then(
        (result) => ({ result }),
        (error) => ({ error }),
      );
      let shutdown;
      try {
        await copiesStarted.promise;
        if (mode === 'shutdown') shutdown = service.onModuleDestroy();
        const outcome = await pending;
        assert.equal(
          outcome.error.code,
          mode === 'deadline'
            ? 'OCR_ASSETS_PREPARATION_TIMEOUT'
            : 'PARSER_PROCESS_STOPPED',
        );
        assert.equal(outcome.error.retryable, true);
        assert.equal(
          forks,
          previousForks,
          'interrupted preparation must never spawn a parser',
        );
        const durationMs = Date.now() - started;
        gate.resolve();
        await (shutdown ?? service.onModuleDestroy());
        for (const directory of directories)
          await assert.rejects(stat(directory), { code: 'ENOENT' });
        results.push({
          phase: `preparation-${mode}`,
          code: outcome.error.code,
          durationMs,
          parserSpawned: false,
          assetsRemoved: true,
        });
      } finally {
        gate.resolve();
        await service.onModuleDestroy();
      }
    }

    // After 600 ms spent preparing assets, a blocked parser gets the remaining
    // budget rather than a fresh full second. Use a real blocked child.
    {
      const entry = join(root, 'blocked-parser.cjs');
      await writeFile(
        entry,
        "process.once('message', () => { while (true) {} });\n",
      );
      let spawnedAt;
      let closed;
      fs.copyFile = async (source, destination) => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        await copyFile(source, destination);
      };
      childProcess.fork = (_entry, _args, options) => {
        spawnedAt = Date.now();
        const child = fork(entry, [], options);
        closed = new Promise((resolve) => child.once('close', resolve));
        return child;
      };
      const service = makeService(1000);
      const started = Date.now();
      try {
        await assert.rejects(service.parse(file), {
          code: 'EXTRACTION_TIMEOUT',
          retryable: false,
        });
        await closed;
        const durationMs = Date.now() - started;
        const childDurationMs = Date.now() - spawnedAt;
        assert(
          childDurationMs < 700,
          'parser received a reset budget after preparation',
        );
        results.push({
          phase: 'shared-preparation-and-parser-deadline',
          durationMs,
          childDurationMs,
          childClosed: true,
        });
      } finally {
        await service.onModuleDestroy();
      }
    }
    const report = {
      generatedAt: new Date().toISOString(),
      node: process.version,
      passed: true,
      paidProviderCalls: 0,
      filesystem: 'real local files with controlled copy failures/delays',
      results,
    };
    if (process.argv[2])
      await writeFile(process.argv[2], `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
  } finally {
    fs.copyFile = copyFile;
    fs.rm = rm;
    childProcess.fork = fork;
    await rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
