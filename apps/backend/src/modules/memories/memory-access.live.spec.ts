import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma';
import { HttpHindsightGateway } from '../../infra/hindsight/http-hindsight.gateway';
import type { QueueService } from '../../infra/queue';
import {
  PrismaConversationRepository,
  PrismaHindsightRepository,
  PrismaMemoryRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { HindsightDeliveryService } from './hindsight-delivery.service';
import { MemoryAccessService } from './memory-access.service';
import { MemoryEngineService } from './memory-engine.service';
import type { MemoryMutationReceipt } from './memory-access.types';
import { MemoryService } from './memory.service';
import { EmbeddingsService } from '../../infra/embeddings';
import { MemoryRollbackService } from './memory-rollback.service';
import { MemoryPolicyService } from './memory-policy.service';
import { MemoryArchiveService } from './memory-archive.service';
import { OpenRouterLanguageModel } from '../../infra/model-gateway';
import { ObservabilityService } from '../../infra/observability';

const databaseUrl = process.env.HINDSIGHT_LEDGER_CONTRACT_URL;
const url = process.env.HINDSIGHT_CONTRACT_URL;
const key = process.env.HINDSIGHT_CONTRACT_KEY;
const policyKey = process.env.HINDSIGHT_POLICY_CONTRACT_KEY;
if (
  databaseUrl &&
  !new URL(databaseUrl).pathname.startsWith('/sydia_hindsight_ledger_contract')
)
  throw new Error(
    'Memory access contracts require a dedicated synthetic database',
  );
const live = databaseUrl && url && key && policyKey ? describe : describe.skip;

live('Chat memory adapter live contract', () => {
  test('retains compound user evidence, corrects one fact, reconciles rollback, and forgets recovered facts', async () => {
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
    const gateway = new HttpHindsightGateway(config);
    const ledger = new PrismaHindsightRepository(prisma);
    const engine = new MemoryEngineService(config);
    const policyTraces: string[] = [];
    const model = new OpenRouterLanguageModel(
      new ConfigService({
        BACKEND_MODEL_API_KEY: policyKey,
        BACKEND_MODEL_NAME: 'qwen/qwen3.8-flash',
        BACKEND_MODEL_BASE_URL: process.env.HINDSIGHT_POLICY_CONTRACT_BASE_URL,
      }),
      ObservabilityService.disabled(),
    );

    const policy = new MemoryPolicyService({
      provider: model.provider,
      model: model.model,
      generate: async (request) => {
        // Capture synthetic diagnostics here, outside the production tracer.
        policyTraces.push(JSON.stringify(request.messages));
        const result = await model.generate(request);
        policyTraces.push(result.text);

        return result;
      },
    });

    const bankId = engine.bankId(userId);
    const delivery = new HindsightDeliveryService(
      ledger,
      gateway,
      config,
      policy,
    );

    const access = new MemoryAccessService(
      engine,
      {} as MemoryService,
      new PrismaMemoryRepository(prisma),
      ledger,
      gateway,
      new PrismaConversationRepository(prisma),
      {
        memoryDeliveries: { add: () => Promise.resolve() },
      } as unknown as QueueService,
      new PrismaUserRepository(prisma),
      policy,
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

      const original = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          userId,
          role: 'user',
          content:
            'Remember these two facts about me: I prefer replies in Indonesian. I live in Makassar.',
          createdAt: new Date('2026-09-30T00:00:00Z'),
        },
      });

      const saveContext = {
        idempotencyKey: randomUUID(),
        sourceMessageId: original.id,
      };

      const input = {
        content:
          'The user prefers replies in Indonesian. The user lives in Makassar.',
        sourceType: 'chat' as const,
      };

      const accepted = (await access.create(
        userId,
        input,
        saveContext,
      )) as MemoryMutationReceipt;

      expect(accepted.status).toBe('queued');
      const sourceId = accepted.sourceIds![0]!;
      await settle(sourceId, 'admitted');
      expect(
        (
          (await access.create(
            userId,
            input,
            saveContext,
          )) as MemoryMutationReceipt
        ).status,
      ).toBe('completed');
      const first = await ledger.snapshot(userId, sourceId);
      const firstDocument = first!.deliveries[0]!.documentId;
      const raw = await gateway.listFacts(bankId, firstDocument);
      const language = raw.items.find(
        ({ text }) => /Indonesian/i.test(text) && !/Makassar/i.test(text),
      );

      expect(language).toBeDefined();
      expect(raw.items.some(({ text }) => /Makassar/i.test(text))).toBe(true);
      const refs = await ledger.referencesForDocuments(userId, bankId, [
        firstDocument,
      ]);

      const languageRef = refs.find(
        ({ reference }) => reference.remoteFactId === language!.id,
      )!;

      expect(
        await ledger.resolveReference(
          'another-synthetic-owner',
          languageRef.reference.id,
        ),
      ).toBeNull();
      const correction = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          userId,
          role: 'user',
          content:
            'Correction: I now prefer replies in English. Remember that instead.',
        },
      });

      const correctionContext = {
        idempotencyKey: randomUUID(),
        sourceMessageId: correction.id,
      };

      const correctionInput = {
        content: 'The user now prefers replies in English.',
      };

      const reference = `hm:${languageRef.reference.id}`;
      const corrected = (await access.update(
        userId,
        reference,
        correctionInput,
        correctionContext,
      )) as MemoryMutationReceipt;

      expect(corrected.status).toBe('queued');
      expect(
        (
          (await access.update(
            userId,
            reference,
            correctionInput,
            correctionContext,
          )) as MemoryMutationReceipt
        ).id,
      ).toBe(corrected.id);
      await settle(sourceId, 'admitted');
      const second = await ledger.snapshot(userId, sourceId);
      expect(second!.source.generation).toBe(2);
      expect((await gateway.listFacts(bankId, firstDocument)).total).toBe(0);
      const latest = second!.deliveries.find(
        ({ generation }) => generation === 2,
      )!;

      const correctedFacts = (
        await gateway.listFacts(bankId, latest.documentId)
      ).items;

      expect(correctedFacts.some(({ text }) => /English/i.test(text))).toBe(
        true,
      );
      expect(correctedFacts.some(({ text }) => /Makassar/i.test(text))).toBe(
        true,
      );
      expect(correctedFacts.some(({ text }) => /Indonesian/i.test(text))).toBe(
        false,
      );
      const archive = await new MemoryArchiveService(ledger, gateway).export(
        userId,
      );

      expect(archive.sources).toHaveLength(1);
      expect(archive.sources[0]!.generation).toBe(2);
      expect(archive.sources[0]!.facts.map(({ text }) => text)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/English/i),
          expect.stringMatching(/Makassar/i),
        ]),
      );
      const hits = await access.search(
        userId,
        'Which city does the user live in?',
        5,
        { mutation: true },
      );

      expect(hits.some(({ content }) => /Makassar/i.test(content))).toBe(true);
      expect(hits.every(({ type }) => type === 'world')).toBe(true);
      const memories = new PrismaMemoryRepository(prisma);
      const embeddings = new EmbeddingsService(
        new ConfigService({
          BACKEND_MODEL_API_KEY: policyKey,
          BACKEND_MODEL_BASE_URL:
            process.env.HINDSIGHT_EMBEDDING_CONTRACT_BASE_URL ??
            'https://openrouter.ai/api/v1',
        }),
      );

      const rollback = new MemoryRollbackService(
        ledger,
        new PrismaUserRepository(prisma),
        new MemoryArchiveService(ledger, gateway),
        embeddings,
        engine,
      );

      expect((await rollback.reconcile(userId)).status).toBe('ready');
      expect(await prisma.memory.count({ where: { userId } })).toBe(0);
      expect((await rollback.reconcile(userId, { dryRun: false })).status).toBe(
        'written',
      );
      await settle(sourceId, 'erased');
      expect((await ledger.findBank(userId, namespace))?.state).toBe('erased');
      const legacyEngine = new MemoryEngineService(
        new ConfigService({
          BACKEND_MEMORY_ENGINE: 'legacy',
          BACKEND_HINDSIGHT_NAMESPACE: namespace,
        }),
      );

      const legacyAccess = new MemoryAccessService(
        legacyEngine,
        new MemoryService(memories, embeddings, config),
        memories,
        ledger,
        gateway,
        new PrismaConversationRepository(prisma),
        {
          memoryDeliveries: { add: () => Promise.resolve() },
        } as unknown as QueueService,
        new PrismaUserRepository(prisma),
      );

      const vague = await legacyAccess.search(userId, 'preferred language', 5);
      const recovered = await legacyAccess.search(
        userId,
        'The user prefers replies in English.',
        5,
      );

      const languageHit = recovered.find(({ content }) =>
        /English/i.test(content),
      )!;

      expect(languageHit).toBeDefined();
      process.stdout.write(
        `Synthetic rollback retrieval vagueMatches=${vague.length} concreteMatches=${recovered.length}\n`,
      );
      expect(
        (
          await legacyAccess.search(userId, 'The user lives in Makassar.', 5)
        ).some(({ content }) => /Makassar/i.test(content)),
      ).toBe(true);
      const postRollbackCorrection = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          userId,
          role: 'user',
          content: 'I now prefer Spanish replies. Remember that instead.',
        },
      });

      await legacyAccess.update(
        userId,
        languageHit.id,
        { content: 'The user now prefers Spanish replies.' },
        {
          sourceMessageId: postRollbackCorrection.id,
          idempotencyKey: randomUUID(),
        },
      );
      expect(
        (await legacyAccess.search(userId, 'Spanish', 5)).some(({ content }) =>
          /Spanish/i.test(content),
        ),
      ).toBe(true);
      const forget = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          userId,
          role: 'user',
          content:
            'Forget the language and city information I asked you to remember.',
        },
      });

      const forgetContext = {
        idempotencyKey: randomUUID(),
        sourceMessageId: forget.id,
      };

      expect(
        (await legacyAccess.delete(userId, corrected.id, forgetContext))!
          .status,
      ).toBe('completed');
      expect(await legacyAccess.search(userId, 'language and city')).toEqual(
        [],
      );
      expect((await rollback.reconcile(userId, { dryRun: false })).status).toBe(
        'unchanged',
      );
      expect(await prisma.memory.count({ where: { userId } })).toBe(0);
      expect(
        (
          (await legacyAccess.create(
            userId,
            input,
            saveContext,
          )) as MemoryMutationReceipt
        ).status,
      ).toBe('withdrawn');
      expect(
        (
          (await legacyAccess.update(
            userId,
            reference,
            correctionInput,
            correctionContext,
          )) as MemoryMutationReceipt
        ).status,
      ).toBe('withdrawn');
      expect(await prisma.memory.count({ where: { userId } })).toBe(0);
      expect(await access.search(userId, 'language and city')).toEqual([]);
      expect(
        (await new MemoryArchiveService(ledger, gateway).export(userId))
          .sources[0],
      ).toMatchObject({ input: null, facts: [] });
      expect(
        await ledger.suppressedMessageIds(userId, [
          original.id,
          correction.id,
          postRollbackCorrection.id,
          forget.id,
        ]),
      ).toHaveLength(4);
      await settle(sourceId, 'erased');
      expect(
        (await access.delete(userId, corrected.id, forgetContext))!.status,
      ).toBe('completed');
      expect(
        (
          (await access.create(
            userId,
            input,
            saveContext,
          )) as MemoryMutationReceipt
        ).status,
      ).toBe('withdrawn');
      expect((await ledger.findBank(userId, namespace))?.state).toBe('erased');
      await expect(
        gateway.listFacts(bankId, latest.documentId),
      ).rejects.toMatchObject({ status: 404 });
    } catch (error: unknown) {
      // Fixture-only diagnostic output; this test never reads real user content.
      process.stderr.write(
        `Synthetic final policy verdict: ${JSON.stringify(policyTraces.slice(-2))}\n`,
      );
      throw error;
    } finally {
      await prisma.hindsightRollback.deleteMany({ where: { userId } });
      await gateway.deleteBank(bankId);
      await prisma.hindsightReference.deleteMany({
        where: { delivery: { source: { bankId } } },
      });
      await prisma.hindsightDelivery.deleteMany({
        where: { source: { bankId } },
      });
      await prisma.hindsightSource.deleteMany({ where: { bankId } });
      await prisma.hindsightBank.deleteMany({ where: { id: bankId } });
      await prisma.hindsightSuppression.deleteMany({ where: { userId } });
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
        if (expected === 'admitted' && current?.state === 'erased')
          throw new Error(
            'Synthetic adapter source was withdrawn by admission',
          );
        if ((await ledger.findBank(userId, namespace))?.lastErrorCode)
          throw new Error(
            'Synthetic adapter delivery failed its live contract',
          );
        await sleep(1_000);
      }

      throw new Error(`Synthetic adapter did not reach ${expected}`);
    }
  }, 360_000);
});
