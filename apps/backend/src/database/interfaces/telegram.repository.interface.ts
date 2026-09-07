import type {
  ExternalIdentity,
  TelegramInboundMessage,
  TelegramLinkToken,
  TelegramProfile,
} from '../entities';

export interface ITelegramRepository {
  findIdentity(userId: string): Promise<ExternalIdentity | null>;
  findIdentityByExternalId(
    externalId: string,
  ): Promise<ExternalIdentity | null>;
  createIdentity(input: {
    userId: string;
    externalId: string;
    verifiedAt: Date;
  }): Promise<ExternalIdentity>;
  revokeIdentity(userId: string): Promise<boolean>;
  createLinkToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<TelegramLinkToken>;
  findLinkTokenByHash(
    tokenHash: string,
    now: Date,
  ): Promise<TelegramLinkToken | null>;
  consumeLinkToken(id: string, externalId: string, now: Date): Promise<boolean>;
  getProfile(externalIdentityId: string): Promise<TelegramProfile | null>;
  upsertProfile(input: {
    externalIdentityId: string;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    lastInboundAt?: Date | null;
  }): Promise<TelegramProfile>;
  recordInbound(input: {
    providerMessageId: string;
    senderExternalId: string;
    chatExternalId: string;
    externalIdentityId?: string | null;
    receivedAt: Date;
  }): Promise<TelegramInboundMessage | null>;
  associateInbound(id: string, externalIdentityId: string): Promise<void>;
  markInboundProcessed(id: string, processedAt: Date): Promise<void>;
}

export const TELEGRAM_REPOSITORY = Symbol('ITelegramRepository');
