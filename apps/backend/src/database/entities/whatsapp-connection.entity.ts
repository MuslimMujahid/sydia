import type {
  WhatsAppConnection as PrismaWhatsAppConnection,
  NotificationDelivery as PrismaNotificationDelivery,
} from '../../generated/prisma/client';

export type WhatsAppConnection = Pick<
  PrismaWhatsAppConnection,
  | 'id'
  | 'userId'
  | 'deviceId'
  | 'generation'
  | 'active'
  | 'assistantExternalId'
  | 'ownerExternalId'
  | 'ownerIdentityId'
  | 'ownerVerifiedAt'
  | 'setupPhase'
  | 'status'
  | 'reason'
  | 'qrAttemptId'
  | 'qrExpiresAt'
  | 'ownerCodeHash'
  | 'ownerCodeExpiresAt'
  | 'outageId'
  | 'disconnectedAt'
  | 'reconnectAttempts'
  | 'nextReconnectAt'
  | 'cleanupAttempts'
  | 'cleanupNeeded'
  | 'lastConnectedAt'
  | 'lastEventAt'
  | 'revokedAt'
  | 'createdAt'
  | 'updatedAt'
>;

export type WhatsAppConnectionScope = Pick<
  WhatsAppConnection,
  'id' | 'generation'
>;
export type WhatsAppConnectionPatch = Partial<
  Pick<
    WhatsAppConnection,
    | 'setupPhase'
    | 'status'
    | 'reason'
    | 'qrAttemptId'
    | 'qrExpiresAt'
    | 'outageId'
    | 'disconnectedAt'
    | 'reconnectAttempts'
    | 'nextReconnectAt'
    | 'cleanupAttempts'
    | 'cleanupNeeded'
    | 'lastConnectedAt'
    | 'lastEventAt'
  >
>;

export class WhatsAppConnectionConflict extends Error {
  constructor() {
    super('WhatsApp account is already in use.');
  }
}
export class WhatsAppConnectionRevoked extends Error {
  constructor() {
    super('WhatsApp connection is no longer authorized.');
  }
}

export type WhatsAppDeliveryScope = {
  connectionId: string | null;
  generation: number | null;
};
export type WhatsAppMissedDelivery = {
  deliveryId: string;
  content: string;
  kind: string;
  sourceId: string | null;
  scheduledAt: Date;
  payload: unknown;
};

export type WhatsAppRecoveryClaim =
  | { state: 'obsolete' | 'empty' | 'in_progress' | 'exhausted' }
  | { state: 'terminal'; deliveryIds: string[] }
  | {
      state: 'claimed';
      summary: Pick<PrismaNotificationDelivery, 'id' | 'content'>;
      deliveryIds: string[];
    };
