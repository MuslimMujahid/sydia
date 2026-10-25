import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infra/prisma';
import { MemoryAccessService } from '../../src/modules/memories/memory-access.service';
import { MemoryEngineService } from '../../src/modules/memories/memory-engine.service';

/** Isolated fixture setup through the active memory service, never legacy SQL. */
async function main() {
  const path = process.argv[2];
  const requestIdentity = process.argv[3] ?? 'secretary-fixture-preferences-v1';
  if (!/^secretary-fixture-preferences-v[12]$/.test(requestIdentity))
    throw new Error('Use the recorded fixture request identity v1 or v2 only.');
  if (!path || process.env.NODE_ENV !== 'development')
    throw new Error('Development-only QA manifest required.');
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('accounts' in raw) ||
    !Array.isArray(raw.accounts) ||
    !('preferences' in raw) ||
    typeof raw.preferences !== 'string'
  )
    throw new Error('Invalid QA manifest.');
  const owner: unknown = raw.accounts[0];
  if (
    !owner ||
    typeof owner !== 'object' ||
    !('id' in owner) ||
    typeof owner.id !== 'string' ||
    !/^secretary-qa-/.test(owner.id)
  )
    throw new Error('Only an isolated secretary QA account is allowed.');
  const url = process.env.BACKEND_DB_URL;
  if (
    !url ||
    !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
  )
    throw new Error('An explicit loopback application database is required.');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
    abortOnError: false,
  });

  const evidence: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    userId: owner.id,
    setupOnly: true,
    requestIdentity,
  };

  try {
    const prisma = app.get(PrismaService);
    if (app.get(MemoryEngineService).modeFor(owner.id) !== 'hindsight')
      throw new Error(
        'QA readiness requires the configured active Hindsight engine.',
      );
    const source = await prisma.message.findFirst({
      where: { userId: owner.id, role: 'user', content: raw.preferences },
      orderBy: { createdAt: 'asc' },
    });

    if (!source)
      throw new Error('The fixture explicit memory instruction is missing.');
    evidence.sourceMessageId = source.id;
    const memory = app.get(MemoryAccessService);
    const receipt = await memory.create(
      owner.id,
      {
        content: raw.preferences,
        category: 'preferensi',
        sourceType: 'chat',
        sourceMessageId: source.id,
      },
      {
        sourceMessageId: source.id,
        idempotencyKey: requestIdentity,
      },
    );

    evidence.receipt = receipt;
    if (
      !('sourceIds' in receipt) ||
      !Array.isArray(receipt.sourceIds) ||
      receipt.sourceIds.some((id: unknown) => typeof id !== 'string')
    )
      throw new Error(
        'Hindsight did not return the source identities for this request.',
      );
    const sourceIds = receipt.sourceIds;
    console.log(
      JSON.stringify({
        setup: 'submitted_through_active_memory_service',
        receipt,
      }),
    );
    const until = Date.now() + 180_000;

    while (Date.now() < until) {
      const bank = await prisma.hindsightBank.findFirst({
        where: { userId: owner.id },
        select: { id: true, state: true },
      });

      const deliveries = bank
        ? await prisma.hindsightDelivery.findMany({
            where: { sourceId: { in: sourceIds }, source: { bankId: bank.id } },
            select: { id: true, state: true, admittedAt: true, erasedAt: true },
          })
        : [];

      evidence.bank = bank;
      evidence.deliveries = deliveries;
      if (
        deliveries.some((delivery) =>
          ['failed', 'erased'].includes(delivery.state),
        )
      )
        throw new Error(
          'The active memory admission pipeline rejected or erased the fixture; inspect the recorded source and delivery.',
        );

      if (deliveries.some((delivery) => delivery.state === 'admitted')) {
        const hits = await memory.search(
          owner.id,
          'Jam kerja setiap hari termasuk akhir pekan, preferensi fokus pagi, dan jeda antaragenda',
          10,
        );

        evidence.recall = hits;

        if (
          hits.length &&
          hits.every(
            (hit) => Array.isArray(hit.evidence) && hit.evidence.length > 0,
          )
        ) {
          evidence.status = 'admitted_recall_observed';
          console.log(
            JSON.stringify({ setup: evidence.status, hits: hits.length }),
          );

          return;
        }
      }

      await delay(2000);
    }

    throw new Error(
      'Active-engine admission and recall were not observed within 180 seconds.',
    );
  } catch (error: unknown) {
    evidence.status = 'failed';
    evidence.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    evidence.finishedAt = new Date().toISOString();
    const output = resolve(
      dirname(path),
      `memory-readiness-${Date.now()}.json`,
    );

    await writeFile(output, JSON.stringify(evidence, null, 2) + '\n', {
      mode: 0o600,
    });
    console.log(JSON.stringify({ artifact: output }));
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('Secretary memory readiness failed.', error);
  process.exitCode = 1;
});
