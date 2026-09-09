import { jest } from '@jest/globals';
import type { User } from '../../database/entities';
import type {
  ClaimedChannelTurns,
  IConversationRepository,
  IUserRepository,
} from '../../database/interfaces';
import type { NormalizedInboundMessage } from '../../shared/messaging';
import type {
  AssistantOrchestratorService,
  ToolExecutorService,
} from '../conversations/services';
import { MessagingHandlerService } from './messaging-handler.service';

const user = { id: 'user-1', name: 'User' } as User;
const baseMessage: NormalizedInboundMessage = {
  provider: 'telegram',
  providerMessageId: 'chat-1:1',
  senderExternalId: 'sender-1',
  chatExternalId: 'chat-1',
  isGroup: false,
  isFromMe: false,
  receivedAt: new Date('2026-09-10T12:00:00.000Z'),
  text: 'Halo',
  kind: 'text',
  raw: {},
};

function setup() {
  const conversation = {
    id: 'conversation-1',
    title: 'Halo',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const assistant = {
    sendAndWait: jest.fn<AssistantOrchestratorService['sendAndWait']>(),
  } as unknown as AssistantOrchestratorService;

  const toolExecutor = {
    resolveConfirmation: jest.fn<ToolExecutorService['resolveConfirmation']>(),
  } as unknown as ToolExecutorService;

  const conversations = {
    resolveChannelConversation: jest.fn(() =>
      Promise.resolve({
        channelConversationId: 'channel-1',
        conversation,
      }),
    ),
    enqueueChannelTurn: jest.fn(() =>
      Promise.resolve({
        turn: { id: 'turn-1' },
        supersededTurnId: null,
      }),
    ),
    cancelChannelTurns: jest.fn(() => Promise.resolve([])),
    resetChannelConversation: jest.fn(() => Promise.resolve()),
    sealChannelTurns: jest.fn(() => Promise.resolve(true)),
    findRecoverableChannelConversationIds: jest.fn(() => Promise.resolve([])),
    renewChannelTurnLeases: jest.fn(() => Promise.resolve()),
    rejectPendingToolInvocations: jest.fn(() => Promise.resolve()),
    claimChannelTurns: jest.fn(() => Promise.resolve(null)),
    nextChannelTurnAvailableAt: jest.fn(() => Promise.resolve(null)),
    findLatestPendingToolInvocation: jest.fn(() => Promise.resolve(null)),
    completeChannelTurns: jest.fn(() => Promise.resolve()),
    failChannelTurns: jest.fn(() => Promise.resolve()),
    requeueChannelTurns: jest.fn(() => Promise.resolve()),
    channelTurnCancellationRequested: jest.fn(() => Promise.resolve(false)),
  } as unknown as IConversationRepository;

  const users = {
    findById: jest.fn(() => Promise.resolve(user)),
  } as unknown as IUserRepository;

  const service = new MessagingHandlerService(
    assistant,
    toolExecutor,
    conversations,
    users,
  );

  return { assistant, conversations, service, toolExecutor, conversation };
}

describe('MessagingHandlerService', () => {
  afterEach(() => jest.useRealTimers());

  it('persists an ordinary message before scheduling processing', async () => {
    jest.useFakeTimers();
    const { conversations, service } = setup();
    await service.registerAdapter('telegram', {
      prepare: () => Promise.resolve({ content: 'Halo' }),
      send: () => Promise.resolve(),
    });

    await service.handle({
      message: baseMessage,
      user,
      externalIdentityId: 'identity-1',
    });

    expect(conversations.enqueueChannelTurn).toHaveBeenCalledTimes(1);
    const call = jest.mocked(conversations.enqueueChannelTurn).mock.calls[0];
    expect(call?.[0]).toBe('channel-1');
    expect(call?.[1]).toBe('chat-1:1');
    expect(call?.[4]).toBe(2_000);
    service.onModuleDestroy();
  });

  it('cancels active and queued work for /stop', async () => {
    const { conversations, service } = setup();
    const send = jest.fn<() => Promise<void>>(() => Promise.resolve());
    await service.registerAdapter('telegram', {
      prepare: () => Promise.resolve({ content: 'Halo' }),
      send,
    });

    await service.handle({
      message: { ...baseMessage, text: '/stop' },
      user,
      externalIdentityId: 'identity-1',
    });

    expect(conversations.cancelChannelTurns).toHaveBeenCalledWith(
      'channel-1',
      expect.any(Date),
    );
    expect(conversations.enqueueChannelTurn).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalled();
  });

  it('coalesces a claimed burst into one assistant turn', async () => {
    jest.useFakeTimers();
    const { assistant, conversations, service, conversation } = setup();
    const send = jest.fn<() => Promise<void>>(() => Promise.resolve());
    const batch: ClaimedChannelTurns = {
      channelConversationId: 'channel-1',
      conversationId: conversation.id,
      userId: user.id,
      externalIdentityId: 'identity-1',
      provider: 'telegram',
      turns: [
        {
          id: 'turn-1',
          channelConversationId: 'channel-1',
          providerMessageId: 'chat-1:1',
          message: { message: baseMessage },
          status: 'processing',
          availableAt: new Date(),
          processingStartedAt: new Date(),
          cancellationRequestedAt: null,
        },
        {
          id: 'turn-2',
          channelConversationId: 'channel-1',
          providerMessageId: 'chat-1:2',
          message: {
            message: {
              ...baseMessage,
              providerMessageId: 'chat-1:2',
              text: 'Tambahkan besok',
            },
          },
          status: 'processing',
          availableAt: new Date(),
          processingStartedAt: new Date(),
          cancellationRequestedAt: null,
        },
      ],
    };

    jest
      .mocked(conversations.claimChannelTurns)
      .mockResolvedValueOnce(batch)
      .mockResolvedValue(null);
    jest.mocked(assistant.sendAndWait).mockResolvedValue({
      conversation,
      userMessage: { id: 'message-1' } as never,
      assistantMessage: { content: 'Baik' } as never,
      assistantRun: { status: 'completed' } as never,
      toolInvocations: [],
    });
    jest
      .mocked(conversations.findRecoverableChannelConversationIds)
      .mockResolvedValue(['channel-1']);
    await service.registerAdapter('telegram', {
      prepare: (_userId, message) => Promise.resolve({ content: message.text }),
      send,
    });

    await jest.runAllTimersAsync();

    expect(assistant.sendAndWait).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ content: 'Halo\nTambahkan besok' }),
    );
    expect(send).toHaveBeenCalled();
    expect(conversations.completeChannelTurns).toHaveBeenCalledWith(
      ['turn-1', 'turn-2'],
      expect.any(Date),
    );
    service.onModuleDestroy();
  });
});
