import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type {
  AssistantRun,
  AssistantRunStatus,
  AssistantRunRecord,
  Conversation,
  ConversationContextRecord,
  ConversationDetail,
  ConversationSummary,
  MemoryDreamRun,
  MemoryDreamSegment,
  Message,
  ToolInvocationRecord,
  ToolInvocationStatus,
} from '../entities';
import {
  ConversationNotFoundError,
  type ChannelConversationInput,
  type ChannelConversationResolution,
  type ChannelTurnRecord,
  type ClaimedChannelTurns,
  type IConversationRepository,
  type UserMessageWrite,
  type UserMessageWriteResult,
} from '../interfaces';

const conversationSelect = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const;

const messageSelect = {
  id: true,
  conversationId: true,
  role: true,
  content: true,
  createdAt: true,
  attachments: {
    select: {
      fileAsset: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          size: true,
          kind: true,
        },
      },
    },
  },
} as const;

const assistantRunSelect = {
  id: true,
  conversationId: true,
  assistantMessageId: true,
  status: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
} as const;

const toolInvocationSelect = {
  id: true,
  assistantRunId: true,
  name: true,
  label: true,
  status: true,
  result: true,
  arguments: true,
  idempotencyKey: true,
  errorMessage: true,
  startedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type InvocationRow = {
  id: string;
  assistantRunId: string;
  name: string;
  label: string;
  status: string;
  result: Prisma.JsonValue | null;
  arguments: Prisma.JsonValue;
  idempotencyKey: string;
  errorMessage: string | null;
  startedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function presentInvocation(invocation: InvocationRow): ToolInvocationRecord {
  const output = invocation.result;
  const record =
    output && typeof output === 'object' && !Array.isArray(output)
      ? (output as Record<string, unknown>)
      : null;

  const nested =
    record && typeof record.object === 'object' && record.object !== null
      ? (record.object as Record<string, unknown>)
      : null;

  const state = nested ?? record;
  const objectId = state && typeof state.id === 'string' ? state.id : null;
  const objectType =
    record?.objectType === 'task' ||
    record?.objectType === 'reminder' ||
    record?.objectType === 'category' ||
    record?.objectType === 'category_confirmation'
      ? record.objectType
      : invocation.name.includes('task')
        ? 'task'
        : invocation.name.includes('category')
          ? 'category'
          : invocation.name.includes('reminder')
            ? 'reminder'
            : null;

  return { ...invocation, objectId, objectType, state, output };
}

function titleFromContent(content: string): string {
  const firstLine = content.split('\n', 1)[0]?.trim() ?? content.trim();

  return firstLine.length <= 72 ? firstLine : `${firstLine.slice(0, 69)}…`;
}

function presentChannelTurn(row: {
  id: string;
  channelConversationId: string;
  providerMessageId: string;
  batchKey: string;
  message: Prisma.JsonValue;
  status: string;
  availableAt: Date;
  processingStartedAt: Date | null;
  cancellationRequestedAt: Date | null;
}): ChannelTurnRecord {
  const message = row.message as unknown as ChannelTurnRecord['message'];

  return {
    ...row,
    message: {
      ...message,
      message: {
        ...message.message,
        receivedAt: new Date(message.message.receivedAt),
      },
    },
  };
}

@Injectable()
export class PrismaConversationRepository implements IConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ConversationSummary[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { userId },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        ...conversationSelect,
        lastMessageAt: true,
        messages: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { content: true },
        },
      },
    });

    return conversations.map(({ messages, ...conversation }) => ({
      ...conversation,
      lastMessagePreview: messages[0]?.content ?? null,
      lastMessageAt: conversation.lastMessageAt,
    }));
  }

  async findDetail(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDetail | null> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: {
        ...conversationSelect,
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: messageSelect,
        },
        assistantRuns: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: assistantRunSelect,
        },
      },
    });

    if (!conversation) return null;

    const toolInvocations = await this.prisma.toolInvocation.findMany({
      where: { assistantRun: { conversationId, conversation: { userId } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: toolInvocationSelect,
    });

    const { messages, assistantRuns, ...summary } = conversation;

    return {
      conversation: summary,
      messages,
      assistantRuns,
      toolInvocations: toolInvocations.map(presentInvocation),
    };
  }

  async findContext(
    userId: string,
    conversationId: string,
  ): Promise<ConversationContextRecord | null> {
    const record = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: {
        id: true,
        rollingSummary: true,
        summaryThroughMessageId: true,
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: messageSelect,
        },
      },
    });

    if (!record) return null;
    const { messages, ...conversation } = record;

    return { conversation, messages };
  }

  async resolveChannelConversation(
    input: ChannelConversationInput,
  ): Promise<ChannelConversationResolution> {
    return this.prisma.$transaction(async (transaction) => {
      const lockKey = `${input.provider}:${input.externalIdentityId}:${input.chatExternalId}`;
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `;
      const existing = await transaction.channelConversation.findUnique({
        where: {
          provider_externalIdentityId_chatExternalId: {
            provider: input.provider,
            externalIdentityId: input.externalIdentityId,
            chatExternalId: input.chatExternalId,
          },
        },
        select: {
          id: true,
          lastInboundAt: true,
          conversation: { select: conversationSelect },
        },
      });

      if (existing && existing.lastInboundAt >= input.activeAfter) {
        await transaction.channelConversation.updateMany({
          where: {
            id: existing.id,
            lastInboundAt: { lt: input.receivedAt },
          },
          data: { lastInboundAt: input.receivedAt },
        });

        return {
          channelConversationId: existing.id,
          conversation: existing.conversation,
        };
      }

      const conversation = await transaction.conversation.create({
        data: {
          userId: input.userId,
          channel: input.provider,
          title: titleFromContent(input.title),
        },
        select: conversationSelect,
      });

      const mapping = await transaction.channelConversation.upsert({
        where: {
          provider_externalIdentityId_chatExternalId: {
            provider: input.provider,
            externalIdentityId: input.externalIdentityId,
            chatExternalId: input.chatExternalId,
          },
        },
        create: {
          provider: input.provider,
          externalIdentityId: input.externalIdentityId,
          chatExternalId: input.chatExternalId,
          conversationId: conversation.id,
          lastInboundAt: input.receivedAt,
        },
        update: {
          conversationId: conversation.id,
          lastInboundAt: input.receivedAt,
        },
        select: { id: true },
      });

      return { channelConversationId: mapping.id, conversation };
    });
  }

  async enqueueChannelTurn(
    channelConversationId: string,
    providerMessageId: string,
    message: Prisma.InputJsonValue,
    now: Date,
    burstWindowMs: number,
  ): Promise<{ turn: ChannelTurnRecord; supersededTurnId: string | null }> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${channelConversationId}, 0))
      `;
      const active = await transaction.channelTurn.findFirst({
        where: { channelConversationId, status: 'processing' },
        orderBy: { processingStartedAt: 'desc' },
      });

      const pendingBurst = await transaction.channelTurn.findFirst({
        where: {
          channelConversationId,
          status: 'queued',
          availableAt: { gt: now },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      const superseded =
        active?.processingStartedAt &&
        active.processingStartedAt.getTime() >= now.getTime() - burstWindowMs
          ? active
          : null;

      const batchKey =
        superseded?.batchKey ?? pendingBurst?.batchKey ?? providerMessageId;

      if (superseded) {
        await transaction.channelTurn.update({
          where: { id: superseded.id },
          data: { cancellationRequestedAt: now },
        });
      }

      if (superseded || pendingBurst) {
        await transaction.channelTurn.updateMany({
          where: { channelConversationId, status: 'queued' },
          data: {
            batchKey,
            availableAt: new Date(now.getTime() + burstWindowMs),
          },
        });
      }

      const turn = await transaction.channelTurn.upsert({
        where: {
          channelConversationId_providerMessageId: {
            channelConversationId,
            providerMessageId,
          },
        },
        create: {
          channelConversationId,
          providerMessageId,
          message,
          batchKey,
          availableAt:
            superseded || pendingBurst
              ? new Date(now.getTime() + burstWindowMs)
              : now,
        },
        update: {},
      });

      return {
        turn: presentChannelTurn(turn),
        supersededTurnId: superseded?.id ?? null,
      };
    });
  }

  async claimChannelTurns(
    channelConversationId: string,
    now: Date,
    staleBefore: Date,
    leaseUntil: Date,
  ): Promise<ClaimedChannelTurns | null> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${channelConversationId}, 0))
      `;
      const processing = await transaction.channelTurn.findFirst({
        where: {
          channelConversationId,
          status: { in: ['processing', 'sealed'] },
          leaseUntil: { gt: now },
        },
        select: { id: true },
      });

      if (processing) return null;
      await transaction.channelTurn.updateMany({
        where: {
          channelConversationId,
          status: { in: ['processing', 'sealed'] },
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
          processingStartedAt: { lte: staleBefore },
        },
        data: { status: 'queued', leaseUntil: null },
      });
      const first = await transaction.channelTurn.findFirst({
        where: { channelConversationId, status: 'queued' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      if (!first || first.availableAt > now) return null;
      const batch = await transaction.channelTurn.findMany({
        where: {
          channelConversationId,
          status: 'queued',
          batchKey: first.batchKey,
          availableAt: { lte: now },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      const ids = batch.map(({ id }) => id);
      await transaction.channelTurn.updateMany({
        where: { id: { in: ids }, status: 'queued' },
        data: {
          status: 'processing',
          processingStartedAt: now,
          leaseUntil,
          cancellationRequestedAt: null,
        },
      });
      const channel = await transaction.channelConversation.findUniqueOrThrow({
        where: { id: channelConversationId },
        select: {
          id: true,
          provider: true,
          externalIdentityId: true,
          conversationId: true,
          externalIdentity: { select: { userId: true } },
        },
      });

      return {
        channelConversationId: channel.id,
        conversationId: channel.conversationId,
        userId: channel.externalIdentity.userId,
        externalIdentityId: channel.externalIdentityId,
        provider: channel.provider as 'whatsapp' | 'telegram',
        turns: batch.map(presentChannelTurn),
      };
    });
  }

  async nextChannelTurnAvailableAt(
    channelConversationId: string,
  ): Promise<Date | null> {
    const now = new Date();
    const processing = await this.prisma.channelTurn.findFirst({
      where: {
        channelConversationId,
        status: { in: ['processing', 'sealed'] },
        leaseUntil: { gt: now },
      },
      orderBy: { leaseUntil: 'asc' },
      select: { leaseUntil: true },
    });

    if (processing?.leaseUntil)
      return new Date(
        Math.min(processing.leaseUntil.getTime(), now.getTime() + 1_000),
      );

    return (
      (
        await this.prisma.channelTurn.findFirst({
          where: { channelConversationId, status: 'queued' },
          orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
          select: { availableAt: true },
        })
      )?.availableAt ?? null
    );
  }

  async channelTurnCancellationRequested(turnId: string): Promise<boolean> {
    return Boolean(
      (
        await this.prisma.channelTurn.findUnique({
          where: { id: turnId },
          select: { cancellationRequestedAt: true },
        })
      )?.cancellationRequestedAt,
    );
  }

  async renewChannelTurnLeases(
    turnIds: string[],
    leaseUntil: Date,
  ): Promise<void> {
    await this.prisma.channelTurn.updateMany({
      where: {
        id: { in: turnIds },
        status: { in: ['processing', 'sealed'] },
      },
      data: { leaseUntil },
    });
  }

  async completeChannelTurns(turnIds: string[], now: Date): Promise<void> {
    await this.prisma.channelTurn.updateMany({
      where: { id: { in: turnIds }, status: { in: ['processing', 'sealed'] } },
      data: { status: 'completed', completedAt: now, leaseUntil: null },
    });
  }

  async failChannelTurns(
    turnIds: string[],
    message: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.channelTurn.updateMany({
      where: { id: { in: turnIds }, status: 'processing' },
      data: {
        status: 'failed',
        errorMessage: message,
        completedAt: now,
        leaseUntil: null,
      },
    });
  }

  async sealChannelTurns(
    channelConversationId: string,
    turnIds: string[],
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${channelConversationId}, 0))
      `;
      const cancelled = await transaction.channelTurn.findFirst({
        where: { id: { in: turnIds }, cancellationRequestedAt: { not: null } },
        select: { id: true },
      });

      if (cancelled) return false;
      const result = await transaction.channelTurn.updateMany({
        where: { id: { in: turnIds }, status: 'processing' },
        data: { status: 'sealed' },
      });

      return result.count === turnIds.length;
    });
  }

  async requeueChannelTurns(
    turnIds: string[],
    availableAt: Date,
  ): Promise<void> {
    await this.prisma.channelTurn.updateMany({
      where: {
        id: { in: turnIds },
        status: { in: ['processing', 'sealed'] },
      },
      data: {
        status: 'queued',
        availableAt,
        processingStartedAt: null,
        leaseUntil: null,
        cancellationRequestedAt: null,
      },
    });
  }

  async cancelChannelTurns(
    channelConversationId: string,
    now: Date,
  ): Promise<string[]> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${channelConversationId}, 0))
      `;
      const active = await transaction.channelTurn.findMany({
        where: {
          channelConversationId,
          status: { in: ['processing', 'sealed'] },
        },
        select: { id: true },
      });

      await transaction.channelTurn.updateMany({
        where: {
          channelConversationId,
          status: { in: ['queued', 'processing', 'sealed'] },
        },
        data: {
          status: 'cancelled',
          cancellationRequestedAt: now,
          completedAt: now,
          leaseUntil: null,
        },
      });

      return active.map(({ id }) => id);
    });
  }

  async findRecoverableChannelConversationIds(
    provider?: 'whatsapp' | 'telegram',
  ): Promise<string[]> {
    const rows = await this.prisma.channelTurn.findMany({
      where: {
        status: { in: ['queued', 'processing', 'sealed'] },
        ...(provider ? { channelConversation: { provider } } : {}),
      },
      distinct: ['channelConversationId'],
      select: { channelConversationId: true },
    });

    return rows.map(({ channelConversationId }) => channelConversationId);
  }

  async rejectPendingToolInvocations(
    userId: string,
    conversationId: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.toolInvocation.updateMany({
      where: {
        status: 'awaiting_confirmation',
        assistantRun: { conversationId, conversation: { userId } },
      },
      data: {
        status: 'rejected',
        errorMessage: 'Dibatalkan oleh pesan atau percakapan baru.',
        completedAt: now,
      },
    });
  }

  async resetChannelConversation(
    provider: 'whatsapp' | 'telegram',
    externalIdentityId: string,
    chatExternalId: string,
  ): Promise<void> {
    await this.prisma.channelConversation.updateMany({
      where: { provider, externalIdentityId, chatExternalId },
      data: { lastInboundAt: new Date(0) },
    });
  }

  async findLatestPendingToolInvocation(
    userId: string,
    conversationId: string,
  ): Promise<ToolInvocationRecord | null> {
    const invocation = await this.prisma.toolInvocation.findFirst({
      where: {
        status: 'awaiting_confirmation',
        assistantRun: { conversationId, conversation: { userId } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: toolInvocationSelect,
    });

    return invocation ? presentInvocation(invocation) : null;
  }

  async writeUserMessage(
    input: UserMessageWrite,
  ): Promise<UserMessageWriteResult> {
    const existing = await this.prisma.message.findFirst({
      where: {
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        role: 'user',
      },
      select: {
        ...messageSelect,
        conversation: { select: conversationSelect },
      },
    });

    if (existing) {
      const { conversation, ...userMessage } = existing;

      return { conversation, userMessage, replayed: true };
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        let conversation: Conversation;

        if (input.conversationId) {
          const ownedConversation = await transaction.conversation.findFirst({
            where: { id: input.conversationId, userId: input.userId },
            select: conversationSelect,
          });

          if (!ownedConversation) {
            throw new ConversationNotFoundError();
          }

          conversation = ownedConversation;
        } else {
          conversation = await transaction.conversation.create({
            data: {
              userId: input.userId,
              channel: input.channel ?? 'web',
              title: titleFromContent(input.content),
            },
            select: conversationSelect,
          });
        }

        const attachmentAssets = input.attachmentIds?.length
          ? await transaction.fileAsset.findMany({
              where: {
                userId: input.userId,
                OR: [
                  { id: { in: input.attachmentIds } },
                  { document: { id: { in: input.attachmentIds } } },
                ],
              },
              select: { id: true },
            })
          : [];

        if (attachmentAssets.length !== (input.attachmentIds?.length ?? 0)) {
          throw new Error('Satu atau beberapa lampiran tidak ditemukan.');
        }

        const userMessage = await transaction.message.create({
          data: {
            conversationId: conversation.id,
            userId: input.userId,
            role: 'user',
            content: input.content,
            idempotencyKey: input.idempotencyKey,
            ...(attachmentAssets.length
              ? {
                  attachments: {
                    createMany: {
                      data: attachmentAssets.map(({ id: fileAssetId }) => ({
                        fileAssetId,
                      })),
                    },
                  },
                }
              : {}),
          },
          select: messageSelect,
        });

        conversation = await transaction.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: userMessage.createdAt },
          select: conversationSelect,
        });

        return { conversation, userMessage, replayed: false };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.prisma.message.findFirst({
          where: {
            userId: input.userId,
            idempotencyKey: input.idempotencyKey,
            role: 'user',
          },
          select: {
            ...messageSelect,
            conversation: { select: conversationSelect },
          },
        });

        if (replay) {
          const { conversation, ...userMessage } = replay;

          return { conversation, userMessage, replayed: true };
        }
      }

      throw error;
    }
  }

  async findUserMessageContent(
    userId: string,
    messageId: string,
  ): Promise<string | null> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, userId, role: 'user' },
      select: { content: true },
    });

    return message?.content ?? null;
  }

  async maskUserMessage(
    userId: string,
    messageId: string,
    replacement: string,
  ): Promise<boolean> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, userId, role: 'user' },
      select: { conversationId: true },
    });

    if (!message) return false;

    await this.prisma.$transaction([
      this.prisma.message.update({
        where: { id: messageId },
        data: { content: replacement },
      }),
      this.prisma.conversation.update({
        where: { id: message.conversationId },
        data: { title: titleFromContent(replacement) },
      }),
    ]);

    return true;
  }

  async maskActiveChannelTurns(
    userId: string,
    messageId: string,
    replacement: string,
  ): Promise<void> {
    const source = await this.prisma.message.findFirst({
      where: { id: messageId, userId },
      select: { conversationId: true },
    });

    if (!source) return;

    const turns = await this.prisma.channelTurn.findMany({
      where: {
        channelConversation: { conversationId: source.conversationId },
        status: { in: ['queued', 'processing', 'sealed'] },
      },
      select: { id: true, message: true },
    });

    await Promise.all(
      turns.map(({ id, message }) => {
        const queued = message as unknown as ChannelTurnRecord['message'];
        const safeMessage = {
          ...queued,
          message: {
            ...queued.message,
            text: replacement,
            ...(queued.message.caption === undefined
              ? {}
              : { caption: replacement }),
            raw: {},
          },
        } as unknown as Prisma.InputJsonValue;

        return this.prisma.channelTurn.update({
          where: { id },
          data: { message: safeMessage },
        });
      }),
    );
  }

  async findRun(
    userId: string,
    conversationId: string,
    runId: string,
  ): Promise<AssistantRunRecord | null> {
    return this.prisma.assistantRun.findFirst({
      where: { id: runId, conversationId, conversation: { userId } },
      select: { ...assistantRunSelect, inputMessageId: true, startedAt: true },
    });
  }

  async findLatestRunForMessage(
    userId: string,
    messageId: string,
  ): Promise<AssistantRunRecord | null> {
    return this.prisma.assistantRun.findFirst({
      where: { inputMessageId: messageId, conversation: { userId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { ...assistantRunSelect, inputMessageId: true, startedAt: true },
    });
  }

  async createRun(input: {
    conversationId: string;
    inputMessageId: string;
    idempotencyKey: string;
    retryOfRunId?: string;
    provider: string;
    model: string;
  }): Promise<AssistantRun> {
    try {
      return await this.prisma.assistantRun.create({
        data: input,
        select: assistantRunSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.assistantRun.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: assistantRunSelect,
        });

        if (existing) return existing;
      }

      throw error;
    }
  }

  async claimRun(id: string, staleBefore: Date): Promise<boolean> {
    const result = await this.prisma.assistantRun.updateMany({
      where: {
        id,
        OR: [
          { status: 'queued' },
          { status: 'failed' },
          { status: 'running', startedAt: { lt: staleBefore } },
        ],
      },
      data: {
        status: 'running',
        assistantMessageId: null,
        errorMessage: null,
        inputTokens: null,
        outputTokens: null,
        startedAt: new Date(),
        completedAt: null,
      },
    });

    return result.count === 1;
  }

  async updateRun(
    id: string,
    update: {
      status: AssistantRunStatus;
      assistantMessageId?: string | null;
      errorMessage?: string | null;
      inputTokens?: number | null;
      outputTokens?: number | null;
      startedAt?: Date | null;
      completedAt?: Date | null;
    },
  ): Promise<AssistantRun> {
    return this.prisma.assistantRun.update({
      where: { id },
      data: update,
      select: assistantRunSelect,
    });
  }

  async completeRun(input: {
    runId: string;
    conversationId: string;
    userId: string;
    content: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  }): Promise<{ assistantMessage: Message; assistantRun: AssistantRun }> {
    return this.prisma.$transaction(async (transaction) => {
      const assistantMessage = await transaction.message.create({
        data: {
          conversationId: input.conversationId,
          userId: input.userId,
          role: 'assistant',
          content: input.content,
        },
        select: messageSelect,
      });

      await transaction.conversation.update({
        where: { id: input.conversationId },
        data: { lastMessageAt: assistantMessage.createdAt },
      });

      const assistantRun = await transaction.assistantRun.update({
        where: { id: input.runId },
        data: {
          status: 'completed',
          assistantMessageId: assistantMessage.id,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          costUsd: input.costUsd,
          completedAt: new Date(),
        },
        select: assistantRunSelect,
      });

      return { assistantMessage, assistantRun };
    });
  }

  async createToolInvocation(input: {
    assistantRunId: string;
    toolCallId: string;
    name: string;
    label: string;
    arguments: Prisma.InputJsonValue;
    idempotencyKey: string;
  }): Promise<ToolInvocationRecord> {
    const select = {
      ...toolInvocationSelect,
      result: true,
      errorMessage: true,
      startedAt: true,
    } as const;

    try {
      const created = await this.prisma.toolInvocation.create({
        data: input,
        select,
      });

      return presentInvocation(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.toolInvocation.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select,
        });

        if (existing) return presentInvocation(existing);
      }

      throw error;
    }
  }

  async claimToolInvocation(id: string, staleBefore: Date): Promise<boolean> {
    const result = await this.prisma.toolInvocation.updateMany({
      where: {
        id,
        OR: [
          { status: 'pending' },
          { status: 'running', startedAt: { lt: staleBefore } },
        ],
      },
      data: { status: 'running', startedAt: new Date() },
    });

    return result.count === 1;
  }

  async updateToolInvocation(
    id: string,
    update: {
      status: ToolInvocationStatus;
      result?: Prisma.InputJsonValue;
      errorMessage?: string | null;
      startedAt?: Date;
      completedAt?: Date;
    },
  ): Promise<ToolInvocationRecord> {
    const invocation = await this.prisma.toolInvocation.update({
      where: { id },
      data: update,
      select: {
        ...toolInvocationSelect,
      },
    });

    return presentInvocation(invocation);
  }

  async findToolInvocation(
    userId: string,
    id: string,
  ): Promise<ToolInvocationRecord | null> {
    const invocation = await this.prisma.toolInvocation.findFirst({
      where: { id, assistantRun: { conversation: { userId } } },
      select: toolInvocationSelect,
    });

    return invocation ? presentInvocation(invocation) : null;
  }

  async claimToolConfirmation(id: string): Promise<boolean> {
    const result = await this.prisma.toolInvocation.updateMany({
      where: { id, status: 'awaiting_confirmation' },
      data: { status: 'running', startedAt: new Date() },
    });

    return result.count === 1;
  }

  async replaceSummary(
    userId: string,
    conversationId: string,
    content: string,
    throughMessageId: string,
    expectedPreviousThroughMessageId: string | null,
  ): Promise<boolean> {
    const replaced = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.conversation.updateMany({
        where: {
          id: conversationId,
          userId,
          summaryThroughMessageId: expectedPreviousThroughMessageId,
        },
        data: {
          rollingSummary: content,
          summaryThroughMessageId: throughMessageId,
        },
      });

      if (updated.count !== 1) return false;

      await tx.conversationSummary.create({
        data: { conversationId, content, throughMessageId },
      });

      return true;
    });

    return replaced;
  }

  async findMemoryDreamSegment(
    userId: string,
    conversationId: string,
    throughMessageId: string,
  ): Promise<MemoryDreamSegment | null> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: {
        memoryDreamThroughMessageId: true,
        messages: {
          where: { role: { in: ['user', 'assistant'] } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: messageSelect,
        },
      },
    });

    const deletionMarkers = await this.prisma.memoryDeletionMarker.findMany({
      where: { userId, conversationId },
      select: { sourceMessageId: true },
    });

    const deletedSourceIds = new Set(
      deletionMarkers.map(({ sourceMessageId }) => sourceMessageId),
    );

    if (!conversation) return null;
    const throughIndex = conversation.messages.findIndex(
      ({ id }) => id === throughMessageId,
    );

    if (throughIndex < 0) return null;
    const previousIndex = conversation.memoryDreamThroughMessageId
      ? conversation.messages.findIndex(
          ({ id }) => id === conversation.memoryDreamThroughMessageId,
        )
      : -1;

    if (previousIndex >= throughIndex) return null;

    return {
      userId,
      conversationId,
      previousThroughMessageId: conversation.memoryDreamThroughMessageId,
      throughMessageId,
      messages: conversation.messages
        .slice(previousIndex + 1, throughIndex + 1)
        .filter(({ id }) => !deletedSourceIds.has(id))
        .map((message) => ({
          ...message,
          role: message.role === 'assistant' ? 'assistant' : 'user',
        })),
    };
  }

  async beginMemoryDream(
    segment: MemoryDreamSegment,
    dreamerVersion: string,
  ): Promise<MemoryDreamRun | null> {
    const existing = await this.prisma.memoryDreamRun.findUnique({
      where: {
        conversationId_throughMessageId_dreamerVersion: {
          conversationId: segment.conversationId,
          throughMessageId: segment.throughMessageId,
          dreamerVersion,
        },
      },
    });

    if (existing?.status === 'completed') return null;

    if (
      existing?.status === 'running' &&
      existing.startedAt > new Date(Date.now() - 15 * 60 * 1000)
    ) {
      return null;
    }

    const run = existing
      ? await this.prisma.memoryDreamRun.update({
          where: { id: existing.id },
          data: {
            status: 'running',
            errorMessage: null,
            startedAt: new Date(),
          },
        })
      : await this.prisma.memoryDreamRun.create({
          data: {
            userId: segment.userId,
            conversationId: segment.conversationId,
            throughMessageId: segment.throughMessageId,
            dreamerVersion,
          },
        });

    return run;
  }

  async completeMemoryDream(
    runId: string,
    segment: MemoryDreamSegment,
    candidateCount: number,
    mutationCount: number,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const advanced = await tx.conversation.updateMany({
        where: {
          id: segment.conversationId,
          userId: segment.userId,
          memoryDreamThroughMessageId: segment.previousThroughMessageId,
        },
        data: { memoryDreamThroughMessageId: segment.throughMessageId },
      });

      if (advanced.count !== 1) return false;
      await tx.memoryDreamRun.update({
        where: { id: runId },
        data: {
          status: 'completed',
          candidateCount,
          mutationCount,
          completedAt: new Date(),
        },
      });

      return true;
    });
  }

  async failMemoryDream(runId: string, errorMessage: string): Promise<void> {
    await this.prisma.memoryDreamRun.update({
      where: { id: runId },
      data: { status: 'failed', errorMessage, completedAt: new Date() },
    });
  }

  async findPendingMemoryDreams(
    idleBefore: Date,
  ): Promise<
    Array<{ userId: string; conversationId: string; throughMessageId: string }>
  > {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        lastMessageAt: { lte: idleBefore },
        user: { automaticMemoryEnabled: true },
      },
      select: {
        id: true,
        userId: true,
        memoryDreamThroughMessageId: true,
        messages: {
          where: { role: { in: ['user', 'assistant'] } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { id: true },
        },
      },
    });

    return conversations.flatMap((conversation) => {
      const throughMessageId = conversation.messages[0]?.id;

      return throughMessageId &&
        throughMessageId !== conversation.memoryDreamThroughMessageId
        ? [
            {
              userId: conversation.userId,
              conversationId: conversation.id,
              throughMessageId,
            },
          ]
        : [];
    });
  }

  async delete(userId: string, conversationId: string): Promise<boolean> {
    const result = await this.prisma.conversation.deleteMany({
      where: { id: conversationId, userId },
    });

    return result.count === 1;
  }
}
