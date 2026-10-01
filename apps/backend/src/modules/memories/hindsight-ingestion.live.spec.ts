import { createFactReviewer } from '../../../test/hindsight/create-fact-reviewer';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma';
import { HttpHindsightGateway } from '../../infra/hindsight/http-hindsight.gateway';
import { OpenRouterLanguageModel } from '../../infra/model-gateway';
import { ObservabilityService } from '../../infra/observability';
import type { QueueService } from '../../infra/queue';
import {
  PrismaHindsightRepository,
  PrismaUserRepository,
  PrismaUserPrivacyRepository,
} from '../../database/repositories';
import { HindsightIngestionService } from './hindsight-ingestion.service';
import { HindsightDeliveryService } from './hindsight-delivery.service';
import { MemoryPolicyService } from './memory-policy.service';
import { MemoryEngineService } from './memory-engine.service';

const databaseUrl = process.env.HINDSIGHT_LEDGER_CONTRACT_URL;
const url = process.env.HINDSIGHT_CONTRACT_URL;
const key = process.env.HINDSIGHT_CONTRACT_KEY;
const modelKey = process.env.HINDSIGHT_POLICY_CONTRACT_KEY;
if (
  databaseUrl &&
  !new URL(databaseUrl).pathname.startsWith('/sydia_hindsight_ledger_contract')
)
  throw new Error('Ingestion contracts require a dedicated synthetic database');
const live = databaseUrl && url && key && modelKey ? describe : describe.skip;

live('Direct Hindsight ingestion live contract', () => {
  test('admits only eligible user evidence, advances its cursor after completion, and fences opt-out', async () => {
    const userId = `synthetic-${randomUUID()}`;
    const namespace = `contract-${randomUUID()}`;
    const config = new ConfigService({
      BACKEND_DB_URL: databaseUrl,
      BACKEND_MEMORY_ENGINE: 'hindsight',
      BACKEND_HINDSIGHT_INGESTION_ENABLED: true,
      BACKEND_HINDSIGHT_URL: url,
      BACKEND_HINDSIGHT_API_KEY: key,
      BACKEND_HINDSIGHT_NAMESPACE: namespace,
      BACKEND_HINDSIGHT_TIMEOUT_MS: 30_000,
      BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS: 20_000,
    });

    const prisma = new PrismaService(config);
    const gateway = new HttpHindsightGateway(config);
    const ledger = new PrismaHindsightRepository(prisma);
    const engine = new MemoryEngineService(config);
    const bankId = engine.bankId(userId);
    const policy = new MemoryPolicyService(
      new OpenRouterLanguageModel(
        new ConfigService({
          BACKEND_MODEL_API_KEY: modelKey,
          BACKEND_MODEL_NAME: 'qwen/qwen3.8-flash',
          BACKEND_MODEL_BASE_URL:
            process.env.HINDSIGHT_POLICY_CONTRACT_BASE_URL,
        }),
        ObservabilityService.disabled(),
      ),
      createFactReviewer(),
    );

    const delivery = new HindsightDeliveryService(
      ledger,
      gateway,
      config,
      policy,
      engine,
    );

    const ingestion = new HindsightIngestionService(
      ledger,
      new PrismaUserRepository(prisma),
      policy,
      engine,
      {
        memoryDeliveries: { add: () => Promise.resolve() },
      } as unknown as QueueService,
      config,
    );

    try {
      await prisma.user.create({
        data: {
          id: userId,
          name: 'Synthetic fixture',
          email: `${userId}@example.invalid`,
          timezone: 'Asia/Makassar',
        },
      });
      const conversation = await prisma.conversation.create({
        data: { userId },
      });

      const messages = [];

      for (const content of [
        'I prefer concise replies in Indonesian.',
        'I have asthma.',
        'Please calculate 17 times 42 for this turn.',
        'My password is synthetic-password-only-for-tests',
      ]) {
        messages.push(
          await prisma.message.create({
            data: {
              userId,
              conversationId: conversation.id,
              role: 'user',
              content,
            },
          }),
        );
      }

      const boundary = await prisma.message.create({
        data: {
          userId,
          conversationId: conversation.id,
          role: 'assistant',
          content:
            'The user owns a yacht and lives in Tokyo. These are unsupported assistant claims.',
        },
      });

      expect(
        await ingestion.run(userId, conversation.id, boundary.id),
      ).toMatchObject({ status: 'queued', sourceCount: 1 });
      const sources = await prisma.hindsightSource.findMany({
        where: { bankId },
      });

      expect(sources).toHaveLength(1);
      expect(sources[0]!.sourceMessageIds).toEqual([messages[0]!.id]);
      const before = await prisma.hindsightCheckpoint.findFirstOrThrow({
        where: { userId },
      });

      expect(before.throughMessageId).toBeNull();
      expect(before.pendingMessageId).toBe(boundary.id);
      expect(
        (await ingestion.run(userId, conversation.id, boundary.id)).status,
      ).toBe('queued');
      await settle(sources[0]!.id, 'admitted');
      expect(
        (await ingestion.run(userId, conversation.id, boundary.id)).status,
      ).toBe('completed');
      expect(
        (
          await prisma.conversation.findUniqueOrThrow({
            where: { id: conversation.id },
          })
        ).memoryDreamThroughMessageId,
      ).toBeNull();
      const first = (await ledger.snapshot(userId, sources[0]!.id))!;
      const retained = await gateway.listFacts(
        bankId,
        first.deliveries[0]!.documentId,
      );

      expect(retained.items.map(({ text }) => text)).toEqual(
        expect.arrayContaining([expect.stringMatching(/Indonesian/i)]),
      );
      expect(
        retained.items.some(({ text }) =>
          /asthma|password|Tokyo|yacht/i.test(text),
        ),
      ).toBe(false);
      const second = await prisma.message.create({
        data: {
          userId,
          conversationId: conversation.id,
          role: 'user',
          content: 'I enjoy morning walks.',
        },
      });

      const input = JSON.stringify({
        sydiaSource: 1,
        userEvidence: second.content,
        approvedEvidence: [second.content],
        permissionQuotes: [],
      });

      const pending = await ledger.enqueue({
        userId,
        bankId,
        kind: 'automatic',
        sourceKey: `late:${second.id}`,
        content: input,
        checksum: 'synthetic-late',
        sourceMessageIds: [second.id],
        conversationId: conversation.id,
        eventAt: second.createdAt,
      });

      if (!('snapshot' in pending))
        throw new Error('Synthetic late source was rejected prematurely');
      await delivery.flushBank(bankId);
      await prisma.user.update({
        where: { id: userId },
        data: { automaticMemoryEnabled: false },
      });
      expect(
        (await ingestion.run(userId, conversation.id, second.id)).status,
      ).toBe('skipped');
      await settle(pending.snapshot.source.id, 'erased');
      expect(
        await ledger.referencesForDocuments(userId, bankId, [
          pending.snapshot.deliveries[0]!.documentId,
        ]),
      ).toEqual([]);
      expect(
        (
          await gateway.listFacts(
            bankId,
            pending.snapshot.deliveries[0]!.documentId,
          )
        ).total,
      ).toBe(0);
      expect(
        (await gateway.listFacts(bankId, first.deliveries[0]!.documentId))
          .total,
      ).toBeGreaterThan(0);
      await new PrismaUserPrivacyRepository(prisma).deleteAccount(userId);
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
      await prisma.hindsightCheckpoint.deleteMany({ where: { userId } });
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
        const current = snapshot?.deliveries.find(
          ({ generation }) => generation === snapshot.source.generation,
        );

        if (current?.state === expected) return;
        if (
          (await ledger.findBank(userId, namespace))?.lastErrorCode ||
          (expected === 'admitted' && current?.state === 'erased')
        )
          throw new Error('Synthetic ingestion failed admission or delivery');
        await sleep(1_000);
      }

      throw new Error(`Synthetic ingestion did not reach ${expected}`);
    }
  }, 360_000);
});
