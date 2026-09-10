import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { HttpError, type Context } from 'grammy';
import { TelegramGatewayService } from './telegram.gateway';

describe('TelegramGatewayService inbound feedback', () => {
  it('uses the retrying scoped transport before dispatching inbound work', async () => {
    const gateway = new TelegramGatewayService({
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService);

    const events: string[] = [];
    const sendTyping = jest
      .spyOn(gateway, 'sendTyping')
      .mockImplementation(() => {
        events.push('typing');

        return Promise.resolve(true);
      });

    const ctx = {
      chatId: 123,
      businessConnectionId: 'business-1',
      msg: { message_thread_id: 8 },
    } as unknown as Context;

    gateway.setInboundHandler(() => {
      events.push('handler');

      return Promise.resolve();
    });

    await gateway.handle(ctx);

    expect(sendTyping).toHaveBeenCalledWith('123', {
      businessConnectionId: 'business-1',
      messageThreadId: 8,
    });
    expect(events).toEqual(['typing', 'handler']);
  });

  it('retries transient Telegram transport failures', async () => {
    jest.useFakeTimers();
    const gateway = new TelegramGatewayService({
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService);

    const sendTyping = jest
      .fn<() => Promise<true>>()
      .mockRejectedValueOnce(
        new HttpError('sendChatAction failed', new Error('socket reset')),
      )
      .mockRejectedValueOnce(
        new HttpError('sendChatAction failed', new Error('socket reset')),
      )
      .mockResolvedValue(true);

    Object.assign(gateway, { outboundAdapter: { sendTyping } });
    const result = gateway.sendTyping('123');

    await jest.advanceTimersByTimeAsync(750);
    await expect(result).resolves.toBe(true);
    expect(sendTyping).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });
});
