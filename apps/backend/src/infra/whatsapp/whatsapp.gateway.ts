import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FileHandle } from 'node:fs/promises';
import { open, readFile, unlink } from 'node:fs/promises';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@whatsmeow-node/whatsmeow-node';
import { EventEmitter } from 'node:events';
import {
  WHATSAPP_REPOSITORY,
  type IWhatsAppRepository,
} from '../../database/interfaces';
import { normalizeInboundEvent } from './whatsapp.adapter';
import type {
  NormalizedInboundMessage,
  WhatsAppClient,
  WhatsAppClientFactory,
  WhatsAppGatewayStatus,
} from './whatsapp.types';
import { WHATSAPP_CLIENT_FACTORY } from './whatsapp.types';

export type GatewaySnapshot = {
  status: WhatsAppGatewayStatus;
  registrationReady: boolean;
  profileReady: boolean;
  sendingPaused: boolean;
  enforcementCode: string | null;
  enforcementReason: string | null;
  recoveryReason: string | null;
  lastConnectedAt: Date | null;
  lastEventAt: Date | null;
};

const ENFORCEMENT_CODES: Record<string, true> = {
  '401': true,
  BULK_MESSAGING: true,
  REACHOUT_TIMELIMIT: true,
  TEMPORARY_BAN: true,
};

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = [1_000, 2_000, 4_000, 8_000, 16_000];

type GatewayEvents = {
  inbound: (message: NormalizedInboundMessage) => void;
  receipt: (receipt: {
    type: string;
    chat: string;
    sender: string;
    isGroup: boolean;
    ids: string[];
    timestamp: number;
  }) => void;
};

@Injectable()
export class WhatsAppGatewayService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WhatsAppGatewayService.name);
  private readonly store: string;
  private jid: string | undefined;
  private client: WhatsAppClient | null = null;
  private snapshot: GatewaySnapshot = {
    status: 'disconnected',
    registrationReady: false,
    profileReady: false,
    sendingPaused: false,
    enforcementCode: null,
    enforcementReason: null,
    recoveryReason: null,
    lastConnectedAt: null,
    lastEventAt: null,
  };

  private stopped = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private lock: FileHandle | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(WHATSAPP_REPOSITORY)
    private readonly repository: IWhatsAppRepository,
    @Inject(WHATSAPP_CLIENT_FACTORY)
    private readonly factory: WhatsAppClientFactory = (options) =>
      createClient(options),
  ) {
    super();
    this.store = config.get<string>(
      'BACKEND_WHATSAPP_STORE_PATH',
      '.data/whatsapp',
    );
    this.ensureGoResolverForCompanion();
  }

  private companionBinaryPath(): string | undefined {
    const configured = this.config.get<string>('BACKEND_WHATSAPP_BINARY_PATH');
    if (configured) return configured;

    const local = resolve(process.cwd(), 'bin', 'whatsmeow-node');

    return existsSync(local) ? local : undefined;
  }

  private ensureGoResolverForCompanion(): void {
    const current = process.env.GODEBUG;
    const options = current
      ? current.split(',').filter((option) => !option.startsWith('netdns='))
      : [];

    if (!options.includes('netdns=go')) options.push('netdns=go');
    process.env.GODEBUG = options.join(',');
  }

  async onModuleInit(): Promise<void> {
    if (
      this.config.get<boolean>('BACKEND_WHATSAPP_RUNTIME_ENABLED', true) !==
      true
    )
      return;
    if (!(await this.acquireOwnership())) return;
    const state = await this.repository.getGatewayState();
    if (state)
      this.snapshot = {
        status: (state.status as WhatsAppGatewayStatus) ?? 'disconnected',
        registrationReady: state.registrationReady,
        profileReady: state.profileReady,
        sendingPaused: state.sendingPaused,
        enforcementCode: state.enforcementCode,
        enforcementReason: state.enforcementReason,
        recoveryReason: state.recoveryReason,
        lastConnectedAt: state.lastConnectedAt,
        lastEventAt: state.lastEventAt,
      };
    await this.initialize();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.reconnectTimer ?? undefined);
    const client = this.client;
    this.client = null;
    this.generation += 1;

    try {
      if (client) {
        try {
          await client.disconnect();
        } finally {
          client.close();
        }
      }
    } finally {
      await this.releaseOwnership();
    }
  }

  getStatus(): GatewaySnapshot {
    return { ...this.snapshot };
  }

  getJid(): string | undefined {
    return this.jid;
  }

  getClient(): WhatsAppClient | null {
    return this.client;
  }

  async requestPairCode(phone: string): Promise<string> {
    if (this.snapshot.sendingPaused || this.snapshot.status === 'enforced')
      throw new Error('WhatsApp pairing is paused by enforcement.');
    if (!this.client) await this.initialize();
    if (!this.client) throw new Error('WhatsApp client is unavailable.');
    this.snapshot.status = 'connecting';
    await this.persist({ status: 'connecting', recoveryReason: null });

    try {
      if (!(await this.client.isConnected())) await this.client.connect();
      const code = await this.client.pairCode(phone);
      this.snapshot.status = 'awaiting_pair';
      await this.persist({ status: 'awaiting_pair' });

      return code;
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async sendText(jid: string, content: string) {
    if (
      !this.client ||
      this.snapshot.sendingPaused ||
      this.snapshot.status !== 'connected'
    )
      throw new Error(
        'WhatsApp sending is paused until the companion session is healthy.',
      );

    return this.client.sendMessage(jid, { conversation: content });
  }

  async markRead(ids: string[], chat: string, sender?: string): Promise<void> {
    if (!this.client) throw new Error('WhatsApp client is unavailable.');
    await this.client.markRead(ids, chat, sender);
  }

  async presence(chat: string, state: 'composing' | 'paused'): Promise<void> {
    if (!this.client) throw new Error('WhatsApp client is unavailable.');
    await this.client.sendChatPresence(chat, state);
  }

  async download(message: Record<string, unknown>): Promise<string> {
    if (!this.client) throw new Error('WhatsApp client is unavailable.');

    return this.client.downloadAny(message);
  }

  on<K extends keyof GatewayEvents>(
    event: K,
    listener: GatewayEvents[K],
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  private async initialize(): Promise<void> {
    if (this.stopped || this.client) return;
    const goDebug = (process.env.GODEBUG ?? '')
      .split(',')
      .filter((setting) => setting !== '' && !setting.startsWith('netdns='));

    process.env.GODEBUG = [...goDebug, 'netdns=go'].join(',');
    this.snapshot.status = 'connecting';
    await this.persist({ status: 'connecting', lastEventAt: new Date() });
    const client = this.factory({
      store: this.store,
      binaryPath: this.companionBinaryPath(),
      commandTimeout: this.config.get<number>(
        'BACKEND_WHATSAPP_COMMAND_TIMEOUT',
        30_000,
      ),
    });

    const generation = ++this.generation;
    this.client = client;
    this.bindEvents(client, generation);

    try {
      const initialized = await client.init();
      if (generation !== this.generation || this.client !== client) return;
      this.jid = initialized.jid;
      this.snapshot.registrationReady = Boolean(initialized.jid);
      const loggedIn = await client.isLoggedIn();

      if (!loggedIn) {
        this.snapshot.status = 'awaiting_pair';
        this.snapshot.registrationReady = false;
        await this.persist({
          status: 'awaiting_pair',
          registrationReady: false,
          recoveryReason: 'WhatsApp companion is not paired.',
        });

        return;
      }

      await client.connect();
    } catch (error) {
      if (generation === this.generation) {
        await this.handleError(error);
        await this.retireClient(client);
        this.scheduleReconnect();
      }
    }
  }

  private bindEvents(client: WhatsAppClient, generation: number): void {
    const current = (): boolean =>
      generation === this.generation && this.client === client;

    client.on('connected', (event) => {
      if (
        !current() ||
        this.snapshot.status === 'enforced' ||
        this.snapshot.sendingPaused
      )
        return;
      this.reconnectAttempt = 0;
      this.snapshot.status = 'connected';
      this.snapshot.registrationReady = true;
      this.snapshot.profileReady = true;
      this.snapshot.lastConnectedAt = new Date();
      void this.persist({
        status: 'connected',
        registrationReady: true,
        profileReady: true,
        lastConnectedAt: this.snapshot.lastConnectedAt,
        lastEventAt: new Date(),
      });
      this.logger.log(`WhatsApp companion connected as ${event.jid}`);
    });
    client.on('message', (event) => {
      if (!current()) return;
      const normalized = normalizeInboundEvent(event);
      this.snapshot.lastEventAt = new Date();
      void this.persist({ lastEventAt: this.snapshot.lastEventAt });
      if (!normalized.isFromMe) this.emit('inbound', normalized);
    });
    client.on('message:receipt', (receipt) => {
      if (current()) this.emit('receipt', receipt);
    });
    client.on('disconnected', () => {
      if (!current()) return;
      this.snapshot.status = 'disconnected';
      this.snapshot.recoveryReason = 'WhatsApp companion disconnected.';
      void this.persist({
        status: 'disconnected',
        recoveryReason: this.snapshot.recoveryReason,
        lastEventAt: new Date(),
      });
      void this.retireClient(client).then(() => this.scheduleReconnect());
    });
    client.on('logged_out', (event) => {
      if (!current()) return;
      this.snapshot.status = 'logged_out';
      this.snapshot.registrationReady = false;
      this.snapshot.sendingPaused = true;
      this.snapshot.recoveryReason = `WhatsApp companion logged out: ${event.reason}`;
      void this.persist({
        status: 'logged_out',
        registrationReady: false,
        sendingPaused: true,
        recoveryReason: this.snapshot.recoveryReason,
        lastEventAt: new Date(),
      });
      void this.retireClient(client);
    });
    client.on('stream_error', (event) => {
      if (current())
        void this.enforce(event.code, `WhatsApp stream error ${event.code}`);
    });
    client.on('temporary_ban', (event) => {
      if (current())
        void this.enforce(
          'TEMPORARY_BAN',
          `Temporary ban ${event.code} until ${event.expire}`,
        );
    });
    client.on('error', (error) => {
      if (current()) void this.handleError(error);
    });
    client.on('exit', (event) => {
      if (!current() || this.stopped || event.code === 0) return;
      void this.handleError(
        new Error(`WhatsApp companion exited (${event.code ?? 'unknown'})`),
      );
      void this.retireClient(client).then(() => this.scheduleReconnect());
    });
  }

  private async retireClient(client: WhatsAppClient): Promise<void> {
    if (this.client !== client) return;
    this.client = null;
    this.generation += 1;

    try {
      await client.disconnect();
    } catch {
      /* process may already be gone */
    }

    client.close();
  }

  private async enforce(code: string, reason: string): Promise<void> {
    if (!ENFORCEMENT_CODES[code] || this.snapshot.status === 'enforced') return;
    this.snapshot.status = 'enforced';
    this.snapshot.sendingPaused = true;
    this.snapshot.enforcementCode = code;
    this.snapshot.enforcementReason = reason;
    this.snapshot.recoveryReason =
      'Operator recovery is required before sending or pairing resumes.';
    await this.persist({
      status: 'enforced',
      sendingPaused: true,
      enforcementCode: code,
      enforcementReason: reason,
      recoveryReason: this.snapshot.recoveryReason,
      lastEventAt: new Date(),
    });
    const client = this.client;
    if (client) await this.retireClient(client);
  }

  private async handleError(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const match = /401|BULK_MESSAGING|REACHOUT_TIMELIMIT/i.exec(message);

    if (match) await this.enforce(match[0].toUpperCase(), message);
    else {
      this.snapshot.recoveryReason = message;
      await this.persist({ recoveryReason: message, lastEventAt: new Date() });
    }

    this.logger.warn(message);
  }

  private async acquireOwnership(): Promise<boolean> {
    const lockPath = `${this.store}.owner.lock`;

    const acquire = async (): Promise<boolean> => {
      try {
        this.lock = await open(lockPath, 'wx');
        await this.lock.writeFile(String(process.pid));

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

    this.snapshot.recoveryReason =
      'WhatsApp companion is active in another Sydia process.';
    this.logger.warn(this.snapshot.recoveryReason);

    return false;
  }

  private async releaseOwnership(): Promise<void> {
    const lock = this.lock;
    this.lock = null;
    if (!lock) return;
    await lock.close();
    await unlink(`${this.store}.owner.lock`).catch(() => undefined);
  }

  private scheduleReconnect(): void {
    if (
      this.stopped ||
      this.snapshot.sendingPaused ||
      this.snapshot.status === 'logged_out' ||
      this.snapshot.status === 'enforced' ||
      this.reconnectTimer ||
      this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS
    )
      return;
    const delay =
      RECONNECT_DELAY_MS[this.reconnectAttempt] ??
      RECONNECT_DELAY_MS[RECONNECT_DELAY_MS.length - 1];

    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.initialize();
    }, delay);
  }

  private async persist(input: Partial<GatewaySnapshot>): Promise<void> {
    try {
      await this.repository.updateGatewayState(input);
    } catch (error) {
      this.logger.warn(
        `Could not persist WhatsApp state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
