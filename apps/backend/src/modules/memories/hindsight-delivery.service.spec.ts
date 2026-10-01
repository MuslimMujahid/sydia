import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { MemorySourceSnapshot } from '../../database/entities';
import type { IHindsightRepository } from '../../database/interfaces';
import { HindsightError, type HindsightGateway } from '../../infra/hindsight';
import { HindsightDeliveryService } from './hindsight-delivery.service';
import type { MemoryPolicyService } from './memory-policy.service';

const source: MemorySourceSnapshot = {
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
    id: 'source',
    bankId: 'bank',
    sourceKey: 'save:one',
    kind: 'explicit',
    generation: 1,
    state: 'active',
    checksum: 'hash',
    sourceMessageIds: [],
    conversationId: null,
    legacyMemoryId: null,
    legacyUpdatedAt: null,
    eventAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  deliveries: [
    {
      id: 'delivery',
      sourceId: 'source',
      generation: 1,
      documentId: 'source:g1',
      operationId: '550e8400-e29b-41d4-a716-446655440000',
      requestKey: null,
      requestFingerprint: null,
      checksum: 'hash',
      content: 'The user prefers Indonesian.',
      state: 'pending',
      dispatchStartedAt: null,
      retainedAt: null,
      admittedAt: null,
      erasedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

function setup(
  snapshot = source,
  policy?: MemoryPolicyService,
  settings: Record<string, unknown> = {},
) {
  const ledger = {
    retireStaleImports: jest
      .fn<IHindsightRepository['retireStaleImports']>()
      .mockResolvedValue(0),
    claimBank: jest
      .fn<IHindsightRepository['claimBank']>()
      .mockResolvedValue(snapshot.bank),
    renewBank: jest
      .fn<IHindsightRepository['renewBank']>()
      .mockResolvedValue(true),
    releaseBank: jest
      .fn<IHindsightRepository['releaseBank']>()
      .mockResolvedValue(),
    bankSources: jest
      .fn<IHindsightRepository['bankSources']>()
      .mockResolvedValue([snapshot]),
    startDispatch: jest
      .fn<IHindsightRepository['startDispatch']>()
      .mockResolvedValue(true),
    transitionDelivery: jest
      .fn<IHindsightRepository['transitionDelivery']>()
      .mockResolvedValue(true),
    admit: jest.fn<IHindsightRepository['admit']>().mockResolvedValue(true),
    rejectDelivery: jest
      .fn<IHindsightRepository['rejectDelivery']>()
      .mockResolvedValue(true),
    markBankErased: jest
      .fn<IHindsightRepository['markBankErased']>()
      .mockResolvedValue(true),
    pendingBanks: jest
      .fn<IHindsightRepository['pendingBanks']>()
      .mockResolvedValue([snapshot.bank]),
  };

  const gateway = {
    version: jest.fn<HindsightGateway['version']>().mockResolvedValue('0.10.2'),
    configureBank: jest
      .fn<HindsightGateway['configureBank']>()
      .mockResolvedValue(),
    operation: jest.fn<HindsightGateway['operation']>().mockResolvedValue({
      id: source.deliveries[0]!.operationId,
      status: 'not_found',
    }),
    retain: jest.fn<HindsightGateway['retain']>().mockResolvedValue({
      id: source.deliveries[0]!.operationId,
      status: 'pending',
    }),
    listFacts: jest.fn<HindsightGateway['listFacts']>().mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'fact',
          text: 'User prefers Indonesian.',
          type: 'world',
          documentId: 'source:g1',
          sourceFactIds: [],
          metadata: { sourceId: 'source', generation: '1', checksum: 'hash' },
          occurredStart: null,
          mentionedAt: null,
        },
      ],
    }),
    deleteDocument: jest
      .fn<HindsightGateway['deleteDocument']>()
      .mockResolvedValue(),
    deleteBank: jest.fn<HindsightGateway['deleteBank']>().mockResolvedValue(),
  };

  const service = new HindsightDeliveryService(
    ledger as unknown as IHindsightRepository,
    gateway as unknown as HindsightGateway,
    new ConfigService({
      BACKEND_HINDSIGHT_NAMESPACE: 'test',
      BACKEND_HINDSIGHT_URL: 'http://private-service',
      BACKEND_HINDSIGHT_API_KEY: 'test-key',
      ...settings,
    }),
    policy,
  );

  return { service, ledger, gateway };
}

describe('HindsightDeliveryService', () => {
  test('recovery selects configured retired namespaces for erasure only', async () => {
    const { service, ledger, gateway } = setup(source, undefined, {
      BACKEND_HINDSIGHT_RETIRED_NAMESPACES: 'previous, previous, test',
    });

    ledger.pendingBanks.mockResolvedValue([]);
    expect(await service.recover()).toBe(0);
    expect(ledger.pendingBanks.mock.calls).toEqual([
      ['test', expect.any(Date), 20],
      ['test-shadow', expect.any(Date), 20],
      ['previous', expect.any(Date), 20, true],
      ['previous-shadow', expect.any(Date), 20, true],
    ]);
    expect(gateway.retain).not.toHaveBeenCalled();
  });

  test('retired namespace banks can be re-erased but cannot be provisioned or retained', async () => {
    const active = {
      ...source,
      bank: { ...source.bank, namespace: 'previous' },
    };

    const { service, ledger, gateway } = setup(active, undefined, {
      BACKEND_HINDSIGHT_RETIRED_NAMESPACES: 'previous',
    });

    expect(await service.flushBank('bank')).toBe(false);
    expect(gateway.configureBank).not.toHaveBeenCalled();
    expect(gateway.retain).not.toHaveBeenCalled();
    ledger.claimBank.mockResolvedValue({ ...active.bank, state: 'erased' });
    ledger.bankSources.mockResolvedValue([]);
    expect(await service.flushBank('bank')).toBe(true);
    expect(gateway.deleteBank).toHaveBeenCalledWith('bank');
    expect(ledger.markBankErased).toHaveBeenCalled();
    expect(gateway.configureBank).not.toHaveBeenCalled();
    expect(gateway.retain).not.toHaveBeenCalled();
  });

  test('persists dispatch before acceptance and does not admit pending inference', async () => {
    const { service, ledger, gateway } = setup();
    expect(await service.flushBank('bank')).toBe(true);
    expect(ledger.startDispatch.mock.invocationCallOrder[0]).toBeLessThan(
      gateway.retain.mock.invocationCallOrder[0]!,
    );
    expect(gateway.retain).toHaveBeenCalledWith(
      'bank',
      expect.objectContaining({
        operationId: source.deliveries[0]!.operationId,
        documentId: 'source:g1',
      }),
    );
    expect(ledger.admit).not.toHaveBeenCalled();
    expect(gateway.listFacts).not.toHaveBeenCalled();
  });

  test('lost acknowledgements recover the persisted operation rather than a new retain', async () => {
    const pending = {
      ...source,
      deliveries: [
        {
          ...source.deliveries[0]!,
          state: 'submitted' as const,
          dispatchStartedAt: new Date(),
        },
      ],
    };

    const { service, ledger, gateway } = setup(pending);
    gateway.operation.mockResolvedValue({
      id: pending.deliveries[0]!.operationId,
      status: 'completed',
    });
    await service.flushBank('bank');
    expect(gateway.retain).not.toHaveBeenCalled();
    expect(ledger.transitionDelivery).toHaveBeenCalledWith(
      'bank',
      expect.any(String),
      'delivery',
      'retained',
    );
    expect(ledger.admit).toHaveBeenCalledWith(
      'bank',
      expect.any(String),
      'delivery',
      ['fact'],
    );
  });

  test('remote extraction receives evidence without envelope diagnostics', async () => {
    const wrapped = {
      ...source,
      deliveries: [
        {
          ...source.deliveries[0]!,
          content: JSON.stringify({
            sydiaSource: 1,
            userEvidence: 'I live in Makassar.',
            approvedEvidence: ['I live in Makassar.'],
            requestedFact: 'The user lives in Makassar.',
            userTimezone: 'Asia/Makassar',
            categoryHint: 'profile',
            sourceMessageId: 'private-message',
            permissionQuotes: [],
          }),
        },
      ],
    };

    const { service, gateway } = setup(wrapped);
    await service.flushBank('bank');
    const sent = gateway.retain.mock.calls[0]![1];
    expect(JSON.parse(sent.content)).toEqual({
      userEvidence: ['I live in Makassar.'],
      requestedFact: 'The user lives in Makassar.',
      permissionQuotes: [],
    });
    expect(sent.content).not.toMatch(/Asia\/Makassar|private-message|profile/);
  });

  test('transport failures preserve uncertain dispatch and schedule durable recovery without source text', async () => {
    const { service, ledger, gateway } = setup();
    gateway.retain.mockRejectedValue(
      new HindsightError('Private provider body', true),
    );
    expect(await service.flushBank('bank')).toBe(false);
    expect(ledger.admit).not.toHaveBeenCalled();
    expect(ledger.transitionDelivery).not.toHaveBeenCalled();
    expect(ledger.releaseBank).toHaveBeenCalledWith(
      'bank',
      expect.any(String),
      expect.any(Date),
      'hindsight_unavailable',
    );
  });

  test('unavailable Jev review leaves a retained source for retry without admission or erasure', async () => {
    const approveFacts = jest
      .fn<MemoryPolicyService['approveFacts']>()
      .mockRejectedValue(new Error('Jev fact review is unavailable: timeout'));

    const { service, ledger, gateway } = setup(source, {
      approveFacts,
    } as unknown as MemoryPolicyService);

    gateway.operation.mockResolvedValue({
      id: source.deliveries[0]!.operationId,
      status: 'completed',
    });
    expect(await service.flushBank('bank')).toBe(false);
    expect(ledger.admit).not.toHaveBeenCalled();
    expect(ledger.rejectDelivery).not.toHaveBeenCalled();
    expect(gateway.deleteDocument).not.toHaveBeenCalled();
    expect(ledger.transitionDelivery.mock.calls.map((call) => call[3])).toEqual(
      ['retained'],
    );
    expect(ledger.releaseBank).toHaveBeenCalledWith(
      'bank',
      expect.any(String),
      expect.any(Date),
      'memory_delivery_error',
    );
  });

  test('a late completion rejected by admission becomes remote erasure work', async () => {
    const { service, ledger, gateway } = setup();
    gateway.operation.mockResolvedValue({
      id: source.deliveries[0]!.operationId,
      status: 'completed',
    });
    ledger.admit.mockResolvedValue(false);
    await service.flushBank('bank');
    expect(ledger.transitionDelivery).toHaveBeenLastCalledWith(
      'bank',
      expect.any(String),
      'delivery',
      'erase_pending',
    );
  });

  test('stale or opted-out dispatch is withdrawn before remote submission', async () => {
    const { service, ledger, gateway } = setup();
    ledger.startDispatch.mockResolvedValue(false);
    await service.flushBank('bank');
    expect(gateway.retain).not.toHaveBeenCalled();
    expect(gateway.operation).not.toHaveBeenCalled();
    expect(ledger.transitionDelivery).toHaveBeenCalledWith(
      'bank',
      expect.any(String),
      'delivery',
      'erase_pending',
    );
  });

  test('an expired worker cannot provision or send a source', async () => {
    const { service, ledger, gateway } = setup();
    ledger.renewBank.mockResolvedValue(false);
    expect(await service.flushBank('bank')).toBe(false);
    expect(gateway.configureBank).not.toHaveBeenCalled();
    expect(gateway.retain).not.toHaveBeenCalled();
  });

  test('bank erasure waits for running inference to drain', async () => {
    const retired = {
      ...source,
      bank: { ...source.bank, state: 'erasing' as const },
      source: { ...source.source, state: 'deleted' as const },
      deliveries: [
        {
          ...source.deliveries[0]!,
          state: 'erase_pending' as const,
          dispatchStartedAt: new Date(),
        },
      ],
    };

    const { service, ledger, gateway } = setup(retired);
    gateway.operation.mockResolvedValue({
      id: retired.deliveries[0]!.operationId,
      status: 'processing',
    });
    await service.flushBank('bank');
    expect(gateway.configureBank).not.toHaveBeenCalled();
    expect(gateway.deleteDocument).not.toHaveBeenCalled();
    expect(gateway.deleteBank).not.toHaveBeenCalled();
    expect(ledger.markBankErased).not.toHaveBeenCalled();
  });

  test('unverified source metadata cannot become admitted reference facts', async () => {
    const { service, ledger, gateway } = setup();
    gateway.operation.mockResolvedValue({
      id: source.deliveries[0]!.operationId,
      status: 'completed',
    });
    gateway.listFacts.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'foreign',
          text: 'Unsupported claim',
          type: 'world',
          documentId: 'source:g1',
          sourceFactIds: [],
          metadata: { sourceId: 'other-source' },
          occurredStart: null,
          mentionedAt: null,
        },
      ],
    });
    expect(await service.flushBank('bank')).toBe(false);
    expect(ledger.admit).not.toHaveBeenCalled();
    expect(ledger.transitionDelivery).toHaveBeenLastCalledWith(
      'bank',
      expect.any(String),
      'delivery',
      'erase_pending',
    );
  });

  test('default unconfigured deployment performs no remote or ledger work', async () => {
    const { ledger, gateway } = setup();
    const service = new HindsightDeliveryService(
      ledger as unknown as IHindsightRepository,
      gateway as unknown as HindsightGateway,
      new ConfigService({}),
    );

    expect(await service.recover()).toBe(0);
    expect(await service.flushBank('bank')).toBe(false);
    expect(ledger.pendingBanks).not.toHaveBeenCalled();
    expect(gateway.version).not.toHaveBeenCalled();
  });

  test('lost ownership between review batches stops admission without withdrawing another worker’s delivery', async () => {
    const approveFacts = jest.fn<MemoryPolicyService['approveFacts']>();
    const { service, ledger, gateway } = setup(source, {
      approveFacts,
    } as unknown as MemoryPolicyService);

    gateway.operation.mockResolvedValue({
      id: source.deliveries[0]!.operationId,
      status: 'completed',
    });
    approveFacts.mockImplementation(async (_owner, _content, _facts, renew) => {
      await renew!();
      ledger.renewBank.mockResolvedValue(false);
      await renew!();

      return true;
    });
    expect(await service.flushBank('bank')).toBe(false);
    expect(approveFacts).toHaveBeenCalledTimes(1);
    expect(ledger.admit).not.toHaveBeenCalled();
    expect(ledger.rejectDelivery).not.toHaveBeenCalled();
  });

  test('a negative fact review withdraws the whole source', async () => {
    const approveFacts = jest
      .fn<MemoryPolicyService['approveFacts']>()
      .mockResolvedValue(false);

    const { service, ledger, gateway } = setup(source, {
      approveFacts,
    } as unknown as MemoryPolicyService);

    gateway.operation.mockResolvedValue({
      id: source.deliveries[0]!.operationId,
      status: 'completed',
    });
    await service.flushBank('bank');
    expect(ledger.admit).not.toHaveBeenCalled();
    expect(ledger.rejectDelivery).toHaveBeenCalledWith(
      'bank',
      expect.any(String),
      'delivery',
    );
  });
});
