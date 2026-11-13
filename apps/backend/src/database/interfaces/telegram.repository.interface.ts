import type {
  ExternalIdentity,
  TelegramInboundMessage,
  TelegramLinkToken,
  TelegramProfile,
} from '../entities';

/**
 * Outcome of atomically consuming a link token into a verified identity.
 *
 * An unavailable token never releases an existing identity. A valid token
 * transfers the Telegram account to its owner, disconnecting any previous owner.
 */
export type TelegramLinkCommit =
  | { status: 'linked'; identity: ExternalIdentity }
  | { status: 'token_unavailable' };

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
   * transaction. Previous bindings are replaced atomically, with a fresh identity
   * when ownership changes so the accounts' channel conversations stay separate.
   * A mid-flight failure restores the previous bindings and token.
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
