import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  AUDIT_EVENT_REPOSITORY,
  USER_REPOSITORY,
  WHATSAPP_REPOSITORY,
  type IAuditEventRepository,
  type IUserRepository,
  type IWhatsAppRepository,
} from '../../database/interfaces';
import type { WhatsAppContactState } from '../../database/entities';
import { MessagingHandlerService } from '../messaging';
import { DocumentService } from '../documents/document.service';
import { NotificationService } from '../notifications';
import { OpenRouterMediaService } from '../../infra/model-gateway';
import {
  WhatsAppGatewayService,
  type GatewaySnapshot,
} from '../../infra/whatsapp';
import { normalizeJid, groupMessageAddressesBot } from '../../infra/whatsapp';
import type { NormalizedInboundMessage } from '../../infra/whatsapp';
import {
  WHATSAPP_CLOCK,
  WHATSAPP_RANDOM,
  WHATSAPP_SLEEP,
  delayForReply,
  inQuietHours,
  isOptOut,
  proactiveShareAllowed,
  senderCanReceiveProactive,
  type Clock,
  type Random,
  type Sleep,
} from './whatsapp.policy';

export type WhatsAppStatusResponse = {
  gateway: GatewaySnapshot;
  linked: boolean;
  externalId: string | null;
  contact: {
    firstInboundAt: Date | null;
    firstResponseAt: Date | null;
    optedOutAt: Date | null;
    lastInboundAt: Date | null;
    lastProactiveSentAt: Date | null;
    lastProactiveReplyAt: Date | null;
    unansweredProactiveCount: number;
  } | null;
};

type OutboundOptions = {
  proactive: boolean;
  userId: string;
  externalId: string;
  content: string;
  inbound?: NormalizedInboundMessage;
  contactState?: WhatsAppContactState | null;
};

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);
  private outboundQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly gateway: WhatsAppGatewayService,
    @Inject(WHATSAPP_REPOSITORY) private readonly whatsapp: IWhatsAppRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly notifications: NotificationService,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly audit: IAuditEventRepository,
    private readonly messages: MessagingHandlerService,
    private readonly documents: DocumentService,
    private readonly media: OpenRouterMediaService,
    @Inject(WHATSAPP_CLOCK) private readonly clock: Clock,
    @Inject(WHATSAPP_RANDOM) private readonly random: Random,
    @Inject(WHATSAPP_SLEEP) private readonly sleep: Sleep,
  ) {}

  onModuleInit(): void {
    this.gateway.on('inbound', (message) => void this.handleInbound(message));
    this.gateway.on('receipt', (receipt) => void this.handleReceipt(receipt));
  }

  async status(userId: string): Promise<WhatsAppStatusResponse> {
    const identity = await this.whatsapp.findIdentity(userId);
    const contact = identity
      ? await this.whatsapp.getContactState(identity.id)
      : null;

    return {
      gateway: this.gateway.getStatus(),
      linked: Boolean(identity),
      externalId: identity?.externalId ?? null,
      contact: contact
        ? {
            firstInboundAt: contact.firstInboundAt,
            firstResponseAt: contact.firstResponseAt,
            optedOutAt: contact.optedOutAt,
            lastInboundAt: contact.lastInboundAt,
            lastProactiveSentAt: contact.lastProactiveSentAt,
            lastProactiveReplyAt: contact.lastProactiveReplyAt,
            unansweredProactiveCount: contact.unansweredProactiveCount,
          }
        : null,
    };
  }

  async createLinkCode(
    userId: string,
  ): Promise<{ code: string; expiresAt: Date }> {
    const gateway = this.gateway.getStatus();
    if (gateway.sendingPaused || gateway.status === 'enforced')
      throw new Error('WhatsApp linking is paused by enforcement.');
    const plain = `SYDIA-${randomBytes(4).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(this.clock().getTime() + 10 * 60_000);
    await this.whatsapp.createLinkCode({
      userId,
      codeHash: this.hashCode(plain),
      expiresAt,
    });
    await this.audit.record({
      userId,
      eventType: 'whatsapp.link_code.created',
      metadata: { expiresAt },
    });

    return { code: plain, expiresAt };
  }

  async revoke(userId: string): Promise<{ revoked: boolean }> {
    const revoked = await this.whatsapp.revokeIdentity(userId);
    await this.audit.record({
      userId,
      eventType: 'whatsapp.identity.revoked',
      metadata: { revoked },
    });

    return { revoked };
  }

  async pairCompanion(phone: string): Promise<{ code: string }> {
    return { code: await this.gateway.requestPairCode(phone) };
  }

  async deliverNotification(input: {
    userId: string;
    kind: string;
    content: string;
    idempotencyKey: string;
    proactive: boolean;
    sourceId?: string;
  }): Promise<{ status: string; providerMessageId?: string }> {
    const existing = await this.notifications.findByIdempotencyKey(
      input.userId,
      input.idempotencyKey,
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
      );

      return {
        status: current?.status ?? 'in_progress',
        providerMessageId: current?.providerMessageId ?? undefined,
      };
    }

    const identity = await this.whatsapp.findIdentity(input.userId);

    if (!identity) {
      await this.notifications.recordOutcome({
        userId: input.userId,
        deliveryId: existing.id,
        status: 'skipped_unlinked',
        policyOutcome: 'blocked',
      });

      return { status: 'skipped_unlinked' };
    }

    const state = await this.whatsapp.getContactState(identity.id);
    const user = await this.users.findById(input.userId);

    if (!user) {
      await this.notifications.recordOutcome({
        userId: input.userId,
        deliveryId: existing.id,
        status: 'skipped_user_missing',
        policyOutcome: 'blocked',
      });

      return { status: 'skipped_user_missing' };
    }

    try {
      const result = await this.sendOutbound({
        proactive: input.proactive,
        userId: input.userId,
        externalId: identity.externalId,
        content: input.content,
        contactState: state,
      });

      await this.notifications.recordOutcome({
        userId: input.userId,
        deliveryId: existing.id,
        status: 'delivered',
        policyOutcome: 'allowed',
        providerMessageId: result.id,
        deliveredAt: this.clock(),
      });

      return { status: 'delivered', providerMessageId: result.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.notifications.recordOutcome({
        userId: input.userId,
        deliveryId: existing.id,
        status: 'failed',
        policyOutcome: 'blocked',
        error: message,
        attemptedAt: this.clock(),
      });

      return { status: 'failed' };
    }
  }

  async sendProactive(input: {
    userId: string;
    content: string;
    idempotencyKey: string;
    sourceId?: string;
  }): Promise<{ status: string }> {
    const result = await this.deliverNotification({
      ...input,
      kind: 'proactive',
      proactive: true,
    });

    return { status: result.status };
  }

  private async handleInbound(
    message: NormalizedInboundMessage,
  ): Promise<void> {
    const gatewayJid = this.gateway.getJid();
    if (
      message.isFromMe ||
      (message.isGroup && !groupMessageAddressesBot(message, gatewayJid))
    )
      return;
    const existingIdentity = await this.whatsapp.findIdentityByExternalId(
      message.senderExternalId,
    );

    const recorded = await this.whatsapp.recordInbound({
      provider: 'whatsapp',
      providerMessageId: message.providerMessageId,
      senderExternalId: message.senderExternalId,
      externalIdentityId: existingIdentity?.id,
      receivedAt: message.receivedAt,
    });

    if (!recorded) return;
    await this.whatsapp.incrementTraffic(this.day(this.clock()), {
      inbound: 1,
    });

    try {
      let identity = existingIdentity;
      if (!identity && !message.isGroup)
        identity = await this.consumeLinkCode(message);
      if (!identity) return;
      if (!recorded.externalIdentityId)
        await this.whatsapp.associateInbound(recorded.id, identity.id);
      const state = await this.whatsapp.ensureContactState(identity.id);
      const now = this.clock();

      if (state.lastProactiveSentAt) {
        await this.whatsapp.recordInboundReply(identity.id, now);
      } else {
        await this.whatsapp.updateContactState(identity.id, {
          firstInboundAt: state.firstInboundAt ?? now,
          lastInboundAt: now,
        });
      }

      if (isOptOut(message.text)) {
        if (!state.optedOutAt) {
          await this.whatsapp.updateContactState(identity.id, {
            optedOutAt: now,
          });
          const user = await this.users.findById(identity.userId);
          if (user)
            await this.sendOutbound({
              userId: user.id,
              externalId: identity.externalId,
              content: `Hi, this is ${user.name}'s AI assistant. You are now opted out and I will not send further WhatsApp messages unless you message again. Reply START to resume or STOP to remain opted out.`,
              proactive: false,
              inbound: message,
              contactState: state,
            });
        }

        return;
      }

      const user = await this.users.findById(identity.userId);
      if (!user) return;
      const input = await this.ingestInboundMedia(user.id, message);
      const responded = await this.messages.handle({
        message,
        user,
        content: input.content,
        attachmentIds: input.attachmentIds,
        transformResponse: (content) =>
          state.firstResponseAt
            ? content
            : `Hi, this is ${user.name}'s AI assistant. ${content} Reply STOP to opt out.`,
        send: async (content) => {
          await this.sendOutbound({
            userId: user.id,
            externalId: identity.externalId,
            content,
            proactive: false,
            inbound: message,
            contactState: state,
          });
        },
      });

      if (!responded) return;
      await this.whatsapp.updateContactState(identity.id, {
        firstResponseAt: state.firstResponseAt ?? now,
        optedOutAt: null,
      });
    } catch (error) {
      this.logger.error(
        `WhatsApp inbound processing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await this.whatsapp.markInboundProcessed(recorded.id, this.clock());
    }
  }

  private async consumeLinkCode(message: NormalizedInboundMessage) {
    const candidate = message.text.trim().toUpperCase();
    if (!/^SYDIA-[A-Z0-9]{8}$/.test(candidate)) return null;
    const link = await this.whatsapp.findLinkCodeByHash(
      this.hashCode(candidate),
      this.clock(),
    );

    if (
      !link ||
      !(await this.whatsapp.consumeLinkCode(
        link.id,
        message.senderExternalId,
        this.clock(),
      ))
    )
      return null;
    const existing = await this.whatsapp.findIdentityByExternalId(
      message.senderExternalId,
    );

    if (existing) return existing;
    const identity = await this.whatsapp.createIdentity({
      userId: link.userId,
      externalId: message.senderExternalId,
      verifiedAt: this.clock(),
    });

    await this.audit.record({
      userId: link.userId,
      eventType: 'whatsapp.identity.linked',
      metadata: { externalId: message.senderExternalId },
    });

    return identity;
  }

  private async ingestInboundMedia(
    userId: string,
    message: NormalizedInboundMessage,
  ): Promise<{ content: string; attachmentIds?: string[] }> {
    if (!message.mediaMessage || message.kind === 'unknown')
      return { content: message.text };
    const downloaded = await this.gateway.download(message.raw);
    const buffer = await readFile(downloaded);
    const media = message.mediaMessage;
    const mimeType =
      typeof media.mimetype === 'string'
        ? media.mimetype
        : message.kind === 'image'
          ? 'image/jpeg'
          : message.kind === 'voice'
            ? 'audio/ogg'
            : 'application/octet-stream';

    const filename =
      typeof media.fileName === 'string'
        ? media.fileName
        : `${message.providerMessageId}.${message.kind === 'voice' ? 'ogg' : 'bin'}`;

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

  private async sendOutbound(options: OutboundOptions) {
    return this.enqueue(async () => {
      const gateway = this.gateway.getStatus();
      if (gateway.sendingPaused || gateway.status !== 'connected')
        throw new Error('WhatsApp sending is paused.');
      const now = this.clock();
      const day = this.day(now);

      if (options.proactive) {
        const identity = await this.whatsapp.findIdentity(options.userId);
        const state = identity
          ? await this.whatsapp.getContactState(identity.id)
          : null;

        const preferences = await this.notifications.getPreferences(
          options.userId,
        );

        const user = await this.users.findById(options.userId);
        const traffic = await this.whatsapp.getTraffic(day);
        if (
          !state ||
          !user ||
          preferences?.whatsappNotificationsEnabled === false ||
          !traffic ||
          !senderCanReceiveProactive({
            ...state,
            now,
            timezone: user.timezone,
          }) ||
          !proactiveShareAllowed(
            traffic.inboundCount,
            traffic.proactiveCount,
          ) ||
          inQuietHours(now, user.timezone)
        )
          throw new Error('WhatsApp proactive delivery is not eligible.');
      }

      const reserved = await this.whatsapp.reserveOutbound({
        now,
        proactive: options.proactive,
        day,
      });

      if (!reserved)
        throw new Error(
          options.proactive
            ? 'WhatsApp proactive delivery is not eligible.'
            : 'WhatsApp outbound ceiling reached.',
        );

      if (options.inbound) {
        await this.gateway.markRead(
          [options.inbound.providerMessageId],
          options.inbound.chatExternalId,
          options.inbound.isGroup
            ? options.inbound.senderExternalId
            : undefined,
        );
        const delays = delayForReply(this.random, options.content);
        await this.sleep(delays.initial);
        await this.gateway.presence(
          options.inbound.chatExternalId,
          'composing',
        );
        await this.sleep(delays.typing);
      }

      const recipient = options.inbound?.isGroup
        ? options.inbound.chatExternalId
        : normalizeJid(options.externalId);

      const result = await this.gateway.send({
        recipientExternalId: recipient,
        content: options.content,
        replyToProviderMessageId: options.inbound?.providerMessageId,
      });

      const sentAt = this.clock();
      await this.whatsapp.incrementTraffic(day, {
        outbound: 1,
        ...(options.proactive ? { proactive: 1 } : {}),
      });

      if (options.proactive) {
        const identity = await this.whatsapp.findIdentity(options.userId);
        if (identity)
          await this.whatsapp.recordProactiveSent(identity.id, sentAt);
      }

      if (options.inbound)
        await this.gateway.presence(options.inbound.chatExternalId, 'paused');

      return { id: result.providerMessageId };
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.outboundQueue.then(operation, operation);
    this.outboundQueue = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  private day(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private async handleReceipt(receipt: {
    type: string;
    chat: string;
    sender: string;
    isGroup: boolean;
    ids: string[];
    timestamp: number;
  }): Promise<void> {
    if (!['read', 'played', 'delivered'].includes(receipt.type)) return;
    const identity = await this.whatsapp.findIdentityByExternalId(
      normalizeJid(receipt.isGroup ? receipt.sender : receipt.chat),
    );

    if (identity)
      await this.audit.record({
        userId: identity.userId,
        eventType: `whatsapp.receipt.${receipt.type}`,
        metadata: { ids: receipt.ids },
      });
  }
}
