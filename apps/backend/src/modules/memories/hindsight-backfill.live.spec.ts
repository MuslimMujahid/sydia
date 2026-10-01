import { createFactReviewer } from '../../../test/hindsight/create-fact-reviewer';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma';
import { HttpHindsightGateway } from '../../infra/hindsight/http-hindsight.gateway';
import { OpenRouterLanguageModel } from '../../infra/model-gateway';
import { ObservabilityService } from '../../infra/observability';
import {
  PrismaHindsightRepository,
  PrismaMemoryRepository,
  PrismaUserRepository,
  PrismaConversationRepository,
} from '../../database/repositories';
import { HindsightBackfillService } from './hindsight-backfill.service';
import { HindsightDeliveryService } from './hindsight-delivery.service';
import { MemoryEngineService } from './memory-engine.service';
import { MemoryPolicyService } from './memory-policy.service';
import { MemoryArchiveService } from './memory-archive.service';

const databaseUrl = process.env.HINDSIGHT_LEDGER_CONTRACT_URL;
const url = process.env.HINDSIGHT_CONTRACT_URL;
const key = process.env.HINDSIGHT_CONTRACT_KEY;
const modelKey = process.env.HINDSIGHT_POLICY_CONTRACT_KEY;
if (
  databaseUrl &&
  !new URL(databaseUrl).pathname.startsWith('/sydia_hindsight_ledger_contract')
)
  throw new Error('Backfill contracts require a dedicated synthetic database');
const live = databaseUrl && url && key && modelKey ? describe : describe.skip;

live('Hindsight saved-fact backfill live contract', () => {
  test('imports existing facts through policy and admission, recalls them, skips reruns, and erases deleted legacy sources', async () => {
    const userId = `synthetic-${randomUUID()}`;
    const namespace = `contract-${randomUUID()}`;
    const config = new ConfigService({
      BACKEND_DB_URL: databaseUrl,
      BACKEND_MEMORY_ENGINE: 'hindsight',
      BACKEND_HINDSIGHT_URL: url,
      BACKEND_HINDSIGHT_API_KEY: key,
      BACKEND_HINDSIGHT_NAMESPACE: namespace,
      BACKEND_HINDSIGHT_TIMEOUT_MS: 30_000,
      BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS: 20_000,
    });

    const prisma = new PrismaService(config);
    const ledger = new PrismaHindsightRepository(prisma);
    const memories = new PrismaMemoryRepository(prisma);
    const gateway = new HttpHindsightGateway(config);
    const engine = new MemoryEngineService(config);
    const bankId = engine.bankId(userId);
    const model = new OpenRouterLanguageModel(
      new ConfigService({
        BACKEND_MODEL_API_KEY: modelKey,
        BACKEND_MODEL_NAME: 'qwen/qwen3.8-flash',
        BACKEND_MODEL_BASE_URL: process.env.HINDSIGHT_POLICY_CONTRACT_BASE_URL,
      }),
      ObservabilityService.disabled(),
    );

    let modelCalls = 0;
    const policy = new MemoryPolicyService(
      {
        provider: model.provider,
        model: model.model,
        generate: (request) => {
          modelCalls += 1;

          return model.generate(request);
        },
      },
      createFactReviewer(),
    );

    const backfill = new HindsightBackfillService(
      memories,
      ledger,
      new PrismaUserRepository(prisma),
      engine,
      new PrismaConversationRepository(prisma),
      policy,
    );

    const delivery = new HindsightDeliveryService(
      ledger,
      gateway,
      config,
      policy,
      engine,
    );

    const archive = new MemoryArchiveService(ledger, gateway);

    try {
      await prisma.user.create({
        data: {
          id: userId,
          name: 'Synthetic fixture',
          email: `${userId}@example.invalid`,
          timezone: 'Asia/Makassar',
          automaticMemoryEnabled: false,
        },
      });
      const conversation = await prisma.conversation.create({
        data: { userId },
      });

      const eventAt = new Date('2026-09-30T00:00:00Z');
      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          userId,
          role: 'user',
          content: 'I prefer replies in Indonesian. Remember this.',
          createdAt: eventAt,
        },
      });

      const saved = await memories.create(userId, {
        content: 'The user prefers replies in Indonesian.',
        sourceType: 'chat',
        sourceMessageId: message.id,
        sourceMessageIds: [message.id],
      });

      expect((await backfill.batch(userId)).outcomes).toEqual([
        { legacyId: saved.id, status: 'eligible' },
      ]);
      expect(modelCalls).toBe(0);
      expect(await ledger.findBank(userId, namespace)).toBeNull();
      const accepted = await backfill.batch(userId, { dryRun: false });
      expect(accepted.interrupted).toBe(false);
      expect(accepted.outcomes[0]?.status).toBe('written');
      const sourceId = accepted.outcomes[0]!.sourceId!;
      await settle(sourceId, 'admitted');
      const current = (await ledger.snapshot(userId, sourceId))!;
      expect(current.source.kind).toBe('import');
      expect(current.source.sourceMessageIds).toEqual([message.id]);
      expect(current.source.eventAt).toEqual(eventAt);
      const exported = await archive.export(userId);
      expect(
        exported.sources[0]!.facts.some(({ text }) => /Indonesian/i.test(text)),
      ).toBe(true);
      const recall = await gateway.recall(bankId, {
        query: 'Which language does the user prefer for replies?',
        timestamp: new Date().toISOString(),
        maxTokens: 800,
        includeObservations: false,
      });

      expect(recall.results.some(({ text }) => /Indonesian/i.test(text))).toBe(
        true,
      );
      const callsBeforeRerun = modelCalls;
      expect(
        (await backfill.batch(userId, { dryRun: false })).outcomes[0]?.status,
      ).toBe('unchanged');
      expect(modelCalls).toBe(callsBeforeRerun);
      const documentId = current.deliveries[0]!.documentId;
      expect(await memories.delete(userId, saved.id)).toBe(true);
      expect((await archive.export(userId)).sources[0]).toMatchObject({
        input: null,
        facts: [],
      });
      await settle(sourceId, 'erased');
      expect((await gateway.listFacts(bankId, documentId)).total).toBe(0);
      expect(
        (await backfill.batch(userId, { dryRun: false })).outcomes,
      ).toEqual([]);
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
      const deadline = Date.now() + 120_000;

      while (Date.now() < deadline) {
        await delivery.flushBank(bankId);
        const snapshot = await ledger.snapshot(userId, sourceId);
        const latest = snapshot?.deliveries.find(
          ({ generation }) => generation === snapshot.source.generation,
        );

        if (latest?.state === expected) return;
        if (
          (await ledger.findBank(userId, namespace))?.lastErrorCode ||
          (expected === 'admitted' && latest?.state === 'erased')
        )
          throw new Error('Synthetic backfill failed admission or delivery');
        await sleep(1_000);
      }

      throw new Error(`Synthetic backfill did not reach ${expected}`);
    }
  }, 240_000);
});
