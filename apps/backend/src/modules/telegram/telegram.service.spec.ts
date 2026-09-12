import { jest } from '@jest/globals';
import type { User } from '../../database/entities';
import type {
  IAuditEventRepository,
  ITelegramRepository,
  IUserRepository,
} from '../../database/interfaces';
import type { TelegramGatewayService } from '../../infra/telegram';
import type { OpenRouterMediaService } from '../../infra/model-gateway';
import type { NormalizedInboundMessage } from '../../shared/messaging';
import type { DocumentService } from '../documents/document.service';
import type {
  ChannelTurnAdapter,
  MessagingHandlerService,
} from '../messaging/messaging-handler.service';
import { TelegramService } from './telegram.service';

const message: NormalizedInboundMessage = {
  provider: 'telegram',
  providerMessageId: '123:42',
  senderExternalId: '123',
  chatExternalId: '123',
  isGroup: false,
  isFromMe: false,
  receivedAt: new Date('2026-09-10T12:00:00.000Z'),
  text: '',
  kind: 'document',
  mediaMessage: { fileId: 'file-1' },
  raw: { businessConnectionId: 'business-1', messageThreadId: 8 },
};

function setup() {
  let adapter: ChannelTurnAdapter | undefined;
  const outbound = {
    send: jest.fn(() => Promise.resolve({ providerMessageId: '123:43' })),
    sendFile: jest.fn(() => Promise.resolve({ providerMessageId: '123:44' })),
  };

  const gateway = {
    setInboundHandler: jest.fn(),
    getOutboundAdapter: jest.fn(() => outbound),
    sendTyping: jest.fn(() => Promise.resolve()),
  } as unknown as TelegramGatewayService;

  const messages = {
    registerAdapter: jest.fn((_provider: string, value: ChannelTurnAdapter) => {
      adapter = value;

      return Promise.resolve();
    }),
  } as unknown as MessagingHandlerService;

  const service = new TelegramService(
    gateway,
    {} as ITelegramRepository,
    {} as IUserRepository,
    {} as IAuditEventRepository,
    messages,
    {} as DocumentService,
    {} as OpenRouterMediaService,
  );

  return {
    adapter: () => {
      if (!adapter) throw new Error('Telegram adapter was not registered');

      return adapter;
    },
    gateway,
    outbound,
    service,
  };
}

describe('TelegramService processing feedback', () => {
  afterEach(() => jest.useRealTimers());

  it('acknowledges media immediately and keeps typing while processing', async () => {
    jest.useFakeTimers();
    const { adapter, gateway, outbound, service } = setup();
    await service.onModuleInit();

    await adapter().queued?.(message);

    expect(outbound.send).toHaveBeenCalledTimes(1);
    expect(outbound.send).toHaveBeenCalledWith({
      recipientExternalId: '123',
      content: '📂 File sedang diproses ...',
      replyToProviderMessageId: '123:42',
    });
    expect(gateway.sendTyping).toHaveBeenCalledWith('123', {
      businessConnectionId: 'business-1',
      messageThreadId: 8,
    });

    const stop = await adapter().beginProcessing?.(
      [message, { ...message, providerMessageId: '123:43' }],
      new AbortController().signal,
    );

    expect(outbound.send).toHaveBeenCalledTimes(1);
    expect(gateway.sendTyping).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(4_000);
    expect(gateway.sendTyping).toHaveBeenCalledTimes(3);

    stop?.();
    await jest.advanceTimersByTimeAsync(8_000);
    expect(gateway.sendTyping).toHaveBeenCalledTimes(3);
  });

  it('starts typing immediately without acknowledging ordinary text', async () => {
    jest.useFakeTimers();
    const { adapter, gateway, outbound, service } = setup();
    await service.onModuleInit();
    const text = {
      ...message,
      kind: 'text' as const,
      mediaMessage: undefined,
      text: 'Halo',
    };

    await adapter().queued?.(text);

    expect(outbound.send).not.toHaveBeenCalled();
    expect(gateway.sendTyping).toHaveBeenCalledWith('123', {
      businessConnectionId: 'business-1',
      messageThreadId: 8,
    });
  });

  it.each([
    ['en', '📂 Sending file ...'],
    ['id', '📂 Mengirim file ...'],
  ])(
    'acknowledges in %s before sending a confirmed file',
    async (locale, acknowledgement) => {
      const { adapter, outbound, service } = setup();
      await service.onModuleInit();
      const file = {
        filename: 'invoice.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('invoice'),
      };

      await expect(
        adapter().sendFile?.({ locale } as User, message, file),
      ).resolves.toEqual({ providerMessageId: '123:44' });
      expect(outbound.send).toHaveBeenCalledWith({
        recipientExternalId: '123',
        content: acknowledgement,
        replyToProviderMessageId: '123:42',
      });
      expect(outbound.sendFile).toHaveBeenCalledWith({
        recipientExternalId: '123',
        replyToProviderMessageId: '123:42',
        businessConnectionId: 'business-1',
        messageThreadId: 8,
        ...file,
      });
      expect(outbound.send.mock.invocationCallOrder[0]).toBeLessThan(
        outbound.sendFile.mock.invocationCallOrder[0]!,
      );
    },
  );
});
