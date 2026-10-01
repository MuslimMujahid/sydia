import { randomUUID, createHash } from 'node:crypto';
import { withdrawConnectedMemorySources } from './prisma-memory-coordination';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type {
  MemoryBank,
  MemorySource,
  MemoryDelivery,
  MemoryDeliveryState,
  MemorySourceSnapshot,
  ResolvedMemoryReference,
  MemoryCheckpoint,
  MemoryIngestionSegment,
  MemoryRollback,
  MemoryRollbackBoundary,
} from '../entities';
import type {
  IHindsightRepository,
  EnqueueMemorySource,
  MemorySourceWriteResult,
  MemorySourcesWriteResult,
  ReconcileMemoryRollback,
  MemoryRollbackResult,
} from '../interfaces';

const bankSelect = {
  id: true,
  userId: true,
  namespace: true,
  state: true,
  leaseToken: true,
  leaseUntil: true,
  nextAttemptAt: true,
  attempts: true,
  lastErrorCode: true,
  erasedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const checkpointSelect = {
  id: true,
  userId: true,
  namespace: true,
  conversationId: true,
  policyVersion: true,
  throughMessageId: true,
  throughCreatedAt: true,
  pendingMessageId: true,
  pendingCreatedAt: true,
  pendingSourceIds: true,
} as const;

const deliverySelect = {
  id: true,
  sourceId: true,
  generation: true,
  documentId: true,
  operationId: true,
  requestKey: true,
  requestFingerprint: true,
  checksum: true,
  content: true,
  state: true,
  dispatchStartedAt: true,
  retainedAt: true,
  admittedAt: true,
  erasedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const sourceSelect = {
  id: true,
  bankId: true,
  sourceKey: true,
  kind: true,
  generation: true,
  state: true,
  checksum: true,
  sourceMessageIds: true,
  conversationId: true,
  legacyMemoryId: true,
  legacyUpdatedAt: true,
  eventAt: true,
  createdAt: true,
  updatedAt: true,
  bank: { select: bankSelect },
  deliveries: { select: deliverySelect, orderBy: { generation: 'asc' } },
} as const satisfies Prisma.HindsightSourceSelect;

const referenceSelect = {
  id: true,
  deliveryId: true,
  remoteFactId: true,
  createdAt: true,
  delivery: { select: { ...deliverySelect, source: { select: sourceSelect } } },
} as const satisfies Prisma.HindsightReferenceSelect;

type SourceRow = Prisma.HindsightSourceGetPayload<{
  select: typeof sourceSelect;
}>;
type ReferenceRow = Prisma.HindsightReferenceGetPayload<{
  select: typeof referenceSelect;
}>;
type Transaction = Prisma.TransactionClient;

class MemoryWriteAborted extends Error {
  constructor(readonly status: 'unavailable' | 'suppressed' | 'stale') {
    super('Memory source batch changed');
  }
}
class MemoryForgetAborted extends Error {
  constructor(readonly status: 'missing' | 'stale') {
    super('Memory source batch changed');
  }
}

function pendingDeliveries(now: Date): Prisma.HindsightDeliveryWhereInput {
  return {
    OR: [
      { state: { in: ['pending', 'submitted', 'retained', 'erase_pending'] } },
      // Keep verifying physical erasure after uncertain/cancelled remote work.
      {
        state: 'erased',
        erasedAt: { lte: new Date(now.getTime() - 60 * 60 * 1_000) },
      },
    ],
  };
}

function present(row: SourceRow): MemorySourceSnapshot {
  const { bank, deliveries, ...source } = row;

  return {
    bank: bank as MemoryBank,
    source: source as MemorySource,
    deliveries: deliveries as MemoryDelivery[],
  };
}

function presentReference(row: ReferenceRow): ResolvedMemoryReference {
  const { delivery, ...reference } = row;
  const { source, ...record } = delivery;

  return { ...present(source), reference, delivery: record as MemoryDelivery };
}

/** SQL constraints enforce the finite states; owner and bank locks order local writes. */
@Injectable()
export class PrismaHindsightRepository implements IHindsightRepository {
  constructor(private readonly prisma: PrismaService) {}

  rollbackRecord(
    userId: string,
    bankId: string,
  ): Promise<MemoryRollback | null> {
    return this.prisma.hindsightRollback.findFirst({
      where: { bankId, userId },
    });
  }

  async rollbackBoundary(
    userId: string,
    bankId: string,
  ): Promise<MemoryRollbackBoundary | null> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockOwner(tx, userId))) return null;
      await this.lockBank(tx, bankId);

      return this.readRollbackBoundary(tx, userId, bankId);
    });
  }

  private async readRollbackBoundary(
    tx: Transaction,
    userId: string,
    bankId: string,
  ): Promise<MemoryRollbackBoundary | null> {
    const bank = await tx.hindsightBank.findFirst({
      where: { id: bankId, userId, state: 'active' },
      select: { leaseUntil: true },
    });

    if (!bank || (bank.leaseUntil && bank.leaseUntil > new Date())) return null;
    const sources = await tx.hindsightSource.findMany({
      where: { bankId },
      orderBy: { id: 'asc' },
      select: {
        ...sourceSelect,
        deliveries: {
          orderBy: { generation: 'asc' },
          select: {
            id: true,
            generation: true,
            checksum: true,
            state: true,
            references: {
              orderBy: { remoteFactId: 'asc' },
              select: { remoteFactId: true },
            },
          },
        },
      },
    });

    for (const source of sources) {
      if (
        source.deliveries.some((delivery) =>
          delivery.generation === source.generation
            ? !['admitted', 'erased'].includes(delivery.state)
            : delivery.state !== 'erased',
        )
      )
        return null;
      const latest = source.deliveries.find(
        ({ generation }) => generation === source.generation,
      );

      if (
        latest?.state === 'admitted' &&
        (source.state !== 'active' ||
          !(await this.validImport(tx, userId, source)) ||
          (await this.suppression(tx, userId, source.sourceMessageIds)).length)
      )
        return null;
    }

    const conversations = await tx.conversation.findMany({
      where: { userId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        messages: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { id: true },
        },
      },
    });

    const legacyIds = [
      ...new Set(
        sources.flatMap((source) => [
          ...(source.legacyMemoryId ? [source.legacyMemoryId] : []),
          ...(source.sourceKey.startsWith('legacy:')
            ? [source.sourceKey.slice(7)]
            : []),
        ]),
      ),
    ];

    const legacy = await tx.memory.findMany({
      where: { userId, id: { in: legacyIds } },
      orderBy: { id: 'asc' },
      select: { id: true, updatedAt: true },
    });

    return {
      legacy: legacy.map(({ id, updatedAt }) => ({
        id,
        updatedAt: updatedAt.toISOString(),
      })),
      sources: sources.map((source) => ({
        id: source.id,
        sourceKey: source.sourceKey,
        kind: source.kind,
        generation: source.generation,
        state: source.state,
        checksum: source.checksum,
        eventAt: source.eventAt.toISOString(),
        sourceMessageIds: source.sourceMessageIds,
        legacyMemoryId: source.legacyMemoryId,
        legacyUpdatedAt: source.legacyUpdatedAt?.toISOString() ?? null,
        deliveries: source.deliveries.map((delivery) => ({
          id: delivery.id,
          generation: delivery.generation,
          state: delivery.state,
          checksum: delivery.checksum,
          factIds: delivery.references.map(({ remoteFactId }) => remoteFactId),
        })),
      })),
      conversations: conversations.map(({ id, messages }) => ({
        id,
        throughMessageId: messages[0]?.id ?? null,
      })),
    };
  }

  async reconcileRollback(
    input: ReconcileMemoryRollback,
  ): Promise<MemoryRollbackResult> {
    return this.prisma.$transaction(
      async (tx) => {
        if (!(await this.lockOwner(tx, input.userId)))
          return { status: 'unavailable' };
        await this.lockBank(tx, input.bankId);
        const existing = await tx.hindsightRollback.findFirst({
          where: { bankId: input.bankId, userId: input.userId },
        });

        if (existing) return { status: 'unchanged', record: existing };
        const bank = await tx.hindsightBank.findFirst({
          where: {
            id: input.bankId,
            userId: input.userId,
            namespace: input.namespace,
            state: 'active',
          },
          select: { leaseUntil: true },
        });

        if (!bank) return { status: 'unavailable' };
        if (bank.leaseUntil && bank.leaseUntil > new Date())
          return { status: 'busy' };
        const fresh = await this.readRollbackBoundary(
          tx,
          input.userId,
          input.bankId,
        );

        if (!fresh || JSON.stringify(fresh) !== JSON.stringify(input.boundary))
          return { status: 'stale' };
        const expected = new Set(
          fresh.sources.flatMap((source) => {
            const delivery = source.deliveries.find(
              ({ generation }) => generation === source.generation,
            );

            return source.state === 'active' && delivery?.state === 'admitted'
              ? delivery.factIds.map((id) => `${source.id}:${id}`)
              : [];
          }),
        );

        if (
          input.facts.length !== expected.size ||
          input.facts.some(
            (fact) =>
              !expected.delete(`${fact.sourceId}:${fact.remoteFactId}`) ||
              !fact.text.trim() ||
              fact.embedding.length !== 1536 ||
              fact.embedding.some((value) => !Number.isFinite(value)),
          )
        )
          return { status: 'stale' };

        // Replace imported originals with current verified facts; unrelated legacy rows remain.
        const legacyIds = [
          ...new Set(
            fresh.sources.flatMap((source) => [
              ...(source.legacyMemoryId ? [source.legacyMemoryId] : []),
              ...(source.sourceKey.startsWith('legacy:')
                ? [source.sourceKey.slice(7)]
                : []),
            ]),
          ),
        ];

        await tx.memory.updateMany({
          where: { userId: input.userId, supersedesId: { in: legacyIds } },
          data: { supersedesId: null },
        });
        await tx.memory.updateMany({
          where: { userId: input.userId, supersededById: { in: legacyIds } },
          data: { supersededById: null },
        });
        await tx.memory.deleteMany({
          where: { userId: input.userId, id: { in: legacyIds } },
        });
        const rows = input.facts.map((fact) => {
          const source = fresh.sources.find(({ id }) => id === fact.sourceId)!;
          const key = `rollback:${source.id}:${source.generation}:${fact.remoteFactId}`;

          return {
            id: `hr-${createHash('sha256').update(key).digest('hex')}`,
            key,
            source,
            fact,
          };
        });

        for (let offset = 0; offset < rows.length; offset += 100) {
          const batch = rows.slice(offset, offset + 100);
          await tx.memory.createMany({
            data: batch.map(({ id, key, source, fact }) => ({
              id,
              userId: input.userId,
              content: fact.text,
              sourceKey: key,
              sourceType: 'chat',
              sourceMessageIds: source.sourceMessageIds,
              sourceMessageId: source.sourceMessageIds[0] ?? null,
              extractorVersion: 'hindsight-rollback-v1',
              embeddingModel: input.embeddingModel,
              embeddingVersion: input.embeddingVersion,
              createdAt:
                fact.occurredAt && Number.isFinite(Date.parse(fact.occurredAt))
                  ? new Date(fact.occurredAt)
                  : new Date(source.eventAt),
            })),
          });
          await tx.$executeRaw(
            Prisma.sql`UPDATE memory AS m SET embedding = v.embedding::vector FROM (VALUES ${Prisma.join(batch.map(({ id, fact }) => Prisma.sql`(${id}, ${`[${fact.embedding.join(',')}]`})`))}) AS v(id, embedding) WHERE m.id = v.id AND m."userId" = ${input.userId}`,
          );
        }

        for (const conversation of fresh.conversations)
          await tx.conversation.update({
            where: { id: conversation.id },
            data: {
              memoryDreamThroughMessageId: conversation.throughMessageId,
            },
          });
        // Permanently fence this bank before switching readers. Recovery keeps erasing it.
        await tx.hindsightSource.updateMany({
          where: { bankId: input.bankId },
          data: { state: 'deleted' },
        });
        await tx.hindsightDelivery.updateMany({
          where: { source: { bankId: input.bankId }, state: { not: 'erased' } },
          data: { state: 'erase_pending', content: null },
        });
        await tx.hindsightBank.update({
          where: { id: input.bankId },
          data: {
            state: 'erasing',
            leaseToken: null,
            leaseUntil: null,
            nextAttemptAt: new Date(),
          },
        });
        const record = await tx.hindsightRollback.create({
          data: {
            bankId: input.bankId,
            userId: input.userId,
            namespace: input.namespace,
            boundaryChecksum: createHash('sha256')
              .update(JSON.stringify(fresh))
              .digest('hex'),
            sourceCount: fresh.sources.length,
            factCount: input.facts.length,
          },
        });

        return { status: 'written', record };
      },
      { timeout: 120_000 },
    );
  }

  private async lockOwner(tx: Transaction, userId: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string; automaticMemoryEnabled: boolean }>
    >(
      Prisma.sql`SELECT id, "automaticMemoryEnabled" FROM "user" WHERE id = ${userId} FOR UPDATE`,
    );

    return rows[0] ?? null;
  }

  private async lockBank(tx: Transaction, bankId: string): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM hindsight_bank WHERE id = ${bankId} FOR UPDATE`,
    );
  }

  async ensureBank(
    userId: string,
    namespace: string,
    bankId: string,
  ): Promise<MemoryBank | null> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockOwner(tx, userId))) return null;
      const bank = await tx.hindsightBank.upsert({
        where: { userId_namespace: { userId, namespace } },
        create: { id: bankId, userId, namespace },
        update: {},
        select: bankSelect,
      });

      return bank.state === 'active' ? (bank as MemoryBank) : null;
    });
  }

  async ingestionSegment(
    userId: string,
    namespace: string,
    policyVersion: string,
    conversationId: string,
    throughMessageId: string,
  ): Promise<MemoryIngestionSegment | null> {
    return this.prisma.$transaction(async (tx) => {
      const owner = await this.lockOwner(tx, userId);
      if (!owner?.automaticMemoryEnabled) return null;
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, userId },
        select: { memoryDreamThroughMessageId: true },
      });

      const through = await tx.message.findFirst({
        where: { id: throughMessageId, userId, conversationId },
        select: { id: true, createdAt: true },
      });

      if (!conversation || !through) return null;
      const initial = conversation.memoryDreamThroughMessageId
        ? await tx.message.findFirst({
            where: {
              id: conversation.memoryDreamThroughMessageId,
              userId,
              conversationId,
            },
            select: { id: true, createdAt: true },
          })
        : null;

      const checkpoint = await tx.hindsightCheckpoint.upsert({
        where: {
          namespace_conversationId_policyVersion: {
            namespace,
            conversationId,
            policyVersion,
          },
        },
        create: {
          userId,
          namespace,
          conversationId,
          policyVersion,
          throughMessageId: initial?.id ?? null,
          throughCreatedAt: initial?.createdAt ?? null,
        },
        update: {},
        select: checkpointSelect,
      });

      if (checkpoint.userId !== userId) return null;
      if (checkpoint.pendingMessageId && checkpoint.pendingCreatedAt)
        return {
          checkpoint,
          through: {
            id: checkpoint.pendingMessageId,
            createdAt: checkpoint.pendingCreatedAt,
          },
          messages: [],
        };
      if (
        checkpoint.throughCreatedAt &&
        (through.createdAt < checkpoint.throughCreatedAt ||
          (through.createdAt.getTime() ===
            checkpoint.throughCreatedAt.getTime() &&
            through.id <= checkpoint.throughMessageId!))
      )
        return null;
      const messages = await tx.message.findMany({
        where: {
          userId,
          conversationId,
          role: 'user',
          AND: [
            {
              OR: [
                { createdAt: { lt: through.createdAt } },
                { createdAt: through.createdAt, id: { lte: through.id } },
              ],
            },
            ...(checkpoint.throughCreatedAt
              ? [
                  {
                    OR: [
                      { createdAt: { gt: checkpoint.throughCreatedAt } },
                      {
                        createdAt: checkpoint.throughCreatedAt,
                        id: { gt: checkpoint.throughMessageId! },
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 25,
        select: { id: true, content: true, createdAt: true },
      });

      return {
        checkpoint,
        through: messages.length > 24 ? messages[23]! : through,
        messages: messages.slice(0, 24),
      };
    });
  }

  async stageCheckpoint(
    segment: MemoryIngestionSegment,
    sourceIds: string[],
  ): Promise<boolean> {
    const { checkpoint, through } = segment;

    return this.prisma.$transaction(async (tx) => {
      const owner = await this.lockOwner(tx, checkpoint.userId);
      if (!owner?.automaticMemoryEnabled) return false;
      const ids = [...new Set(sourceIds)];
      if (
        ids.length > 24 ||
        (await tx.hindsightSource.count({
          where: {
            id: { in: ids },
            conversationId: checkpoint.conversationId,
            bank: {
              userId: checkpoint.userId,
              namespace: checkpoint.namespace,
              state: 'active',
            },
          },
        })) !== ids.length
      )
        return false;
      const result = await tx.hindsightCheckpoint.updateMany({
        where: {
          id: checkpoint.id,
          userId: checkpoint.userId,
          throughMessageId: checkpoint.throughMessageId,
          pendingMessageId: null,
        },
        data: {
          pendingMessageId: through.id,
          pendingCreatedAt: through.createdAt,
          pendingSourceIds: ids,
        },
      });

      return result.count === 1;
    });
  }

  async completeCheckpoint(
    userId: string,
    checkpointId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockOwner(tx, userId))) return false;
      const checkpoint = await tx.hindsightCheckpoint.findFirst({
        where: { id: checkpointId, userId, pendingMessageId: { not: null } },
        select: checkpointSelect,
      });

      if (
        !checkpoint ||
        !checkpoint.pendingMessageId ||
        !checkpoint.pendingCreatedAt
      )
        return false;
      const sources = await tx.hindsightSource.findMany({
        where: {
          id: { in: checkpoint.pendingSourceIds },
          bank: { userId, namespace: checkpoint.namespace, state: 'active' },
        },
        select: {
          generation: true,
          deliveries: { select: { generation: true, state: true } },
        },
      });

      if (
        sources.length !== checkpoint.pendingSourceIds.length ||
        sources.some(
          ({ generation, deliveries }) =>
            !deliveries.some(
              (delivery) =>
                delivery.generation === generation &&
                ['admitted', 'erased'].includes(delivery.state),
            ),
        )
      )
        return false;
      const updated = await tx.hindsightCheckpoint.updateMany({
        where: {
          id: checkpointId,
          pendingMessageId: checkpoint.pendingMessageId,
          throughMessageId: checkpoint.throughMessageId,
        },
        data: {
          throughMessageId: checkpoint.pendingMessageId,
          throughCreatedAt: checkpoint.pendingCreatedAt,
          pendingMessageId: null,
          pendingCreatedAt: null,
          pendingSourceIds: [],
        },
      });

      return updated.count === 1;
    });
  }

  pendingCheckpoints(
    namespace: string,
    limit: number,
  ): Promise<MemoryCheckpoint[]> {
    return this.prisma.hindsightCheckpoint.findMany({
      where: { namespace, pendingMessageId: { not: null } },
      take: Math.max(1, Math.min(100, limit)),
      orderBy: { updatedAt: 'asc' },
      select: checkpointSelect,
    });
  }

  async explicitSourceMessageIds(
    userId: string,
    ids: string[],
  ): Promise<string[]> {
    const sources = await this.prisma.hindsightSource.findMany({
      where: {
        bank: { userId },
        kind: { in: ['explicit', 'import'] },
        sourceMessageIds: { hasSome: ids },
      },
      select: { sourceMessageIds: true },
    });

    return [
      ...new Set(
        sources
          .flatMap(({ sourceMessageIds }) => sourceMessageIds)
          .filter((id) => ids.includes(id)),
      ),
    ];
  }

  recoverableIngestion(
    namespace: string,
    policyVersion: string,
    idleBefore: Date,
    userIds: string[],
    limit: number,
  ): Promise<
    Array<{
      userId: string;
      conversationId: string;
      throughMessageId: string;
      lastMessageAt: Date;
    }>
  > {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT c."userId", c.id AS "conversationId", latest.id AS "throughMessageId", c."lastMessageAt"
      FROM conversation c JOIN "user" u ON u.id = c."userId" AND u."automaticMemoryEnabled"
      JOIN LATERAL (SELECT id, "createdAt" FROM message WHERE "conversationId" = c.id AND "userId" = c."userId" ORDER BY "createdAt" DESC, id DESC LIMIT 1) latest ON TRUE
      LEFT JOIN hindsight_checkpoint cp ON cp."conversationId" = c.id AND cp.namespace = ${namespace} AND cp."policyVersion" = ${policyVersion}
      WHERE c."lastMessageAt" <= ${idleBefore} AND cp."pendingMessageId" IS NULL
        ${userIds.length ? Prisma.sql`AND c."userId" IN (${Prisma.join(userIds)})` : Prisma.empty}
        AND (cp.id IS NULL OR cp."throughCreatedAt" IS NULL OR (latest."createdAt", latest.id) > (cp."throughCreatedAt", cp."throughMessageId"))
      ORDER BY c."lastMessageAt" ASC, c.id ASC LIMIT ${Math.max(1, Math.min(100, limit))}`);
  }

  async findBank(
    userId: string,
    namespace: string,
  ): Promise<MemoryBank | null> {
    const bank = await this.prisma.hindsightBank.findUnique({
      where: { userId_namespace: { userId, namespace } },
      select: bankSelect,
    });

    return bank as MemoryBank | null;
  }

  async enqueue(input: EnqueueMemorySource): Promise<MemorySourceWriteResult> {
    return this.prisma.$transaction((tx) => this.enqueueLocked(tx, input));
  }

  private async enqueueLocked(
    tx: Transaction,
    input: EnqueueMemorySource,
  ): Promise<MemorySourceWriteResult> {
    const user = await this.lockOwner(tx, input.userId);
    if (!user || (input.kind === 'automatic' && !user.automaticMemoryEnabled))
      return { status: 'unavailable' };
    if (
      input.legacySnapshot &&
      !(await tx.memory.findFirst({
        where: {
          id: input.legacySnapshot.id,
          userId: input.userId,
          status: 'active',
          updatedAt: input.legacySnapshot.updatedAt,
        },
        select: { id: true },
      }))
    )
      return { status: 'stale' };
    await this.lockBank(tx, input.bankId);
    const bank = await tx.hindsightBank.findFirst({
      where: { id: input.bankId, userId: input.userId, state: 'active' },
      select: { id: true },
    });

    if (!bank) return { status: 'unavailable' };
    if (
      (await this.suppression(tx, input.userId, input.sourceMessageIds)).length
    )
      return { status: 'suppressed' };

    // Direct automatic ingestion must have owned user-message evidence.
    if (input.kind === 'automatic') {
      const messages = await tx.message.count({
        where: {
          id: { in: [...new Set(input.sourceMessageIds)] },
          userId: input.userId,
          role: 'user',
        },
      });

      if (!messages || messages !== new Set(input.sourceMessageIds).size)
        return { status: 'suppressed' };
    }

    const previous = await tx.hindsightSource.findUnique({
      where: {
        bankId_sourceKey: {
          bankId: input.bankId,
          sourceKey: input.sourceKey,
        },
      },
      select: sourceSelect,
    });

    if (previous?.state === 'deleted') return { status: 'suppressed' };

    if (input.requestKey && previous) {
      const replay = previous.deliveries.find(
        ({ requestKey }) => requestKey === input.requestKey,
      );

      if (replay)
        return replay.checksum === input.checksum &&
          replay.requestFingerprint === (input.requestFingerprint ?? null)
          ? { status: 'unchanged', snapshot: present(previous) }
          : { status: 'stale' };
    }

    if (
      input.expectedGeneration !== undefined &&
      previous?.generation !== input.expectedGeneration
    )
      return { status: 'stale' };
    if (previous?.checksum === input.checksum && !input.requestKey)
      return { status: 'unchanged', snapshot: present(previous) };
    // Idempotent imports/segments cannot silently replace an already-written source.
    if (previous && input.expectedGeneration === undefined)
      return { status: 'stale' };

    const sourceId = previous?.id ?? randomUUID();
    const generation = (previous?.generation ?? 0) + 1;
    const sourceMessageIds = [
      ...new Set([
        ...(previous?.sourceMessageIds ?? []),
        ...input.sourceMessageIds,
      ]),
    ];

    if ((await this.suppression(tx, input.userId, sourceMessageIds)).length)
      return { status: 'suppressed' };
    const data = {
      checksum: input.checksum,
      generation,
      kind: input.kind,
      sourceMessageIds,
      conversationId: input.conversationId,
      eventAt: input.eventAt,
      legacyMemoryId: input.legacySnapshot?.id ?? null,
      legacyUpdatedAt: input.legacySnapshot?.updatedAt ?? null,
    };

    if (previous) {
      await tx.hindsightSource.update({ where: { id: sourceId }, data });
      await tx.hindsightDelivery.updateMany({
        where: { sourceId, state: { not: 'erased' } },
        data: { state: 'erase_pending' },
      });
    } else {
      await tx.hindsightSource.create({
        data: {
          id: sourceId,
          bankId: input.bankId,
          sourceKey: input.sourceKey,
          ...data,
        },
      });
    }

    await tx.hindsightDelivery.create({
      data: {
        sourceId,
        generation,
        documentId: `${sourceId}:g${generation}`,
        operationId: randomUUID(),
        content: input.content,
        requestKey: input.requestKey,
        requestFingerprint: input.requestFingerprint,
        checksum: input.checksum,
      },
    });
    // Wakes durable recovery even if queue publication or the caller crashes.
    await tx.hindsightBank.update({
      where: { id: input.bankId },
      data: { nextAttemptAt: new Date(), lastErrorCode: null },
    });
    const row = await tx.hindsightSource.findUniqueOrThrow({
      where: { id: sourceId },
      select: sourceSelect,
    });

    return { status: 'written', snapshot: present(row) };
  }

  async replaceSources(
    inputs: EnqueueMemorySource[],
  ): Promise<MemorySourcesWriteResult> {
    if (
      !inputs.length ||
      inputs.length > 8 ||
      inputs.some(
        (input) =>
          input.userId !== inputs[0]!.userId ||
          input.bankId !== inputs[0]!.bankId ||
          input.expectedGeneration === undefined ||
          !input.requestKey,
      )
    )
      return { status: 'unavailable' };

    try {
      return await this.prisma.$transaction(async (tx) => {
        const snapshots: MemorySourceSnapshot[] = [];

        for (const input of inputs) {
          const result = await this.enqueueLocked(tx, input);
          if (!('snapshot' in result))
            throw new MemoryWriteAborted(result.status);
          snapshots.push(result.snapshot);
        }

        return { status: 'written', snapshots };
      });
    } catch (error: unknown) {
      if (error instanceof MemoryWriteAborted) return { status: error.status };
      throw error;
    }
  }

  async findMutation(
    userId: string,
    bankId: string,
    requestKey: string,
  ): Promise<MemorySourceSnapshot[]> {
    const rows = await this.prisma.hindsightSource.findMany({
      where: { bankId, bank: { userId }, deliveries: { some: { requestKey } } },
      select: sourceSelect,
    });

    return rows.map(present);
  }

  async snapshot(
    userId: string,
    sourceId: string,
  ): Promise<MemorySourceSnapshot | null> {
    const row = await this.prisma.hindsightSource.findFirst({
      where: { id: sourceId, bank: { userId } },
      select: sourceSelect,
    });

    return row ? present(row) : null;
  }

  async ownerSourcePage(
    userId: string,
    afterId?: string,
    limit = 100,
  ): Promise<MemorySourceSnapshot[]> {
    const rows = await this.prisma.hindsightSource.findMany({
      where: { bank: { userId }, id: afterId ? { gt: afterId } : undefined },
      select: sourceSelect,
      orderBy: { id: 'asc' },
      take: Math.max(1, Math.min(100, limit)),
    });

    return rows.map(present);
  }

  async findSource(
    userId: string,
    bankId: string,
    sourceKey: string,
  ): Promise<MemorySourceSnapshot | null> {
    const row = await this.prisma.hindsightSource.findFirst({
      where: { bankId, sourceKey, bank: { userId } },
      select: sourceSelect,
    });

    return row ? present(row) : null;
  }

  async forget(
    userId: string,
    sourceId: string,
    expectedGeneration: number,
  ): Promise<'deleted' | 'missing' | 'stale'> {
    return this.prisma.$transaction((tx) =>
      this.forgetLocked(tx, userId, sourceId, expectedGeneration),
    );
  }

  private async forgetLocked(
    tx: Transaction,
    userId: string,
    sourceId: string,
    expectedGeneration: number,
    additionalMessageIds: string[] = [],
  ): Promise<'deleted' | 'missing' | 'stale'> {
    if (!(await this.lockOwner(tx, userId))) return 'missing';
    const initial = await tx.hindsightSource.findFirst({
      where: { id: sourceId, bank: { userId } },
      select: { bankId: true },
    });

    if (!initial) return 'missing';
    await this.lockBank(tx, initial.bankId);
    const source = await tx.hindsightSource.findUniqueOrThrow({
      where: { id: sourceId },
      select: sourceSelect,
    });

    if (source.state !== 'deleted' && source.generation !== expectedGeneration)
      return 'stale';
    await withdrawConnectedMemorySources(
      tx,
      userId,
      [source.id],
      source.sourceMessageIds,
      additionalMessageIds,
    );

    return 'deleted';
  }

  async forgetSources(
    userId: string,
    targets: Array<{ sourceId: string; generation: number }>,
    additionalMessageIds: string[] = [],
  ): Promise<'deleted' | 'missing' | 'stale'> {
    if (!targets.length || targets.length > 8) return 'missing';

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!(await this.lockOwner(tx, userId)))
          throw new MemoryForgetAborted('missing');

        const messages = [...new Set(additionalMessageIds)];

        if (messages.length) {
          const count = await tx.message.count({
            where: { id: { in: messages }, userId, role: 'user' },
          });

          if (count !== messages.length)
            throw new MemoryForgetAborted('missing');
          await tx.hindsightSuppression.createMany({
            data: messages.map((messageId) => ({ userId, messageId })),
            skipDuplicates: true,
          });
          await tx.memoryDeletionMarker.createMany({
            data: messages.map((sourceMessageId) => ({
              userId,
              sourceMessageId,
            })),
            skipDuplicates: true,
          });
        }

        // Validate the entire selection before shared-evidence withdrawal can
        // retire another selected source and mask a stale generation.
        for (const target of targets) {
          const source = await tx.hindsightSource.findFirst({
            where: { id: target.sourceId, bank: { userId } },
            select: { generation: true, state: true },
          });

          if (!source) throw new MemoryForgetAborted('missing');
          if (
            source.state !== 'deleted' &&
            source.generation !== target.generation
          )
            throw new MemoryForgetAborted('stale');
        }

        for (const target of targets) {
          const result = await this.forgetLocked(
            tx,
            userId,
            target.sourceId,
            target.generation,
            messages,
          );

          if (result !== 'deleted') throw new MemoryForgetAborted(result);
        }

        return 'deleted' as const;
      });
    } catch (error: unknown) {
      if (error instanceof MemoryForgetAborted) return error.status;
      throw error;
    }
  }

  async claimBank(
    bankId: string,
    token: string,
    until: Date,
  ): Promise<MemoryBank | null> {
    const now = new Date();
    if (until <= now) return null;
    const result = await this.prisma.hindsightBank.updateMany({
      where: {
        id: bankId,
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      data: { leaseToken: token, leaseUntil: until },
    });

    if (!result.count) return null;
    const bank = await this.prisma.hindsightBank.findUniqueOrThrow({
      where: { id: bankId },
      select: bankSelect,
    });

    return bank as MemoryBank;
  }

  async renewBank(
    bankId: string,
    token: string,
    until: Date,
  ): Promise<boolean> {
    const now = new Date();
    if (until <= now) return false;
    const result = await this.prisma.hindsightBank.updateMany({
      where: { id: bankId, leaseToken: token, leaseUntil: { gt: now } },
      data: { leaseUntil: until },
    });

    return result.count === 1;
  }

  async releaseBank(
    bankId: string,
    token: string,
    nextAttemptAt: Date,
    errorCode?: string,
  ): Promise<void> {
    await this.prisma.hindsightBank.updateMany({
      where: { id: bankId, leaseToken: token },
      data: {
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt,
        attempts: errorCode ? { increment: 1 } : 0,
        lastErrorCode: errorCode ?? null,
      },
    });
  }

  async pendingBanks(
    namespace: string,
    now: Date,
    limit: number,
    erasureOnly = false,
  ): Promise<MemoryBank[]> {
    const rows = await this.prisma.hindsightBank.findMany({
      where: {
        namespace,
        ...(erasureOnly ? { state: { in: ['erasing', 'erased'] } } : {}),
        nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
        AND: [
          {
            OR: [
              // Retired banks are re-erased periodically to catch uncertain late writes.
              { state: { in: ['erasing', 'erased'] } },
              {
                sources: {
                  some: {
                    deliveries: {
                      some: pendingDeliveries(now),
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: bankSelect,
    });

    return rows as MemoryBank[];
  }

  async bankSources(
    bankId: string,
    limit = 50,
  ): Promise<MemorySourceSnapshot[]> {
    const rows = await this.prisma.hindsightSource.findMany({
      where: { bankId, deliveries: { some: pendingDeliveries(new Date()) } },
      select: sourceSelect,
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return rows.map(present);
  }

  private liveLease(bankId: string, token: string) {
    return { id: bankId, leaseToken: token, leaseUntil: { gt: new Date() } };
  }

  async startDispatch(
    bankId: string,
    token: string,
    deliveryId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.hindsightDelivery.findFirst({
        where: { id: deliveryId, source: { bankId } },
        select: { source: { select: { bank: { select: { userId: true } } } } },
      });

      if (!row) return false;
      const user = await this.lockOwner(tx, row.source.bank.userId);
      if (!user) return false;
      await this.lockBank(tx, bankId);
      const delivery = await tx.hindsightDelivery.findFirst({
        where: {
          id: deliveryId,
          state: { in: ['pending', 'submitted'] },
          source: {
            state: 'active',
            bank: { ...this.liveLease(bankId, token), state: 'active' },
          },
        },
        select: {
          ...deliverySelect,
          source: {
            select: {
              generation: true,
              kind: true,
              sourceMessageIds: true,
              legacyMemoryId: true,
              legacyUpdatedAt: true,
            },
          },
        },
      });

      if (
        !delivery ||
        !(await this.validImport(tx, user.id, delivery.source)) ||
        !(await this.validAutomaticEvidence(tx, user.id, delivery.source)) ||
        delivery.generation !== delivery.source.generation ||
        (delivery.source.kind === 'automatic' &&
          !user.automaticMemoryEnabled) ||
        (await this.suppression(tx, user.id, delivery.source.sourceMessageIds))
          .length
      )
        return false;
      await tx.hindsightDelivery.update({
        where: { id: deliveryId },
        data: { state: 'submitted', dispatchStartedAt: new Date() },
      });

      return true;
    });
  }

  async transitionDelivery(
    bankId: string,
    token: string,
    deliveryId: string,
    state: MemoryDeliveryState,
  ): Promise<boolean> {
    let changed = false;

    await this.prisma.$transaction(async (tx) => {
      await this.lockBank(tx, bankId);
      const lease = await tx.hindsightBank.findFirst({
        where: this.liveLease(bankId, token),
        select: { id: true },
      });

      if (!lease) return;
      const row = await tx.hindsightDelivery.findFirst({
        where: { id: deliveryId, source: { bankId } },
        select: deliverySelect,
      });

      if (!row) return;
      // Admission has its own checks; stale completion can never re-admit a source.
      const allowed: Record<MemoryDeliveryState, MemoryDeliveryState[]> = {
        pending: [],
        submitted: [],
        retained: ['submitted'],
        admitted: [],
        erase_pending: [
          'pending',
          'submitted',
          'retained',
          'admitted',
          'failed',
        ],
        erased: ['erase_pending', 'erased'],
        failed: ['submitted', 'retained'],
      };

      if (!allowed[state].includes(row.state as MemoryDeliveryState)) return;
      await tx.hindsightDelivery.update({
        where: { id: deliveryId },
        data: {
          state,
          ...(state === 'retained' ? { retainedAt: new Date() } : {}),
          ...(state === 'erased'
            ? { erasedAt: new Date(), content: null }
            : {}),
        },
      });
      // Keep opaque retired references for idempotent forget/retry resolution;
      // normal retrieval rejects them and no extracted text is retained here.
      changed = true;
    });

    return changed;
  }

  async admit(
    bankId: string,
    token: string,
    deliveryId: string,
    factIds: string[],
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.hindsightBank.findUnique({
        where: { id: bankId },
        select: { userId: true },
      });

      if (!initial) return false;
      const user = await this.lockOwner(tx, initial.userId);
      if (!user) return false;
      await this.lockBank(tx, bankId);
      const row = await tx.hindsightDelivery.findFirst({
        where: {
          id: deliveryId,
          state: { in: ['retained', 'admitted'] },
          source: {
            state: 'active',
            bank: { ...this.liveLease(bankId, token), state: 'active' },
          },
        },
        select: {
          ...deliverySelect,
          source: {
            select: {
              generation: true,
              kind: true,
              sourceMessageIds: true,
              legacyMemoryId: true,
              legacyUpdatedAt: true,
            },
          },
        },
      });

      if (
        !row ||
        !(await this.validImport(tx, user.id, row.source)) ||
        !(await this.validAutomaticEvidence(tx, user.id, row.source)) ||
        row.generation !== row.source.generation ||
        (row.source.kind === 'automatic' && !user.automaticMemoryEnabled) ||
        (await this.suppression(tx, user.id, row.source.sourceMessageIds))
          .length
      )
        return false;
      if (factIds.some((id) => !id.trim())) return false;
      await tx.hindsightReference.createMany({
        data: [...new Set(factIds)].map((remoteFactId) => ({
          deliveryId,
          remoteFactId,
        })),
        skipDuplicates: true,
      });
      await tx.hindsightDelivery.update({
        where: { id: deliveryId },
        data: { state: 'admitted', admittedAt: new Date() },
      });

      return true;
    });
  }

  async rejectDelivery(
    bankId: string,
    token: string,
    deliveryId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockBank(tx, bankId);
      const row = await tx.hindsightDelivery.findFirst({
        where: {
          id: deliveryId,
          state: { in: ['pending', 'submitted', 'retained'] },
          source: { bank: this.liveLease(bankId, token) },
        },
        select: { sourceId: true, generation: true },
      });

      if (!row) return false;
      await tx.hindsightSource.updateMany({
        where: { id: row.sourceId, generation: row.generation },
        data: { state: 'deleted' },
      });
      await tx.hindsightDelivery.update({
        where: { id: deliveryId },
        data: { state: 'erase_pending', content: null },
      });

      return true;
    });
  }

  private async filterReferences(
    rows: ReferenceRow[],
    userId: string,
  ): Promise<ResolvedMemoryReference[]> {
    const refs = rows
      .map(presentReference)
      .filter(
        ({ bank, source, delivery }) =>
          bank.userId === userId &&
          bank.state === 'active' &&
          source.state === 'active' &&
          delivery.state === 'admitted' &&
          delivery.generation === source.generation,
      );

    const suppressed = new Set(
      await this.suppressedMessageIds(
        userId,
        refs.flatMap(({ source }) => source.sourceMessageIds),
      ),
    );

    const legacyRows = await this.prisma.memory.findMany({
      where: {
        userId,
        status: 'active',
        id: {
          in: refs.flatMap(({ source }) =>
            source.legacyMemoryId ? [source.legacyMemoryId] : [],
          ),
        },
      },
      select: { id: true, updatedAt: true },
    });

    const currentImports = new Map(
      legacyRows.map(({ id, updatedAt }) => [id, updatedAt.getTime()]),
    );

    return refs.filter(
      ({ source }) =>
        !source.sourceMessageIds.some((id) => suppressed.has(id)) &&
        (!source.legacyMemoryId ||
          currentImports.get(source.legacyMemoryId) ===
            source.legacyUpdatedAt?.getTime()),
    );
  }

  private async validImport(
    tx: Transaction,
    userId: string,
    source: { legacyMemoryId: string | null; legacyUpdatedAt: Date | null },
  ): Promise<boolean> {
    if (!source.legacyMemoryId) return true;

    return Boolean(
      await tx.memory.findFirst({
        where: {
          id: source.legacyMemoryId,
          userId,
          status: 'active',
          updatedAt: source.legacyUpdatedAt ?? undefined,
        },
        select: { id: true },
      }),
    );
  }

  private async validAutomaticEvidence(
    tx: Transaction,
    userId: string,
    source: { kind: string; sourceMessageIds: string[] },
  ): Promise<boolean> {
    if (source.kind !== 'automatic') return true;
    const ids = [...new Set(source.sourceMessageIds)];

    return (
      ids.length > 0 &&
      (await tx.message.count({
        where: { id: { in: ids }, userId, role: 'user' },
      })) === ids.length
    );
  }

  async retireStaleImports(bankId: string, token: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const bank = await tx.hindsightBank.findFirst({
        where: { ...this.liveLease(bankId, token), state: 'active' },
        select: { userId: true },
      });

      if (!bank || !(await this.lockOwner(tx, bank.userId))) return 0;
      await this.lockBank(tx, bankId);
      const stale = await tx.$queryRaw<
        Array<{ id: string; retired: boolean }>
      >(Prisma.sql`
        SELECT s.id, (m.id IS NULL OR m.status <> 'active') AS retired FROM hindsight_source s LEFT JOIN memory m
          ON m.id = s."legacyMemoryId" AND m."userId" = ${bank.userId}
        WHERE s."bankId" = ${bankId} AND s.state = 'active' AND s."legacyMemoryId" IS NOT NULL
          AND (m.id IS NULL OR m.status <> 'active' OR m."updatedAt" <> s."legacyUpdatedAt")
        ORDER BY s.id LIMIT 50`);

      const ids = stale.map(({ id }) => id);
      if (!ids.length) return 0;
      await tx.hindsightSource.updateMany({
        where: {
          id: {
            in: stale.filter(({ retired }) => retired).map(({ id }) => id),
          },
        },
        data: { state: 'deleted' },
      });
      await tx.hindsightDelivery.updateMany({
        where: { sourceId: { in: ids }, state: { not: 'erased' } },
        data: { state: 'erase_pending', content: null },
      });

      return ids.length;
    });
  }

  async resolveReference(
    userId: string,
    referenceId: string,
    includeRetired = false,
  ): Promise<ResolvedMemoryReference | null> {
    const row = await this.prisma.hindsightReference.findFirst({
      where: { id: referenceId, delivery: { source: { bank: { userId } } } },
      select: referenceSelect,
    });

    if (row && includeRetired) return presentReference(row);

    return row
      ? ((await this.filterReferences([row], userId))[0] ?? null)
      : null;
  }

  async referencesForDocuments(
    userId: string,
    bankId: string,
    documentIds: string[],
  ): Promise<ResolvedMemoryReference[]> {
    const rows = await this.prisma.hindsightReference.findMany({
      where: {
        delivery: {
          documentId: { in: documentIds },
          source: { bankId, bank: { userId } },
        },
      },
      select: referenceSelect,
    });

    return this.filterReferences(rows, userId);
  }

  async markBankErased(bankId: string, token: string): Promise<boolean> {
    const result = await this.prisma.hindsightBank.updateMany({
      where: {
        ...this.liveLease(bankId, token),
        state: { in: ['erasing', 'erased'] },
        sources: {
          none: { deliveries: { some: { state: { not: 'erased' } } } },
        },
      },
      data: { state: 'erased', erasedAt: new Date() },
    });

    return result.count === 1;
  }

  private async suppression(
    tx: Transaction,
    userId: string,
    ids: string[],
  ): Promise<string[]> {
    if (!ids.length) return [];
    const [current, legacy] = await Promise.all([
      tx.hindsightSuppression.findMany({
        where: { userId, messageId: { in: ids } },
        select: { messageId: true },
      }),
      tx.memoryDeletionMarker.findMany({
        where: { userId, sourceMessageId: { in: ids } },
        select: { sourceMessageId: true },
      }),
    ]);

    return [
      ...new Set([
        ...current.map(({ messageId }) => messageId),
        ...legacy.map(({ sourceMessageId }) => sourceMessageId),
      ]),
    ];
  }

  suppressedMessageIds(userId: string, ids: string[]): Promise<string[]> {
    return this.suppression(this.prisma, userId, ids);
  }

  pendingErasureCount(userId: string): Promise<number> {
    return this.prisma.hindsightDelivery.count({
      where: {
        state: { not: 'erased' },
        source: { state: 'deleted', bank: { userId } },
      },
    });
  }
}
