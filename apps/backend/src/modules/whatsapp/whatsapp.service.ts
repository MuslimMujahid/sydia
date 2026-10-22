import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  HttpStatus,
} from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  AUDIT_EVENT_REPOSITORY,
  USER_REPOSITORY,
  WHATSAPP_CONNECTION_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  type IAuditEventRepository,
  type IUserRepository,
  type IWhatsAppConnectionRepository,
  type INotificationRepository,
} from '../../database/interfaces';
import {
  WhatsAppConnectionRevoked,
  type WhatsAppConnection,
  type WhatsAppConnectionScope,
  type WhatsAppMissedDelivery,
} from '../../database/entities';
import { MessagingHandlerService } from '../messaging';
import { DocumentService } from '../documents/document.service';
import { NotificationService } from '../notifications';
import type {
  CalendarReminderDispatch,
  NotificationJob,
} from '../../infra/queue';
import { OpenRouterMediaService } from '../../infra/model-gateway';
import { WhatsAppConnectionsGateway } from '../../infra/whatsapp/whatsapp-connections.gateway';
import { normalizeJid } from '../../infra/whatsapp';
import type { NormalizedInboundMessage } from '../../shared/messaging';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { WHATSAPP_CLOCK, type Clock } from './whatsapp.clock';

function hash(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

function eventPayload(value: unknown): CalendarReminderDispatch | undefined {
  if (!value || typeof value !== 'object' || !('eventReminder' in value))
    return undefined;
  const event = value.eventReminder;
  if (
    !event ||
    typeof event !== 'object' ||
    !('kind' in event) ||
    event.kind !== 'dispatch' ||
    !('userId' in event) ||
    typeof event.userId !== 'string' ||
    !('eventId' in event) ||
    typeof event.eventId !== 'string' ||
    !('startAt' in event) ||
    typeof event.startAt !== 'string' ||
    !('scheduledAt' in event) ||
    typeof event.scheduledAt !== 'string' ||
    !('timezone' in event) ||
    typeof event.timezone !== 'string'
  )
    return undefined;

  return {
    kind: 'dispatch',
    userId: event.userId,
    eventId: event.eventId,
    startAt: event.startAt,
    scheduledAt: event.scheduledAt,
    timezone: event.timezone,
  };
}

type NotificationInput = Omit<NotificationJob, 'channel'>;

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly challengeSecret: string;
  constructor(
    private readonly gateway: WhatsAppConnectionsGateway,
    @Inject(WHATSAPP_CONNECTION_REPOSITORY)
    private readonly connections: IWhatsAppConnectionRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly notifications: NotificationService,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly audit: IAuditEventRepository,
    private readonly messages: MessagingHandlerService,
    private readonly documents: DocumentService,
    private readonly media: OpenRouterMediaService,
    @Inject(WHATSAPP_CLOCK) private readonly clock: Clock,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly deliveryRecords: INotificationRepository,
    config: ConfigService,
  ) {
    this.challengeSecret = config.getOrThrow<string>('BACKEND_AUTH_SECRET');
  }

  async onModuleInit() {
    this.gateway.registerInbound((connection, message) =>
      this.handleInbound(connection, message),
    );
    this.gateway.registerReceipt(async (connection, payload) => {
      const receiptType = payload.receipt_type;

      if (
        !Array.isArray(payload.ids) ||
        payload.ids.length > 1_000 ||
        !payload.ids.every(
          (id): id is string => typeof id === 'string' && id.length > 0,
        ) ||
        (receiptType !== 'delivered' &&
          receiptType !== 'read' &&
          receiptType !== 'played')
      ) {
        this.logger.warn(
          `Ignored invalid WhatsApp receipt for ${connection.id}.`,
        );

        return;
      }

      const chat =
        typeof payload.chat_id === 'string'
          ? normalizeJid(payload.chat_id)
          : null;

      const sender =
        typeof payload.from === 'string' && payload.from
          ? normalizeJid(payload.from)
          : chat;

      if (
        !chat ||
        !sender ||
        chat !== connection.ownerExternalId ||
        sender !== connection.ownerExternalId
      ) {
        this.logger.warn(
          `Ignored non-owner WhatsApp receipt for ${connection.id}.`,
        );

        return;
      }

      const reconciled = await this.connections.reconcileReceipt(connection, {
        ownerExternalId: sender,
        messageIds: payload.ids,
        type: receiptType,
        receivedAt: this.clock(),
      });

      if (!reconciled) return;
      await this.audit.record({
        userId: connection.userId,
        eventType: 'whatsapp.receipt',
        metadata: {
          connectionId: connection.id,
          generation: connection.generation,
          reconciled,
          ids: payload.ids,
          type:
            typeof payload.receipt_type === 'string'
              ? payload.receipt_type
              : 'unknown',
        },
      });
    });
    this.gateway.registerRecovered((connection) => this.recover(connection));
    await this.messages.registerAdapter('whatsapp', {
      prepare: (userId, message) => this.ingestInboundMedia(userId, message),
      send: async (user, _identity, message, content) => {
        await this.authorize(user.id, message);
        await this.gateway.send(this.scope(message), (client, connection) =>
          client.sendText(connection.ownerExternalId!, content),
        );
      },
      sendFile: async (user, message, file) => {
        await this.authorize(user.id, message);
        const result = await this.gateway.send(
          this.scope(message),
          (client, connection) =>
            client.sendFile(
              connection.ownerExternalId!,
              file,
              undefined,
              message.providerMessageId,
            ),
        );

        return { providerMessageId: result.message_id };
      },
    });
  }

  private async requireUser(userId: string) {
    const user = await this.users.findById(userId);
    if (!user?.emailVerified)
      throw new ApiException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Verifikasi email Anda sebelum menghubungkan WhatsApp.',
        status: HttpStatus.FORBIDDEN,
      });

    return user;
  }

  async status(userId: string) {
    const connection = await this.gateway.status(userId);
    if (!connection)
      return {
        connected: false,
        linked: false,
        setupPhase: 'disconnected',
        status: 'disconnected',
        assistantNumber: null,
        ownerNumber: null,
        reason: null,
        ownerCodeExpiresAt: null,
        qrExpiresAt: null,
      };

    return {
      connected:
        connection.status === 'connected' && connection.setupPhase === 'ready',
      linked: Boolean(connection.ownerVerifiedAt),
      setupPhase: connection.setupPhase,
      status: connection.status,
      assistantNumber: connection.assistantExternalId?.split('@')[0] ?? null,
      ownerNumber: connection.ownerExternalId?.split('@')[0] ?? null,
      reason: connection.reason,
      ownerCodeExpiresAt: connection.ownerCodeExpiresAt,
      qrExpiresAt: connection.qrExpiresAt,
    };
  }

  async beginQr(userId: string, refresh = false) {
    await this.requireUser(userId);

    return this.gateway.beginQr(userId, refresh);
  }

  async qrAsset(userId: string, attemptId: string) {
    const bytes = await this.connections.getQr(userId, attemptId, this.clock());
    if (!bytes)
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Kode QR tidak tersedia atau sudah kedaluwarsa.',
        status: HttpStatus.NOT_FOUND,
      });

    return Buffer.from(bytes);
  }

  async createLinkCode(userId: string) {
    await this.requireUser(userId);

    for (let attempt = 0; attempt < 3; attempt++) {
      const connection = await this.connections.findActive(userId);
      if (
        !connection ||
        !connection.assistantExternalId ||
        connection.ownerVerifiedAt
      )
        break;
      const now = this.clock();
      const existingExpiry = connection.ownerCodeExpiresAt;

      if (existingExpiry && existingExpiry > now) {
        const code = this.ownerCode(connection, existingExpiry);
        if (hash(code) === connection.ownerCodeHash)
          return { code, expiresAt: existingExpiry };
      }

      const expiresAt = new Date(now.getTime() + 10 * 60_000);
      const code = this.ownerCode(connection, expiresAt);
      const created = await this.connections.issueOwnerCode(
        connection,
        hash(code),
        expiresAt,
        { expectedHash: connection.ownerCodeHash },
      );

      if (!created) continue;
      await this.audit.record({
        userId,
        eventType: 'whatsapp.owner_challenge.created',
        metadata: { connectionId: connection.id, expiresAt },
      });

      return { code, expiresAt };
    }

    this.logger.warn(
      'WhatsApp owner challenge could not be issued for the current connection.',
    );
    throw new ApiException({
      code: ErrorCodes.CONFLICT,
      message: 'Hubungkan akun asisten sebelum memverifikasi nomor pribadi.',
      status: HttpStatus.CONFLICT,
    });
  }

  private ownerCode(connection: WhatsAppConnectionScope, expiresAt: Date) {
    // Reconstruct a valid challenge across tabs/processes without storing its
    // plaintext. Scope and expiry changes produce a new proof.
    const digest = createHmac('sha256', this.challengeSecret)
      .update(
        JSON.stringify([
          'whatsapp-owner',
          connection.id,
          connection.generation,
          expiresAt.toISOString(),
        ]),
      )
      .digest('hex')
      .slice(0, 8)
      .toUpperCase();

    return `SYDIA-${digest}`;
  }

  async replaceOwner(userId: string) {
    await this.requireUser(userId);
    if (!(await this.connections.resetOwner(userId)))
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message: 'Akun asisten belum terhubung.',
        status: HttpStatus.CONFLICT,
      });

    return this.createLinkCode(userId);
  }

  async revoke(userId: string) {
    const result = await this.gateway.disconnect(userId);
    await this.audit.record({
      userId,
      eventType: 'whatsapp.connection.revoked',
      metadata: result,
    });

    return result;
  }

  async reconnect(userId: string) {
    await this.requireUser(userId);
    await this.gateway.reconnect(userId);

    return this.status(userId);
  }

  private scope(message: NormalizedInboundMessage): WhatsAppConnectionScope {
    if (!message.whatsappConnection) throw new WhatsAppConnectionRevoked();

    return message.whatsappConnection;
  }

  private async authorize(userId: string, message: NormalizedInboundMessage) {
    const scope = this.scope(message);
    const connection = await this.connections.findActive(userId);
    if (
      !connection ||
      connection.id !== scope.id ||
      connection.generation !== scope.generation ||
      !connection.ownerVerifiedAt ||
      connection.ownerExternalId !== message.senderExternalId ||
      message.isGroup ||
      message.isFromMe
    )
      throw new WhatsAppConnectionRevoked();

    return connection;
  }

  private async handleInbound(
    connection: WhatsAppConnection,
    message: NormalizedInboundMessage,
  ) {
    if (!connection.ownerVerifiedAt) {
      const candidate = message.text.trim().toUpperCase();
      if (!/^SYDIA-[A-Z0-9]{8}$/.test(candidate)) return;
      await this.requireUser(connection.userId);
      const verified = await this.connections.verifyOwner(
        connection,
        hash(candidate),
        message.senderExternalId,
        this.clock(),
      );

      if (!verified) {
        this.logger.warn(
          `Rejected expired, superseded, or mismatched owner proof for ${connection.id}.`,
        );

        return;
      }

      await this.audit.record({
        userId: connection.userId,
        eventType: 'whatsapp.owner.verified',
        metadata: { connectionId: verified.id },
      });
      await this.gateway.send(verified, (client, current) =>
        client.sendText(
          current.ownerExternalId!,
          'WhatsApp terhubung. Asisten Sydia Anda siap digunakan.',
        ),
      );

      return;
    }

    await this.authorize(connection.userId, message);
    const id = await this.connections.recordInbound(connection, {
      providerMessageId: message.providerMessageId,
      senderExternalId: message.senderExternalId,
      receivedAt: message.receivedAt,
    });

    if (!id) return;

    try {
      const user = await this.requireUser(connection.userId);
      await this.messages.handle({
        user,
        message,
        externalIdentityId: connection.ownerIdentityId!,
      });
      await this.connections.finishInbound(id, {
        status: 'processed',
        now: this.clock(),
      });
    } catch (error) {
      this.logger.error(
        `WhatsApp inbound handling failed for ${connection.id}.`,
        error,
      );
      await this.connections.finishInbound(id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        now: this.clock(),
      });
      throw error;
    }
  }

  private async ingestInboundMedia(
    userId: string,
    message: NormalizedInboundMessage,
  ): Promise<{ content: string; attachmentIds?: string[] }> {
    await this.authorize(userId, message);
    if (!message.mediaMessage || message.kind === 'unknown')
      return { content: message.text };
    const buffer = await this.gateway.download(
      this.scope(message),
      message.senderExternalId,
      message.providerMessageId,
    );

    const details = message.mediaMessage;
    const mimeType =
      typeof details.mimetype === 'string'
        ? details.mimetype
        : message.kind === 'image'
          ? 'image/jpeg'
          : message.kind === 'voice'
            ? 'audio/ogg'
            : 'application/octet-stream';

    const filename =
      typeof details.fileName === 'string'
        ? details.fileName
        : `${message.providerMessageId}.${message.kind === 'voice' ? 'ogg' : 'bin'}`;

    await this.authorize(userId, message);

    if (message.kind === 'voice') {
      const transcript = await this.media.transcribe(
        buffer,
        filename,
        mimeType,
      );

      return {
        content:
          [message.text, transcript].filter(Boolean).join('\n') ||
          'The user sent a voice message.',
      };
    }

    const hint = message.caption?.trim() || message.text.trim();
    const options = hint && !/^\/\S+/.test(hint) ? { hint } : undefined;
    const uploadedFile = {
      originalname: filename,
      mimetype: mimeType,
      size: buffer.length,
      buffer,
    };

    const document = options
      ? await this.documents.ingest(userId, uploadedFile, options)
      : await this.documents.ingest(userId, uploadedFile);

    const ready = await this.documents.waitUntilReady(userId, document.id);

    return {
      content:
        [message.text, ready.imageDescription].filter(Boolean).join('\n') ||
        `The user sent a ${message.kind}.`,
      attachmentIds: [document.file.id],
    };
  }

  async deliverNotification(
    input: NotificationInput,
  ): Promise<{ status: string; providerMessageId?: string }> {
    const existing = await this.notifications.findByIdempotencyKey(
      input.userId,
      input.idempotencyKey,
      'whatsapp',
    );

    if (!existing) {
      this.logger.warn(
        'WhatsApp notification has no persisted delivery intent.',
      );

      return { status: 'skipped_missing_intent' };
    }

    if (!['pending', 'failed'].includes(existing.status))
      return {
        status: existing.status,
        providerMessageId: existing.providerMessageId ?? undefined,
      };

    const outcome = async (
      status: string,
      providerMessageId?: string,
      error?: string,
    ) => {
      await this.notifications.recordOutcome({
        userId: input.userId,
        deliveryId: existing.id,
        status,
        providerMessageId,
        error,
      });

      return { status, providerMessageId };
    };

    const binding = await this.connections.deliveryScope(existing.id);
    const connection = await this.connections.findActive(input.userId);
    if (
      !binding?.connectionId ||
      !connection ||
      binding.connectionId !== connection.id ||
      binding.generation !== connection.generation ||
      !connection.ownerVerifiedAt
    )
      return outcome('skipped_unlinked');
    const preferences = await this.notifications.getPreferences(input.userId);
    if (preferences?.whatsappNotificationsEnabled === false)
      return outcome('skipped_disabled');
    const requested = ['reminder', 'event_reminder'].includes(existing.kind);

    if (requested && connection.outageId && connection.status === 'connected') {
      // A worker may wake after provider confirmation but before recovery has
      // built its summary. Collect due work first so this race cannot replay
      // an outage occurrence as an ordinary, apparently on-time notification.
      await this.connections.collectPendingMissed(
        connection,
        connection.outageId,
        this.clock(),
      );
      const stored = await this.notifications.findByIdempotencyKey(
        input.userId,
        input.idempotencyKey,
        'whatsapp',
      );

      if (stored?.status === 'missed') return { status: 'missed' };
    }

    if (
      !requested &&
      !(await this.connections.hasConsent(input.userId, existing.kind))
    )
      return outcome('skipped_not_opted_in');
    if (
      input.kind === 'event_reminder' &&
      !(await this.notifications.eventReminderIsCurrent(input))
    )
      return outcome('skipped_obsolete');
    if (
      input.kind === 'reminder' &&
      !(await this.connections.reminderIsCurrent(input.userId, existing.id))
    )
      return outcome('skipped_obsolete');
    if (!(await this.notifications.claimDelivery(input.userId, existing.id)))
      return { status: 'in_progress' };
    const user = await this.users.findById(input.userId);
    if (!user?.emailVerified) return outcome('skipped_user_unavailable');

    if (connection.status !== 'connected') {
      if (requested && connection.outageId) {
        const scheduledAt = input.eventReminder
          ? new Date(input.eventReminder.scheduledAt)
          : await this.connections.reminderDueAt(input.userId, existing.id);

        if (!scheduledAt || Number.isNaN(scheduledAt.getTime()))
          throw new Error(
            'Missed WhatsApp reminder is missing its scheduled time.',
          );
        await this.connections.recordMissed(
          existing.id,
          connection.outageId,
          scheduledAt,
          { ...input },
        );

        return outcome('missed');
      }

      return outcome('skipped_disconnected');
    }

    let sending = false;

    try {
      const result = await this.gateway.send(
        connection,
        async (client, current) => {
          if (
            (await this.notifications.getPreferences(input.userId))
              ?.whatsappNotificationsEnabled === false
          )
            return null;
          sending = true;

          return client.sendText(current.ownerExternalId!, existing.content);
        },
      );

      return result
        ? outcome('delivered', result.message_id)
        : outcome('skipped_disabled');
    } catch (error) {
      this.logger.error(
        `WhatsApp notification delivery failed for ${connection.id}.`,
        error,
      );

      // An exception after dispatch can mean the provider accepted the message: do not replay blindly.
      return outcome(
        sending ? 'unknown' : 'failed',
        undefined,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  sendProactive(input: {
    userId: string;
    content: string;
    idempotencyKey: string;
    sourceId?: string;
  }) {
    return this.deliverNotification({
      ...input,
      kind: 'proactive',
      proactive: true,
    });
  }

  private async recover(connection: WhatsAppConnection) {
    if (!connection.outageId || !connection.ownerVerifiedAt) return;

    if (
      (await this.notifications.getPreferences(connection.userId))
        ?.whatsappNotificationsEnabled === false
    ) {
      await this.connections.completeRecovery(
        connection,
        connection.outageId,
        [],
        this.clock(),
      );

      return;
    }

    await this.connections.collectPendingMissed(
      connection,
      connection.outageId,
      this.clock(),
    );
    const missed = await this.connections.missed(
      connection,
      connection.outageId,
    );

    const current: WhatsAppMissedDelivery[] = [];

    for (const item of missed) {
      const valid =
        item.kind === 'reminder'
          ? await this.connections.reminderIsCurrent(
              connection.userId,
              item.deliveryId,
            )
          : await this.notifications.missedEventReminderIsCurrent(
              {
                userId: connection.userId,
                eventReminder: eventPayload(item.payload),
              },
              this.clock(),
            );

      if (valid) current.push(item);
    }

    let content: string | null = null;

    if (current.length) {
      const user = await this.requireUser(connection.userId);
      const title =
        user.locale === 'id'
          ? 'Pengingat yang terlewat saat WhatsApp terputus:'
          : 'Reminders missed while WhatsApp was disconnected:';

      const rows = current
        .slice(0, 10)
        .map(
          (item) =>
            `${new Intl.DateTimeFormat(user.locale === 'id' ? 'id-ID' : 'en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: user.timezone }).format(item.scheduledAt)} — ${item.content.slice(0, 180)}`,
        );

      const extra =
        current.length > 10
          ? `\n+${current.length - 10} ${user.locale === 'id' ? 'pengingat lainnya' : 'more reminders'}`
          : '';

      content = `${title}\n${rows.join('\n')}${extra}`.slice(0, 3000);
    }

    const claim = await this.connections.claimRecovery(
      connection,
      connection.outageId,
      content
        ? { content, deliveryIds: current.map((item) => item.deliveryId) }
        : null,
      this.clock(),
    );

    if (claim.state === 'obsolete' || claim.state === 'in_progress') return;

    if (claim.state === 'exhausted') {
      this.logger.error(
        `WhatsApp recovery retry budget exhausted for ${connection.id}; missed records remain pending for inspection.`,
      );
      await this.connections.update(connection, {
        reason:
          'Ringkasan pengingat belum terkirim setelah beberapa percobaan. Periksa koneksi WhatsApp.',
      });

      return;
    }

    if (claim.state === 'claimed') {
      let sending = false;

      try {
        const sent = await this.gateway.send(
          connection,
          async (client, active) => {
            if (
              (await this.notifications.getPreferences(connection.userId))
                ?.whatsappNotificationsEnabled === false
            )
              return null;

            // Source cancellation may happen while this claim waits for the send
            // lock. A pre-dispatch retry can safely rebuild content and coverage.
            for (const item of current) {
              const valid =
                item.kind === 'reminder'
                  ? await this.connections.reminderIsCurrent(
                      connection.userId,
                      item.deliveryId,
                    )
                  : await this.notifications.missedEventReminderIsCurrent(
                      {
                        userId: connection.userId,
                        eventReminder: eventPayload(item.payload),
                      },
                      this.clock(),
                    );

              if (!valid)
                throw new Error(
                  'Recovery reminder changed before dispatch; rebuild the summary.',
                );
            }

            sending = true;

            return client.sendText(
              active.ownerExternalId!,
              claim.summary.content,
            );
          },
        );

        await this.notifications.recordOutcome({
          userId: connection.userId,
          deliveryId: claim.summary.id,
          status: sent ? 'delivered' : 'skipped_disabled',
          providerMessageId: sent?.message_id,
        });
      } catch (error) {
        this.logger.error('WhatsApp recovery summary failed.', error);
        await this.notifications.recordOutcome({
          userId: connection.userId,
          deliveryId: claim.summary.id,
          status: sending ? 'unknown' : 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
        // Explicitly degraded recovery: a healthy transport stays connected.
        // The persisted failed attempt permits at most five pre-dispatch tries.
        // An uncertain dispatch is terminal and is never blindly replayed.
        if (!sending) return;
      }
    }

    await this.connections.completeRecovery(
      connection,
      connection.outageId,
      claim.state === 'claimed' || claim.state === 'terminal'
        ? claim.deliveryIds
        : [],
      this.clock(),
    );
  }
}
