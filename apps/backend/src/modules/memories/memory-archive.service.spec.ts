import { describe, expect, jest, test } from '@jest/globals';
import type {
  MemorySourceSnapshot,
  ResolvedMemoryReference,
} from '../../database/entities';
import type { IHindsightRepository } from '../../database/interfaces';
import type { HindsightGateway, HindsightFact } from '../../infra/hindsight';
import { MemoryArchiveService } from './memory-archive.service';

function setup() {
  const at = new Date('2026-10-01T00:00:00Z');
  const snapshot: MemorySourceSnapshot = {
    bank: {
      id: 'bank',
      userId: 'owner',
      namespace: 'contract',
      state: 'active',
      leaseToken: null,
      leaseUntil: null,
      nextAttemptAt: at,
      attempts: 0,
      lastErrorCode: null,
      erasedAt: null,
      createdAt: at,
      updatedAt: at,
    },
    source: {
      id: 'source',
      bankId: 'bank',
      sourceKey: 'explicit:one',
      kind: 'explicit',
      generation: 2,
      state: 'active',
      checksum: 'new-hash',
      sourceMessageIds: ['user-message'],
      conversationId: null,
      legacyMemoryId: null,
      legacyUpdatedAt: null,
      eventAt: at,
      createdAt: at,
      updatedAt: at,
    },
    deliveries: [
      {
        id: 'current',
        sourceId: 'source',
        generation: 2,
        checksum: 'new-hash',
        documentId: 'source:g2',
        operationId: 'operation',
        requestKey: null,
        requestFingerprint: null,
        content: '{"sydiaSource":1,"userEvidence":"I now prefer English."}',
        state: 'admitted',
        dispatchStartedAt: at,
        retainedAt: at,
        admittedAt: at,
        erasedAt: null,
        createdAt: at,
        updatedAt: at,
      },
    ],
  };

  const reference: ResolvedMemoryReference = {
    ...snapshot,
    delivery: snapshot.deliveries[0]!,
    reference: {
      id: 'ref',
      remoteFactId: 'fact',
      deliveryId: 'current',
      createdAt: at,
    },
  };

  const fact: HindsightFact = {
    id: 'fact',
    text: 'The user now prefers English.',
    type: 'world',
    documentId: 'source:g2',
    sourceFactIds: [],
    metadata: { sourceId: 'source', generation: '2', checksum: 'new-hash' },
    occurredStart: at.toISOString(),
    mentionedAt: at.toISOString(),
  };

  const ledger = {
    ownerSourcePage: jest
      .fn<IHindsightRepository['ownerSourcePage']>()
      .mockResolvedValue([snapshot]),
    suppressedMessageIds: jest
      .fn<IHindsightRepository['suppressedMessageIds']>()
      .mockResolvedValue([]),
    referencesForDocuments: jest
      .fn<IHindsightRepository['referencesForDocuments']>()
      .mockResolvedValue([reference]),
    snapshot: jest
      .fn<IHindsightRepository['snapshot']>()
      .mockResolvedValue(snapshot),
  };

  const gateway = {
    listFacts: jest
      .fn<HindsightGateway['listFacts']>()
      .mockResolvedValue({ total: 1, items: [fact] }),
  };

  return {
    ledger,
    gateway,
    snapshot,
    fact,
    service: new MemoryArchiveService(
      ledger as unknown as IHindsightRepository,
      gateway as unknown as HindsightGateway,
    ),
  };
}

describe('MemoryArchiveService', () => {
  test('exports current admitted facts with their source evidence and event time', async () => {
    const { service, ledger } = setup();
    const archive = await service.export('owner');
    expect(ledger.ownerSourcePage).toHaveBeenCalledWith(
      'owner',
      undefined,
      100,
    );
    expect(archive.sources[0]).toMatchObject({
      sourceId: 'source',
      generation: 2,
      sourceMessageIds: ['user-message'],
      facts: [
        {
          text: 'The user now prefers English.',
          occurredAt: '2026-10-01T00:00:00.000Z',
        },
      ],
    });
  });

  test('suppressed or withdrawn sources export no source text and make no remote read', async () => {
    const { service, ledger, gateway } = setup();
    ledger.suppressedMessageIds.mockResolvedValue(['user-message']);
    expect((await service.export('owner')).sources[0]).toMatchObject({
      state: 'withdrawn',
      input: null,
      facts: [],
    });
    expect(gateway.listFacts).not.toHaveBeenCalled();
  });

  test('provider failure or foreign metadata cannot produce a partial successful export', async () => {
    const { service, gateway, fact } = setup();
    gateway.listFacts.mockRejectedValueOnce(
      new Error('Private provider error'),
    );
    await expect(service.export('owner')).rejects.toMatchObject({
      status: 503,
    });
    gateway.listFacts.mockResolvedValue({
      total: 1,
      items: [{ ...fact, metadata: { ...fact.metadata, sourceId: 'foreign' } }],
    });
    await expect(service.export('owner')).rejects.toMatchObject({
      status: 503,
    });
  });

  test('a racing correction or deletion invalidates the export after remote retrieval', async () => {
    const { service, ledger, snapshot } = setup();
    ledger.snapshot.mockResolvedValue({
      ...snapshot,
      source: { ...snapshot.source, generation: 3 },
    });
    await expect(service.export('owner')).rejects.toMatchObject({
      status: 503,
    });
    ledger.snapshot.mockResolvedValue(null);
    await expect(service.export('owner')).rejects.toMatchObject({
      status: 503,
    });
  });

  test('pending intents remain distinct from facts and are revalidated before exposing input', async () => {
    const { service, ledger, gateway, snapshot } = setup();
    const pending = {
      ...snapshot,
      deliveries: [{ ...snapshot.deliveries[0]!, state: 'pending' as const }],
    };

    ledger.ownerSourcePage.mockResolvedValue([pending]);
    ledger.snapshot.mockResolvedValue(pending);
    expect((await service.export('owner')).sources[0]).toMatchObject({
      deliveryState: 'pending',
      input: pending.deliveries[0]!.content,
      facts: [],
    });
    expect(gateway.listFacts).not.toHaveBeenCalled();
    ledger.snapshot.mockResolvedValue({
      ...pending,
      source: { ...pending.source, state: 'deleted' },
    });
    await expect(service.export('owner')).rejects.toMatchObject({
      status: 503,
    });
  });
});
