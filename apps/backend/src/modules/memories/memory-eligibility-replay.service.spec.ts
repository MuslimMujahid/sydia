import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type {
  IConversationRepository,
  IHindsightRepository,
  IUserRepository,
} from '../../database/interfaces';
import type { QueueService } from '../../infra/queue';
import { MemoryEngineService } from './memory-engine.service';
import type { MemoryPolicyService } from './memory-policy.service';
import { MemoryEligibilityReplayService } from './memory-eligibility-replay.service';

function setup() {
  const conversations = {
    findUserMemoryEvidence: jest
      .fn<IConversationRepository['findUserMemoryEvidence']>()
      .mockResolvedValue({
        id: 'message',
        content: 'I prefer tea.',
        conversationId: 'conversation',
        createdAt: new Date('2026-09-01T00:00:00Z'),
      }),
  };

  const ledger = {
    findBank: jest
      .fn<IHindsightRepository['findBank']>()
      .mockResolvedValue(null),
    ensureBank: jest
      .fn<IHindsightRepository['ensureBank']>()
      .mockResolvedValue({ id: 'bank' } as never),
    suppressedMessageIds: jest
      .fn<IHindsightRepository['suppressedMessageIds']>()
      .mockResolvedValue([]),
    explicitSourceMessageIds: jest
      .fn<IHindsightRepository['explicitSourceMessageIds']>()
      .mockResolvedValue([]),
    findSource: jest
      .fn<IHindsightRepository['findSource']>()
      .mockResolvedValue(null),
    enqueue: jest
      .fn<IHindsightRepository['enqueue']>()
      .mockResolvedValue({ status: 'created', snapshot: {} } as never),
  };

  const users = {
    findById: jest.fn<IUserRepository['findById']>().mockResolvedValue({
      automaticMemoryEnabled: true,
      timezone: 'Asia/Makassar',
    } as never),
  };

  const policy = {
    approveEvidence: jest
      .fn<MemoryPolicyService['approveEvidence']>()
      .mockResolvedValue({
        spans: [
          { quote: 'I prefer tea.', sensitive: false, permissionQuote: null },
        ],
      }),
  };

  const add = jest
    .fn<QueueService['memoryDeliveries']['add']>()
    .mockResolvedValue({} as never);

  const engine = new MemoryEngineService(
    new ConfigService({
      BACKEND_MEMORY_ENGINE: 'hindsight',
      BACKEND_HINDSIGHT_NAMESPACE: 'test',
      BACKEND_HINDSIGHT_INGESTION_ENABLED: true,
    }),
  );

  const service = new MemoryEligibilityReplayService(
    conversations as unknown as IConversationRepository,
    ledger as unknown as IHindsightRepository,
    users as unknown as IUserRepository,
    policy as unknown as MemoryPolicyService,
    engine,
    { memoryDeliveries: { add } } as unknown as QueueService,
  );

  return { service, conversations, ledger, users, policy, add };
}

test('default replay is owner-scoped and performs no ledger or queue writes', async () => {
  const { service, conversations, ledger, add } = setup();
  expect(await service.replay('owner', ['message'])).toEqual([
    { messageId: 'message', status: 'eligible' },
  ]);
  expect(conversations.findUserMemoryEvidence).toHaveBeenCalledWith(
    'owner',
    'message',
  );
  expect(ledger.ensureBank).not.toHaveBeenCalled();
  expect(ledger.enqueue).not.toHaveBeenCalled();
  expect(add).not.toHaveBeenCalled();
});
test('replay excludes suppressed/foreign messages without reviewing them', async () => {
  const { service, conversations, ledger, policy } = setup();
  conversations.findUserMemoryEvidence.mockResolvedValueOnce(null);
  expect(await service.replay('owner', ['foreign'])).toEqual([
    { messageId: 'foreign', status: 'excluded' },
  ]);
  ledger.suppressedMessageIds.mockResolvedValueOnce(['message']);
  expect(await service.replay('owner', ['message'])).toEqual([
    { messageId: 'message', status: 'excluded' },
  ]);
  expect(policy.approveEvidence).not.toHaveBeenCalled();
});
test('apply preserves original source identity and timestamps without checkpoint mutation', async () => {
  const { service, ledger, add } = setup();
  expect(await service.replay('owner', ['message'], true)).toEqual([
    { messageId: 'message', status: 'queued' },
  ]);
  expect(ledger.enqueue).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceKey: 'automatic:sydia-admission-v1:message',
      kind: 'automatic',
      sourceMessageIds: ['message'],
      eventAt: new Date('2026-09-01T00:00:00Z'),
    }),
  );
  expect(add).toHaveBeenCalledWith('deliver', { kind: 'bank', bankId: 'bank' });
});
test('opt-out or forgetting during evidence review fences replay writes', async () => {
  const { service, users, ledger } = setup();
  users.findById
    .mockResolvedValueOnce({ automaticMemoryEnabled: true } as never)
    .mockResolvedValueOnce({ automaticMemoryEnabled: false } as never);
  expect(await service.replay('owner', ['message'], true)).toEqual([
    { messageId: 'message', status: 'excluded' },
  ]);
  expect(ledger.enqueue).not.toHaveBeenCalled();
  users.findById.mockResolvedValue({ automaticMemoryEnabled: true } as never);
  ledger.suppressedMessageIds
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(['message']);
  expect(await service.replay('owner', ['message'], true)).toEqual([
    { messageId: 'message', status: 'excluded' },
  ]);
  expect(ledger.enqueue).not.toHaveBeenCalled();
});
