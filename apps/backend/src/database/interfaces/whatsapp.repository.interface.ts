import type {
  ExternalIdentity,
  WhatsAppContactState,
  WhatsAppGatewayState,
  WhatsAppInboundMessage,
  WhatsAppLinkCode,
  WhatsAppTrafficDaily,
} from '../entities';

export interface IWhatsAppRepository {
  getGatewayState(): Promise<WhatsAppGatewayState | null>;
  updateGatewayState(
    input: Partial<
      Omit<WhatsAppGatewayState, 'id' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<WhatsAppGatewayState>;
  findLinkCodeByHash(
    codeHash: string,
    now?: Date,
  ): Promise<WhatsAppLinkCode | null>;
  createLinkCode(input: {
    userId: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<WhatsAppLinkCode>;
  consumeLinkCode(id: string, externalId: string, now: Date): Promise<boolean>;
  findIdentity(userId: string): Promise<ExternalIdentity | null>;
  findIdentityByExternalId(
    externalId: string,
  ): Promise<ExternalIdentity | null>;
  createIdentity(input: {
    userId: string;
    externalId: string;
    verifiedAt?: Date | null;
  }): Promise<ExternalIdentity>;
  revokeIdentity(userId: string): Promise<boolean>;
  getContactState(
    externalIdentityId: string,
  ): Promise<WhatsAppContactState | null>;
  ensureContactState(externalIdentityId: string): Promise<WhatsAppContactState>;
  updateContactState(
    externalIdentityId: string,
    input: Partial<
      Omit<
        WhatsAppContactState,
        'id' | 'externalIdentityId' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<WhatsAppContactState>;
  recordInbound(input: {
    provider: string;
    providerMessageId: string;
    senderExternalId: string;
    externalIdentityId?: string | null;
    receivedAt: Date;
  }): Promise<WhatsAppInboundMessage | null>;
  associateInbound(id: string, externalIdentityId: string): Promise<void>;
  markInboundProcessed(id: string, processedAt?: Date): Promise<void>;
  recordProactiveSent(
    externalIdentityId: string,
    sentAt: Date,
  ): Promise<WhatsAppContactState>;
  recordInboundReply(
    externalIdentityId: string,
    receivedAt: Date,
  ): Promise<WhatsAppContactState>;
  getTraffic(day: Date): Promise<WhatsAppTrafficDaily | null>;
  incrementTraffic(
    day: Date,
    counts: {
      inbound?: number;
      outbound?: number;
      proactive?: number;
    },
  ): Promise<WhatsAppTrafficDaily>;
  reserveOutbound(input: {
    now: Date;
    proactive: boolean;
    day: Date;
  }): Promise<boolean>;
}

export const WHATSAPP_REPOSITORY = Symbol('IWhatsAppRepository');
