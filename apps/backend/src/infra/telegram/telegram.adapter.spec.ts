import { jest } from '@jest/globals';
import { Api } from 'grammy';
import type { Context } from 'grammy';
import {
  TelegramInboundAdapter,
  TelegramOutboundAdapter,
} from './telegram.adapter';

describe('Telegram message adapters', () => {
  it.each([
    [
      'text',
      { text: 'Ringkasan harian: Kirim laporan' },
      'Ringkasan harian: Kirim laporan',
    ],
    ['caption', { caption: 'Kirim laporan' }, 'Kirim laporan'],
    ['non-text message', {}, ''],
  ])(
    'preserves the referenced %s when replying in Telegram',
    (_label, referenced, text) => {
      const context = {
        me: { id: 99 },
        update: { update_id: 7 },
        from: { id: 123 },
        msg: {
          message_id: 42,
          date: 1_780_000_000,
          chat: { id: 123, type: 'private' },
          text: 'Tandai tugas ini selesai',
          quote: { text: 'Kirim laporan', position: 0 },
          reply_to_message: { message_id: 40, from: { id: 99 }, ...referenced },
        },
      } as unknown as Context;

      expect(new TelegramInboundAdapter().normalize(context)).toEqual(
        expect.objectContaining({
          text: 'Tandai tugas ini selesai',
          replyTo: {
            providerMessageId: '123:40',
            text,
            isFromMe: true,
            quoteText: 'Kirim laporan',
          },
        }),
      );
    },
  );

  it('normalizes a private text message', () => {
    const context = {
      me: { id: 99 },
      update: { update_id: 7 },
      businessConnectionId: 'business-1',
      msg: {
        message_id: 42,
        message_thread_id: 8,
        date: 1_780_000_000,
        chat: { id: 123, type: 'private' },
        text: 'hello',
      },
      from: { id: 123, first_name: 'Siti', is_bot: false },
    } as unknown as Context;

    const normalized = new TelegramInboundAdapter().normalize(context);

    expect(normalized).toEqual(
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
    expect(normalized?.raw).toEqual(
      expect.objectContaining({
        businessConnectionId: 'business-1',
        messageThreadId: 8,
      }),
    );
  });

  it('confirms typing through the same Bot API client', async () => {
    const sendChatAction = jest.fn(() => Promise.resolve(true as const));
    const adapter = new TelegramOutboundAdapter({
      sendChatAction,
    } as unknown as Api);

    await expect(
      adapter.sendTyping('123', {
        businessConnectionId: 'business-1',
        messageThreadId: 8,
      }),
    ).resolves.toBe(true);
    expect(sendChatAction).toHaveBeenCalledWith('123', 'typing', {
      business_connection_id: 'business-1',
      message_thread_id: 8,
    });
  });

  it('sends rich Markdown without reply parameters and returns a stable provider id', async () => {
    const sendRichMessage = jest.fn(() =>
      Promise.resolve({ chat: { id: 123 }, message_id: 43 }),
    );

    const adapter = new TelegramOutboundAdapter({
      sendRichMessage,
    } as unknown as Api);

    await expect(
      adapter.send({
        recipientExternalId: '123',
        content: '**Ready**\n\n- First\n  - Nested\n- Second',
        replyToProviderMessageId: '123:42',
      }),
    ).resolves.toEqual({ providerMessageId: '123:43' });
    expect(sendRichMessage).toHaveBeenCalledWith('123', {
      markdown: '**Ready**\n\n- First\n  - Nested\n- Second',
    });
  });

  it('uploads a document buffer without Telegram reply parameters and returns a stable provider id', async () => {
    const sendDocument = jest.fn(() =>
      Promise.resolve({ chat: { id: 123 }, message_id: 44 }),
    );

    const adapter = new TelegramOutboundAdapter({
      sendDocument,
    } as unknown as Api);

    await expect(
      adapter.sendFile({
        recipientExternalId: '123',
        filename: 'invoice.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('invoice'),
        replyToProviderMessageId: '123:42',
        businessConnectionId: 'business-1',
        messageThreadId: 8,
      }),
    ).resolves.toEqual({ providerMessageId: '123:44' });
    expect(sendDocument).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({ filename: 'invoice.pdf' }),
      {
        caption: undefined,
        business_connection_id: 'business-1',
        message_thread_id: 8,
      },
    );
  });

  it('passes API rejection to the delivery handler without sending a duplicate plain message', async () => {
    const error = new Error('Telegram rejected rich message');
    const sendRichMessage = jest.fn(() => Promise.reject(error));
    const sendMessage = jest.fn();
    const adapter = new TelegramOutboundAdapter({
      sendRichMessage,
      sendMessage,
    } as unknown as Api);

    await expect(
      adapter.send({ recipientExternalId: '123', content: '- Item' }),
    ).rejects.toBe(error);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
