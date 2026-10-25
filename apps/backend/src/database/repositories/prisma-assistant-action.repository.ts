import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type {
  AssistancePreference,
  AssistancePreferenceWrite,
  AssistantAction,
  AssistantActionEvidence,
  AssistantActionStatus,
  NewAssistantAction,
} from '../entities';
import type {
  AssistantActionUpdate,
  IAssistantActionRepository,
} from '../interfaces';

const actionSelect = {
  id: true,
  userId: true,
  conversationId: true,
  preparedBy: true,
  offerMessageId: true,
  behavior: true,
  actionType: true,
  targetRef: true,
  parameters: true,
  version: true,
  reason: true,
  evidence: true,
  deduplicationKey: true,
  status: true,
  statusReason: true,
  usefulUntil: true,
  snoozedUntil: true,
  acceptedMessageId: true,
  acceptedAt: true,
  decidedAt: true,
  executionLeaseUntil: true,
  resultType: true,
  resultId: true,
  receiptKey: true,
  lastErrorCode: true,
  createdAt: true,
  updatedAt: true,
} as const;

const preferenceSelect = {
  userId: true,
  pausedAll: true,
  pausedUntil: true,
  pausedBehaviors: true,
  quietStart: true,
  quietEnd: true,
  instructionMessageId: true,
  updatedAt: true,
} as const;

type ActionRow = Prisma.AssistantActionGetPayload<{
  select: typeof actionSelect;
}>;

function present(row: ActionRow): AssistantAction {
  return {
    ...row,
    behavior: row.behavior as AssistantAction['behavior'],
    actionType: row.actionType as AssistantAction['actionType'],
    status: row.status as AssistantActionStatus,
    parameters:
      row.parameters && typeof row.parameters === 'object'
        ? (row.parameters as Record<string, unknown>)
        : {},
    evidence: Array.isArray(row.evidence)
      ? (row.evidence as AssistantActionEvidence[])
      : [],
  };
}

@Injectable()
export class PrismaAssistantActionRepository implements IAssistantActionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async prepare(
    input: NewAssistantAction,
  ): Promise<{ action: AssistantAction; created: boolean }> {
    try {
      const row = await this.prisma.assistantAction.create({
        data: {
          ...input,
          parameters: input.parameters as Prisma.InputJsonObject,
          evidence: input.evidence,
        },
        select: actionSelect,
      });

      return { action: present(row), created: true };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      const existing = await this.prisma.assistantAction.findUnique({
        where: {
          userId_deduplicationKey: {
            userId: input.userId,
            deduplicationKey: input.deduplicationKey,
          },
        },
        select: actionSelect,
      });

      if (!existing) throw error;

      return { action: present(existing), created: false };
    }
  }

  async findById(userId: string, id: string): Promise<AssistantAction | null> {
    const row = await this.prisma.assistantAction.findFirst({
      where: { id, userId },
      select: actionSelect,
    });

    return row ? present(row) : null;
  }

  async listForConversation(
    userId: string,
    conversationId: string,
    statuses: readonly AssistantActionStatus[],
    limit = 10,
  ): Promise<AssistantAction[]> {
    const rows = await this.prisma.assistantAction.findMany({
      where: { userId, conversationId, status: { in: [...statuses] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: actionSelect,
    });

    return rows.map(present);
  }

  async listForTarget(
    userId: string,
    behavior: string,
    targetRef: string,
  ): Promise<AssistantAction[]> {
    const rows = await this.prisma.assistantAction.findMany({
      where: { userId, behavior, targetRef },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: actionSelect,
    });

    return rows.map(present);
  }

  async listPreparedBy(
    userId: string,
    preparedBy: string,
  ): Promise<AssistantAction[]> {
    const rows = await this.prisma.assistantAction.findMany({
      where: { userId, preparedBy },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: actionSelect,
    });

    return rows.map(present);
  }

  async listRecentForOwner(
    userId: string,
    since: Date,
    statuses: readonly AssistantActionStatus[],
    limit: number,
  ): Promise<AssistantAction[]> {
    const rows = await this.prisma.assistantAction.findMany({
      where: {
        userId,
        updatedAt: { gte: since },
        status: { in: [...statuses] },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: actionSelect,
    });

    return rows.map(present);
  }

  async markOffered(
    userId: string,
    preparedBy: string,
    offerMessageId: string,
    actionIds?: readonly string[],
  ): Promise<number> {
    const result = await this.prisma.assistantAction.updateMany({
      where: {
        userId,
        preparedBy,
        status: 'prepared',
        ...(actionIds ? { id: { in: [...actionIds] } } : {}),
      },
      data: { status: 'offered', offerMessageId, statusReason: 'shown' },
    });

    return result.count;
  }

  async transition(
    userId: string,
    id: string,
    from: readonly AssistantActionStatus[],
    update: AssistantActionUpdate,
  ): Promise<AssistantAction | null> {
    const result = await this.prisma.assistantAction.updateMany({
      where: { id, userId, status: { in: [...from] } },
      data: {
        ...update,
        parameters: update.parameters as Prisma.InputJsonObject | undefined,
      },
    });

    if (result.count === 0) return null;

    return this.findById(userId, id);
  }

  async claimExecution(
    userId: string,
    id: string,
    now: Date,
    leaseUntil: Date,
  ): Promise<AssistantAction | null> {
    const result = await this.prisma.assistantAction.updateMany({
      where: {
        id,
        userId,
        acceptedAt: { not: null },
        OR: [
          { status: { in: ['authorized', 'failed'] } },
          { status: 'executing', executionLeaseUntil: { lt: now } },
        ],
      },
      data: { status: 'executing', executionLeaseUntil: leaseUntil },
    });

    if (result.count === 0) return null;

    return this.findById(userId, id);
  }

  async listDueSnoozed(now: Date, limit: number): Promise<AssistantAction[]> {
    const rows = await this.prisma.assistantAction.findMany({
      where: { status: 'snoozed', snoozedUntil: { lte: now } },
      orderBy: [{ snoozedUntil: 'asc' }, { id: 'asc' }],
      take: limit,
      select: actionSelect,
    });

    return rows.map(present);
  }

  async getPreference(userId: string): Promise<AssistancePreference | null> {
    return this.prisma.assistancePreference.findUnique({
      where: { userId },
      select: preferenceSelect,
    });
  }

  async savePreference(
    userId: string,
    input: AssistancePreferenceWrite,
  ): Promise<AssistancePreference> {
    return this.prisma.assistancePreference.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
      select: preferenceSelect,
    });
  }
}
