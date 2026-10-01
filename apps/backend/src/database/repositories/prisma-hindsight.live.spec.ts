import { randomUUID, createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma';
import type { MemorySourceSnapshot } from '../entities';
import type {
  EnqueueMemorySource,
  MemorySourceWriteResult,
  ReconcileMemoryRollback,
} from '../interfaces';
import { PrismaHindsightRepository } from './prisma-hindsight.repository';
import { PrismaUserPrivacyRepository } from './prisma-user-privacy.repository';
import { PrismaMemoryRepository } from './prisma-memory.repository';
import { PrismaConversationRepository } from './prisma-conversation.repository';
import { PrismaUserRepository } from './prisma-user.repository';
import { HindsightBackfillService } from '../../modules/memories/hindsight-backfill.service';
import { MemoryEngineService } from '../../modules/memories/memory-engine.service';

// Opt-in only, and require an explicitly dedicated database (never the app DB).
const url = process.env.HINDSIGHT_LEDGER_CONTRACT_URL;
if (
  url &&
  !new URL(url).pathname.startsWith('/sydia_hindsight_ledger_contract')
)
  throw new Error('Ledger contracts require a dedicated synthetic database');
const live = url ? describe : describe.skip;

function snapshot(result: MemorySourceWriteResult): MemorySourceSnapshot {
  if (!('snapshot' in result)) throw new Error(`Source was ${result.status}`);

  return result.snapshot;
}

live('Hindsight coordination PostgreSQL contract', () => {
  let prisma: PrismaService;
  let repository: PrismaHindsightRepository;
  const owners: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ BACKEND_DB_URL: url }));
    repository = new PrismaHindsightRepository(prisma);
    await prisma.$connect();
  });

  afterAll(async () => {
    // Only identities created by this run, on the dedicated contract database.
    await prisma.hindsightRollback.deleteMany({
      where: { userId: { in: owners } },
    });
    await prisma.hindsightReference.deleteMany({
      where: { delivery: { source: { bank: { userId: { in: owners } } } } },
    });
    await prisma.hindsightDelivery.deleteMany({
      where: { source: { bank: { userId: { in: owners } } } },
    });
    await prisma.hindsightSource.deleteMany({
      where: { bank: { userId: { in: owners } } },
    });
    await prisma.hindsightBank.deleteMany({
      where: { userId: { in: owners } },
    });
    await prisma.hindsightSuppression.deleteMany({
      where: { userId: { in: owners } },
    });
    await prisma.hindsightCheckpoint.deleteMany({
      where: { userId: { in: owners } },
    });
    await prisma.user.deleteMany({ where: { id: { in: owners } } });
    await prisma.$disconnect();
  });

  async function fixture() {
    const userId = `synthetic-${randomUUID()}`;
    owners.push(userId);
    await prisma.user.create({
      data: {
        id: userId,
        name: 'Synthetic test user',
        email: `${userId}@example.invalid`,
      },
    });
    const bankId = `synthetic-bank-${randomUUID()}`;
    const namespace = `contract-${randomUUID()}`;
    await repository.ensureBank(userId, namespace, bankId);
    const conversation = await prisma.conversation.create({ data: { userId } });
    const message = await prisma.message.create({
      data: {
        userId,
        conversationId: conversation.id,
        role: 'user',
        content: 'I prefer Indonesian answers.',
      },
    });

    const input: EnqueueMemorySource = {
      userId,
      bankId,
      kind: 'explicit',
      sourceKey: `save:${randomUUID()}`,
      content: message.content,
      checksum: createHash('sha256').update(message.content).digest('hex'),
      sourceMessageIds: [message.id],
      conversationId: conversation.id,
      eventAt: message.createdAt,
    };

    return { userId, bankId, namespace, input, message };
  }

  async function admit(
    source: MemorySourceSnapshot,
    token: string,
    fact: string = randomUUID(),
  ) {
    const delivery = source.deliveries.at(-1)!;
    expect(
      await repository.startDispatch(source.bank.id, token, delivery.id),
    ).toBe(true);
    expect(
      await repository.transitionDelivery(
        source.bank.id,
        token,
        delivery.id,
        'retained',
      ),
    ).toBe(true);
    expect(
      await repository.admit(source.bank.id, token, delivery.id, [fact]),
    ).toBe(true);

    return (
      await repository.referencesForDocuments(
        source.bank.userId,
        source.bank.id,
        [delivery.documentId],
      )
    )[0]!;
  }

  async function rollbackFixture() {
    const fixtureData = await fixture();
    const { userId, bankId, namespace, input } = fixtureData;
    const memories = new PrismaMemoryRepository(prisma);
    const saved = await memories.create(userId, {
      content: 'The user prefers Indonesian.',
      sourceType: 'dashboard',
    });

    const original = snapshot(
      await repository.enqueue({
        ...input,
        kind: 'import',
        sourceKey: `legacy:${saved.id}`,
        sourceMessageIds: [],
        conversationId: null,
        legacySnapshot: { id: saved.id, updatedAt: saved.updatedAt },
      }),
    );

    const token = randomUUID();
    await repository.claimBank(bankId, token, new Date(Date.now() + 60_000));
    await admit(original, token, 'old-language');
    const corrected = snapshot(
      await repository.enqueue({
        ...input,
        kind: 'explicit',
        sourceKey: original.source.sourceKey,
        sourceMessageIds: [],
        conversationId: null,
        expectedGeneration: 1,
        content: 'The user now prefers English.',
        checksum: 'new-language',
      }),
    );

    await repository.transitionDelivery(
      bankId,
      token,
      original.deliveries[0]!.id,
      'erased',
    );
    const reference = await admit(corrected, token, 'new-language');
    await repository.releaseBank(bankId, token, new Date());
    const boundary = (await repository.rollbackBoundary(userId, bankId))!;
    const reconcile: ReconcileMemoryRollback = {
      userId,
      bankId,
      namespace,
      boundary,
      facts: [
        {
          sourceId: corrected.source.id,
          remoteFactId: 'new-language',
          text: 'The user now prefers English.',
          occurredAt: input.eventAt.toISOString(),
          embedding: [1, ...Array<number>(1535).fill(0)],
        },
      ],
      embeddingModel: 'synthetic-vector',
      embeddingVersion: 'contract-v1',
    };

    return { ...fixtureData, saved, corrected, reference, memories, reconcile };
  }

  test('rollback atomically preserves corrected facts, indexes them, fences the bank, advances the legacy watermark, and is idempotent', async () => {
    const { userId, bankId, namespace, saved, message, memories, reconcile } =
      await rollbackFixture();

    const unrelated = await memories.create(userId, {
      content: 'Unrelated legacy fact',
    });

    const result = await repository.reconcileRollback(reconcile);
    expect(result.status).toBe('written');
    expect(await memories.findById(userId, saved.id)).toBeNull();
    expect(await memories.findById(userId, unrelated.id)).not.toBeNull();
    const recovered = (await memories.searchKeyword(userId, 'English', 5))[0]!;
    expect(recovered).toBeDefined();
    expect(
      (
        await memories.searchVector(
          userId,
          reconcile.facts[0]!.embedding,
          5,
          0.3,
        )
      )[0]?.memory.id,
    ).toBe(recovered.id);
    expect(await repository.ensureBank(userId, namespace, bankId)).toBeNull();
    expect((await repository.findBank(userId, namespace))?.state).toBe(
      'erasing',
    );
    expect(
      (
        await prisma.conversation.findUniqueOrThrow({
          where: { id: message.conversationId },
        })
      ).memoryDreamThroughMessageId,
    ).toBe(message.id);
    expect((await repository.reconcileRollback(reconcile)).status).toBe(
      'unchanged',
    );
    expect(
      await prisma.memory.count({
        where: { userId, content: recovered.content },
      }),
    ).toBe(1);
    expect((await repository.rollbackRecord(userId, bankId))?.factCount).toBe(
      1,
    );
  });

  test('rollback rejects raced messages, live leases, incomplete selections, duplicates, and invalid vectors without changing either corpus', async () => {
    const { userId, bankId, saved, message, memories, reconcile } =
      await rollbackFixture();

    expect(
      (await repository.reconcileRollback({ ...reconcile, facts: [] })).status,
    ).toBe('stale');
    expect(
      (
        await repository.reconcileRollback({
          ...reconcile,
          facts: [reconcile.facts[0]!, reconcile.facts[0]!],
        })
      ).status,
    ).toBe('stale');
    expect(
      (
        await repository.reconcileRollback({
          ...reconcile,
          facts: [{ ...reconcile.facts[0]!, embedding: [1] }],
        })
      ).status,
    ).toBe('stale');
    const token = randomUUID();
    await repository.claimBank(bankId, token, new Date(Date.now() + 60_000));
    expect((await repository.reconcileRollback(reconcile)).status).toBe('busy');
    await repository.releaseBank(bankId, token, new Date());
    await prisma.message.create({
      data: {
        userId,
        conversationId: message.conversationId,
        role: 'user',
        content: 'A concurrent new message',
      },
    });
    expect((await repository.reconcileRollback(reconcile)).status).toBe(
      'stale',
    );
    expect(await repository.rollbackRecord(userId, bankId)).toBeNull();
    expect(await memories.findById(userId, saved.id)).not.toBeNull();
    expect(
      (await repository.findBank(userId, reconcile.namespace))?.state,
    ).toBe('active');
  });

  test('old Hindsight references can forget recovered and subsequently corrected legacy facts without message evidence', async () => {
    const { userId, bankId, corrected, reference, memories, reconcile } =
      await rollbackFixture();

    await repository.reconcileRollback(reconcile);
    const recovered = (await memories.searchKeyword(userId, 'English', 5))[0]!;
    const newer = await memories.supersede(userId, recovered.id, {
      content: 'The user now prefers Spanish.',
      sourceMessageIds: [],
    });

    expect(newer).not.toBeNull();
    expect(
      (await repository.resolveReference(userId, reference.reference.id, true))
        ?.source.id,
    ).toBe(corrected.source.id);
    expect(
      await repository.forgetSources(userId, [
        { sourceId: corrected.source.id, generation: 2 },
      ]),
    ).toBe('deleted');
    expect(await memories.findById(userId, recovered.id)).toBeNull();
    expect(await memories.findById(userId, newer!.id)).toBeNull();
    expect((await repository.reconcileRollback(reconcile)).status).toBe(
      'unchanged',
    );
    expect(await prisma.memory.count({ where: { userId } })).toBe(0);
    expect(await repository.rollbackRecord('other-owner', bankId)).toBeNull();
  });

  test('forgetting through a recovered legacy ID withdraws the retired source and does not resurrect on reconciliation replay', async () => {
    const { userId, corrected, memories, reconcile } = await rollbackFixture();
    await repository.reconcileRollback(reconcile);
    const recovered = (await memories.searchKeyword(userId, 'English', 5))[0]!;
    expect(await memories.delete(userId, recovered.id)).toBe(true);
    expect(await repository.forget(userId, corrected.source.id, 2)).toBe(
      'deleted',
    );
    expect((await repository.reconcileRollback(reconcile)).status).toBe(
      'unchanged',
    );
    expect(await prisma.memory.count({ where: { userId } })).toBe(0);
  });

  test('rollback rejects a legacy revision changed after the verified boundary', async () => {
    const { userId, bankId, saved, reconcile } = await rollbackFixture();
    await prisma.memory.update({
      where: { id: saved.id },
      data: {
        content: 'Concurrent local correction',
        updatedAt: new Date(saved.updatedAt.getTime() + 1000),
      },
    });
    expect((await repository.reconcileRollback(reconcile)).status).toBe(
      'stale',
    );
    expect(await repository.rollbackRecord(userId, bankId)).toBeNull();
    expect(
      await prisma.memory.findUnique({ where: { id: saved.id } }),
    ).toMatchObject({ content: 'Concurrent local correction' });
    expect(
      (await repository.findBank(userId, reconcile.namespace))?.state,
    ).toBe('active');
  });

  test('a prepared rollback cannot cross ownership or recreate facts after account deletion', async () => {
    const { userId, bankId, reconcile } = await rollbackFixture();
    const other = await fixture();
    expect(
      (
        await repository.reconcileRollback({
          ...reconcile,
          userId: other.userId,
        })
      ).status,
    ).toBe('unavailable');
    expect(await repository.rollbackRecord(userId, bankId)).toBeNull();
    expect(
      await new PrismaUserPrivacyRepository(prisma).deleteAccount(userId),
    ).toBe(true);
    expect((await repository.reconcileRollback(reconcile)).status).toBe(
      'unavailable',
    );
    expect(await prisma.memory.count({ where: { userId } })).toBe(0);
    expect(await repository.rollbackRecord(userId, bankId)).toBeNull();
    expect(
      (await repository.findBank(userId, reconcile.namespace))?.state,
    ).toBe('erasing');
  });

  test('erasure-only recovery excludes active banks and keeps retired bank rechecks', async () => {
    const { input, userId, namespace, bankId } = await fixture();
    await repository.enqueue(input);
    const retiredId = `synthetic-bank-${randomUUID()}`;
    const other = await fixture();
    await repository.ensureBank(other.userId, namespace, retiredId);
    await prisma.hindsightBank.update({
      where: { id: retiredId },
      data: { state: 'erased', nextAttemptAt: new Date(0) },
    });
    const now = new Date(Date.now() + 1000);
    const ordinary = await repository.pendingBanks(namespace, now, 20);
    expect(ordinary.map(({ id }) => id)).toEqual(
      expect.arrayContaining([bankId, retiredId]),
    );
    const erasure = await repository.pendingBanks(namespace, now, 20, true);
    expect(erasure.map(({ id }) => id)).toEqual([retiredId]);
    expect((await repository.findBank(userId, namespace))?.state).toBe(
      'active',
    );
  });

  test('saved-fact backfill is dry by default, resumable, opt-out safe, and fenced against legacy edits and deletion', async () => {
    const { userId, bankId, namespace, message } = await fixture();
    await prisma.user.update({
      where: { id: userId },
      data: { automaticMemoryEnabled: false },
    });
    const memories = new PrismaMemoryRepository(prisma);
    const saved = await memories.create(userId, {
      content: 'The user lives in Makassar.',
      pinned: true,
      sourceType: 'dashboard',
    });

    const suppressed = await memories.create(userId, {
      content: 'A previously forgotten preference',
      sourceType: 'chat',
      sourceMessageIds: [message.id],
    });

    await prisma.hindsightSuppression.create({
      data: { userId, messageId: message.id },
    });
    const backfill = new HindsightBackfillService(
      memories,
      repository,
      new PrismaUserRepository(prisma),
      new MemoryEngineService(
        new ConfigService({
          BACKEND_MEMORY_ENGINE: 'hindsight',
          BACKEND_HINDSIGHT_NAMESPACE: namespace,
        }),
      ),
      new PrismaConversationRepository(prisma),
    );

    const dry = await backfill.batch(userId);
    expect(dry.dryRun).toBe(true);
    expect(
      dry.outcomes.find(({ legacyId }) => legacyId === saved.id)?.status,
    ).toBe('eligible');
    expect(
      dry.outcomes.find(({ legacyId }) => legacyId === suppressed.id)?.status,
    ).toBe('suppressed');
    expect(
      await repository.findSource(userId, bankId, `legacy:${saved.id}`),
    ).toBeNull();
    const written = await backfill.batch(userId, { dryRun: false, limit: 1 });
    expect(written.nextCursor).toBe(saved.id);
    expect(written.outcomes[0]?.status).toBe('written');
    const source = (await repository.findSource(
      userId,
      bankId,
      `legacy:${saved.id}`,
    ))!;

    expect(source.source.legacyMemoryId).toBe(saved.id);
    expect(source.source.kind).toBe('import');
    expect(
      (
        await backfill.batch(userId, {
          dryRun: false,
          afterId: written.nextCursor!,
        })
      ).outcomes[0]?.status,
    ).toBe('suppressed');
    expect(
      (await backfill.batch(userId, { dryRun: false })).outcomes[0]?.status,
    ).toBe('unchanged');
    const token = randomUUID();
    await repository.claimBank(bankId, token, new Date(Date.now() + 60_000));
    const refs = await admit(source, token);
    expect(refs).toBeDefined();
    await memories.update(userId, saved.id, { pinned: false });
    expect(
      await repository.resolveReference(userId, refs.reference.id),
    ).toBeNull();
    expect(
      (await repository.snapshot(userId, source.source.id))!.deliveries[0]!
        .state,
    ).toBe('erase_pending');
    await repository.retireStaleImports(bankId, token);
    expect(
      (await repository.snapshot(userId, source.source.id))!.source.state,
    ).toBe('active');
    expect(
      (await backfill.batch(userId, { dryRun: false })).outcomes[0]?.status,
    ).toBe('written');
    expect(
      (await repository.snapshot(userId, source.source.id))!.source.generation,
    ).toBe(2);
    await memories.delete(userId, saved.id);
    expect(
      (await repository.snapshot(userId, source.source.id))!.source.state,
    ).toBe('deleted');
    expect(
      await repository.enqueue({
        userId,
        bankId,
        sourceKey: 'legacy:deleted-retry',
        kind: 'import',
        content: saved.content,
        checksum: 'retry',
        sourceMessageIds: [],
        conversationId: null,
        eventAt: saved.createdAt,
        legacySnapshot: { id: saved.id, updatedAt: saved.updatedAt },
      }),
    ).toEqual({ status: 'stale' });
  });

  test('ingestion checkpoints advance after verified admission, stay independent from legacy/shadow, and disappear with the account', async () => {
    const { userId, bankId, namespace, input, message } = await fixture();

    for (const content of [
      'I live in Makassar.',
      'I prefer concise replies.',
      'I work in software.',
    ]) {
      await prisma.message.create({
        data: {
          userId,
          conversationId: message.conversationId,
          role: 'user',
          content,
        },
      });
    }

    const boundary = await prisma.message.create({
      data: {
        userId,
        conversationId: message.conversationId,
        role: 'assistant',
        content: 'Unsupported assistant claim about owning a yacht.',
      },
    });

    const segment = (await repository.ingestionSegment(
      userId,
      namespace,
      'policy-v1',
      message.conversationId,
      boundary.id,
    ))!;

    expect(segment.messages).toHaveLength(4);
    expect(segment.messages.some(({ id }) => id === boundary.id)).toBe(false);
    const source = snapshot(
      await repository.enqueue({
        ...input,
        kind: 'automatic',
        sourceKey: `automatic:${message.id}`,
      }),
    );

    expect(await repository.stageCheckpoint(segment, [source.source.id])).toBe(
      true,
    );
    expect(await repository.stageCheckpoint(segment, [source.source.id])).toBe(
      false,
    );
    expect(
      await repository.completeCheckpoint(userId, segment.checkpoint.id),
    ).toBe(false);
    const token = randomUUID();
    await repository.claimBank(bankId, token, new Date(Date.now() + 60_000));
    await admit(source, token);
    expect(
      await repository.completeCheckpoint(userId, segment.checkpoint.id),
    ).toBe(true);
    expect(
      (
        await prisma.conversation.findUniqueOrThrow({
          where: { id: message.conversationId },
        })
      ).memoryDreamThroughMessageId,
    ).toBeNull();
    expect(
      await repository.ingestionSegment(
        userId,
        namespace,
        'policy-v1',
        message.conversationId,
        boundary.id,
      ),
    ).toBeNull();
    const shadow = (await repository.ingestionSegment(
      userId,
      `${namespace}-shadow`,
      'policy-v1',
      message.conversationId,
      boundary.id,
    ))!;

    expect(shadow.messages).toHaveLength(4);
    expect(await repository.stageCheckpoint(shadow, [source.source.id])).toBe(
      false,
    );
    await prisma.conversation.update({
      where: { id: message.conversationId },
      data: { lastMessageAt: new Date(0) },
    });
    expect(
      await repository.recoverableIngestion(
        namespace,
        'policy-v1',
        new Date(),
        [userId],
        20,
      ),
    ).toEqual([]);
    expect(
      await repository.recoverableIngestion(
        `${namespace}-shadow`,
        'policy-v1',
        new Date(),
        [userId],
        20,
      ),
    ).toHaveLength(1);
    await prisma.user.update({
      where: { id: userId },
      data: { automaticMemoryEnabled: false },
    });
    expect(
      await repository.ingestionSegment(
        userId,
        `${namespace}-other`,
        'policy-v1',
        message.conversationId,
        boundary.id,
      ),
    ).toBeNull();
    expect(
      await repository.recoverableIngestion(
        `${namespace}-shadow`,
        'policy-v1',
        new Date(),
        [userId],
        20,
      ),
    ).toEqual([]);
    await new PrismaUserPrivacyRepository(prisma).deleteAccount(userId);
    expect(await prisma.hindsightCheckpoint.count({ where: { userId } })).toBe(
      0,
    );
  });

  test('concurrent replay creates one source, delivery, and persisted operation identity', async () => {
    const { input } = await fixture();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => repository.enqueue(input)),
    );

    expect(results.filter(({ status }) => status === 'written')).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === 'unchanged')).toHaveLength(
      11,
    );
    const sources = results.map(snapshot);
    expect(new Set(sources.map(({ source }) => source.id)).size).toBe(1);
    expect(
      new Set(sources.map(({ deliveries }) => deliveries[0]!.operationId)).size,
    ).toBe(1);
    expect(sources[0]!.deliveries).toHaveLength(1);
  });

  test('corrections compare generations, withdraw old references, and fence late completion', async () => {
    const { input, bankId, userId } = await fixture();
    const initial = snapshot(await repository.enqueue(input));
    const token = randomUUID();
    await repository.claimBank(bankId, token, new Date(Date.now() + 60_000));
    const reference = await admit(initial, token);
    const results = await Promise.all([
      repository.enqueue({
        ...input,
        content: 'English now',
        checksum: 'english',
        expectedGeneration: 1,
      }),
      repository.enqueue({
        ...input,
        content: 'French now',
        checksum: 'french',
        expectedGeneration: 1,
      }),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      'stale',
      'written',
    ]);
    const changed = snapshot(
      results.find(({ status }) => status === 'written')!,
    );

    expect(changed.source.generation).toBe(2);
    expect(changed.deliveries[0]!.state).toBe('erase_pending');
    expect(changed.deliveries[1]!.documentId).not.toBe(
      initial.deliveries[0]!.documentId,
    );
    expect(
      await repository.resolveReference(userId, reference.reference.id),
    ).toBeNull();
    expect(
      await repository.admit(bankId, token, initial.deliveries[0]!.id, [
        'stale-fact',
      ]),
    ).toBe(false);
  });

  test('forgetting immediately hides shared evidence and prevents replay/backfill resurrection', async () => {
    const { input, bankId, userId } = await fixture();
    const first = snapshot(await repository.enqueue(input));
    const second = snapshot(
      await repository.enqueue({ ...input, sourceKey: 'shared-evidence' }),
    );

    const token = randomUUID();
    await repository.claimBank(bankId, token, new Date(Date.now() + 60_000));
    const ref = await admit(first, token);
    await admit(second, token);
    expect(await repository.forget(userId, first.source.id, 1)).toBe('deleted');
    expect(
      await repository.resolveReference(userId, ref.reference.id),
    ).toBeNull();
    expect(
      (await repository.snapshot(userId, second.source.id))?.source.state,
    ).toBe('deleted');
    expect(
      (await repository.snapshot(userId, first.source.id))?.deliveries[0]!
        .content,
    ).toBeNull();
    expect(await repository.enqueue(input)).toEqual({ status: 'suppressed' });
    expect(
      await repository.enqueue({
        ...input,
        sourceKey: 'import:legacy',
        kind: 'import',
      }),
    ).toEqual({ status: 'suppressed' });
    expect(
      await repository.admit(bankId, token, first.deliveries[0]!.id, ['late']),
    ).toBe(false);
  });

  test('legacy deletion markers and user-only evidence govern new automatic sources', async () => {
    const { input, userId, message } = await fixture();
    const automatic = { ...input, kind: 'automatic' as const };
    expect(
      await repository.enqueue({ ...automatic, sourceMessageIds: [] }),
    ).toEqual({ status: 'suppressed' });
    const assistant = await prisma.message.create({
      data: {
        userId,
        conversationId: message.conversationId,
        role: 'assistant',
        content: 'The user is a doctor.',
      },
    });

    expect(
      await repository.enqueue({
        ...automatic,
        sourceMessageIds: [assistant.id],
      }),
    ).toEqual({ status: 'suppressed' });
    await prisma.memoryDeletionMarker.create({
      data: { userId, sourceMessageId: message.id },
    });
    expect(await repository.enqueue(automatic)).toEqual({
      status: 'suppressed',
    });
  });

  test('forgetting erases legacy copies and closes shared evidence across active and shadow banks', async () => {
    const { input, userId, namespace, message } = await fixture();
    const second = await prisma.message.create({
      data: {
        userId,
        conversationId: input.conversationId!,
        role: 'user',
        content: 'I still prefer Indonesian.',
      },
    });

    const legacy = await prisma.memory.create({
      data: {
        userId,
        content: 'Legacy copy of the language preference.',
        sourceMessageId: message.id,
        sourceMessageIds: [message.id, second.id],
      },
    });

    const unrelated = await prisma.memory.create({
      data: {
        userId,
        content: 'Unrelated intact fact.',
        supersedesId: legacy.id,
      },
    });

    const root = snapshot(await repository.enqueue(input));
    const shadowBank = `${input.bankId}-shadow`;
    await repository.ensureBank(userId, `${namespace}-shadow`, shadowBank);
    const linked = snapshot(
      await repository.enqueue({
        ...input,
        bankId: shadowBank,
        sourceKey: 'shared-second',
        sourceMessageIds: [second.id],
      }),
    );

    expect(await repository.forget(userId, root.source.id, 1)).toBe('deleted');
    expect(
      await prisma.memory.findUnique({ where: { id: legacy.id } }),
    ).toBeNull();
    expect(
      await prisma.memory.findUnique({ where: { id: unrelated.id } }),
    ).toMatchObject({
      content: 'Unrelated intact fact.',
      supersedesId: null,
    });
    expect(
      (await repository.snapshot(userId, linked.source.id))?.source.state,
    ).toBe('deleted');
    expect(
      await repository.suppressedMessageIds(userId, [message.id, second.id]),
    ).toHaveLength(2);
    expect(
      await repository.enqueue({
        ...input,
        sourceKey: 're-extract-second',
        sourceMessageIds: [second.id],
      }),
    ).toEqual({ status: 'suppressed' });
    expect(
      (
        await new PrismaUserPrivacyRepository(prisma).exportData(userId)
      )?.user.memories.map(({ id }) => id),
    ).not.toContain(legacy.id);
  });

  test('forgetting a corrected debug-created import erases its original local copy without message evidence', async () => {
    const { input, userId } = await fixture();
    const legacy = await prisma.memory.create({
      data: { userId, content: 'The user prefers Indonesian.' },
    });

    const imported = snapshot(
      await repository.enqueue({
        ...input,
        kind: 'import',
        sourceKey: `legacy:${legacy.id}`,
        sourceMessageIds: [],
        legacySnapshot: { id: legacy.id, updatedAt: legacy.updatedAt },
      }),
    );

    const corrected = snapshot(
      await repository.enqueue({
        ...input,
        kind: 'explicit',
        sourceKey: imported.source.sourceKey,
        expectedGeneration: 1,
        content: 'The user prefers English.',
        checksum: 'new-correction',
        sourceMessageIds: [],
      }),
    );

    expect(corrected.source.legacyMemoryId).toBeNull();
    expect(await repository.forget(userId, corrected.source.id, 2)).toBe(
      'deleted',
    );
    expect(
      await prisma.memory.findUnique({ where: { id: legacy.id } }),
    ).toBeNull();
    expect(await repository.forget(userId, corrected.source.id, 2)).toBe(
      'deleted',
    );
  });

  test('opt-out denies late automatic admission while explicit remembers remain eligible', async () => {
    const { input, bankId, userId } = await fixture();
    const automatic = snapshot(
      await repository.enqueue({ ...input, kind: 'automatic' }),
    );

    const token = randomUUID();
    await repository.claimBank(bankId, token, new Date(Date.now() + 60_000));
    expect(
      await repository.startDispatch(
        bankId,
        token,
        automatic.deliveries[0]!.id,
      ),
    ).toBe(true);
    await prisma.user.update({
      where: { id: userId },
      data: { automaticMemoryEnabled: false },
    });
    expect(
      await repository.transitionDelivery(
        bankId,
        token,
        automatic.deliveries[0]!.id,
        'retained',
      ),
    ).toBe(true);
    expect(
      await repository.admit(bankId, token, automatic.deliveries[0]!.id, [
        'late',
      ]),
    ).toBe(false);
    expect(
      await repository.enqueue({
        ...input,
        kind: 'automatic',
        sourceKey: 'another',
      }),
    ).toEqual({ status: 'unavailable' });
    const explicit = snapshot(
      await repository.enqueue({
        ...input,
        sourceKey: 'explicit-after-opt-out',
      }),
    );

    const ref = await admit(explicit, token);
    expect(
      await repository.resolveReference(userId, ref.reference.id),
    ).not.toBeNull();
  });

  test('references and source operations reject other owners, and expired workers lose their lease', async () => {
    const { input, bankId, userId } = await fixture();
    const other = await fixture();
    const source = snapshot(await repository.enqueue(input));
    const token = randomUUID();
    await repository.claimBank(bankId, token, new Date(Date.now() + 60_000));
    const ref = await admit(source, token);
    expect(
      await repository.resolveReference(other.userId, ref.reference.id),
    ).toBeNull();
    expect(
      await repository.snapshot(other.userId, source.source.id),
    ).toBeNull();
    expect(await repository.forget(other.userId, source.source.id, 1)).toBe(
      'missing',
    );
    expect(
      await repository.enqueue({ ...input, userId: other.userId }),
    ).toEqual({ status: 'unavailable' });
    expect(
      await repository.claimBank(
        bankId,
        'competitor',
        new Date(Date.now() + 60_000),
      ),
    ).toBeNull();
    await prisma.hindsightBank.update({
      where: { id: bankId },
      data: { leaseUntil: new Date(0) },
    });
    expect(
      await repository.claimBank(
        bankId,
        'new-worker',
        new Date(Date.now() + 60_000),
      ),
    ).not.toBeNull();
    expect(
      await repository.renewBank(bankId, token, new Date(Date.now() + 60_000)),
    ).toBe(false);
    expect(
      await repository.transitionDelivery(
        bankId,
        token,
        source.deliveries[0]!.id,
        'erase_pending',
      ),
    ).toBe(false);
    await repository.releaseBank(bankId, token, new Date());
    expect(
      (await repository.findBank(userId, source.bank.namespace))?.leaseToken,
    ).toBe('new-worker');
  });

  test('account deletion commits durable bank erasure and cannot recreate a bank from stale work', async () => {
    const { input, userId, bankId, namespace } = await fixture();
    const source = snapshot(await repository.enqueue(input));
    const token = randomUUID();
    await repository.claimBank(bankId, token, new Date(Date.now() + 60_000));
    const ref = await admit(source, token);
    const privacy = new PrismaUserPrivacyRepository(prisma);
    expect(await privacy.deleteAccount(userId)).toBe(true);
    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    expect((await repository.findBank(userId, namespace))?.state).toBe(
      'erasing',
    );
    expect(
      (await repository.snapshot(userId, source.source.id))?.deliveries[0]!
        .content,
    ).toBeNull();
    expect(
      await repository.resolveReference(userId, ref.reference.id),
    ).toBeNull();
    expect(await repository.enqueue(input)).toEqual({ status: 'unavailable' });
    expect(await repository.ensureBank(userId, namespace, bankId)).toBeNull();
    expect(
      await repository.ensureBank(userId, 'different-namespace', 'other-bank'),
    ).toBeNull();
    expect(await repository.markBankErased(bankId, token)).toBe(false);
    expect(
      await repository.transitionDelivery(
        bankId,
        token,
        source.deliveries[0]!.id,
        'erased',
      ),
    ).toBe(true);
    expect(await repository.markBankErased(bankId, token)).toBe(true);
    await repository.releaseBank(bankId, token, new Date());
    expect(
      (await repository.pendingBanks(namespace, new Date(), 10)).map(
        ({ id }) => id,
      ),
    ).toContain(bankId);
  });

  test('compound correction is atomic and replays the same request across retired references', async () => {
    const { input, userId } = await fixture();
    const first = snapshot(await repository.enqueue(input));
    const secondInput = { ...input, sourceKey: 'second' };
    const second = snapshot(await repository.enqueue(secondInput));
    const batch = [
      {
        ...input,
        expectedGeneration: 1,
        content: 'English now',
        checksum: 'english',
        requestKey: 'correction-request',
        requestFingerprint: 'same-input',
      },
      {
        ...secondInput,
        expectedGeneration: 9,
        content: 'French now',
        checksum: 'french',
        requestKey: 'correction-request',
        requestFingerprint: 'same-input',
      },
    ];

    expect(await repository.replaceSources(batch)).toEqual({ status: 'stale' });
    expect(
      (await repository.snapshot(userId, first.source.id))?.source.generation,
    ).toBe(1);
    batch[1]!.expectedGeneration = 1;
    const changed = await repository.replaceSources(batch);
    expect(changed.status).toBe('written');
    expect(
      (await repository.snapshot(userId, second.source.id))?.source.generation,
    ).toBe(2);
    expect((await repository.replaceSources(batch)).status).toBe('written');
    expect(
      (await repository.snapshot(userId, first.source.id))?.deliveries,
    ).toHaveLength(2);
    expect(
      await repository.replaceSources([
        { ...batch[0]!, content: 'Different input', checksum: 'different' },
      ]),
    ).toEqual({ status: 'stale' });
    expect(
      await repository.forgetSources(userId, [
        { sourceId: first.source.id, generation: 2 },
        { sourceId: second.source.id, generation: 1 },
      ]),
    ).toBe('stale');
    expect(
      (await repository.snapshot(userId, first.source.id))?.source.state,
    ).toBe('active');
    expect(
      await repository.forgetSources(userId, [
        { sourceId: first.source.id, generation: 2 },
        { sourceId: second.source.id, generation: 2 },
      ]),
    ).toBe('deleted');
  });
});
