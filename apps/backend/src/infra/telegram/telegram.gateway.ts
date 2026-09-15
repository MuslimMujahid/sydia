import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FileHandle } from 'node:fs/promises';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Agent } from 'node:https';
import { Bot, GrammyError, HttpError, type Context } from 'grammy';
import type { OutboundMessageAdapter } from '../../shared/messaging';
import {
  TelegramInboundAdapter,
  TelegramOutboundAdapter,
} from './telegram.adapter';

export type TelegramInboundHandler = (ctx: Context) => Promise<void>;

// Telegram delivers updates to a single `getUpdates` consumer, so only one
// Sydia process per host may poll a given bot token. The owner lock below
// enforces that; the losing processes keep serving the API but advertise
// themselves as unavailable instead of handing out link tokens they can never
// consume. Restarts are bounded by an exponential backoff because a 409 is a
// configuration problem, not a transient one.
const INITIAL_RESTART_DELAY_MS = 5_000;
const MAX_RESTART_DELAY_MS = 300_000;

@Injectable()
export class TelegramGatewayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramGatewayService.name);
  private readonly bot: Bot | null;
  private readonly inboundAdapter = new TelegramInboundAdapter();
  private readonly lockPath: string;
  private outboundAdapter: TelegramOutboundAdapter | null = null;
  private handler: TelegramInboundHandler | null = null;
  private botUsername: string | null = null;
  private lock: FileHandle | null = null;
  private polling = false;
  private stopped = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private restartDelayMs = INITIAL_RESTART_DELAY_MS;
  private runtimeNotice: string | null = null;

  constructor(config: ConfigService) {
    const token = config.get<string>('BACKEND_TELEGRAM_BOT_TOKEN', '');
    const enabled =
      config.get<boolean>('BACKEND_TELEGRAM_RUNTIME_ENABLED', true) === true &&
      token !== '';

    this.bot = enabled
      ? new Bot(token, {
          client: { baseFetchConfig: { agent: new Agent({ family: 4 }) } },
        })
      : null;
    this.botUsername =
      config.get<string>('BACKEND_TELEGRAM_BOT_USERNAME', '') || null;
    this.lockPath = config.get<string>(
      'BACKEND_TELEGRAM_LOCK_PATH',
      '.data/telegram',
    );
  }

  setInboundHandler(handler: TelegramInboundHandler): void {
    this.handler = handler;
  }

  async handle(ctx: Context): Promise<void> {
    if (!this.handler) return;
    const chatId = ctx.chatId;

    if (chatId !== undefined)
      await this.sendTyping(String(chatId), {
        businessConnectionId: ctx.businessConnectionId,
        messageThreadId: ctx.msg?.message_thread_id,
      });

    await this.handler(ctx);
  }

  isAvailable(): boolean {
    return this.bot !== null && this.polling === true;
  }

  getRuntimeNotice(): string | null {
    return this.runtimeNotice;
  }

  getBotUsername(): string | null {
    return this.botUsername;
  }

  getInboundAdapter(): TelegramInboundAdapter {
    return this.inboundAdapter;
  }

  getOutboundAdapter(): OutboundMessageAdapter {
    if (!this.outboundAdapter)
      throw new Error('Telegram bot is not configured.');

    return this.outboundAdapter;
  }

  async sendTyping(
    chatExternalId: string,
    scope?: { businessConnectionId?: string; messageThreadId?: number },
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (!this.outboundAdapter || signal?.aborted) return false;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return (
          (await this.outboundAdapter.sendTyping(chatExternalId, scope)) ===
          true
        );
      } catch (error) {
        if (signal?.aborted) return false;
        const retry = error instanceof HttpError && attempt < 3;

        if (retry) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, attempt * 250),
          );

          continue;
        }

        const detail =
          error instanceof GrammyError
            ? `code=${error.error_code} description=${error.description} retryAfter=${error.parameters.retry_after ?? 'none'}`
            : error instanceof HttpError
              ? `transport=${
                  error.error instanceof Error
                    ? `${error.error.name}: ${error.error.message}; cause=${
                        error.error.cause instanceof Error
                          ? `${error.error.cause.name}: ${error.error.cause.message}`
                          : typeof error.error.cause === 'string'
                            ? error.error.cause
                            : error.error.cause === undefined
                              ? 'none'
                              : JSON.stringify(error.error.cause)
                      }`
                    : JSON.stringify(error.error)
                }`
              : String(error);

        this.logger.warn(
          `Telegram typing indicator failed after ${attempt} attempt(s): chat=${chatExternalId} ${detail}`,
        );

        return false;
      }
    }

    return false;
  }

  async download(fileId: string): Promise<Uint8Array> {
    if (!this.bot) throw new Error('Telegram bot is not configured.');
    const file = await this.bot.api.getFile(fileId);
    if (!file.file_path) throw new Error('Telegram file path is unavailable.');
    const response = await fetch(
      `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`,
    );

    if (!response.ok)
      throw new Error(`Telegram file download failed (${response.status}).`);

    return new Uint8Array(await response.arrayBuffer());
  }

  async onModuleInit(): Promise<void> {
    const bot = this.bot;
    if (!bot) return;
    this.outboundAdapter = new TelegramOutboundAdapter(bot.api);
    bot.on('message', (ctx) => this.handle(ctx));
    bot.catch((error) => {
      const cause = error.error;
      if (cause instanceof GrammyError)
        this.logger.error(`Telegram API error: ${cause.description}`);
      else if (cause instanceof HttpError)
        this.logger.error(`Telegram network error: ${String(cause.error)}`);
      else this.logger.error(`Telegram update error: ${String(cause)}`);
    });
    // Only inbound updates are exclusive, so a process that loses the lock
    // still sends outbound messages; it just cannot consume replies.
    if (!(await this.acquireOwnership())) return;
    void this.runPolling();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    this.polling = false;
    const bot = this.bot;

    if (bot?.isRunning()) {
      // `stop()` confirms the offset with one last `getUpdates`, which rejects
      // when that call fails (network outage, revoked token). The lock must be
      // released either way, or the next process can never take over polling.
      try {
        await bot.stop();
      } catch (error) {
        this.logger.warn(
          `Telegram polling shutdown failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await this.releaseOwnership();
  }

  // Long polling is supervised because grammY treats 401/409 as fatal for the
  // whole `start()` call: a losing poller would otherwise stay silent forever
  // while the API keeps advertising Telegram as available.
  private async runPolling(): Promise<void> {
    const bot = this.bot;
    if (!bot || this.stopped || !this.lock) return;

    try {
      await bot.start({
        allowed_updates: ['message'],
        onStart: ({ username }) => {
          if (this.stopped) return;
          this.polling = true;
          this.runtimeNotice = null;
          this.restartDelayMs = INITIAL_RESTART_DELAY_MS;
          this.botUsername = username;
          this.logger.log(`Telegram bot @${username} connected`);
        },
      });
      if (this.stopped) return;
      this.markPollingFailed(
        'Telegram polling stopped unexpectedly. Retrying shortly.',
      );
    } catch (error) {
      if (this.stopped) return;
      this.markPollingFailed(
        error instanceof GrammyError
          ? `Telegram rejected the connection (code=${error.error_code} description=${error.description}). Retrying shortly.`
          : `Telegram polling failed (${String(error)}). Retrying shortly.`,
      );
    }
  }

  private markPollingFailed(reason: string): void {
    this.polling = false;
    this.runtimeNotice = reason;
    this.logger.warn(reason);
    this.scheduleRestart();
  }

  private scheduleRestart(): void {
    if (this.stopped || this.restartTimer || !this.lock) return;

    const delay = this.restartDelayMs;
    this.restartDelayMs = Math.min(delay * 2, MAX_RESTART_DELAY_MS);
    this.logger.warn(`Retrying Telegram polling in ${delay}ms`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.runPolling();
    }, delay);
  }

  private async acquireOwnership(): Promise<boolean> {
    const lockPath = `${this.lockPath}.owner.lock`;
    await mkdir(dirname(lockPath), { recursive: true });

    const acquire = async (): Promise<boolean> => {
      try {
        const lock = await open(lockPath, 'wx');
        await lock.writeFile(String(process.pid));
        this.lock = lock;

        return true;
      } catch (error) {
        if (
          error === null ||
          typeof error !== 'object' ||
          !('code' in error) ||
          error.code !== 'EEXIST'
        ) {
          throw error;
        }

        return false;
      }
    };

    if (await acquire()) return true;

    let ownerIsAlive = false;

    try {
      const ownerPid = Number.parseInt(await readFile(lockPath, 'utf8'), 10);

      if (Number.isInteger(ownerPid)) {
        try {
          process.kill(ownerPid, 0);
          ownerIsAlive = true;
        } catch (error) {
          ownerIsAlive =
            error !== null &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'EPERM';
        }
      }
    } catch {
      // A missing or unreadable owner is stale and can be replaced below.
    }

    if (!ownerIsAlive) {
      await unlink(lockPath).catch(() => undefined);
      if (await acquire()) return true;
    }

    const reason =
      'The Telegram bot is connected in another Sydia process on this host.';

    this.runtimeNotice = reason;
    this.logger.warn(reason);

    return false;
  }

  private async releaseOwnership(): Promise<void> {
    const lock = this.lock;
    this.lock = null;
    if (!lock) return;
    await lock.close();
    await unlink(`${this.lockPath}.owner.lock`).catch(() => undefined);
  }
}
