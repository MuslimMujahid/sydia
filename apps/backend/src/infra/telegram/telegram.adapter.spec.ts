import { jest } from '@jest/globals';
import { Api } from 'grammy';
import type { Context } from 'grammy';
import {
  TelegramInboundAdapter,
  TelegramOutboundAdapter,
} from './telegram.adapter';

describe('Telegram message adapters', () => {
  it('normalizes a private text message', () => {
    const context = {
      me: { id: 99 },
      update: { update_id: 7 },
      msg: {
        message_id: 42,
        date: 1_780_000_000,
        chat: { id: 123, type: 'private' },
        text: 'hello',
      },
      from: { id: 123, first_name: 'Siti', is_bot: false },
    } as unknown as Context;

    expect(new TelegramInboundAdapter().normalize(context)).toEqual(
      expect.objectContaining({
        provider: 'telegram',
        providerMessageId: '123:42',
        senderExternalId: '123',
        chatExternalId: '123',
        isGroup: false,
        isFromMe: false,
        kind: 'text',
        text: 'hello',
      }),
    );
  });

  it('sends replies through the Bot API and returns a stable provider id', async () => {
    const sendMessage = jest.fn(() =>
      Promise.resolve({ chat: { id: 123 }, message_id: 43 }),
    );

    const adapter = new TelegramOutboundAdapter({
      sendMessage,
    } as unknown as Api);

    await expect(
      adapter.send({
        recipientExternalId: '123',
        content: 'reply',
        replyToProviderMessageId: '123:42',
      }),
    ).resolves.toEqual({ providerMessageId: '123:43' });
    expect(sendMessage).toHaveBeenCalledWith('123', 'reply', {
      reply_parameters: { message_id: 42 },
    });
  });
});
