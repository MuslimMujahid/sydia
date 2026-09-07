import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent } from 'node:https';
import { Bot, GrammyError, HttpError, type Context } from 'grammy';
import type { OutboundMessageAdapter } from '../../shared/messaging';
import {
  TelegramInboundAdapter,
  TelegramOutboundAdapter,
} from './telegram.adapter';

export type TelegramInboundHandler = (ctx: Context) => Promise<void>;

@Injectable()
export class TelegramGatewayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramGatewayService.name);
  private readonly bot: Bot | null;
  private readonly inboundAdapter = new TelegramInboundAdapter();
  private outboundAdapter: OutboundMessageAdapter | null = null;
  private handler: TelegramInboundHandler | null = null;
  private botUsername: string | null = null;

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
  }

  setInboundHandler(handler: TelegramInboundHandler): void {
    this.handler = handler;
  }

  isAvailable(): boolean {
    return this.bot !== null;
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

  onModuleInit(): void {
    const bot = this.bot;
    if (!bot) return;
    this.outboundAdapter = new TelegramOutboundAdapter(bot.api);
    bot.on('message', async (ctx) => {
      if (this.handler) await this.handler(ctx);
    });
    bot.catch((error) => {
      const cause = error.error;
      if (cause instanceof GrammyError)
        this.logger.error(`Telegram API error: ${cause.description}`);
      else if (cause instanceof HttpError)
        this.logger.error(`Telegram network error: ${String(cause.error)}`);
      else this.logger.error(`Telegram update error: ${String(cause)}`);
    });
    void bot
      .start({
        allowed_updates: ['message'],
        onStart: ({ username }) => {
          this.botUsername = username;
          this.logger.log(`Telegram bot @${username} connected`);
        },
      })
      .catch((error: unknown) =>
        this.logger.error(`Telegram bot startup failed: ${String(error)}`),
      );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bot?.isRunning()) await this.bot.stop();
  }
}
