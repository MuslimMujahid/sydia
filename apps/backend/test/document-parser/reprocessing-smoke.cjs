const assert = require('node:assert/strict');
const { Queue, Worker } = require('bullmq');
const {
  DocumentReprocessingService,
} = require('../../dist/src/modules/documents/document-reprocessing.service.js');

async function main() {
  const url = process.argv[2];
  if (!url || !/^redis:\/\/127\.0\.0\.1:\d+$/.test(url))
    throw new Error('Supply the loopback URL of a disposable Redis instance.');
  const queue = new Queue('sydia-maintenance-smoke', { connection: { url } });
  const records = new Map(
    ['a', 'b', 'c'].map((id) => [
      id,
      { id, status: 'ready', file: { kind: 'document' } },
    ]),
  );
  let failedOnce = false;
  const visited = [];
  const repository = {
    findById: async (owner, id) =>
      owner === 'owner' ? (records.get(id) ?? null) : null,
    restart: async (id) => {
      records.get(id).status = 'processing';
    },
  };
  const documents = {
    processDocument: async (id) => {
      visited.push(id);
      if (id === 'b' && !failedOnce) {
        failedOnce = true;
        throw new Error('Simulated embedding outage');
      }
      records.get(id).status = 'ready';
    },
    markProcessingFailed: async (id) => {
      records.get(id).status = 'failed';
    },
  };
  const service = new DocumentReprocessingService(
    repository,
    documents,
    {},
    { documents: queue },
  );
  let worker;
  let releaseJob;
  let finish;
  let blockingBatch;
  try {
    const preview = await service.batch('owner', ['c', 'a', 'b'], {
      dryRun: true,
      limit: 2,
    });
    assert.equal(preview.afterId, 'b');
    assert.equal(visited.length, 0);
    await assert.rejects(
      service.batch('owner', ['a'], { dryRun: false }),
      /Pause the documents queue/,
    );

    let startedJob;
    const started = new Promise((resolve) => {
      startedJob = resolve;
    });
    worker = new Worker(
      queue.name,
      async () => {
        startedJob();
        await new Promise((resolve) => {
          releaseJob = resolve;
        });
      },
      { connection: { url } },
    );
    await queue.add('hold', {});
    await started;
    await queue.pause();
    await assert.rejects(
      service.batch('owner', ['a'], { dryRun: false }),
      /Pause the documents queue/,
    );
    releaseJob();
    await worker.close();
    worker = undefined;

    const first = await service.batch('owner', ['c', 'b', 'a'], {
      dryRun: false,
    });
    assert.equal(first.interrupted, true);
    assert.equal(first.afterId, 'a');
    const second = await service.batch('owner', ['c', 'b', 'a'], {
      dryRun: false,
      afterId: first.afterId,
    });
    assert.equal(second.afterId, 'c');
    assert.equal(second.hasMore, false);
    assert.deepEqual(visited, ['a', 'b', 'b', 'c']);

    let processingStarted;
    const processing = new Promise((resolve) => {
      processingStarted = resolve;
    });
    const blockingService = new DocumentReprocessingService(
      repository,
      {
        ...documents,
        processDocument: async (id) => {
          processingStarted();
          await new Promise((resolve) => {
            finish = resolve;
          });
          records.get(id).status = 'ready';
        },
      },
      {},
      { documents: queue },
    );
    const running = blockingService.batch('owner', ['a'], { dryRun: false });
    blockingBatch = running;
    await processing;
    const client = await queue.getBackend().client;
    const key = queue.toKey('reprocessing-lease');
    const token = await client.get(key);
    assert.equal(typeof token, 'string');
    await assert.rejects(
      service.batch('owner', ['b'], { dryRun: false }),
      /maintenance lease/,
    );
    assert.equal(
      await client.runCommand('sydiaDocumentMaintenanceRenew', [
        key,
        token,
        120000,
      ]),
      1,
    );
    assert.equal(
      await client.runCommand('sydiaDocumentMaintenanceRelease', [
        key,
        'wrong-owner',
      ]),
      0,
    );
    assert.equal(await client.get(key), token);
    finish();
    await running;
    assert.equal(await client.get(key), null);

    assert.equal(
      await client.runCommand('sydiaDocumentMaintenanceAcquire', [
        key,
        'expiry-test',
        50,
      ]),
      'OK',
    );
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(await client.get(key), null);
    process.stdout.write(
      `${JSON.stringify({ passed: true, checks: ['dry-run', 'active-job-exclusion', 'paused-queue', 'resume-cursor', 'exclusive-lease', 'lease-renewal', 'token-safe-release', 'lease-expiry'] })}\n`,
    );
  } finally {
    releaseJob?.();
    finish?.();
    await blockingBatch?.catch(() => undefined);
    await worker?.close();
    await queue.obliterate({ force: true });
    await queue.close();
  }
}

main().catch(() => {
  process.stderr.write('Document maintenance smoke failed.\n');
  process.exitCode = 1;
});
