import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Context } from 'grammy';
import {
  AUDIT_EVENT_REPOSITORY,
  TELEGRAM_REPOSITORY,
  USER_REPOSITORY,
  type IAuditEventRepository,
  type ITelegramRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { TelegramGatewayService } from '../../infra/telegram';
import { OpenRouterMediaService } from '../../infra/model-gateway';
import type { NormalizedInboundMessage } from '../../shared/messaging';
import { DocumentService } from '../documents/document.service';
import { MessagingHandlerService } from '../messaging';
import { NotificationService } from '../notifications';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly gateway: TelegramGatewayService,
    @Inject(TELEGRAM_REPOSITORY)
    private readonly telegram: ITelegramRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly audit: IAuditEventRepository,
    private readonly messages: MessagingHandlerService,
    private readonly documents: DocumentService,
    private readonly media: OpenRouterMediaService,
    private readonly notifications: NotificationService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.gateway.setInboundHandler((ctx) => this.handleContext(ctx));
    await this.messages.registerAdapter('telegram', {
      prepare: (userId, message) => this.ingestMedia(userId, message),
      send: (_user, _identityId, message, content) =>
        this.send(message, content),
      sendFile: (user, message, file) =>
        this.sendFile(user.locale, message, file),
      beginProcessing: (messages, signal) =>
        this.beginProcessing(messages, signal),
      queued: (message) => this.acknowledgeQueued(message),
    });
  }

  async status(userId: string) {
    const identity = await this.telegram.findIdentity(userId);
    const profile = identity
      ? await this.telegram.getProfile(identity.id)
      : null;

    return {
      available: this.gateway.isAvailable(),
      linked: Boolean(identity),
      externalId: identity?.externalId ?? null,
      username: profile?.username ?? null,
      firstName: profile?.firstName ?? null,
      botUsername: this.gateway.getBotUsername(),
      lastInboundAt: profile?.lastInboundAt ?? null,
    };
  }

  async createLink(userId: string): Promise<{ url: string; expiresAt: Date }> {
    const username = this.gateway.getBotUsername();
    if (!this.gateway.isAvailable() || !username)
      throw new Error('Telegram bot is not available.');
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await this.telegram.createLinkToken({
      userId,
      tokenHash: this.hashToken(token),
      expiresAt,
    });
    await this.audit.record({
      userId,
      eventType: 'telegram.link_token.created',
      metadata: { expiresAt },
    });

    return {
      url: `https://t.me/${username}?start=${token}`,
      expiresAt,
    };
  }

  async revoke(userId: string): Promise<{ revoked: boolean }> {
    const revoked = await this.telegram.revokeIdentity(userId);
    await this.audit.record({
      userId,
      eventType: 'telegram.identity.revoked',
      metadata: { revoked },
    });

    return { revoked };
  }

  async deliverNotification(input: {
    userId: string;
    content: string;
    idempotencyKey: string;
  }): Promise<{ status: string; providerMessageId?: string }> {
    const existing = await this.notifications.findByIdempotencyKey(
      input.userId,
      input.idempotencyKey,
      'telegram',
    );

    if (!existing) return { status: 'skipped_missing_intent' };

    if (existing.status === 'delivered') {
      return {
        status: existing.status,
        providerMessageId: existing.providerMessageId ?? undefined,
      };
    }

    if (existing.status === 'attempting') return { status: 'in_progress' };

    if (!(await this.notifications.claimDelivery(input.userId, existing.id))) {
      const current = await this.notifications.findByIdempotencyKey(
        input.userId,
        input.idempotencyKey,
        'telegram',
      );

      return {
        status: current?.status ?? 'in_progress',
        providerMessageId: current?.providerMessageId ?? undefined,
      };
    }

    const identity = await this.telegram.findIdentity(input.userId);

    if (!identity) {
      await this.notifications.recordOutcome({
        userId: input.userId,
        deliveryId: existing.id,
        status: 'skipped_unlinked',
        policyOutcome: 'blocked',
      });

      return { status: 'skipped_unlinked' };
    }

    try {
      const result = await this.gateway.getOutboundAdapter().send({
        recipientExternalId: identity.externalId,
        content: input.content,
      });

      await this.notifications.recordOutcome({
        userId: input.userId,
        deliveryId: existing.id,
        status: 'delivered',
        policyOutcome: 'allowed',
        providerMessageId: result.providerMessageId,
      });

      return {
        status: 'delivered',
        providerMessageId: result.providerMessageId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.notifications.recordOutcome({
        userId: input.userId,
        deliveryId: existing.id,
        status: 'failed',
        policyOutcome: 'blocked',
        error: message,
      });

      return { status: 'failed' };
    }
  }

  private async handleContext(ctx: Context): Promise<void> {
    const message = this.gateway.getInboundAdapter().normalize(ctx);
    if (!message || message.isFromMe || message.isGroup) return;
    const existingIdentity = await this.telegram.findIdentityByExternalId(
      message.senderExternalId,
    );

    const recorded = await this.telegram.recordInbound({
      providerMessageId: message.providerMessageId,
      senderExternalId: message.senderExternalId,
      chatExternalId: message.chatExternalId,
      externalIdentityId: existingIdentity?.id,
      receivedAt: message.receivedAt,
    });

    if (!recorded) return;

    try {
      const startToken = this.startToken(message.text);
      let identity = existingIdentity;

      if (startToken) {
        identity = await this.consumeLinkToken(
          ctx,
          startToken,
          message,
          recorded.id,
        );

        return;
      }

      if (!identity) {
        await this.send(
          message,
          'Tautkan akun Telegram Anda dari pengaturan Sydia terlebih dahulu.',
        );

        return;
      }

      if (!recorded.externalIdentityId)
        await this.telegram.associateInbound(recorded.id, identity.id);
      await this.updateProfile(identity.id, ctx, message.receivedAt);
      const user = await this.users.findById(identity.userId);
      if (!user) return;
      await this.messages.handle({
        message,
        user,
        externalIdentityId: identity.id,
      });
    } catch (error) {
      this.logger.error(
        `Telegram inbound processing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await this.telegram.markInboundProcessed(recorded.id, new Date());
    }
  }

  private async consumeLinkToken(
    ctx: Context,
    token: string,
    message: NormalizedInboundMessage,
    inboundId: string,
  ) {
    const link = await this.telegram.findLinkTokenByHash(
      this.hashToken(token),
      new Date(),
    );

    if (!link) {
      await this.send(
        message,
        'Tautan ini tidak valid atau sudah kedaluwarsa. Buat tautan baru dari pengaturan Sydia.',
      );

      return null;
    }

    const priorForTelegram = await this.telegram.findIdentityByExternalId(
      message.senderExternalId,
    );

    if (priorForTelegram && priorForTelegram.userId !== link.userId) {
      await this.send(
        message,
        'Akun Telegram ini sudah tertaut ke akun Sydia lain. Putuskan tautan lama terlebih dahulu.',
      );

      return null;
    }

    if (
      !(await this.telegram.consumeLinkToken(
        link.id,
        message.senderExternalId,
        new Date(),
      ))
    ) {
      await this.send(message, 'Tautan ini sudah digunakan.');

      return null;
    }

    const priorForUser = await this.telegram.findIdentity(link.userId);
    if (priorForUser && priorForUser.externalId !== message.senderExternalId)
      await this.telegram.revokeIdentity(link.userId);
    const identity =
      priorForTelegram ??
      (await this.telegram.createIdentity({
        userId: link.userId,
        externalId: message.senderExternalId,
        verifiedAt: new Date(),
      }));

    await this.telegram.associateInbound(inboundId, identity.id);
    await this.updateProfile(identity.id, ctx, message.receivedAt);
    await this.audit.record({
      userId: link.userId,
      eventType: 'telegram.identity.linked',
      metadata: { externalId: message.senderExternalId },
    });
    await this.send(
      message,
      'Telegram berhasil ditautkan ke akun Sydia Anda. Kirim pesan apa pun untuk mulai berbicara dengan Sydia.',
    );

    return identity;
  }

  private async updateProfile(
    identityId: string,
    ctx: Context,
    lastInboundAt: Date,
  ): Promise<void> {
    await this.telegram.upsertProfile({
      externalIdentityId: identityId,
      username: ctx.from?.username ?? null,
      firstName: ctx.from?.first_name ?? null,
      lastName: ctx.from?.last_name ?? null,
      lastInboundAt,
    });
  }

  private scopeFor(message: NormalizedInboundMessage): {
    businessConnectionId?: string;
    messageThreadId?: number;
  } {
    return {
      businessConnectionId:
        typeof message.raw.businessConnectionId === 'string'
          ? message.raw.businessConnectionId
          : undefined,
      messageThreadId:
        typeof message.raw.messageThreadId === 'number'
          ? message.raw.messageThreadId
          : undefined,
    };
  }

  private async acknowledgeQueued(
    message: NormalizedInboundMessage,
  ): Promise<void> {
    const isMedia =
      message.kind !== 'unknown' &&
      typeof message.mediaMessage?.fileId === 'string';

    if (isMedia) {
      try {
        await this.send(message, '📂 File sedang diproses ...');
      } catch (error) {
        this.logger.warn(
          `Telegram processing acknowledgement failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await this.gateway.sendTyping(
      message.chatExternalId,
      this.scopeFor(message),
    );
  }

  private async beginProcessing(
    messages: NormalizedInboundMessage[],
    signal: AbortSignal,
  ): Promise<() => void> {
    const last = messages.at(-1);
    if (!last) return () => undefined;

    let stopped = false;
    let sending = false;

    const sendTyping = async (): Promise<void> => {
      if (stopped || sending || signal.aborted) return;
      sending = true;

      try {
        await this.gateway.sendTyping(
          last.chatExternalId,
          this.scopeFor(last),
          signal,
        );
      } finally {
        sending = false;
      }
    };

    const timer = setInterval(() => void sendTyping(), 4_000);

    const stop = (): void => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      signal.removeEventListener('abort', stop);
    };

    signal.addEventListener('abort', stop, { once: true });
    await sendTyping();

    return stop;
  }

  private async ingestMedia(
    userId: string,
    message: NormalizedInboundMessage,
  ): Promise<{ content: string; attachmentIds?: string[] }> {
    const fileId = message.mediaMessage?.fileId;
    if (typeof fileId !== 'string' || message.kind === 'unknown')
      return { content: message.text };
    const buffer = Buffer.from(await this.gateway.download(fileId));
    const mimeType =
      typeof message.mediaMessage?.mimeType === 'string'
        ? message.mediaMessage.mimeType
        : 'application/octet-stream';

    const filename =
      typeof message.mediaMessage?.fileName === 'string'
        ? message.mediaMessage.fileName
        : message.providerMessageId;

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

    const document = await this.documents.ingest(userId, {
      originalname: filename,
      mimetype: mimeType,
      size: buffer.length,
      buffer,
    });

    // Images are no longer described by a vision model, so there is nothing to
    // wait for; other kinds are indexed before the turn continues.
    if (message.kind !== 'image')
      await this.documents.waitUntilReady(userId, document.id);

    const content =
      [message.text].filter(Boolean).join('\n') ||
      `The user sent a ${message.kind}.`;

    return { content, attachmentIds: [document.file.id] };
  }

  private async send(
    inbound: NormalizedInboundMessage,
    content: string,
  ): Promise<void> {
    await this.gateway.getOutboundAdapter().send({
      recipientExternalId: inbound.chatExternalId,
      content,
    });
  }

  private async sendFile(
    locale: string,
    inbound: NormalizedInboundMessage,
    file: { filename: string; mimeType: string; buffer: Buffer },
  ): Promise<{ providerMessageId: string }> {
    const outbound = this.gateway.getOutboundAdapter();
    if (!outbound.sendFile)
      throw new Error('Telegram file sending is unavailable.');
    await this.send(
      inbound,
      locale === 'id' ? '📂 Mengirim file ...' : '📂 Sending file ...',
    );

    return outbound.sendFile({
      recipientExternalId: inbound.chatExternalId,
      businessConnectionId: this.scopeFor(inbound).businessConnectionId,
      messageThreadId: this.scopeFor(inbound).messageThreadId,
      ...file,
    });
  }

  private startToken(text: string): string | null {
    const match = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?\s*$/.exec(
      text,
    );

    return match?.[1] ?? null;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
