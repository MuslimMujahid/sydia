import type {
  TelegramInboundMessage as PrismaTelegramInboundMessage,
  TelegramLinkToken as PrismaTelegramLinkToken,
  TelegramProfile as PrismaTelegramProfile,
} from '../../generated/prisma/client';

export type TelegramLinkToken = Pick<
  PrismaTelegramLinkToken,
  | 'id'
  | 'userId'
  | 'tokenHash'
  | 'expiresAt'
  | 'consumedAt'
  | 'consumedByExternalId'
  | 'createdAt'
>;

export type TelegramProfile = Pick<
  PrismaTelegramProfile,
  | 'id'
  | 'externalIdentityId'
  | 'username'
  | 'firstName'
  | 'lastName'
  | 'lastInboundAt'
  | 'createdAt'
  | 'updatedAt'
>;

export type TelegramInboundMessage = Pick<
  PrismaTelegramInboundMessage,
  | 'id'
  | 'providerMessageId'
  | 'senderExternalId'
  | 'chatExternalId'
  | 'externalIdentityId'
  | 'receivedAt'
  | 'processedAt'
  | 'createdAt'
>;
