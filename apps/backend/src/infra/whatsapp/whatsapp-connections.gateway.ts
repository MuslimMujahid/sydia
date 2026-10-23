import {
  MAX_MEDIA_BYTES,
  MediaDownloadLimitError,
  readMediaResponse,
} from '../../shared/messaging/media-download';
import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WHATSAPP_CONNECTION_REPOSITORY,
  type IWhatsAppConnectionRepository,
} from '../../database/interfaces';
import {
  WhatsAppConnectionConflict,
  WhatsAppConnectionRevoked,
  type WhatsAppConnection,
  type WhatsAppConnectionScope,
} from '../../database/entities';
import type { NormalizedInboundMessage } from '../../shared/messaging';
import { normalizeInboundEvent, normalizeJid } from './whatsapp.adapter';
import { GoWhatsAppHttpClient } from './whatsapp.client';
import type { GoWaWebhookEvent } from './whatsapp.types';

export const WHATSAPP_CONNECTION_CLIENT_FACTORY = Symbol(
  'WHATSAPP_CONNECTION_CLIENT_FACTORY',
);
export type ConnectionClient = Pick<
  GoWhatsAppHttpClient,
  | 'ensureDevice'
  | 'status'
  | 'loginQr'
  | 'logout'
  | 'removeDevice'
  | 'reconnect'
  | 'sendText'
  | 'sendFile'
  | 'markRead'
  | 'sendChatPresence'
  | 'downloadMedia'
>;
export type ConnectionClientFactory = (deviceId: string) => ConnectionClient;
export type ScopedInboundHandler = (
  connection: WhatsAppConnection,
  message: NormalizedInboundMessage,
) => Promise<void>;
export type ScopedReceiptHandler = (
  connection: WhatsAppConnection,
  payload: Record<string, unknown>,
) => Promise<void>;

@Injectable()
export class WhatsAppConnectionsGateway
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WhatsAppConnectionsGateway.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;
  private inboundHandler: ScopedInboundHandler | undefined;
  private receiptHandler: ScopedReceiptHandler | undefined;
  private recoveredHandler:
    ((connection: WhatsAppConnection) => Promise<void>) | undefined;

  constructor(
    @Inject(WHATSAPP_CONNECTION_REPOSITORY)
    private readonly repository: IWhatsAppConnectionRepository,
    @Inject(WHATSAPP_CONNECTION_CLIENT_FACTORY)
    private readonly factory: ConnectionClientFactory,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (
      this.config.get<boolean | string>(
        'BACKEND_WHATSAPP_RUNTIME_ENABLED',
        true,
      ) === false ||
      this.config.get<string>('BACKEND_WHATSAPP_RUNTIME_ENABLED') === 'false'
    )
      return;
    this.timer = setInterval(() => {
      void this.tick().catch((error) =>
        this.logger.error('WhatsApp connection polling failed.', error),
      );
    }, 15_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  registerInbound(handler: ScopedInboundHandler) {
    this.inboundHandler = handler;
  }

  registerReceipt(handler: ScopedReceiptHandler) {
    this.receiptHandler = handler;
  }

  registerRecovered(
    handler: (connection: WhatsAppConnection) => Promise<void>,
  ) {
    this.recoveredHandler = handler;
  }

  async beginQr(
    userId: string,
    refresh = false,
  ): Promise<{ attemptId: string; expiresAt: Date; assetPath: string }> {
    const timeout = this.config.get<number>(
      'BACKEND_WHATSAPP_COMMAND_TIMEOUT',
      30_000,
    );

    return this.repository.serializedSetup(
      userId,
      () => this.prepareQr(userId, refresh),
      timeout * 5 + 10_000,
    );
  }

  private async prepareQr(
    userId: string,
    refresh: boolean,
  ): Promise<{ attemptId: string; expiresAt: Date; assetPath: string }> {
    const previous = await this.repository.findActive(userId);
    if (previous?.ownerVerifiedAt || previous?.assistantExternalId)
      throw new WhatsAppConnectionConflict();

    if (
      !refresh &&
      previous?.setupPhase === 'pairing' &&
      previous.qrAttemptId &&
      previous.qrExpiresAt &&
      previous.qrExpiresAt > new Date()
    ) {
      return {
        attemptId: previous.qrAttemptId,
        expiresAt: previous.qrExpiresAt,
        assetPath: `/whatsapp/companion/qr/${previous.qrAttemptId}`,
      };
    }

    if (previous) await this.disconnect(userId);
    const connection = await this.repository.create(
      userId,
      `sydia-${randomUUID()}`,
    );

    const client = this.factory(connection.deviceId);

    try {
      await client.ensureDevice(connection.deviceId);
      const startedAt = new Date();
      const qr = await client.loginQr();
      const expiresAt = new Date(
        startedAt.getTime() + qr.durationSeconds * 1_000,
      );

      if (expiresAt <= new Date())
        throw new Error('WhatsApp QR expired before it could be displayed.');
      const attemptId = randomUUID();
      if (
        !(await this.repository.setQr(
          connection,
          attemptId,
          qr.image,
          expiresAt,
        ))
      )
        throw new WhatsAppConnectionRevoked();

      return {
        attemptId,
        expiresAt,
        assetPath: `/whatsapp/companion/qr/${attemptId}`,
      };
    } catch (error) {
      this.logger.error(
        `WhatsApp QR login failed for connection ${connection.id}.`,
        error,
      );
      await this.repository.update(connection, {
        setupPhase: 'qr_error',
        reason: 'Kode QR tidak dapat dimuat. Coba lagi.',
      });
      throw error;
    }
  }

  async reconnect(userId: string) {
    const connection = await this.repository.findActive(userId);
    if (
      !connection ||
      !connection.ownerVerifiedAt ||
      connection.status === 'enforced' ||
      connection.status === 'logged_out'
    )
      throw new WhatsAppConnectionRevoked();
    await this.repository.update(connection, {
      status: 'disconnected',
      reconnectAttempts: 0,
      nextReconnectAt: new Date(),
      reason: 'Menyambungkan kembali WhatsApp…',
    });
    await this.refresh({
      ...connection,
      status: 'disconnected',
      reconnectAttempts: 0,
      nextReconnectAt: new Date(),
    });
  }

  download(scope: WhatsAppConnectionScope, sender: string, messageId: string) {
    return this.send(scope, async (client, connection) => {
      if (connection.ownerExternalId !== sender)
        throw new WhatsAppConnectionRevoked();
      const result = await client.downloadMedia(sender, messageId);
      if (
        result.message_id !== messageId ||
        !Number.isSafeInteger(result.file_size) ||
        result.file_size < 0
      )
        throw new Error('GoWA returned invalid media metadata.');
      if (result.file_size > MAX_MEDIA_BYTES)
        throw new MediaDownloadLimitError();
      const base = this.config.getOrThrow<string>('BACKEND_WHATSAPP_GOWA_URL');
      const path = result.file_url || result.file_path;
      if (typeof path !== 'string' || !path)
        throw new Error('GoWA returned invalid media metadata.');
      const source = new URL(path, base.replace(/\/$/, '') + '/');

      const origin = new URL(base);
      const prefix = origin.pathname.replace(/\/$/, '') + '/statics/media/';
      if (
        source.origin !== origin.origin ||
        source.username ||
        source.password ||
        source.search ||
        source.hash ||
        !source.pathname.startsWith(prefix) ||
        source.pathname.length <= prefix.length ||
        /%(?:2f|5c|00)/i.test(source.pathname) ||
        path.includes('\\') ||
        [...path].some((character) => character.charCodeAt(0) < 32)
      )
        throw new Error('Untrusted WhatsApp media asset path.');
      const response = await fetch(source, {
        headers: { 'X-Device-Id': connection.deviceId },
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok)
        throw new Error(`WhatsApp media download failed: ${response.status}`);

      return readMediaResponse(response);
    });
  }

  async disconnect(userId: string) {
    const revoked = await this.repository.revoke(userId, new Date());
    const connection = revoked ?? (await this.repository.findLatest(userId));
    if (connection?.cleanupNeeded) await this.cleanup(connection);
    const latest = await this.repository.findLatest(userId);

    return {
      revoked: Boolean(revoked),
      cleanupPending: latest?.cleanupNeeded === true,
    };
  }

  private async cleanup(connection: WhatsAppConnection) {
    if (
      !(await this.repository.claimCleanup(
        connection.id,
        connection.cleanupAttempts,
      ))
    )
      return;

    try {
      const client = this.factory(connection.deviceId);
      await client.removeDevice();
      await this.repository.cleanupResult(connection.id, null);
    } catch (error) {
      this.logger.error(
        `WhatsApp device cleanup failed for ${connection.id}.`,
        error,
      );
      await this.repository.cleanupResult(
        connection.id,
        'Sesi telah diputus di Sydia; pembersihan perangkat WhatsApp belum selesai.',
      );
    }
  }

  async status(userId: string) {
    const connection = await this.repository.findActive(userId);
    if (!connection) return null;
    await this.refresh(connection);

    return this.repository.findActive(userId);
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;

    try {
      const connections = await this.repository.listRuntime();
      await Promise.all(
        connections.map(async (connection) => {
          try {
            if (connection.cleanupNeeded) await this.cleanup(connection);
            else if (connection.active) await this.refresh(connection);
          } catch (error) {
            this.logger.error(
              `WhatsApp lifecycle update failed for ${connection.id}.`,
              error,
            );
          }
        }),
      );
    } finally {
      this.ticking = false;
    }
  }

  async refresh(connection: WhatsAppConnection) {
    if (
      !connection.active ||
      connection.status === 'enforced' ||
      connection.status === 'logged_out' ||
      connection.setupPhase === 'qr_expired' ||
      connection.setupPhase === 'conflict'
    )
      return;

    if (
      !connection.assistantExternalId &&
      connection.qrExpiresAt &&
      connection.qrExpiresAt <= new Date()
    ) {
      await this.repository.update(connection, {
        setupPhase: 'qr_expired',
        qrAttemptId: null,
        qrExpiresAt: null,
        cleanupNeeded: true,
        reason: 'Kode QR kedaluwarsa. Muat kode baru.',
      });
      // Revoke the provider's login attempt too; stale scans must not activate a connection.
      await this.cleanup({
        ...connection,
        setupPhase: 'qr_expired',
        cleanupNeeded: true,
      });

      return;
    }

    try {
      const client = this.factory(connection.deviceId);
      const state = await client.status();
      if (state.device_id !== connection.deviceId)
        throw new Error('WhatsApp provider returned a different device.');

      if (state.is_connected && state.is_logged_in && state.jid) {
        const confirmed = await this.repository.confirmAssistant(
          connection,
          normalizeJid(state.jid),
          new Date(),
        );

        if (confirmed && connection.outageId && this.recoveredHandler) {
          try {
            await this.recoveredHandler(confirmed);
          } catch (error) {
            // Recovery is a separate degraded operation. Its persisted claim
            // controls replay; a summary/database error is not a new outage.
            this.logger.error(
              `WhatsApp recovery processing failed for ${connection.id}; transport is connected and the outage remains pending.`,
              error,
            );
          }
        }

        return;
      }

      if (!connection.assistantExternalId) return; // QR awaiting provider confirmation.

      if (!state.is_logged_in) {
        await this.repository.update(connection, {
          status: 'logged_out',
          reason: 'Sesi WhatsApp berakhir. Hubungkan kembali akun asisten.',
        });

        return;
      }

      await this.disconnected(connection);
      if (await this.repository.claimReconnect(connection, new Date()))
        await client.reconnect();
    } catch (error) {
      this.logger.warn(
        `WhatsApp provider status failed for ${connection.id}.`,
        error,
      );

      if (error instanceof WhatsAppConnectionConflict) {
        await this.repository.update(connection, {
          setupPhase: 'conflict',
          status: 'enforced',
          reason: 'Nomor asisten ini sudah digunakan akun Sydia lain.',
        });
      } else if (error instanceof WhatsAppConnectionRevoked) {
        await this.repository.update(connection, {
          status: 'enforced',
          reason: 'Identitas akun asisten berubah. Hubungkan ulang dari Sydia.',
        });
      } else if (this.restricted(error)) {
        await this.repository.update(connection, {
          status: 'enforced',
          reason:
            'Pengiriman dibatasi oleh WhatsApp. Periksa akun asisten sebelum melanjutkan.',
        });
      } else {
        await this.disconnected(connection);
      }
    }
  }

  private async disconnected(connection: WhatsAppConnection) {
    if (!connection.assistantExternalId || connection.status === 'disconnected')
      return;
    await this.repository.update(connection, {
      status: 'disconnected',
      reason: 'Koneksi WhatsApp terputus.',
      outageId: connection.outageId ?? randomUUID(),
      disconnectedAt: connection.disconnectedAt ?? new Date(),
      reconnectAttempts: 0,
      nextReconnectAt: new Date(Date.now() + 5_000),
    });
  }

  private restricted(error: unknown) {
    if (!(error instanceof Error)) return false;
    const code = 'code' in error ? error.code : undefined;

    return (
      typeof code === 'string' &&
      /^(?:463|BULK_MESSAGING|REACHOUT_TIMELOCK|REACHOUT_TIMELIMIT|TEMPORARY_BAN)$/.test(
        code,
      )
    );
  }

  async handleWebhook(event: GoWaWebhookEvent) {
    const device = 'device_id' in event ? event.device_id : undefined;
    const session = 'session_id' in event ? event.session_id : undefined;

    if (
      typeof device !== 'string' ||
      !device ||
      (session !== undefined && (typeof session !== 'string' || !session))
    ) {
      this.logger.warn('Rejected WhatsApp event without a device identifier.');

      return;
    }

    // GoWA v9.3 carries the WhatsApp JID in device_id and the registered
    // operator device key in session_id. Older explicit-device envelopes use
    // device_id alone. Neither format permits a provider-default fallback.
    const connection = await this.repository.findDevice(
      typeof session === 'string' ? session : device,
    );

    if (!connection?.active) {
      this.logger.warn(
        'Rejected WhatsApp event for unknown or revoked device.',
      );

      return;
    }

    if (
      session !== undefined &&
      normalizeJid(device) !== connection.assistantExternalId
    ) {
      this.logger.warn(
        `Rejected WhatsApp event with a mismatched assistant identity for ${connection.id}.`,
      );

      return;
    }

    if (
      !event.payload ||
      connection.status === 'enforced' ||
      !['ready', 'owner_verification'].includes(connection.setupPhase)
    )
      return;

    if (event.event === 'message') {
      const message = normalizeInboundEvent(event.payload);
      if (message.isGroup || message.isFromMe || !message.providerMessageId)
        return;
      if (
        connection.ownerExternalId &&
        message.senderExternalId !== connection.ownerExternalId
      )
        return;
      if (!this.inboundHandler)
        throw new Error('WhatsApp inbound handler is not registered.');
      await this.inboundHandler(connection, {
        ...message,
        whatsappConnection: {
          id: connection.id,
          generation: connection.generation,
        },
      });
    } else if (event.event === 'message.ack' && connection.ownerVerifiedAt) {
      if (!this.receiptHandler)
        throw new Error('WhatsApp receipt handler is not registered.');
      await this.receiptHandler(connection, event.payload);
    }
  }

  /** A row lock fences revocation and serializes network sends across API/worker processes. */
  async send<T>(
    scope: WhatsAppConnectionScope,
    operation: (
      client: ConnectionClient,
      connection: WhatsAppConnection,
    ) => Promise<T>,
  ) {
    try {
      return await this.repository.serialized(scope, (connection) => {
        if (
          connection.setupPhase !== 'ready' ||
          !connection.ownerVerifiedAt ||
          !connection.ownerExternalId ||
          connection.status !== 'connected'
        )
          throw new WhatsAppConnectionRevoked();

        return operation(this.factory(connection.deviceId), connection);
      });
    } catch (error) {
      this.logger.error(`WhatsApp send failed for ${scope.id}.`, error);
      if (this.restricted(error))
        await this.repository.update(scope, {
          status: 'enforced',
          reason: 'WhatsApp membatasi pengiriman dari akun ini.',
        });
      throw error;
    }
  }
}
