import { jest } from '@jest/globals';
import type { PrismaService } from '../../infra/prisma';
import { PrismaConversationRepository } from './prisma-conversation.repository';

const input = {
  provider: 'telegram' as const,
  externalIdentityId: 'identity-1',
  chatExternalId: 'chat-1',
  userId: 'user-1',
  title: 'Halo',
  activeAfter: new Date('2026-09-09T12:00:00.000Z'),
  receivedAt: new Date('2026-09-10T12:00:00.000Z'),
};

function prismaWithTransaction(transaction: Record<string, unknown>) {
  return {
    $transaction: jest.fn(
      (work: (tx: Record<string, unknown>) => Promise<unknown>) =>
        work(transaction),
    ),
  } as unknown as PrismaService;
}

describe('PrismaConversationRepository channel conversations', () => {
  it('reuses an active mapped conversation', async () => {
    const conversation = {
      id: 'conversation-1',
      title: 'Halo',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const transaction = {
      $executeRaw: jest.fn(() => Promise.resolve(1)),
      channelConversation: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: 'channel-1',
            lastInboundAt: new Date('2026-09-10T11:00:00.000Z'),
            conversation,
          }),
        ),
        updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
        upsert: jest.fn(),
      },
      conversation: { create: jest.fn() },
    };

    const repository = new PrismaConversationRepository(
      prismaWithTransaction(transaction),
    );

    await expect(repository.resolveChannelConversation(input)).resolves.toEqual(
      {
        channelConversationId: 'channel-1',
        conversation,
      },
    );
    expect(transaction.conversation.create).not.toHaveBeenCalled();
    expect(transaction.channelConversation.upsert).not.toHaveBeenCalled();
  });

  it('rotates an expired mapped conversation after inactivity', async () => {
    const conversation = {
      id: 'conversation-2',
      title: 'Halo',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const transaction = {
      $executeRaw: jest.fn(() => Promise.resolve(1)),
      channelConversation: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: 'channel-1',
            lastInboundAt: new Date('2026-09-08T11:00:00.000Z'),
            conversation: { ...conversation, id: 'conversation-1' },
          }),
        ),
        updateMany: jest.fn(),
        upsert: jest.fn<(input: unknown) => Promise<{ id: string }>>(() =>
          Promise.resolve({ id: 'channel-1' }),
        ),
      },
      conversation: {
        create: jest.fn(() => Promise.resolve(conversation)),
      },
    };

    const repository = new PrismaConversationRepository(
      prismaWithTransaction(transaction),
    );

    await expect(repository.resolveChannelConversation(input)).resolves.toEqual(
      {
        channelConversationId: 'channel-1',
        conversation,
      },
    );
    const upsert = transaction.channelConversation.upsert.mock.calls[0]?.[0] as
      | { update?: { conversationId?: string; lastInboundAt?: Date } }
      | undefined;

    expect(upsert?.update).toEqual({
      conversationId: 'conversation-2',
      lastInboundAt: input.receivedAt,
    });
  });

  it('marks a recent active turn for cancellation and delays its correction', async () => {
    const active = {
      id: 'turn-1',
      channelConversationId: 'channel-1',
      providerMessageId: 'message-1',
      batchKey: 'message-1',
      message: {
        message: {
          provider: 'telegram',
          providerMessageId: 'message-1',
          senderExternalId: 'sender-1',
          chatExternalId: 'chat-1',
          isGroup: false,
          isFromMe: false,
          receivedAt: '2026-09-10T12:00:00.000Z',
          text: 'Halo',
          kind: 'text',
          raw: {},
        },
      },
      status: 'processing',
      availableAt: new Date('2026-09-10T12:00:00.000Z'),
      processingStartedAt: new Date('2026-09-10T12:00:00.000Z'),
      cancellationRequestedAt: null,
      leaseUntil: new Date('2026-09-10T12:05:00.000Z'),
      completedAt: null,
      errorMessage: null,
      createdAt: new Date('2026-09-10T12:00:00.000Z'),
      updatedAt: new Date('2026-09-10T12:00:00.000Z'),
    };

    const correction = {
      ...active,
      id: 'turn-2',
      providerMessageId: 'message-2',
      status: 'queued',
      processingStartedAt: null,
    };

    const transaction = {
      $executeRaw: jest.fn(() => Promise.resolve(1)),
      channelTurn: {
        findFirst: jest
          .fn<() => Promise<typeof active | null>>()
          .mockResolvedValueOnce(active)
          .mockResolvedValueOnce(null),
        update: jest.fn(() => Promise.resolve(active)),
        updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
        upsert: jest.fn<(input: unknown) => Promise<typeof correction>>(() =>
          Promise.resolve(correction),
        ),
      },
    };

    const repository = new PrismaConversationRepository(
      prismaWithTransaction(transaction),
    );

    const now = new Date('2026-09-10T12:00:01.000Z');

    const result = await repository.enqueueChannelTurn(
      'channel-1',
      'message-2',
      correction.message,
      now,
      2_000,
    );

    expect(result.supersededTurnId).toBe('turn-1');
    expect(transaction.channelTurn.update).toHaveBeenCalledWith({
      where: { id: 'turn-1' },
      data: { cancellationRequestedAt: now },
    });
    const create = transaction.channelTurn.upsert.mock.calls[0]?.[0] as
      { create?: { batchKey?: string; availableAt?: Date } } | undefined;

    expect(create?.create).toMatchObject({
      batchKey: 'message-1',
      availableAt: new Date('2026-09-10T12:00:03.000Z'),
    });
  });
});
