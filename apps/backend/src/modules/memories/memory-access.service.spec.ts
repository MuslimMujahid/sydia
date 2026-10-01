import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type {
  MemorySourceSnapshot,
  ResolvedMemoryReference,
  User,
} from '../../database/entities';
import type {
  IHindsightRepository,
  IMemoryRepository,
  IConversationRepository,
  IUserRepository,
} from '../../database/interfaces';
import type { HindsightGateway, HindsightFact } from '../../infra/hindsight';
import { MemoryPolicyService } from './memory-policy.service';
import type { LanguageModelGateway } from '../../infra/model-gateway';
import type { QueueService } from '../../infra/queue';
import { MemoryAccessService } from './memory-access.service';
import { MemoryEngineService } from './memory-engine.service';
import type { MemoryService } from './memory.service';

const sourceId = '11111111-1111-4111-a111-111111111111';
const referenceId = '22222222-2222-4222-a222-222222222222';
const otherReferenceId = '33333333-3333-4333-a333-333333333333';
const snapshot: MemorySourceSnapshot = {
  bank: {
    id: 'bank',
    userId: 'user',
    namespace: 'test',
    state: 'active',
    leaseToken: null,
    leaseUntil: null,
    nextAttemptAt: new Date(),
    attempts: 0,
    lastErrorCode: null,
    erasedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  source: {
    id: sourceId,
    bankId: 'bank',
    sourceKey: 'explicit:one',
    kind: 'explicit',
    generation: 1,
    state: 'active',
    checksum: 'source-checksum',
    sourceMessageIds: ['old-message'],
    conversationId: 'conversation',
    legacyMemoryId: null,
    legacyUpdatedAt: null,
    eventAt: new Date('2026-09-30T00:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  deliveries: [
    {
      id: 'delivery',
      sourceId,
      generation: 1,
      documentId: `${sourceId}:g1`,
      operationId: '44444444-4444-4444-a444-444444444444',
      requestKey: null,
      requestFingerprint: null,
      checksum: 'source-checksum',
      content: 'Original user source',
      state: 'admitted',
      dispatchStartedAt: new Date(),
      retainedAt: new Date(),
      admittedAt: new Date(),
      erasedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

function fact(id: string, text: string): HindsightFact {
  return {
    id,
    text,
    type: 'world',
    documentId: snapshot.deliveries[0]!.documentId,
    sourceFactIds: [],
    metadata: { sourceId, generation: '1', checksum: 'source-checksum' },
    occurredStart: null,
    mentionedAt: null,
  };
}

function reference(
  id = referenceId,
  remoteFactId = 'language',
): ResolvedMemoryReference {
  return {
    ...snapshot,
    delivery: snapshot.deliveries[0]!,
    reference: {
      id,
      remoteFactId,
      deliveryId: 'delivery',
      createdAt: new Date(),
    },
  };
}

const context = {
  idempotencyKey: 'request',
  sourceMessageId: 'current-message',
};

function setup(
  settings: Record<string, unknown> = {},
  policy?: MemoryPolicyService,
) {
  const engine = new MemoryEngineService(
    new ConfigService({
      BACKEND_MEMORY_ENGINE: 'hindsight',
      BACKEND_HINDSIGHT_NAMESPACE: 'test',
      ...settings,
    }),
  );

  const ledger = {
    ensureBank: jest
      .fn<IHindsightRepository['ensureBank']>()
      .mockResolvedValue(snapshot.bank),
    findBank: jest
      .fn<IHindsightRepository['findBank']>()
      .mockResolvedValue(snapshot.bank),
    findMutation: jest
      .fn<IHindsightRepository['findMutation']>()
      .mockResolvedValue([]),
    enqueue: jest
      .fn<IHindsightRepository['enqueue']>()
      .mockImplementation((input) =>
        Promise.resolve({
          status: 'written',
          snapshot: {
            ...snapshot,
            deliveries: [
              {
                ...snapshot.deliveries[0]!,
                state: 'pending',
                requestKey: input.requestKey ?? null,
                requestFingerprint: input.requestFingerprint ?? null,
                checksum: input.checksum,
                content: input.content,
              },
            ],
          },
        }),
      ),
    replaceSources: jest
      .fn<IHindsightRepository['replaceSources']>()
      .mockImplementation((inputs) =>
        Promise.resolve({
          status: 'written',
          snapshots: inputs.map((input) => ({
            ...snapshot,
            source: { ...snapshot.source, generation: 2 },
            deliveries: [
              {
                ...snapshot.deliveries[0]!,
                generation: 2,
                requestKey: input.requestKey ?? null,
                requestFingerprint: input.requestFingerprint ?? null,
                checksum: input.checksum,
                state: 'pending',
              },
            ],
          })),
        }),
      ),
    resolveReference: jest
      .fn<IHindsightRepository['resolveReference']>()
      .mockImplementation((_owner, id) =>
        Promise.resolve(
          id === referenceId
            ? reference()
            : id === otherReferenceId
              ? reference(otherReferenceId, 'city')
              : null,
        ),
      ),
    referencesForDocuments: jest
      .fn<IHindsightRepository['referencesForDocuments']>()
      .mockResolvedValue([reference(), reference(otherReferenceId, 'city')]),
    snapshot: jest
      .fn<IHindsightRepository['snapshot']>()
      .mockResolvedValue(snapshot),
    forgetSources: jest
      .fn<IHindsightRepository['forgetSources']>()
      .mockResolvedValue('deleted'),
    suppressedMessageIds: jest
      .fn<IHindsightRepository['suppressedMessageIds']>()
      .mockResolvedValue([]),
    pendingErasureCount: jest
      .fn<IHindsightRepository['pendingErasureCount']>()
      .mockResolvedValue(1),
  };

  const legacy = {
    search: jest.fn<MemoryService['search']>().mockResolvedValue([]),
    create: jest.fn<MemoryService['create']>(),
    update: jest.fn<MemoryService['update']>(),
  };

  const memories = {
    delete: jest.fn<IMemoryRepository['delete']>().mockResolvedValue(true),
  };

  const gateway = {
    recall: jest.fn<HindsightGateway['recall']>().mockResolvedValue({
      results: [fact('language', 'The user prefers Indonesian.')],
      sourceFacts: {},
      sourceFactsTruncated: false,
    }),
    listFacts: jest.fn<HindsightGateway['listFacts']>().mockResolvedValue({
      total: 2,
      items: [
        fact('language', 'The user prefers Indonesian.'),
        fact('city', 'The user lives in Makassar.'),
      ],
    }),
  };

  const conversations = {
    findUserMemoryEvidence: jest
      .fn<IConversationRepository['findUserMemoryEvidence']>()
      .mockResolvedValue({
        id: 'current-message',
        conversationId: 'conversation',
        content: 'Remember that I now prefer English.',
        createdAt: new Date('2026-10-01T00:00:00Z'),
      }),
  };

  const evidenceContext = jest
    .fn<IConversationRepository['findUserMemoryEvidenceContext']>()
    .mockImplementation(async () => {
      const current = await conversations.findUserMemoryEvidence(
        'user',
        'current-message',
      );

      return current ? [current] : [];
    });

  const conversationEvidence = {
    ...conversations,
    findUserMemoryEvidenceContext: evidenceContext,
  };

  const add = jest
    .fn<QueueService['memoryDeliveries']['add']>()
    .mockResolvedValue({} as never);

  const users = {
    findById: jest
      .fn<IUserRepository['findById']>()
      .mockResolvedValue({ id: 'user', timezone: 'Asia/Makassar' } as User),
  };

  const service = new MemoryAccessService(
    engine,
    legacy as unknown as MemoryService,
    memories as unknown as IMemoryRepository,
    ledger as unknown as IHindsightRepository,
    gateway as unknown as HindsightGateway,
    conversationEvidence as unknown as IConversationRepository,
    { memoryDeliveries: { add } } as unknown as QueueService,
    users as unknown as IUserRepository,
    policy,
  );

  return {
    service,
    engine,
    ledger,
    legacy,
    memories,
    gateway,
    conversations: conversationEvidence,
    add,
  };
}

describe('MemoryAccessService', () => {
  test('legacy and excluded cohorts use existing retrieval and writes', async () => {
    const { service, gateway, legacy } = setup({
      BACKEND_HINDSIGHT_COHORT: 'other-user',
    });

    await service.search('user', 'language');
    await service.create('user', { content: 'Prefers Indonesian.' }, context);
    expect(legacy.search).toHaveBeenCalledWith('user', 'language', 5);
    expect(legacy.create).toHaveBeenCalled();
    expect(gateway.recall).not.toHaveBeenCalled();
  });

  test('new saves return queued receipts and preserve evidence/event time/timezone', async () => {
    const { service, ledger } = setup();
    const result = await service.create(
      'user',
      { content: 'Prefers English.' },
      context,
    );

    expect(result).toMatchObject({ engine: 'hindsight', status: 'queued' });
    const write = ledger.enqueue.mock.calls[0]![0];
    expect(write.eventAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(write.sourceMessageIds).toEqual(['current-message']);
    expect(JSON.parse(write.content)).toMatchObject({
      userEvidence: 'Remember that I now prefer English.',
      userTimezone: 'Asia/Makassar',
      requestedFact: 'Prefers English.',
    });
  });

  test('queue publication failure leaves durable accepted work queued', async () => {
    const { service, ledger, add } = setup();
    add.mockRejectedValue(new Error('Redis unavailable'));
    expect(
      await service.create('user', { content: 'Prefers English.' }, context),
    ).toMatchObject({ status: 'queued' });
    expect(ledger.enqueue).toHaveBeenCalledTimes(1);
  });

  test('a saved request replay after switching to legacy cannot recreate reconciled or forgotten facts', async () => {
    const original = setup();
    const input = { content: 'Prefers English.' };
    await original.service.create('user', input, context);
    const write = original.ledger.enqueue.mock.calls[0]![0];
    const { service, ledger, legacy } = setup({
      BACKEND_MEMORY_ENGINE: 'legacy',
    });

    ledger.findBank.mockResolvedValue({ ...snapshot.bank, state: 'erased' });
    ledger.findMutation.mockResolvedValue([
      {
        ...snapshot,
        bank: { ...snapshot.bank, state: 'erased' },
        source: { ...snapshot.source, state: 'deleted' },
        deliveries: [
          {
            ...snapshot.deliveries[0]!,
            requestKey: write.requestKey!,
            requestFingerprint: write.requestFingerprint!,
            state: 'erased',
          },
        ],
      },
    ]);
    expect(await service.create('user', input, context)).toMatchObject({
      status: 'withdrawn',
    });
    expect(legacy.create).not.toHaveBeenCalled();
    await expect(
      service.create('user', { content: 'Prefers French.' }, context),
    ).rejects.toThrow(/different input/);
    expect(legacy.create).not.toHaveBeenCalled();
  });

  test('credential material and missing/foreign user evidence are rejected before dispatch', async () => {
    const { service, ledger, conversations } = setup();
    await expect(
      service.create('user', { content: 'My password is secret123.' }, context),
    ).rejects.toThrow(/Credential/);
    conversations.findUserMemoryEvidence.mockResolvedValue(null);
    await expect(
      service.create('user', { content: 'I am a doctor.' }, context),
    ).rejects.toThrow(/user message/);
    expect(ledger.enqueue).not.toHaveBeenCalled();
  });

  test('a follow-up remember request uses the preceding user fact and attributes both messages', async () => {
    const quote = 'Kalo pagi saya suka minum kopi + sereal';
    const generate = jest
      .fn<LanguageModelGateway['generate']>()
      .mockResolvedValueOnce({
        text: JSON.stringify({
          spans: [{ quote, sensitive: false, permissionQuote: null }],
        }),
        usage: {},
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          facts: [
            {
              id: 'requested',
              grounded: true,
              durable: true,
              sensitive: false,
              permissionQuote: null,
              evidenceQuotes: [quote],
            },
          ],
        }),
        usage: {},
      });

    const { service, conversations, ledger } = setup(
      {},
      new MemoryPolicyService({ generate } as unknown as LanguageModelGateway),
    );

    const previous = {
      id: 'previous-message',
      conversationId: 'conversation',
      content: quote,
      createdAt: new Date('2026-09-30T23:59:00Z'),
    };

    const current = {
      ...previous,
      id: 'current-message',
      content: 'Ingat ya sebagai kebiasaan',
      createdAt: new Date('2026-10-01T00:00:00Z'),
    };

    conversations.findUserMemoryEvidence.mockResolvedValue(current);
    conversations.findUserMemoryEvidenceContext.mockResolvedValue([
      {
        ...previous,
        id: 'unrelated-message',
        content: 'Saya suka bermain tenis',
      },
      previous,
      current,
    ]);

    await expect(
      service.create(
        'user',
        { content: 'The user likes coffee and cereal in the morning.' },
        context,
      ),
    ).resolves.toMatchObject({ status: 'queued' });
    expect(ledger.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMessageIds: ['previous-message', 'current-message'],
      }),
    );
    const payload = JSON.parse(ledger.enqueue.mock.calls[0]![0].content) as {
      approvedEvidence: string[];
    };

    expect(payload.approvedEvidence).toEqual([quote]);
  });

  test('a follow-up cannot reuse forgotten evidence or credential-bearing messages', async () => {
    const quote = 'I like coffee and cereal in the morning.';

    for (const blocked of ['forgotten', 'credential']) {
      const generate = jest
        .fn<LanguageModelGateway['generate']>()
        .mockResolvedValue({
          text: JSON.stringify({
            spans: [{ quote, sensitive: false, permissionQuote: null }],
          }),
          usage: {},
        });

      const { service, conversations, ledger } = setup(
        {},
        new MemoryPolicyService({
          generate,
        } as unknown as LanguageModelGateway),
      );

      const current = {
        id: 'current-message',
        conversationId: 'conversation',
        content: 'Remember that habit.',
        createdAt: new Date(),
      };

      conversations.findUserMemoryEvidence.mockResolvedValue(current);
      conversations.findUserMemoryEvidenceContext.mockResolvedValue([
        {
          ...current,
          id: 'previous-message',
          content:
            blocked === 'credential'
              ? quote + ' My password is abcdef123!'
              : quote,
        },
        current,
      ]);
      if (blocked === 'forgotten')
        ledger.suppressedMessageIds.mockResolvedValue(['previous-message']);
      await expect(
        service.create('user', { content: quote }, context),
      ).rejects.toThrow(/eligible user evidence/);
      expect(ledger.enqueue).not.toHaveBeenCalled();
      const prompt = generate.mock.calls[0]![0].messages[1]!.content;
      const reviewInput = JSON.parse(prompt as string) as {
        userEvidence: string;
      };

      expect(reviewInput.userEvidence).not.toContain(quote);
      expect(reviewInput.userEvidence).not.toContain('password');
    }
  });

  test('raw recall is restricted to admitted current references with exact metadata', async () => {
    const { service, gateway } = setup();
    gateway.recall.mockResolvedValue({
      results: [
        fact('language', 'Prefers Indonesian.'),
        {
          ...fact('city', 'Foreign claim.'),
          metadata: { sourceId: 'foreign' },
        },
      ],
      sourceFacts: {},
      sourceFactsTruncated: false,
    });
    const hits = await service.search('user', 'preferences');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe(`hm:${referenceId}`);
    expect(hits[0]?.evidence?.[0]?.sourceId).toBe(sourceId);
  });

  test('observations require every supporting fact; truncation cannot hide missing evidence', async () => {
    const { service, gateway } = setup();
    const observation: HindsightFact = {
      ...fact('observation', 'The user has language and location preferences.'),
      type: 'observation',
      documentId: null,
      metadata: {},
      sourceFactIds: ['language', 'missing'],
    };

    gateway.recall.mockResolvedValue({
      results: [observation],
      sourceFacts: { language: fact('language', 'Prefers Indonesian.') },
      sourceFactsTruncated: true,
    });
    expect(await service.search('user', 'preferences')).toEqual([]);
    gateway.recall.mockResolvedValue({
      results: [{ ...observation, sourceFactIds: ['language', 'city'] }],
      sourceFacts: {
        language: fact('language', 'Prefers Indonesian.'),
        city: fact('city', 'Lives in Makassar.'),
      },
      sourceFactsTruncated: false,
    });
    expect((await service.search('user', 'preferences'))[0]?.id).toBe(
      `hm:${referenceId}.${otherReferenceId}`,
    );
  });

  test('fact correction preserves unrelated verified facts and is generation checked', async () => {
    const { service, ledger } = setup();
    expect(
      await service.update(
        'user',
        `hm:${referenceId}`,
        { content: 'The user prefers English.' },
        context,
      ),
    ).toMatchObject({ status: 'queued', generation: 2 });
    const input = ledger.replaceSources.mock.calls[0]![0][0]!;
    expect(input.expectedGeneration).toBe(1);
    expect(JSON.parse(input.content)).toMatchObject({
      requestedFact: 'The user prefers English.',
      preservedFacts: [{ text: 'The user lives in Makassar.' }],
    });
    expect(input.sourceMessageIds).toEqual(['old-message', 'current-message']);
  });

  test('replayed corrections return their original intent without remote re-read or another write', async () => {
    const { service, ledger, gateway } = setup();
    await service.update(
      'user',
      `hm:${referenceId}`,
      { content: 'English.' },
      context,
    );
    const input = ledger.replaceSources.mock.calls[0]![0][0]!;
    ledger.findMutation.mockResolvedValue([
      {
        ...snapshot,
        source: { ...snapshot.source, generation: 2 },
        deliveries: [
          {
            ...snapshot.deliveries[0]!,
            generation: 2,
            requestKey: input.requestKey!,
            requestFingerprint: input.requestFingerprint!,
            state: 'admitted',
          },
        ],
      },
    ]);
    expect(
      await service.update(
        'user',
        `hm:${referenceId}`,
        { content: 'English.' },
        context,
      ),
    ).toMatchObject({ status: 'completed' });
    expect(gateway.listFacts).toHaveBeenCalledTimes(1);
    expect(ledger.replaceSources).toHaveBeenCalledTimes(1);
    ledger.findBank.mockResolvedValue({ ...snapshot.bank, state: 'erased' });
    expect(
      await service.update(
        'user',
        `hm:${referenceId}`,
        { content: 'English.' },
        context,
      ),
    ).toMatchObject({ status: 'completed' });
    expect(ledger.replaceSources).toHaveBeenCalledTimes(1);
    await expect(
      service.update(
        'user',
        `hm:${referenceId}`,
        { content: 'French.' },
        context,
      ),
    ).rejects.toThrow(/different input/);
  });

  test('correction carries prior permission only while preserving previously admitted facts', async () => {
    const { service, ledger } = setup();
    const permission = 'Remember that I have asthma.';
    const prior = {
      ...snapshot,
      deliveries: [
        {
          ...snapshot.deliveries[0]!,
          content: JSON.stringify({
            sydiaSource: 1,
            userEvidence: permission,
            permissionQuotes: [permission],
          }),
        },
      ],
    };

    ledger.resolveReference.mockResolvedValue({
      ...reference(),
      ...prior,
      delivery: prior.deliveries[0]!,
    });
    await service.update(
      'user',
      `hm:${referenceId}`,
      { content: 'Prefers English.' },
      context,
    );
    expect(
      JSON.parse(ledger.replaceSources.mock.calls[0]![0][0]!.content),
    ).toMatchObject({
      permissionQuotes: [permission],
    });
    ledger.snapshot.mockResolvedValue(prior);
    await service.update(
      'user',
      `hs:${sourceId}:1`,
      { content: 'Prefers English.' },
      context,
    );
    expect(
      JSON.parse(ledger.replaceSources.mock.calls[1]![0][0]!.content),
    ).toMatchObject({
      permissionQuotes: [],
      preservedFacts: [],
    });
  });

  test('stale generations and cross-user references cannot mutate a source', async () => {
    const { service, ledger } = setup();
    ledger.resolveReference.mockResolvedValue({
      ...reference(),
      source: { ...snapshot.source, generation: 2 },
    });
    await expect(
      service.update(
        'user',
        `hm:${referenceId}`,
        { content: 'English.' },
        context,
      ),
    ).rejects.toThrow(/stale/);
    ledger.resolveReference.mockResolvedValue(null);
    await expect(service.delete('user', `hm:${referenceId}`)).rejects.toThrow(
      /stale/,
    );
    expect(ledger.replaceSources).not.toHaveBeenCalled();
    expect(ledger.forgetSources).not.toHaveBeenCalled();
  });

  test('forgetting reports local suppression separately from completed remote erasure', async () => {
    const { service, ledger } = setup();
    expect(
      await service.delete('user', `hm:${referenceId}.${otherReferenceId}`),
    ).toMatchObject({ status: 'queued', sourceIds: [sourceId] });
    expect(ledger.forgetSources).toHaveBeenCalledWith(
      'user',
      [{ sourceId, generation: 1 }],
      [],
    );
    ledger.pendingErasureCount.mockResolvedValue(0);
    expect(await service.delete('user', `hm:${referenceId}`)).toMatchObject({
      status: 'completed',
    });
  });

  test('retrieval outages are honest and never fall back to unsynchronized legacy facts', async () => {
    const { service, gateway, legacy } = setup();
    gateway.recall.mockRejectedValue(new Error('Provider unavailable'));
    await expect(service.search('user', 'language')).rejects.toThrow(
      /temporarily unavailable/,
    );
    expect(legacy.search).not.toHaveBeenCalled();
  });

  test('old references can forget only owned retired banks in configured retired namespaces', async () => {
    const { service, ledger } = setup({
      BACKEND_HINDSIGHT_RETIRED_NAMESPACES: 'previous',
    });

    const retired = {
      ...snapshot,
      bank: {
        ...snapshot.bank,
        namespace: 'previous',
        state: 'erased' as const,
      },
    };

    ledger.snapshot.mockResolvedValue(retired);
    ledger.pendingErasureCount.mockResolvedValue(0);
    expect(await service.delete('user', `hs:${sourceId}:1`)).toMatchObject({
      status: 'completed',
    });
    expect(ledger.forgetSources).toHaveBeenCalledTimes(1);
    ledger.snapshot.mockResolvedValue({
      ...retired,
      bank: { ...retired.bank, state: 'active' },
    });
    await expect(service.delete('user', `hs:${sourceId}:1`)).rejects.toThrow(
      /stale/,
    );
    ledger.snapshot.mockResolvedValue({
      ...retired,
      bank: { ...retired.bank, namespace: 'foreign' },
    });
    await expect(service.delete('user', `hs:${sourceId}:1`)).rejects.toThrow(
      /stale/,
    );
    expect(ledger.forgetSources).toHaveBeenCalledTimes(1);
  });
});
