import type {
  WhatsAppContactState as PrismaWhatsAppContactState,
  WhatsAppGatewayState as PrismaWhatsAppGatewayState,
  WhatsAppInboundMessage as PrismaWhatsAppInboundMessage,
  WhatsAppLinkCode as PrismaWhatsAppLinkCode,
  WhatsAppTrafficDaily as PrismaWhatsAppTrafficDaily,
} from '../../generated/prisma/client';

export type WhatsAppGatewayState = Pick<
  PrismaWhatsAppGatewayState,
  | 'id'
  | 'status'
  | 'registrationReady'
  | 'profileReady'
  | 'sendingPaused'
  | 'enforcementCode'
  | 'enforcementReason'
  | 'recoveryReason'
  | 'lastConnectedAt'
  | 'lastEventAt'
  | 'createdAt'
  | 'updatedAt'
>;

export type WhatsAppLinkCode = Pick<
  PrismaWhatsAppLinkCode,
  | 'id'
  | 'userId'
  | 'codeHash'
  | 'expiresAt'
  | 'consumedAt'
  | 'consumedByExternalId'
  | 'createdAt'
>;

export type WhatsAppContactState = Pick<
  PrismaWhatsAppContactState,
  | 'id'
  | 'externalIdentityId'
  | 'firstInboundAt'
  | 'firstResponseAt'
  | 'optedOutAt'
  | 'lastInboundAt'
  | 'lastProactiveSentAt'
  | 'lastProactiveReplyAt'
  | 'unansweredProactiveCount'
  | 'createdAt'
  | 'updatedAt'
>;

export type WhatsAppInboundMessage = Pick<
  PrismaWhatsAppInboundMessage,
  | 'id'
  | 'provider'
  | 'providerMessageId'
  | 'senderExternalId'
  | 'externalIdentityId'
  | 'receivedAt'
  | 'processedAt'
  | 'createdAt'
>;

export type WhatsAppTrafficDaily = Pick<
  PrismaWhatsAppTrafficDaily,
  | 'id'
  | 'day'
  | 'inboundCount'
  | 'outboundCount'
  | 'proactiveCount'
  | 'createdAt'
  | 'updatedAt'
>;
