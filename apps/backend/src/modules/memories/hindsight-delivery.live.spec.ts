import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma';
import { HttpHindsightGateway } from '../../infra/hindsight/http-hindsight.gateway';
import {
  PrismaHindsightRepository,
  PrismaUserPrivacyRepository,
} from '../../database/repositories';
import { HindsightDeliveryService } from './hindsight-delivery.service';
import type { EnqueueMemorySource } from '../../database/interfaces';

const databaseUrl = process.env.HINDSIGHT_LEDGER_CONTRACT_URL;
const url = process.env.HINDSIGHT_CONTRACT_URL;
const key = process.env.HINDSIGHT_CONTRACT_KEY;
if (
  databaseUrl &&
  !new URL(databaseUrl).pathname.startsWith('/sydia_hindsight_ledger_contract')
)
  throw new Error('Delivery contracts require a dedicated synthetic database');
const live = databaseUrl && url && key ? describe : describe.skip;

live('Durable Hindsight delivery live contract', () => {
  test('replays saves, replaces generations, forgets, and erases a deleted account', async () => {
    const userId = `synthetic-${randomUUID()}`;
    const bankId = `sydia-contract-${randomUUID()}`;
    const namespace = `contract-${randomUUID()}`;
    const config = new ConfigService({
      BACKEND_DB_URL: databaseUrl,
      BACKEND_HINDSIGHT_URL: url,
      BACKEND_HINDSIGHT_API_KEY: key,
      BACKEND_HINDSIGHT_NAMESPACE: namespace,
      BACKEND_HINDSIGHT_TIMEOUT_MS: 30_000,
      BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS: 15_000,
    });

    const prisma = new PrismaService(config);
    const gateway = new HttpHindsightGateway(config);
    const ledger = new PrismaHindsightRepository(prisma);
    const delivery = new HindsightDeliveryService(ledger, gateway, config);
    const content = 'The user prefers answers in Indonesian.';
    const input: EnqueueMemorySource = {
      userId,
      bankId,
      sourceKey: 'explicit:language',
      kind: 'explicit',
      content,
      checksum: createHash('sha256').update(content).digest('hex'),
      sourceMessageIds: [],
      conversationId: null,
      eventAt: new Date('2026-10-01T00:00:00Z'),
    };

    try {
      await prisma.user.create({
        data: {
          id: userId,
          name: 'Synthetic user',
          email: `${userId}@example.invalid`,
        },
      });
      await ledger.ensureBank(userId, namespace, bankId);
      const first = await ledger.enqueue(input);
      if (!('snapshot' in first))
        throw new Error('Could not create synthetic source');
      const sourceId = first.snapshot.source.id;
      expect((await ledger.enqueue(input)).status).toBe('unchanged');
      await settle(sourceId, 'admitted');
      const original = first.snapshot.deliveries[0]!;
      const oldReferences = await ledger.referencesForDocuments(
        userId,
        bankId,
        [original.documentId],
      );

      expect(oldReferences.length).toBeGreaterThan(0);

      const correction = await ledger.enqueue({
        ...input,
        content: 'The user now prefers answers in English.',
        checksum: 'english-v2',
        expectedGeneration: 1,
      });

      if (!('snapshot' in correction))
        throw new Error('Could not correct synthetic source');
      expect(
        await ledger.resolveReference(userId, oldReferences[0]!.reference.id),
      ).toBeNull();
      await settle(sourceId, 'admitted');
      expect((await gateway.listFacts(bankId, original.documentId)).total).toBe(
        0,
      );
      const updated = correction.snapshot.deliveries.at(-1)!;
      const refs = await ledger.referencesForDocuments(userId, bankId, [
        updated.documentId,
      ]);

      expect(refs.length).toBeGreaterThan(0);
      const recalled = await gateway.recall(bankId, {
        query: 'Which language does the user prefer?',
        timestamp: new Date().toISOString(),
        maxTokens: 800,
      });

      expect(recalled.results.length).toBeGreaterThan(0);

      expect(await ledger.forget(userId, sourceId, 2)).toBe('deleted');
      expect(
        await ledger.resolveReference(userId, refs[0]!.reference.id),
      ).toBeNull();
      await settle(sourceId, 'erased');
      expect(
        (
          await gateway.recall(bankId, {
            query: 'Which language does the user prefer?',
            timestamp: new Date().toISOString(),
            maxTokens: 800,
          })
        ).results,
      ).toEqual([]);

      // A separate explicit source exercises erasure after the local User is gone.
      const other = await ledger.enqueue({
        ...input,
        sourceKey: 'explicit:timezone',
        content: 'The user lives in Makassar.',
        checksum: 'makassar',
      });

      if (!('snapshot' in other))
        throw new Error('Could not create second synthetic source');
      await settle(other.snapshot.source.id, 'admitted');
      expect(
        await new PrismaUserPrivacyRepository(prisma).deleteAccount(userId),
      ).toBe(true);
      await delivery.flushBank(bankId);
      expect((await ledger.findBank(userId, namespace))?.state).toBe('erased');
      expect(await ledger.ensureBank(userId, namespace, bankId)).toBeNull();
      // Repeated erasure does not provision a new bank or need the deleted User.
      await delivery.flushBank(bankId);
      expect((await ledger.findBank(userId, namespace))?.state).toBe('erased');
    } finally {
      await gateway.deleteBank(bankId);
      await prisma.hindsightReference.deleteMany({
        where: { delivery: { source: { bankId } } },
      });
      await prisma.hindsightDelivery.deleteMany({
        where: { source: { bankId } },
      });
      await prisma.hindsightSource.deleteMany({ where: { bankId } });
      await prisma.hindsightBank.deleteMany({ where: { id: bankId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }

    async function settle(
      sourceId: string,
      expected: 'admitted' | 'erased',
    ): Promise<void> {
      const deadline = Date.now() + 90_000;

      while (Date.now() < deadline) {
        await delivery.flushBank(bankId);
        const snapshot = await ledger.snapshot(userId, sourceId);
        const current = snapshot?.deliveries.find(
          ({ generation }) => generation === snapshot.source.generation,
        );

        if (current?.state === expected) return;
        if ((await ledger.findBank(userId, namespace))?.lastErrorCode)
          throw new Error('Synthetic delivery failed its live contract');
        await sleep(1_000);
      }

      throw new Error(`Synthetic delivery did not reach ${expected}`);
    }
  }, 300_000);
});
