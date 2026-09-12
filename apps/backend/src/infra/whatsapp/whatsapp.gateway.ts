import type { FileHandle } from 'node:fs/promises';
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'node:events';
import type {
  OutboundMessage,
  OutboundMessageAdapter,
  OutboundMessageResult,
} from '../../shared/messaging';
import {
  WHATSAPP_REPOSITORY,
  type IWhatsAppRepository,
} from '../../database/interfaces';
import { normalizeInboundEvent } from './whatsapp.adapter';
import type {
  GoWaWebhookEvent,
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

// Session hygiene (Part 1 #14-16) and the ban guardrails (Part 2 #9-10) live
// here. Any protocol-level warning matching ENFORCEMENT_CODES pauses sending
// and pairing (operator recovery required); never retry logins or relink QR
// codes while `enforced`. Reconnect attempts are deliberately bounded so the
// gateway never reconnects in a loop. Full rules: whatsapp.policy.ts.
const ENFORCEMENT_CODES: Record<string, true> = {
  '401': true,
  '463': true,
  BULK_MESSAGING: true,
  REACHOUT_TIMELIMIT: true,
  REACHOUT_TIMELOCK: true,
  TEMPORARY_BAN: true,
};

const ENFORCEMENT_PATTERN =
  /401|463|BULK_MESSAGING|REACHOUT_TIMELIMIT|REACHOUT_TIMELOCK|TEMPORARY_BAN|reach.?out|timelock/i;

const DEFAULT_POLL_MS = 15_000;

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
  implements OnModuleInit, OnModuleDestroy, OutboundMessageAdapter
{
  private readonly logger = new Logger(WhatsAppGatewayService.name);
  private readonly baseUrl: string;
  private readonly deviceId: string;
  private readonly timeoutMs: number;
  private readonly lockPath: string;
  private readonly pollMs: number;
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
  private generation = 0;
  private deviceEnsured = false;
  private lock: FileHandle | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(WHATSAPP_REPOSITORY)
    private readonly repository: IWhatsAppRepository,
    @Inject(WHATSAPP_CLIENT_FACTORY)
    private readonly factory: WhatsAppClientFactory,
  ) {
    super();
    this.baseUrl = config
      .get<string>('BACKEND_WHATSAPP_GOWA_URL', 'http://127.0.0.1:3001')
      .replace(/\/+$/, '');
    this.deviceId = config.get<string>(
      'BACKEND_WHATSAPP_GOWA_DEVICE_ID',
      'sydia',
    );
    this.timeoutMs = config.get<number>(
      'BACKEND_WHATSAPP_COMMAND_TIMEOUT',
      30_000,
    );
    this.lockPath = config.get<string>(
      'BACKEND_WHATSAPP_LOCK_PATH',
      '.data/whatsapp',
    );
    this.pollMs = config.get<number>(
      'BACKEND_WHATSAPP_STATUS_POLL_MS',
      DEFAULT_POLL_MS,
    );
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
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.client = null;
    this.generation += 1;
    await this.releaseOwnership();
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
      await this.client.ensureDevice(this.deviceId);
      const code = await this.client.pairCode(phone);
      this.snapshot.status = 'awaiting_pair';
      await this.persist({ status: 'awaiting_pair' });

      return code;
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async send(input: OutboundMessage): Promise<OutboundMessageResult> {
    const result = await this.sendText(
      input.recipientExternalId,
      input.content,
    );

    return { providerMessageId: result.id };
  }

  async sendText(jid: string, content: string): Promise<{ id: string }> {
    if (
      !this.client ||
      this.snapshot.sendingPaused ||
      this.snapshot.status !== 'connected'
    )
      throw new Error(
        'WhatsApp sending is paused until the companion session is healthy.',
      );

    try {
      const result = await this.client.sendText(jid, content);

      return { id: result.message_id };
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async sendDocument(
    jid: string,
    file: { filename: string; mimeType: string; buffer: Buffer },
    replyMessageId?: string,
  ): Promise<{ id: string }> {
    if (
      !this.client ||
      this.snapshot.sendingPaused ||
      this.snapshot.status !== 'connected'
    )
      throw new Error(
        'WhatsApp sending is paused until the companion session is healthy.',
      );

    try {
      const result = await this.client.sendFile(
        jid,
        file,
        undefined,
        replyMessageId,
      );

      return { id: result.message_id };
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async markRead(ids: string[], chat: string, sender?: string): Promise<void> {
    if (!this.client) throw new Error('WhatsApp client is unavailable.');
    const phone = sender ?? chat;

    try {
      for (const id of ids) await this.client.markRead(phone, id);
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async presence(chat: string, state: 'composing' | 'paused'): Promise<void> {
    if (!this.client) throw new Error('WhatsApp client is unavailable.');

    try {
      await this.client.sendChatPresence(chat, state);
    } catch (error) {
      await this.handleError(error);
    }
  }

  async download(raw: Record<string, unknown>): Promise<string> {
    if (!this.client) throw new Error('WhatsApp client is unavailable.');
    const messageId = typeof raw.id === 'string' ? raw.id : '';
    const chat =
      typeof raw.chat_id === 'string'
        ? raw.chat_id
        : typeof raw.from === 'string'
          ? raw.from
          : '';

    if (!messageId || !chat)
      throw new Error('Cannot resolve WhatsApp media message identity.');

    const result = await this.client.downloadMedia(chat, messageId);
    const url =
      result.file_url ||
      (result.file_path
        ? `${this.baseUrl}/${result.file_path.replace(/^\/+/, '')}`
        : '');

    if (!url) throw new Error('WhatsApp media URL is unavailable.');

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok)
      throw new Error(`WhatsApp media download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const directory = await mkdtemp(join(tmpdir(), 'sydia-whatsapp-'));
    const path = join(directory, result.filename || `${messageId}.bin`);
    await writeFile(path, buffer);

    return path;
  }

  on<K extends keyof GatewayEvents>(
    event: K,
    listener: GatewayEvents[K],
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  handleWebhook(event: GoWaWebhookEvent): void {
    if (this.stopped) return;

    if (event.event === 'message' && event.payload) {
      const normalized = normalizeInboundEvent(event.payload);
      this.snapshot.lastEventAt = new Date();
      void this.persist({ lastEventAt: this.snapshot.lastEventAt });
      if (!normalized.isFromMe) this.emit('inbound', normalized);

      return;
    }

    if (event.event === 'message.ack' && event.payload) {
      const payload = event.payload;
      const ids = Array.isArray(payload.ids)
        ? payload.ids.map((id) => String(id))
        : [];

      const chat = typeof payload.chat_id === 'string' ? payload.chat_id : '';
      const sender = typeof payload.from === 'string' ? payload.from : chat;

      this.emit('receipt', {
        type:
          typeof payload.receipt_type === 'string' ? payload.receipt_type : '',
        chat,
        sender,
        isGroup: chat.endsWith('@g.us'),
        ids,
        timestamp: Date.now(),
      });
    }
  }

  private async initialize(): Promise<void> {
    if (this.stopped || this.client) return;
    this.snapshot.status = 'connecting';
    await this.persist({ status: 'connecting', lastEventAt: new Date() });

    const client = this.factory({
      baseUrl: this.baseUrl,
      deviceId: this.deviceId,
      timeoutMs: this.timeoutMs,
    });

    const generation = ++this.generation;
    this.client = client;

    await this.refreshStatus(generation);
    this.pollTimer = setInterval(() => {
      if (!this.stopped && generation === this.generation)
        void this.refreshStatus(generation);
    }, this.pollMs);
  }

  private async refreshStatus(generation: number): Promise<void> {
    if (!this.client || generation !== this.generation || this.stopped) return;

    try {
      if (!this.deviceEnsured) {
        await this.client.ensureDevice(this.deviceId);
        this.deviceEnsured = true;
      }

      const status = await this.client.status();
      if (generation !== this.generation) return;

      this.jid = status.jid || undefined;

      if (this.snapshot.status === 'enforced') return;
      if (this.snapshot.sendingPaused && this.snapshot.status === 'logged_out')
        return;

      if (status.is_logged_in && status.jid) {
        this.snapshot.status = 'connected';
        this.snapshot.registrationReady = true;
        this.snapshot.profileReady = true;
        this.snapshot.lastConnectedAt =
          this.snapshot.lastConnectedAt ?? new Date();
        this.snapshot.recoveryReason = null;
        await this.persist({
          status: 'connected',
          registrationReady: true,
          profileReady: true,
          lastConnectedAt: this.snapshot.lastConnectedAt,
          lastEventAt: new Date(),
          recoveryReason: null,
        });
      } else {
        this.snapshot.status = 'awaiting_pair';
        this.snapshot.registrationReady = false;
        await this.persist({
          status: 'awaiting_pair',
          registrationReady: false,
          recoveryReason: 'WhatsApp companion is not paired.',
        });
      }
    } catch (error) {
      if (generation !== this.generation) return;
      await this.handleError(error);
      this.snapshot.status = 'disconnected';
      await this.persist({
        status: 'disconnected',
        recoveryReason: this.snapshot.recoveryReason,
        lastEventAt: new Date(),
      });
    }
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
  }

  private async handleError(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const match = ENFORCEMENT_PATTERN.exec(message);

    if (match) {
      const code = match[0].toUpperCase().replace(/[^A-Z0-9]/g, '_');
      await this.enforce(
        ENFORCEMENT_CODES[code] ? code : 'REACHOUT_TIMELOCK',
        message,
      );
    } else {
      this.snapshot.recoveryReason = message;
      await this.persist({ recoveryReason: message, lastEventAt: new Date() });
    }

    this.logger.warn(message);
  }

  private async acquireOwnership(): Promise<boolean> {
    const lockPath = `${this.lockPath}.owner.lock`;
    await mkdir(dirname(lockPath), { recursive: true });

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
    await unlink(`${this.lockPath}.owner.lock`).catch(() => undefined);
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
