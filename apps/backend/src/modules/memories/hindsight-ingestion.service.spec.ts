import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type {
  IHindsightRepository,
  IUserRepository,
} from '../../database/interfaces';
import type {
  MemoryIngestionSegment,
  MemorySourceSnapshot,
  User,
} from '../../database/entities';
import type { QueueService } from '../../infra/queue';
import { HindsightIngestionService } from './hindsight-ingestion.service';
import { MemoryEngineService } from './memory-engine.service';
import type { MemoryPolicyService } from './memory-policy.service';
import type { MemoryEligibilityService } from './memory-eligibility.service';

const segment: MemoryIngestionSegment = {
  checkpoint: {
    id: 'checkpoint',
    userId: 'user',
    namespace: 'test',
    conversationId: 'conversation',
    policyVersion: 'sydia-admission-v1',
    throughMessageId: null,
    throughCreatedAt: null,
    pendingMessageId: null,
    pendingCreatedAt: null,
    pendingSourceIds: [],
  },
  through: { id: 'boundary', createdAt: new Date() },
  messages: [
    { id: 'm1', content: 'I prefer short replies.', createdAt: new Date() },
    { id: 'm2', content: 'Remember my city.', createdAt: new Date() },
    { id: 'm3', content: 'A forgotten source', createdAt: new Date() },
    {
      id: 'm4',
      content: 'My password is synthetic-password',
      createdAt: new Date(),
    },
  ],
};

function setup(
  settings: Record<string, unknown> = {},
  eligibility?: MemoryEligibilityService,
) {
  const config = new ConfigService({
    BACKEND_MEMORY_ENGINE: 'hindsight',
    BACKEND_HINDSIGHT_NAMESPACE: 'test',
    BACKEND_HINDSIGHT_INGESTION_ENABLED: true,
    ...settings,
  });

  const ledger = {
    ingestionSegment: jest
      .fn<IHindsightRepository['ingestionSegment']>()
      .mockResolvedValue(segment),
    completeCheckpoint: jest
      .fn<IHindsightRepository['completeCheckpoint']>()
      .mockResolvedValue(false),
    stageCheckpoint: jest
      .fn<IHindsightRepository['stageCheckpoint']>()
      .mockResolvedValue(true),
    ensureBank: jest
      .fn<IHindsightRepository['ensureBank']>()
      .mockResolvedValue({ id: 'bank' } as never),
    suppressedMessageIds: jest
      .fn<IHindsightRepository['suppressedMessageIds']>()
      .mockResolvedValue(['m3']),
    explicitSourceMessageIds: jest
      .fn<IHindsightRepository['explicitSourceMessageIds']>()
      .mockResolvedValue(['m2']),
    findSource: jest
      .fn<IHindsightRepository['findSource']>()
      .mockResolvedValue(null),
    enqueue: jest.fn<IHindsightRepository['enqueue']>().mockResolvedValue({
      status: 'written',
      snapshot: { source: { id: 'source' } } as MemorySourceSnapshot,
    }),
    pendingCheckpoints: jest
      .fn<IHindsightRepository['pendingCheckpoints']>()
      .mockResolvedValue([]),
    recoverableIngestion: jest
      .fn<IHindsightRepository['recoverableIngestion']>()
      .mockResolvedValue([]),
  };

  const policy = {
    approveEvidence: jest
      .fn<MemoryPolicyService['approveEvidence']>()
      .mockResolvedValue({
        spans: [
          {
            quote: 'I prefer short replies.',
            sensitive: false,
            permissionQuote: null,
          },
        ],
      }),
  };

  const users = {
    findById: jest.fn<IUserRepository['findById']>().mockResolvedValue({
      id: 'user',
      automaticMemoryEnabled: true,
      timezone: 'Asia/Makassar',
    } as User),
  };

  const add = jest
    .fn<QueueService['memoryDeliveries']['add']>()
    .mockResolvedValue({} as never);

  const service = new HindsightIngestionService(
    ledger as unknown as IHindsightRepository,
    users as unknown as IUserRepository,
    policy as unknown as MemoryPolicyService,
    new MemoryEngineService(config),
    { memoryDeliveries: { add } } as unknown as QueueService,
    config,
    eligibility,
  );

  return { service, ledger, policy, users, add };
}

describe('HindsightIngestionService', () => {
  test('a negative eligibility decision skips review but stages the original checkpoint', async () => {
    const shouldReview = jest
      .fn<MemoryEligibilityService['shouldReview']>()
      .mockResolvedValue(false);

    const { service, ledger, policy } = setup({}, {
      shouldReview,
    } as unknown as MemoryEligibilityService);

    await service.run('user', 'conversation', 'boundary');
    expect(shouldReview).toHaveBeenCalledTimes(1);
    expect(shouldReview).toHaveBeenCalledWith(
      'user',
      segment.messages[0]!.content,
    );
    expect(policy.approveEvidence).not.toHaveBeenCalled();
    expect(ledger.enqueue).not.toHaveBeenCalled();
    expect(ledger.stageCheckpoint).toHaveBeenCalledWith(segment, []);
  });

  test('submits only approved user evidence, skipping explicit, forgotten, and credential-bearing messages', async () => {
    const { service, ledger, policy } = setup();
    expect(await service.run('user', 'conversation', 'boundary')).toEqual({
      status: 'queued',
      sourceCount: 1,
    });
    expect(policy.approveEvidence).toHaveBeenCalledTimes(1);
    expect(ledger.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'automatic',
        sourceMessageIds: ['m1'],
        eventAt: segment.messages[0]!.createdAt,
      }),
    );
    const input = ledger.enqueue.mock.calls[0]![0];
    expect(JSON.parse(input.content)).toMatchObject({
      approvedEvidence: ['I prefer short replies.'],
      userTimezone: 'Asia/Makassar',
      role: 'user',
    });
    expect(ledger.stageCheckpoint).toHaveBeenCalledWith(segment, ['source']);
  });

  test('queued remote work cannot advance a checkpoint, and retries reuse existing sources', async () => {
    const { service, ledger, policy } = setup();
    ledger.ingestionSegment.mockResolvedValue({
      ...segment,
      checkpoint: {
        ...segment.checkpoint,
        pendingMessageId: 'boundary',
        pendingCreatedAt: new Date(),
        pendingSourceIds: ['source'],
      },
    });
    expect((await service.run('user', 'conversation', 'boundary')).status).toBe(
      'queued',
    );
    expect(ledger.stageCheckpoint).not.toHaveBeenCalled();
    expect(policy.approveEvidence).not.toHaveBeenCalled();
    ledger.ingestionSegment.mockResolvedValue(segment);
    ledger.findSource.mockResolvedValue({
      source: { id: 'source' },
    } as MemorySourceSnapshot);
    await service.run('user', 'conversation', 'boundary');
    expect(policy.approveEvidence).not.toHaveBeenCalled();
    expect(ledger.enqueue).not.toHaveBeenCalled();
    expect(ledger.stageCheckpoint).toHaveBeenCalledWith(segment, ['source']);
  });

  test('opt-out and rollout flags stop scheduling work before evidence reaches a provider', async () => {
    for (const settings of [
      { BACKEND_MEMORY_ENGINE: 'legacy' },
      { BACKEND_HINDSIGHT_INGESTION_ENABLED: false },
      { BACKEND_HINDSIGHT_COHORT: 'different-user' },
    ]) {
      const { service, ledger, policy } = setup(settings);
      expect(
        (await service.run('user', 'conversation', 'boundary')).status,
      ).toBe('skipped');
      expect(ledger.ingestionSegment).not.toHaveBeenCalled();
      expect(policy.approveEvidence).not.toHaveBeenCalled();
    }

    const { service, ledger, users } = setup();
    users.findById.mockResolvedValue({ automaticMemoryEnabled: false } as User);
    expect((await service.run('user', 'conversation', 'boundary')).status).toBe(
      'skipped',
    );
    expect(ledger.ingestionSegment).not.toHaveBeenCalled();
  });

  test('isolates shadow namespaces and preserves durable work when queue publication fails', async () => {
    const { service, ledger, add } = setup({ BACKEND_MEMORY_ENGINE: 'shadow' });
    add.mockRejectedValue(new Error('Redis unavailable'));
    expect((await service.run('user', 'conversation', 'boundary')).status).toBe(
      'queued',
    );
    expect(ledger.ingestionSegment).toHaveBeenCalledWith(
      'user',
      'test-shadow',
      'sydia-admission-v1',
      'conversation',
      'boundary',
    );
    expect(ledger.ensureBank).toHaveBeenCalledWith(
      'user',
      'test-shadow',
      expect.stringMatching(/^test-shadow-/),
    );
  });
});
