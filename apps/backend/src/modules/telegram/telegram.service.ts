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
  ) {}

  onModuleInit(): void {
    this.gateway.setInboundHandler((ctx) => this.handleContext(ctx));
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
      const input = await this.ingestMedia(user.id, message);
      await this.messages.handle({
        message,
        user,
        content: input.content,
        attachmentIds: input.attachmentIds,
        send: (content) => this.send(message, content),
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

    const document = await this.documents.ingest(userId, {
      originalname: filename,
      mimetype: mimeType,
      size: buffer.length,
      buffer,
    });

    let content = message.text;
    if (message.kind === 'image')
      content = [content, await this.media.describeImage(buffer, mimeType)]
        .filter(Boolean)
        .join('\n');
    if (message.kind === 'voice')
      content = [
        content,
        await this.media.transcribe(buffer, filename, mimeType),
      ]
        .filter(Boolean)
        .join('\n');
    if (!content) content = `The user sent a ${message.kind}.`;

    return { content, attachmentIds: [document.file.id] };
  }

  private async send(
    inbound: NormalizedInboundMessage,
    content: string,
  ): Promise<void> {
    await this.gateway.getOutboundAdapter().send({
      recipientExternalId: inbound.chatExternalId,
      content,
      replyToProviderMessageId: inbound.providerMessageId,
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
