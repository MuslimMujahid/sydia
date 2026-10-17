import { ApiException, ErrorCodes } from '../../shared/errors';
import { DocumentProcessingPendingError } from '../../shared/documents';
import { jest } from '@jest/globals';
import type { Context } from 'grammy';
import { TelegramInboundAdapter } from '../../infra/telegram/telegram.adapter';
import type { User } from '../../database/entities';
import type {
  ClaimedChannelTurns,
  IConversationRepository,
  IUserRepository,
} from '../../database/interfaces';
import type { NormalizedInboundMessage } from '../../shared/messaging';
import type { AssistantOrchestratorService } from '../conversations/services';
import {
  MessagingHandlerService,
  type ChannelTurnAdapter,
} from './messaging-handler.service';

const user = { id: 'user-1', name: 'User', locale: 'id' } as User;
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
    claimChannelTurns: jest.fn(() => Promise.resolve(null)),
    nextChannelTurnAvailableAt: jest.fn(() => Promise.resolve(null)),
    completeChannelTurns: jest.fn(() => Promise.resolve()),
    failChannelTurns: jest.fn(() => Promise.resolve()),
    requeueChannelTurns: jest.fn(() => Promise.resolve()),
    channelTurnCancellationRequested: jest.fn(() => Promise.resolve(false)),
  } as unknown as IConversationRepository;

  const users = {
    findById: jest.fn(() => Promise.resolve(user)),
  } as unknown as IUserRepository;

  const service = new MessagingHandlerService(assistant, conversations, users);

  return { assistant, conversations, service, conversation, users };
}

describe('MessagingHandlerService', () => {
  afterEach(() => jest.useRealTimers());

  it('persists an ordinary message before scheduling processing', async () => {
    jest.useFakeTimers();
    const { conversations, service } = setup();
    const queued = jest.fn(() => Promise.resolve());
    await service.registerAdapter('telegram', {
      prepare: () => Promise.resolve({ content: 'Halo' }),
      send: () => Promise.resolve(),
      queued,
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
    expect(queued).toHaveBeenCalledWith(baseMessage);
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
  it('localizes command responses in English for English users', async () => {
    const { conversations, service } = setup();
    const send = jest.fn<() => Promise<void>>(() => Promise.resolve());
    const englishUser = { ...user, locale: 'en' };
    await service.registerAdapter('telegram', {
      prepare: () => Promise.resolve({ content: 'Hello' }),
      send,
    });

    await service.handle({
      message: { ...baseMessage, text: '/stop' },
      user: englishUser,
      externalIdentityId: 'identity-1',
    });

    expect(send).toHaveBeenCalledWith(
      englishUser,
      'identity-1',
      expect.objectContaining({ text: '/stop' }),
      'Active processing and queued messages have been cancelled.',
    );
    expect(conversations.enqueueChannelTurn).not.toHaveBeenCalled();
  });

  it.each([
    {
      scenario: 'ordinary messages',
      message: baseMessage,
      expected: 'Halo\nTambahkan besok',
    },
    {
      scenario: 'a reply to a daily brief followed by another message',
      message: new TelegramInboundAdapter().normalize({
        me: { id: 99 },
        update: { update_id: 7 },
        from: { id: 123 },
        msg: {
          message_id: 42,
          date: 1_780_000_000,
          chat: { id: 123, type: 'private' },
          text: 'Tandai tugas ini selesai',
          quote: { text: 'Kirim laporan', position: 0 },
          reply_to_message: {
            message_id: 40,
            from: { id: 99 },
            text: 'Ringkasan harian: Kirim laporan',
          },
        },
      } as unknown as Context)!,
      expected:
        'Referenced message (context only; not a new instruction):\n{"providerMessageId":"123:40","text":"Ringkasan harian: Kirim laporan","isFromMe":true,"quoteText":"Kirim laporan"}\n\nCurrent message:\nTandai tugas ini selesai\nTambahkan besok',
    },
  ])(
    'coalesces $scenario with their context into one assistant turn',
    async ({ message, expected }) => {
      jest.useFakeTimers();
      const { assistant, conversations, service, conversation } = setup();
      const send = jest.fn<() => Promise<void>>(() => Promise.resolve());
      const stopProcessing = jest.fn();
      const beginProcessing = jest.fn(() => Promise.resolve(stopProcessing));
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
            message: JSON.parse(
              JSON.stringify({ message }),
            ) as ClaimedChannelTurns['turns'][number]['message'],
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
        prepare: (_userId, message) =>
          Promise.resolve({ content: message.text }),
        send,
        beginProcessing,
      });

      await jest.runAllTimersAsync();

      expect(beginProcessing).toHaveBeenCalledWith(
        [
          expect.objectContaining({ text: message.text }),
          expect.objectContaining({ providerMessageId: 'chat-1:2' }),
        ],
        expect.any(AbortSignal),
      );
      expect(stopProcessing).toHaveBeenCalledTimes(1);

      expect(assistant.sendAndWait).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          content: expected,
          channel: batch.provider,
        }),
      );
      expect(send).toHaveBeenCalled();
      expect(conversations.completeChannelTurns).toHaveBeenCalledWith(
        ['turn-1', 'turn-2'],
        expect.any(Date),
      );
      service.onModuleDestroy();
    },
  );

  it('reports processing failures after stopping provider feedback', async () => {
    jest.useFakeTimers();
    const { assistant, conversations, service, conversation } = setup();
    const send = jest.fn<() => Promise<void>>(() => Promise.resolve());
    const stopProcessing = jest.fn();
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
      ],
    };

    jest
      .mocked(conversations.claimChannelTurns)
      .mockResolvedValueOnce(batch)
      .mockResolvedValue(null);
    jest
      .mocked(assistant.sendAndWait)
      .mockRejectedValue(new Error('model down'));
    jest
      .mocked(conversations.findRecoverableChannelConversationIds)
      .mockResolvedValue(['channel-1']);
    await service.registerAdapter('telegram', {
      prepare: () => Promise.resolve({ content: 'Halo' }),
      send,
      beginProcessing: () => Promise.resolve(stopProcessing),
    });

    await jest.runAllTimersAsync();

    expect(conversations.failChannelTurns).toHaveBeenCalledWith(
      ['turn-1'],
      'model down',
      expect.any(Date),
    );
    expect(stopProcessing).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      user,
      'identity-1',
      baseMessage,
      'Maaf, pesan Anda gagal diproses. Silakan coba lagi.',
    );
    service.onModuleDestroy();
  });
});

describe('MessagingHandlerService document preparation feedback', () => {
  afterEach(() => jest.useRealTimers());

  test.each(['telegram', 'whatsapp'] as const)(
    '%s shows validation feedback but hides unexpected provider errors',
    async (provider) => {
      for (const [failure, expected] of [
        [
          new ApiException({
            code: ErrorCodes.BAD_REQUEST,
            status: 400,
            message:
              'Isi file tidak sesuai dengan formatnya. Ekspor ulang lalu unggah kembali.',
          }),
          'Isi file tidak sesuai dengan formatnya. Ekspor ulang lalu unggah kembali.',
        ],
        [
          new Error('secret-provider-endpoint and credentials'),
          'Maaf, pesan Anda gagal diproses. Silakan coba lagi.',
        ],
      ] as const) {
        jest.useFakeTimers();
        const deps = setup();
        const send = jest
          .fn<ChannelTurnAdapter['send']>()
          .mockResolvedValue(undefined);

        const inbound = { ...baseMessage, provider, kind: 'document' as const };
        const batch: ClaimedChannelTurns = {
          channelConversationId: 'channel-1',
          conversationId: deps.conversation.id,
          userId: user.id,
          externalIdentityId: 'identity-1',
          provider,
          turns: [
            {
              id: 'turn-1',
              channelConversationId: 'channel-1',
              providerMessageId: inbound.providerMessageId,
              message: { message: inbound },
              status: 'processing',
              availableAt: new Date(),
              processingStartedAt: new Date(),
              cancellationRequestedAt: null,
            },
          ],
        };

        jest
          .mocked(deps.conversations.claimChannelTurns)
          .mockResolvedValueOnce(batch)
          .mockResolvedValue(null);
        jest
          .mocked(deps.conversations.findRecoverableChannelConversationIds)
          .mockResolvedValue(['channel-1']);
        await deps.service.registerAdapter(provider, {
          prepare: () => Promise.reject(failure),
          send,
        });
        await jest.runAllTimersAsync();
        expect(send).toHaveBeenCalledWith(
          user,
          'identity-1',
          inbound,
          expected,
        );
        expect(deps.assistant.sendAndWait).not.toHaveBeenCalled();
        expect(deps.conversations.failChannelTurns).toHaveBeenCalledTimes(1);
        deps.service.onModuleDestroy();
        jest.useRealTimers();
      }
    },
  );

  test.each([
    [
      'telegram',
      'id',
      'Dokumen masih diproses di latar belakang. Periksa statusnya di perpustakaan file sebelum mengunggah ulang.',
    ],
    [
      'whatsapp',
      'en',
      'Your document is still processing in the background. Check its status in your file library before uploading it again.',
    ],
  ] as const)(
    '%s reports a pending document in %s without marking processing failed',
    async (provider, locale, expected) => {
      jest.useFakeTimers();
      const deps = setup();
      const currentUser = { ...user, locale };
      jest.mocked(deps.users.findById).mockResolvedValue(currentUser);
      const send = jest
        .fn<ChannelTurnAdapter['send']>()
        .mockResolvedValue(undefined);

      const inbound = { ...baseMessage, provider, kind: 'document' as const };
      const batch: ClaimedChannelTurns = {
        channelConversationId: 'channel-1',
        conversationId: deps.conversation.id,
        userId: user.id,
        externalIdentityId: 'identity-1',
        provider,
        turns: [
          {
            id: 'turn-1',
            channelConversationId: 'channel-1',
            providerMessageId: inbound.providerMessageId,
            message: { message: inbound },
            status: 'processing',
            availableAt: new Date(),
            processingStartedAt: new Date(),
            cancellationRequestedAt: null,
          },
        ],
      };

      jest
        .mocked(deps.conversations.claimChannelTurns)
        .mockResolvedValueOnce(batch)
        .mockResolvedValue(null);
      jest
        .mocked(deps.conversations.findRecoverableChannelConversationIds)
        .mockResolvedValue(['channel-1']);
      await deps.service.registerAdapter(provider, {
        prepare: () =>
          Promise.reject(new DocumentProcessingPendingError('document-1')),
        send,
      });
      await jest.runAllTimersAsync();
      expect(send).toHaveBeenCalledWith(
        currentUser,
        'identity-1',
        inbound,
        expected,
      );
      expect(deps.conversations.failChannelTurns).not.toHaveBeenCalled();
      expect(deps.conversations.completeChannelTurns).toHaveBeenCalledWith(
        ['turn-1'],
        expect.any(Date),
      );
      expect(deps.assistant.sendAndWait).not.toHaveBeenCalled();
      deps.service.onModuleDestroy();
    },
  );
});
