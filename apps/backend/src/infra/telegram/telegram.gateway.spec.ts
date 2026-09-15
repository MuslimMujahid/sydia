import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { GrammyError, type Context, HttpError } from 'grammy';
import { TelegramGatewayService } from './telegram.gateway';

// Captured before any `useFakeTimers()` so awaits still reach the real event
// loop (lock handling performs real filesystem I/O).
const nextLoopTick = setImmediate;

const OWNED_ELSEWHERE_NOTICE =
  'The Telegram bot is connected in another Sydia process on this host.';

const BACKOFF_PROBE_MS = 400_000;

interface PollingStartOptions {
  onStart?: (info: { username: string }) => void;
}

interface FakeBot {
  on: jest.Mock;
  catch: jest.Mock;
  api: Record<string, never>;
  start: jest.Mock<(options?: PollingStartOptions) => Promise<void>>;
  stop: jest.Mock<() => Promise<void>>;
  isRunning: jest.Mock<() => boolean>;
}

async function flushIo(): Promise<void> {
  for (let tick = 0; tick < 50; tick += 1)
    await new Promise<void>((resolve) => nextLoopTick(resolve));
}

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    BACKEND_TELEGRAM_BOT_TOKEN: 'test-token',
    BACKEND_TELEGRAM_RUNTIME_ENABLED: true,
    ...overrides,
  };

  return {
    get: jest.fn((key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
    ),
  } as unknown as ConfigService;
}

function makeGateway(overrides: Record<string, unknown> = {}): {
  gateway: TelegramGatewayService;
  bot: FakeBot;
} {
  const gateway = new TelegramGatewayService(makeConfig(overrides));
  let running = false;
  const bot: FakeBot = {
    on: jest.fn(),
    catch: jest.fn(),
    api: {},
    // Long polling keeps `start()` pending until the bot is stopped.
    start: jest.fn<(options?: PollingStartOptions) => Promise<void>>(
      async (options) => {
        options?.onStart?.({ username: 'sydia_bot' });
        running = true;
        await new Promise<void>(() => undefined);
      },
    ),
    stop: jest.fn<() => Promise<void>>(() => {
      running = false;

      return Promise.resolve();
    }),
    isRunning: jest.fn(() => running),
  };

  Object.assign(gateway, { bot });

  return { gateway, bot };
}

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

describe('TelegramGatewayService polling ownership', () => {
  it('remains a no-op without a token: no lock file, no notice, unavailable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sydia-telegram-lock-'));
    const lockPath = join(directory, 'runtime');
    const gateway = new TelegramGatewayService(
      makeConfig({
        BACKEND_TELEGRAM_BOT_TOKEN: '',
        BACKEND_TELEGRAM_LOCK_PATH: lockPath,
      }),
    );

    try {
      await gateway.onModuleInit();

      expect(gateway.isAvailable()).toBe(false);
      expect(gateway.getRuntimeNotice()).toBeNull();
      await expect(
        readFile(`${lockPath}.owner.lock`, 'utf8'),
      ).rejects.toThrow();
    } finally {
      await gateway.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('refuses ownership and reports a notice when a live process holds the lock', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sydia-telegram-lock-'));
    const lockPath = join(directory, 'session');
    const first = makeGateway({ BACKEND_TELEGRAM_LOCK_PATH: lockPath });
    const second = makeGateway({ BACKEND_TELEGRAM_LOCK_PATH: lockPath });

    try {
      await first.gateway.onModuleInit();
      await flushIo();
      await second.gateway.onModuleInit();
      await flushIo();

      expect(first.gateway.isAvailable()).toBe(true);
      expect(first.gateway.getRuntimeNotice()).toBeNull();
      expect(second.gateway.isAvailable()).toBe(false);
      expect(second.gateway.getRuntimeNotice()).toBe(OWNED_ELSEWHERE_NOTICE);
      expect(second.bot.start).not.toHaveBeenCalled();
      expect(await readFile(`${lockPath}.owner.lock`, 'utf8')).toBe(
        String(process.pid),
      );
    } finally {
      await first.gateway.onModuleDestroy();
      await second.gateway.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('takes over a stale lock whose owner process is dead', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sydia-telegram-lock-'));
    const lockPath = join(directory, 'session');
    const exited = spawnSync(process.execPath, ['-e', '']);
    const deadPid = exited.pid ?? 0;

    expect(deadPid).toBeGreaterThan(0);
    expect(() => process.kill(deadPid, 0)).toThrow();
    await writeFile(`${lockPath}.owner.lock`, String(deadPid));

    const { gateway, bot } = makeGateway({
      BACKEND_TELEGRAM_LOCK_PATH: lockPath,
    });

    try {
      await gateway.onModuleInit();
      await flushIo();

      expect(bot.start).toHaveBeenCalledTimes(1);
      expect(gateway.isAvailable()).toBe(true);
      expect(gateway.getRuntimeNotice()).toBeNull();
      expect(await readFile(`${lockPath}.owner.lock`, 'utf8')).toBe(
        String(process.pid),
      );
    } finally {
      await gateway.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('releases the lock on destroy so the next process can poll', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sydia-telegram-lock-'));
    const lockPath = join(directory, 'session');
    const first = makeGateway({ BACKEND_TELEGRAM_LOCK_PATH: lockPath });
    const second = makeGateway({ BACKEND_TELEGRAM_LOCK_PATH: lockPath });

    try {
      await first.gateway.onModuleInit();
      await flushIo();
      await first.gateway.onModuleDestroy();

      await second.gateway.onModuleInit();
      await flushIo();

      expect(second.gateway.isAvailable()).toBe(true);
      expect(second.gateway.getRuntimeNotice()).toBeNull();
      expect(second.bot.start).toHaveBeenCalledTimes(1);
      expect(await readFile(`${lockPath}.owner.lock`, 'utf8')).toBe(
        String(process.pid),
      );
    } finally {
      await first.gateway.onModuleDestroy();
      await second.gateway.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reports the 409 conflict and resumes polling on the scheduled retry', async () => {
    jest.useFakeTimers();
    const directory = await mkdtemp(join(tmpdir(), 'sydia-telegram-lock-'));
    const { gateway, bot } = makeGateway({
      BACKEND_TELEGRAM_LOCK_PATH: join(directory, 'session'),
    });

    bot.start
      .mockRejectedValueOnce(
        new GrammyError(
          "Call to 'getUpdates' failed!",
          {
            ok: false,
            error_code: 409,
            description: 'Conflict: terminated by other getUpdates request',
          },
          'getUpdates',
          {},
        ),
      )
      .mockImplementationOnce(async (options) => {
        options?.onStart?.({ username: 'sydia_bot' });
        await new Promise<void>(() => undefined);
      });

    try {
      await gateway.onModuleInit();
      await flushIo();

      expect(gateway.isAvailable()).toBe(false);
      expect(gateway.getRuntimeNotice()).toContain('code=409');
      expect(gateway.getRuntimeNotice()).toContain(
        'terminated by other getUpdates request',
      );

      await jest.advanceTimersByTimeAsync(5_000);
      await flushIo();

      expect(bot.start).toHaveBeenCalledTimes(2);
      expect(gateway.isAvailable()).toBe(true);
      expect(gateway.getRuntimeNotice()).toBeNull();
    } finally {
      await gateway.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
      jest.useRealTimers();
    }
  });

  it('never restarts polling after the module is destroyed', async () => {
    jest.useFakeTimers();
    const directory = await mkdtemp(join(tmpdir(), 'sydia-telegram-lock-'));
    const { gateway, bot } = makeGateway({
      BACKEND_TELEGRAM_LOCK_PATH: join(directory, 'session'),
    });

    bot.start.mockRejectedValueOnce(new Error('socket hang up'));

    try {
      await gateway.onModuleInit();
      await flushIo();

      expect(gateway.isAvailable()).toBe(false);
      expect(gateway.getRuntimeNotice()).toContain('socket hang up');

      await gateway.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(BACKOFF_PROBE_MS);

      expect(bot.start).toHaveBeenCalledTimes(1);
      expect(gateway.isAvailable()).toBe(false);
    } finally {
      await gateway.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
      jest.useRealTimers();
    }
  });

  it('releases the lock even when stopping the bot fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sydia-telegram-lock-'));
    const lockPath = join(directory, 'session');
    const first = makeGateway({ BACKEND_TELEGRAM_LOCK_PATH: lockPath });
    const second = makeGateway({ BACKEND_TELEGRAM_LOCK_PATH: lockPath });

    try {
      await first.gateway.onModuleInit();
      await flushIo();
      expect(first.gateway.isAvailable()).toBe(true);

      // `stop()` confirms the offset with a final `getUpdates`, so it rejects
      // when Telegram is unreachable. Destroy must still free the lock.
      first.bot.stop.mockRejectedValueOnce(new Error('Unauthorized'));

      await expect(first.gateway.onModuleDestroy()).resolves.toBeUndefined();
      await expect(
        readFile(`${lockPath}.owner.lock`, 'utf8'),
      ).rejects.toThrow();

      first.bot.isRunning.mockReturnValue(false);
      await second.gateway.onModuleInit();
      await flushIo();

      expect(second.gateway.isAvailable()).toBe(true);
      expect(second.gateway.getRuntimeNotice()).toBeNull();
    } finally {
      await first.gateway.onModuleDestroy();
      await second.gateway.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
