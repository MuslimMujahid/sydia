import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma';
import { Prisma } from '../../generated/prisma/client';
import {
  WhatsAppConnectionConflict,
  WhatsAppConnectionRevoked,
  type WhatsAppConnection,
  type WhatsAppConnectionPatch,
  type WhatsAppConnectionScope,
  type WhatsAppRecoveryClaim,
} from '../entities';
import type { IWhatsAppConnectionRepository } from '../interfaces';

type Transaction = Prisma.TransactionClient;
const RECOVERY_DISPATCH_LEASE_MS = 60_000;
const MAX_RECOVERY_ATTEMPTS = 5;

const connectionSelect = {
  id: true,
  userId: true,
  deviceId: true,
  generation: true,
  active: true,
  assistantExternalId: true,
  ownerExternalId: true,
  ownerIdentityId: true,
  ownerVerifiedAt: true,
  setupPhase: true,
  status: true,
  reason: true,
  qrAttemptId: true,
  qrExpiresAt: true,
  ownerCodeHash: true,
  ownerCodeExpiresAt: true,
  outageId: true,
  disconnectedAt: true,
  reconnectAttempts: true,
  nextReconnectAt: true,
  cleanupAttempts: true,
  cleanupNeeded: true,
  lastConnectedAt: true,
  lastEventAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WhatsAppConnectionSelect;

function uniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class PrismaWhatsAppConnectionRepository implements IWhatsAppConnectionRepository {
  private readonly logger = new Logger(PrismaWhatsAppConnectionRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  async collectPendingMissed(
    scope: WhatsAppConnectionScope,
    outageId: string,
    recoveredAt: Date,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const connection = await this.current(tx, scope);
        if (
          !connection?.ownerVerifiedAt ||
          connection.status !== 'connected' ||
          connection.outageId !== outageId ||
          !connection.disconnectedAt
        )
          return 0;
        const preferences = await tx.userPreference.findUnique({
          where: { userId: connection.userId },
          select: { whatsappNotificationsEnabled: true },
        });

        if (preferences?.whatsappNotificationsEnabled === false) return 0;
        if (!connection.lastConnectedAt)
          throw new Error(
            'Recovered WhatsApp connection is missing its recovery time.',
          );
        const interval = {
          gte: connection.disconnectedAt,
          lte: new Date(
            Math.min(
              connection.lastConnectedAt.getTime(),
              recoveredAt.getTime(),
            ),
          ),
        };

        const candidates = await tx.whatsAppDeliveryBinding.findMany({
          where: {
            connectionId: scope.id,
            generation: scope.generation,
            outageId: null,
            delivery: {
              userId: connection.userId,
              channel: 'whatsapp',
              status: { in: ['pending', 'failed'] },
              OR: [
                {
                  kind: 'reminder',
                  reminderOccurrence: { occurrenceAt: interval },
                },
                {
                  kind: 'event_reminder',
                  whatsappBinding: { scheduledAt: interval },
                },
              ],
            },
          },
          select: {
            deliveryId: true,
            scheduledAt: true,
            delivery: {
              select: {
                reminderOccurrence: { select: { occurrenceAt: true } },
              },
            },
          },
          take: 10_001,
        });

        // A partial snapshot would falsely acknowledge a complete recovery. Fail
        // visibly on oversized episodes rather than silently omitting records.
        if (candidates.length > 10_000)
          throw new Error(
            'WhatsApp outage exceeds the 10000-record recovery collection bound. Inspect the pending outage.',
          );
        let collected = 0;

        for (const row of candidates) {
          const due =
            row.scheduledAt ?? row.delivery.reminderOccurrence?.occurrenceAt;

          if (!due)
            throw new Error(
              'Pending WhatsApp reminder lacks its original due time.',
            );
          const claimed = await tx.notificationDelivery.updateMany({
            where: {
              id: row.deliveryId,
              status: { in: ['pending', 'failed'] },
            },
            data: { status: 'missed', policyOutcome: 'transport_outage' },
          });

          if (!claimed.count) continue;
          await tx.whatsAppDeliveryBinding.update({
            where: { deliveryId: row.deliveryId },
            data: { outageId, missedAt: recoveredAt, scheduledAt: due },
          });
          collected++;
        }

        return collected;
      },
      { timeout: 30_000 },
    );
  }

  async claimRecovery(
    scope: WhatsAppConnectionScope,
    outageId: string,
    snapshot: { content: string; deliveryIds: string[] } | null,
    now: Date,
  ): Promise<WhatsAppRecoveryClaim> {
    return this.prisma.$transaction(async (tx) => {
      const connection = await this.current(tx, scope);
      if (!connection?.ownerVerifiedAt || connection.outageId !== outageId)
        return { state: 'obsolete' };
      const idempotencyKey = `whatsapp-recovery:${connection.id}:${outageId}`;
      const existing = await tx.notificationDelivery.findUnique({
        where: {
          userId_idempotencyKey_channel: {
            userId: connection.userId,
            idempotencyKey,
            channel: 'whatsapp',
          },
        },
        select: {
          id: true,
          content: true,
          status: true,
          attemptedAt: true,
          whatsappBinding: true,
        },
      });

      if (
        existing &&
        (!existing.whatsappBinding ||
          existing.whatsappBinding.connectionId !== scope.id ||
          existing.whatsappBinding.generation !== scope.generation)
      )
        throw new WhatsAppConnectionRevoked();

      if (existing?.status === 'attempting' && !existing.attemptedAt)
        throw new Error('WhatsApp recovery claim is missing its attempt time.');
      if (
        existing?.status === 'attempting' &&
        existing.attemptedAt &&
        now.getTime() - existing.attemptedAt.getTime() <
          RECOVERY_DISPATCH_LEASE_MS
      )
        return { state: 'in_progress' };

      if (existing && !['pending', 'failed'].includes(existing.status)) {
        const binding = existing.whatsappBinding;
        const payload = binding?.payload;
        if (
          !binding ||
          binding.connectionId !== scope.id ||
          binding.generation !== scope.generation ||
          binding.outageId !== outageId ||
          !payload ||
          typeof payload !== 'object' ||
          Array.isArray(payload) ||
          !Array.isArray(payload.coveredDeliveryIds) ||
          !payload.coveredDeliveryIds.every(
            (id): id is string => typeof id === 'string',
          )
        )
          throw new Error(
            'WhatsApp recovery summary is missing its scoped coverage evidence.',
          );

        if (existing.status === 'attempting') {
          // The send lock has a 45-second transaction deadline. A stale claim
          // remains uncertain even if the provider call later finishes; it is
          // never evidence that dispatch was rejected after a worker crash.
          await tx.notificationDelivery.update({
            where: { id: existing.id },
            data: {
              status: 'unknown',
              lastError:
                'Recovery worker stopped before recording provider acknowledgment.',
            },
          });
          this.logger.warn(
            `Stale WhatsApp recovery claim ${existing.id} is now unknown; it will not be replayed.`,
          );
        } else if (
          ![
            'delivered',
            'unknown',
            'skipped_disabled',
            'skipped_obsolete',
          ].includes(existing.status)
        ) {
          throw new Error(
            `Unexpected WhatsApp recovery status: ${existing.status}`,
          );
        }

        return { state: 'terminal', deliveryIds: payload.coveredDeliveryIds };
      }

      if (!snapshot) {
        if (existing)
          await tx.notificationDelivery.update({
            where: { id: existing.id },
            data: { status: 'skipped_obsolete' },
          });

        return { state: 'empty' };
      }

      let attemptCount = 0;

      if (existing) {
        const prior = existing.whatsappBinding?.payload;

        if (
          prior &&
          typeof prior === 'object' &&
          !Array.isArray(prior) &&
          'attemptCount' in prior
        ) {
          if (
            typeof prior.attemptCount !== 'number' ||
            !Number.isSafeInteger(prior.attemptCount) ||
            prior.attemptCount < 0
          )
            throw new Error('WhatsApp recovery attempt budget is malformed.');
          attemptCount = prior.attemptCount;
        } else {
          // Upgrade a prepared summary from before durable attempt counters.
          // New claims always write the counter atomically with their content.
          this.logger.warn(
            `Upgrading legacy recovery budget for ${existing.id} from recorded failures.`,
          );
          attemptCount = await tx.notificationDeliveryAttempt.count({
            where: { deliveryId: existing.id, status: 'failed' },
          });
        }
      }

      if (attemptCount >= MAX_RECOVERY_ATTEMPTS) return { state: 'exhausted' };

      const eligible = await tx.whatsAppDeliveryBinding.count({
        where: {
          connectionId: scope.id,
          generation: scope.generation,
          outageId,
          deliveryId: { in: snapshot.deliveryIds },
          delivery: { status: 'missed', userId: connection.userId },
        },
      });

      if (eligible !== snapshot.deliveryIds.length)
        throw new Error(
          'WhatsApp recovery coverage contains missing or out-of-scope deliveries.',
        );

      const summary = existing
        ? await tx.notificationDelivery.update({
            where: { id: existing.id },
            data: {
              content: snapshot.content,
              status: 'attempting',
              attemptedAt: now,
            },
            select: { id: true, content: true },
          })
        : await tx.notificationDelivery.create({
            data: {
              userId: connection.userId,
              kind: 'recovery_summary',
              channel: 'whatsapp',
              proactive: false,
              content: snapshot.content,
              idempotencyKey,
              status: 'attempting',
              attemptedAt: now,
            },
            select: { id: true, content: true },
          });

      // The content and exact coverage become one durable claim. A retry that
      // has not dispatched may refresh both, never just one of these records.
      await tx.whatsAppDeliveryBinding.upsert({
        where: { deliveryId: summary.id },
        create: {
          deliveryId: summary.id,
          connectionId: scope.id,
          generation: scope.generation,
          outageId,
          payload: {
            coveredDeliveryIds: snapshot.deliveryIds,
            attemptCount: attemptCount + 1,
          },
        },
        update: {
          connectionId: scope.id,
          generation: scope.generation,
          outageId,
          payload: {
            coveredDeliveryIds: snapshot.deliveryIds,
            attemptCount: attemptCount + 1,
          },
        },
      });

      return { state: 'claimed', summary, deliveryIds: snapshot.deliveryIds };
    });
  }

  deliveryScope(deliveryId: string) {
    return this.prisma.whatsAppDeliveryBinding.findUnique({
      where: { deliveryId },
      select: { connectionId: true, generation: true },
    });
  }

  async hasConsent(userId: string, kind: string) {
    return (
      (await this.prisma.whatsAppConsent.count({ where: { userId, kind } })) > 0
    );
  }

  async recordMissed(
    deliveryId: string,
    outageId: string,
    scheduledAt: Date,
    payload: Record<string, unknown>,
  ) {
    await this.prisma.whatsAppDeliveryBinding.update({
      where: { deliveryId },
      data: {
        outageId,
        missedAt: new Date(),
        scheduledAt,
        payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonObject,
      },
    });
  }

  async missed(scope: WhatsAppConnectionScope, outageId: string) {
    const rows = await this.prisma.whatsAppDeliveryBinding.findMany({
      where: {
        connectionId: scope.id,
        generation: scope.generation,
        outageId,
        summarizedAt: null,
        delivery: { status: 'missed' },
      },
      include: { delivery: true },
      orderBy: { scheduledAt: 'asc' },
    });

    return rows.map((row) => {
      if (!row.scheduledAt)
        throw new Error(
          'Missed WhatsApp reminder is missing its scheduled time.',
        );

      return {
        deliveryId: row.deliveryId,
        content: row.delivery.content,
        kind: row.delivery.kind,
        sourceId: row.delivery.sourceId,
        scheduledAt: row.scheduledAt,
        payload: row.payload,
      };
    });
  }

  async completeRecovery(
    scope: WhatsAppConnectionScope,
    outageId: string,
    deliveryIds: string[],
    now: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const connection = await this.current(tx, scope);
      if (!connection || connection.outageId !== outageId) return false;

      await tx.whatsAppDeliveryBinding.updateMany({
        where: {
          connectionId: scope.id,
          generation: scope.generation,
          outageId,
          deliveryId: { in: deliveryIds },
          summarizedAt: null,
        },
        data: { summarizedAt: now },
      });
      await tx.whatsAppConnection.update({
        where: { id: scope.id },
        data: {
          outageId: null,
          disconnectedAt: null,
          reconnectAttempts: 0,
          nextReconnectAt: null,
        },
      });

      return true;
    });
  }

  async reconcileReceipt(
    scope: WhatsAppConnectionScope,
    input: Parameters<IWhatsAppConnectionRepository['reconcileReceipt']>[1],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const connection = await this.current(tx, scope);
      if (
        !connection?.ownerVerifiedAt ||
        connection.ownerExternalId !== input.ownerExternalId
      )
        return 0;

      // Evidence advances monotonically. Repeated and out-of-order receipts
      // cannot duplicate reconciliation or downgrade read/played evidence.
      const strongerEvidence =
        input.type === 'delivered'
          ? ['receipt_delivered', 'receipt_read', 'receipt_played']
          : input.type === 'read'
            ? ['receipt_read', 'receipt_played']
            : ['receipt_played'];

      const matched = await tx.notificationDelivery.findMany({
        where: {
          userId: connection.userId,
          channel: 'whatsapp',
          providerMessageId: { in: input.messageIds },
          status: { in: ['attempting', 'unknown', 'delivered'] },
          OR: [
            { policyOutcome: null },
            { policyOutcome: { notIn: strongerEvidence } },
          ],
          whatsappBinding: {
            connectionId: scope.id,
            generation: scope.generation,
          },
        },
        select: { id: true, deliveredAt: true },
      });

      for (const delivery of matched) {
        await tx.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'delivered',
            policyOutcome: `receipt_${input.type}`,
            deliveredAt: delivery.deliveredAt ?? input.receivedAt,
            failedAt: null,
            lastError: null,
          },
        });
      }

      await tx.notificationDeliveryAttempt.updateMany({
        where: {
          deliveryId: { in: matched.map(({ id }) => id) },
          providerMessageId: { in: input.messageIds },
          status: { in: ['attempting', 'unknown'] },
        },
        data: {
          status: 'delivered',
          deliveredAt: input.receivedAt,
          errorMessage: null,
        },
      });

      return matched.length;
    });
  }

  async reminderDueAt(userId: string, deliveryId: string) {
    const row = await this.prisma.notificationDelivery.findFirst({
      where: { id: deliveryId, userId },
      select: { reminderOccurrence: { select: { occurrenceAt: true } } },
    });

    return row?.reminderOccurrence?.occurrenceAt ?? null;
  }

  async reminderIsCurrent(userId: string, deliveryId: string) {
    const row = await this.prisma.notificationDelivery.findFirst({
      where: { id: deliveryId, userId, kind: 'reminder' },
      include: { reminderOccurrence: { include: { reminder: true } } },
    });

    if (!row) return false;
    const occurrence = row.reminderOccurrence;

    return Boolean(
      occurrence &&
      occurrence.reminder.userId === userId &&
      !['cancelled', 'obsolete'].includes(occurrence.status),
    );
  }

  async resetOwner(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const connection = await tx.whatsAppConnection.findFirst({
        where: { userId, active: true },
      });

      if (!connection) return null;
      await this.lock(tx, connection.id);

      return tx.whatsAppConnection.update({
        where: { id: connection.id },
        data: {
          generation: { increment: 1 },
          ownerExternalId: null,
          ownerIdentityId: null,
          ownerVerifiedAt: null,
          ownerCodeHash: null,
          ownerCodeExpiresAt: null,
          setupPhase: 'owner_verification',
          outageId: null,
        },
        select: connectionSelect,
      });
    });
  }

  async setQr(
    scope: WhatsAppConnectionScope,
    attemptId: string,
    image: Uint8Array,
    expiresAt: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const connection = await this.current(tx, scope);
      if (!connection || connection.assistantExternalId) return false;
      await tx.whatsAppConnection.update({
        where: { id: scope.id },
        data: {
          qrImage: Uint8Array.from(image),
          qrAttemptId: attemptId,
          qrExpiresAt: expiresAt,
          setupPhase: 'pairing',
          status: 'awaiting_pair',
        },
      });

      return true;
    });
  }

  async getQr(userId: string, attemptId: string, now: Date) {
    const record = await this.prisma.whatsAppConnection.findFirst({
      where: {
        userId,
        active: true,
        qrAttemptId: attemptId,
        qrExpiresAt: { gt: now },
        setupPhase: 'pairing',
      },
      select: { qrImage: true },
    });

    return record?.qrImage ?? null; // Expected absence: expired, revoked, or another user's attempt.
  }

  async claimCleanup(id: string, attempts: number) {
    if (attempts >= 3) return false;
    const result = await this.prisma.whatsAppConnection.updateMany({
      where: {
        id,
        OR: [{ active: false }, { setupPhase: 'qr_expired' }],
        cleanupNeeded: true,
        cleanupAttempts: attempts,
      },
      data: { cleanupAttempts: { increment: 1 } },
    });

    return result.count === 1;
  }

  async claimReconnect(scope: WhatsAppConnectionScope, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const connection = await this.current(tx, scope);
      if (
        !connection ||
        connection.status !== 'disconnected' ||
        connection.reconnectAttempts >= 3 ||
        !connection.nextReconnectAt ||
        connection.nextReconnectAt > now
      )
        return false;
      const attempts = connection.reconnectAttempts + 1;
      await tx.whatsAppConnection.update({
        where: { id: scope.id },
        data: {
          reconnectAttempts: attempts,
          nextReconnectAt:
            attempts < 3
              ? new Date(now.getTime() + (attempts === 1 ? 30_000 : 120_000))
              : null,
          reason:
            attempts === 3
              ? 'Koneksi perlu dipulihkan. Coba sambungkan kembali.'
              : connection.reason,
        },
      });

      return true;
    });
  }

  async cleanupResult(id: string, error: string | null) {
    await this.prisma.whatsAppConnection.update({
      where: { id },
      data: {
        cleanupNeeded: error !== null,
        reason: error,
      },
    });
  }

  async create(userId: string, deviceId: string): Promise<WhatsAppConnection> {
    try {
      return await this.prisma.whatsAppConnection.create({
        data: { userId, deviceId },
        select: connectionSelect,
      });
    } catch (error) {
      if (uniqueViolation(error)) throw new WhatsAppConnectionConflict();
      throw error;
    }
  }

  findLatest(userId: string) {
    return this.prisma.whatsAppConnection.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: connectionSelect,
    });
  }

  findActive(userId: string) {
    return this.prisma.whatsAppConnection.findFirst({
      where: { userId, active: true },
      select: connectionSelect,
    });
  }

  findDevice(deviceId: string) {
    return this.prisma.whatsAppConnection.findUnique({
      where: { deviceId },
      select: connectionSelect,
    });
  }

  listRuntime() {
    return this.prisma.whatsAppConnection.findMany({
      where: {
        OR: [
          { active: true },
          { cleanupNeeded: true, cleanupAttempts: { lt: 3 } },
        ],
      },
      select: connectionSelect,
    });
  }

  private async lock(tx: Transaction, id: string) {
    await tx.$queryRaw`SELECT id FROM whatsapp_connection WHERE id = ${id} FOR UPDATE`;
  }

  private async current(tx: Transaction, scope: WhatsAppConnectionScope) {
    await this.lock(tx, scope.id);

    return tx.whatsAppConnection.findFirst({
      where: { id: scope.id, generation: scope.generation, active: true },
      select: connectionSelect,
    });
  }

  async update(scope: WhatsAppConnectionScope, patch: WhatsAppConnectionPatch) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.current(tx, scope))) return null;

      return tx.whatsAppConnection.update({
        where: { id: scope.id },
        data: {
          ...patch,
          ...(patch.qrAttemptId === null ? { qrImage: null } : {}),
        },
        select: connectionSelect,
      });
    });
  }

  async confirmAssistant(
    scope: WhatsAppConnectionScope,
    externalId: string,
    now: Date,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const connection = await this.current(tx, scope);
        if (!connection) return null;
        // The provider request may finish after the QR expired or was canceled.
        // Enforce validity under the same lock that grants account authority.
        if (
          !connection.assistantExternalId &&
          (connection.setupPhase === 'qr_expired' ||
            (connection.qrExpiresAt && connection.qrExpiresAt <= now))
        )
          return null;
        if (
          connection.assistantExternalId &&
          connection.assistantExternalId !== externalId
        )
          throw new WhatsAppConnectionRevoked();

        return tx.whatsAppConnection.update({
          where: { id: scope.id },
          data: {
            assistantExternalId: externalId,
            status: 'connected',
            setupPhase: connection.ownerVerifiedAt
              ? 'ready'
              : 'owner_verification',
            qrImage: null,
            qrAttemptId: null,
            qrExpiresAt: null,
            lastConnectedAt:
              connection.outageId &&
              connection.status === 'connected' &&
              connection.lastConnectedAt
                ? connection.lastConnectedAt
                : now,
            reason: null,
          },
          select: connectionSelect,
        });
      });
    } catch (error) {
      if (uniqueViolation(error)) throw new WhatsAppConnectionConflict();
      throw error;
    }
  }

  async issueOwnerCode(
    scope: WhatsAppConnectionScope,
    hash: string,
    expiresAt: Date,
    condition?: { expectedHash: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const connection = await this.current(tx, scope);
      if (
        !connection ||
        !connection.assistantExternalId ||
        connection.status !== 'connected' ||
        connection.ownerVerifiedAt ||
        (condition && connection.ownerCodeHash !== condition.expectedHash)
      )
        return false;
      await tx.whatsAppConnection.update({
        where: { id: scope.id },
        data: { ownerCodeHash: hash, ownerCodeExpiresAt: expiresAt },
      });

      return true;
    });
  }

  async verifyOwner(
    scope: WhatsAppConnectionScope,
    hash: string,
    sender: string,
    now: Date,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const connection = await this.current(tx, scope);
        if (
          !connection ||
          connection.status !== 'connected' ||
          !connection.assistantExternalId ||
          connection.ownerVerifiedAt ||
          connection.ownerCodeHash !== hash ||
          !connection.ownerCodeExpiresAt ||
          connection.ownerCodeExpiresAt <= now ||
          connection.assistantExternalId === sender
        )
          return null;
        const priorIdentity = await tx.externalIdentity.findUnique({
          where: {
            provider_externalId: { provider: 'whatsapp', externalId: sender },
          },
        });

        if (priorIdentity && priorIdentity.userId !== connection.userId)
          throw new WhatsAppConnectionConflict();
        const identity =
          priorIdentity ??
          (await tx.externalIdentity.create({
            data: {
              provider: 'whatsapp',
              externalId: sender,
              userId: connection.userId,
              verifiedAt: now,
            },
          }));

        return tx.whatsAppConnection.update({
          where: { id: scope.id },
          data: {
            ownerExternalId: sender,
            ownerIdentityId: identity.id,
            ownerVerifiedAt: now,
            setupPhase: 'ready',
            ownerCodeHash: null,
            ownerCodeExpiresAt: null,
          },
          select: connectionSelect,
        });
      });
    } catch (error) {
      if (uniqueViolation(error)) throw new WhatsAppConnectionConflict();
      throw error;
    }
  }

  async revoke(userId: string, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      // User lock also serializes revocation when a login request races with disconnect.
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
      const connection = await tx.whatsAppConnection.findFirst({
        where: { userId, active: true },
        select: connectionSelect,
      });

      if (!connection) return null;
      await this.lock(tx, connection.id);

      return tx.whatsAppConnection.update({
        where: { id: connection.id },
        data: {
          active: false,
          generation: { increment: 1 },
          revokedAt: now,
          setupPhase: 'revoked',
          status: 'disconnected',
          ownerCodeHash: null,
          ownerCodeExpiresAt: null,
          qrImage: null,
          qrAttemptId: null,
          qrExpiresAt: null,
          cleanupNeeded: true,
        },
        select: connectionSelect,
      });
    });
  }

  async recordInbound(
    scope: WhatsAppConnectionScope,
    input: {
      providerMessageId: string;
      senderExternalId: string;
      receivedAt: Date;
    },
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!(await this.current(tx, scope))) return null;
        const row = await tx.whatsAppConnectionInbound.create({
          data: {
            connectionId: scope.id,
            generation: scope.generation,
            ...input,
          },
          select: { id: true },
        });

        return row.id;
      });
    } catch (error) {
      if (uniqueViolation(error)) return null; // Expected webhook replay, not an infrastructure failure.
      throw error;
    }
  }

  async finishInbound(
    id: string,
    outcome: { status: 'processed' | 'failed'; error?: string; now: Date },
  ) {
    await this.prisma.whatsAppConnectionInbound.update({
      where: { id },
      data: {
        status: outcome.status,
        error: outcome.error,
        processedAt: outcome.status === 'processed' ? outcome.now : null,
      },
    });
  }

  async serialized<T>(
    scope: WhatsAppConnectionScope,
    operation: (connection: WhatsAppConnection) => Promise<T>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const connection = await this.current(tx, scope);
        if (!connection) throw new WhatsAppConnectionRevoked();

        return operation(connection);
      },
      { timeout: 45_000, maxWait: 10_000 },
    );
  }

  async serializedSetup<T>(
    userId: string,
    operation: () => Promise<T>,
    timeoutMs: number,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('whatsapp-setup'), hashtext(${userId}))`;

        return operation();
      },
      { timeout: timeoutMs, maxWait: 5_000 },
    );
  }
}
