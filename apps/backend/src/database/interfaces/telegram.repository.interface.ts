import type {
  ExternalIdentity,
  TelegramInboundMessage,
  TelegramLinkToken,
  TelegramProfile,
} from '../entities';

/**
 * Outcome of atomically consuming a link token into a verified identity.
 *
 * `identity_conflict` and `token_unavailable` are decided before any write, so
 * a refused link never consumes the token or releases the current identity.
 */
export type TelegramLinkCommit =
  | { status: 'linked'; identity: ExternalIdentity }
  | { status: 'token_unavailable' }
  | { status: 'identity_conflict' };

export interface ITelegramRepository {
  findIdentity(userId: string): Promise<ExternalIdentity | null>;
  findIdentityByExternalId(
    externalId: string,
  ): Promise<ExternalIdentity | null>;
  revokeIdentity(userId: string): Promise<boolean>;
  createLinkToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<TelegramLinkToken>;
  /**
   * Consumes the token matching `tokenHash` and binds `externalId` to the token's
   * owner in one transaction. The token's `userId` is resolved inside that
   * transaction, and the user's previous identity is only released once the new
   * binding is written, so a mid-flight failure cannot leave the user unlinked.
   */
  commitLink(input: {
    tokenHash: string;
    externalId: string;
    now: Date;
  }): Promise<TelegramLinkCommit>;
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
