import type {
  WhatsAppConnection,
  WhatsAppConnectionPatch,
  WhatsAppConnectionScope,
  WhatsAppDeliveryScope,
  WhatsAppMissedDelivery,
  WhatsAppRecoveryClaim,
} from '../entities';

export const WHATSAPP_CONNECTION_REPOSITORY = Symbol(
  'IWhatsAppConnectionRepository',
);

export interface IWhatsAppConnectionRepository {
  collectPendingMissed(
    scope: WhatsAppConnectionScope,
    outageId: string,
    recoveredAt: Date,
  ): Promise<number>;
  claimRecovery(
    scope: WhatsAppConnectionScope,
    outageId: string,
    snapshot: { content: string; deliveryIds: string[] } | null,
    now: Date,
  ): Promise<WhatsAppRecoveryClaim>;
  serializedSetup<T>(
    userId: string,
    operation: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T>;
  setQr(
    scope: WhatsAppConnectionScope,
    attemptId: string,
    image: Uint8Array,
    expiresAt: Date,
  ): Promise<boolean>;
  getQr(
    userId: string,
    attemptId: string,
    now: Date,
  ): Promise<Uint8Array | null>;
  claimCleanup(id: string, attempts: number): Promise<boolean>;
  claimReconnect(scope: WhatsAppConnectionScope, now: Date): Promise<boolean>;
  cleanupResult(id: string, error: string | null): Promise<void>;
  deliveryScope(deliveryId: string): Promise<WhatsAppDeliveryScope | null>;
  hasConsent(userId: string, kind: string): Promise<boolean>;
  recordMissed(
    deliveryId: string,
    outageId: string,
    scheduledAt: Date,
    payload: Record<string, unknown>,
  ): Promise<void>;
  missed(
    scope: WhatsAppConnectionScope,
    outageId: string,
  ): Promise<WhatsAppMissedDelivery[]>;
  completeRecovery(
    scope: WhatsAppConnectionScope,
    outageId: string,
    deliveryIds: string[],
    now: Date,
  ): Promise<boolean>;
  reconcileReceipt(
    scope: WhatsAppConnectionScope,
    input: {
      ownerExternalId: string;
      messageIds: string[];
      type: 'delivered' | 'read' | 'played';
      receivedAt: Date;
    },
  ): Promise<number>;
  reminderDueAt(userId: string, deliveryId: string): Promise<Date | null>;
  reminderIsCurrent(userId: string, deliveryId: string): Promise<boolean>;
  resetOwner(userId: string): Promise<WhatsAppConnection | null>;
  create(userId: string, deviceId: string): Promise<WhatsAppConnection>;
  findLatest(userId: string): Promise<WhatsAppConnection | null>;
  findActive(userId: string): Promise<WhatsAppConnection | null>;
  findDevice(deviceId: string): Promise<WhatsAppConnection | null>;
  listRuntime(): Promise<WhatsAppConnection[]>;
  update(
    scope: WhatsAppConnectionScope,
    patch: WhatsAppConnectionPatch,
  ): Promise<WhatsAppConnection | null>;
  confirmAssistant(
    scope: WhatsAppConnectionScope,
    externalId: string,
    now: Date,
  ): Promise<WhatsAppConnection | null>;
  issueOwnerCode(
    scope: WhatsAppConnectionScope,
    hash: string,
    expiresAt: Date,
    condition?: { expectedHash: string | null },
  ): Promise<boolean>;
  verifyOwner(
    scope: WhatsAppConnectionScope,
    hash: string,
    sender: string,
    now: Date,
  ): Promise<WhatsAppConnection | null>;
  revoke(userId: string, now: Date): Promise<WhatsAppConnection | null>;
  recordInbound(
    scope: WhatsAppConnectionScope,
    input: {
      providerMessageId: string;
      senderExternalId: string;
      receivedAt: Date;
    },
  ): Promise<string | null>;
  finishInbound(
    id: string,
    outcome: { status: 'processed' | 'failed'; error?: string; now: Date },
  ): Promise<void>;
  /** Serializes side effects across processes and fences revocation for their duration. */
  serialized<T>(
    scope: WhatsAppConnectionScope,
    operation: (connection: WhatsAppConnection) => Promise<T>,
  ): Promise<T>;
}
