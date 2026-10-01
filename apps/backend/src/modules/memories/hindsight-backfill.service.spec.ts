import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Memory, MemorySourceSnapshot } from '../../database/entities';
import type {
  IMemoryRepository,
  IHindsightRepository,
  IUserRepository,
  IConversationRepository,
} from '../../database/interfaces';
import { HindsightBackfillService } from './hindsight-backfill.service';
import { MemoryEngineService } from './memory-engine.service';
import type { MemoryPolicyService } from './memory-policy.service';

const now = new Date('2026-09-30T00:00:00Z');
const memory: Memory = {
  id: 'legacy-a',
  content: 'The user prefers Indonesian replies.',
  category: null,
  pinned: false,
  status: 'active',
  sourceMessageIds: [],
  supersedesId: null,
  supersededById: null,
  source: { type: 'dashboard', label: null, messageId: null, documentId: null },
  createdAt: now,
  updatedAt: now,
};

const snapshot: MemorySourceSnapshot = {
  bank: {
    id: 'bank',
    userId: 'owner',
    namespace: 'contract',
    state: 'active',
    leaseToken: null,
    leaseUntil: null,
    nextAttemptAt: now,
    attempts: 0,
    lastErrorCode: null,
    erasedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  source: {
    id: 'source',
    bankId: 'bank',
    sourceKey: 'legacy:legacy-a',
    kind: 'import',
    generation: 1,
    state: 'active',
    checksum: 'checksum',
    sourceMessageIds: [],
    conversationId: null,
    legacyMemoryId: memory.id,
    legacyUpdatedAt: now,
    eventAt: now,
    createdAt: now,
    updatedAt: now,
  },
  deliveries: [],
};

function setup() {
  const memories = {
    backfillPage: jest
      .fn<IMemoryRepository['backfillPage']>()
      .mockResolvedValue([
        memory,
        { ...memory, id: 'legacy-b' },
        { ...memory, id: 'legacy-c' },
      ]),
  };

  const ledger = {
    findBank: jest
      .fn<IHindsightRepository['findBank']>()
      .mockResolvedValue(null),
    ensureBank: jest
      .fn<IHindsightRepository['ensureBank']>()
      .mockResolvedValue(snapshot.bank),
    suppressedMessageIds: jest
      .fn<IHindsightRepository['suppressedMessageIds']>()
      .mockResolvedValue([]),
    findSource: jest
      .fn<IHindsightRepository['findSource']>()
      .mockResolvedValue(null),
    enqueue: jest
      .fn<IHindsightRepository['enqueue']>()
      .mockResolvedValue({ status: 'written', snapshot }),
  };

  const users = {
    findById: jest.fn<IUserRepository['findById']>().mockResolvedValue({
      id: 'owner',
      name: 'Synthetic owner',
      email: 'owner@example.invalid',
      emailVerified: false,
      image: null,
      role: 'user',
      timezone: 'Asia/Makassar',
      locale: 'id',
      onboardingCompleted: true,
      automaticMemoryEnabled: false,
      persona: 'friendly',
      preferredAddress: null,
      createdAt: now,
      updatedAt: now,
    }),
  };

  const conversations = {
    findUserMemoryEvidence: jest
      .fn<IConversationRepository['findUserMemoryEvidence']>()
      .mockResolvedValue(null),
  };

  const policy = {
    approveEvidence: jest
      .fn<MemoryPolicyService['approveEvidence']>()
      .mockResolvedValue({ spans: [] }),
    approveFacts: jest
      .fn<MemoryPolicyService['approveFacts']>()
      .mockResolvedValue(true),
  };

  const service = new HindsightBackfillService(
    memories as unknown as IMemoryRepository,
    ledger as unknown as IHindsightRepository,
    users as unknown as IUserRepository,
    new MemoryEngineService(
      new ConfigService({ BACKEND_HINDSIGHT_NAMESPACE: 'contract' }),
    ),
    conversations as unknown as IConversationRepository,
    policy as unknown as MemoryPolicyService,
  );

  return { service, memories, ledger, policy };
}

describe('HindsightBackfillService', () => {
  test('dry run inspects saved rows without writing or calling the policy model', async () => {
    const { service, ledger, policy } = setup();
    const result = await service.batch('owner');
    expect(result.interrupted).toBe(false);
    expect(result.outcomes.map(({ status }) => status)).toEqual([
      'eligible',
      'eligible',
      'eligible',
    ]);
    expect(ledger.ensureBank).not.toHaveBeenCalled();
    expect(ledger.enqueue).not.toHaveBeenCalled();
    expect(policy.approveFacts).not.toHaveBeenCalled();
  });

  test('returns completed writes and a cursor before a provider failure without skipping later rows', async () => {
    const { service, memories, ledger, policy } = setup();
    policy.approveFacts
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('Provider payload must remain private'));
    const result = await service.batch('owner', { dryRun: false });
    expect(result).toEqual({
      dryRun: false,
      interrupted: true,
      nextCursor: 'legacy-a',
      counts: { written: 1, deferred: 1 },
      outcomes: [
        {
          legacyId: 'legacy-a',
          status: 'written',
          sourceId: 'source',
          generation: 1,
        },
        { legacyId: 'legacy-b', status: 'deferred' },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('Provider payload');
    expect(ledger.enqueue).toHaveBeenCalledTimes(1);
    memories.backfillPage.mockResolvedValue([
      { ...memory, id: 'legacy-b' },
      { ...memory, id: 'legacy-c' },
    ]);
    const resumed = await service.batch('owner', {
      dryRun: false,
      afterId: result.nextCursor!,
    });

    expect(resumed.interrupted).toBe(false);
    expect(resumed.outcomes.map(({ legacyId }) => legacyId)).toEqual([
      'legacy-b',
      'legacy-c',
    ]);
    expect(memories.backfillPage).toHaveBeenLastCalledWith(
      'owner',
      'legacy-a',
      50,
    );
  });

  test.each(['stale', 'unavailable'] as const)(
    'does not advance past a %s enqueue',
    async (status) => {
      const { service, ledger } = setup();
      ledger.enqueue.mockResolvedValueOnce({ status });
      const result = await service.batch('owner', {
        dryRun: false,
        afterId: 'previous-page',
      });

      expect(result.interrupted).toBe(true);
      expect(result.nextCursor).toBe('previous-page');
      expect(result.outcomes).toEqual([{ legacyId: 'legacy-a', status }]);
      expect(ledger.enqueue).toHaveBeenCalledTimes(1);
    },
  );

  test('lost enqueue acknowledgement reports a retry from the beginning and rerun skips the committed revision', async () => {
    const { service, ledger, policy } = setup();
    ledger.enqueue.mockRejectedValueOnce(
      new Error('Lost database acknowledgement'),
    );
    const result = await service.batch('owner', { dryRun: false });
    expect(result.interrupted).toBe(true);
    expect(result.nextCursor).toBeNull();
    expect(result.outcomes).toEqual([
      { legacyId: 'legacy-a', status: 'deferred' },
    ]);
    ledger.findSource.mockResolvedValueOnce(snapshot);
    const rerun = await service.batch('owner', { dryRun: false });
    expect(rerun.interrupted).toBe(false);
    expect(rerun.outcomes[0]?.status).toBe('unchanged');
    expect(policy.approveFacts).toHaveBeenCalledTimes(3);
    expect(ledger.enqueue).toHaveBeenCalledTimes(3);
  });
});
