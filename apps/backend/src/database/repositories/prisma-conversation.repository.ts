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
  Message,
  ToolInvocationRecord,
  ToolInvocationStatus,
} from '../entities';
import {
  ConversationNotFoundError,
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
  label: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

function titleFromContent(content: string): string {
  const firstLine = content.split('\n', 1)[0]?.trim() ?? content.trim();

  return firstLine.length <= 72 ? firstLine : `${firstLine.slice(0, 69)}…`;
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

    return { conversation: summary, messages, assistantRuns, toolInvocations };
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
              channel: 'web',
              title: titleFromContent(input.content),
            },
            select: conversationSelect,
          });
        }

        const userMessage = await transaction.message.create({
          data: {
            conversationId: conversation.id,
            userId: input.userId,
            role: 'user',
            content: input.content,
            idempotencyKey: input.idempotencyKey,
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
      return await this.prisma.toolInvocation.create({ data: input, select });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.toolInvocation.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select,
        });

        if (existing) return existing;
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
    return this.prisma.toolInvocation.update({
      where: { id },
      data: update,
      select: {
        ...toolInvocationSelect,
        result: true,
        errorMessage: true,
        startedAt: true,
      },
    });
  }

  async replaceSummary(
    userId: string,
    conversationId: string,
    content: string,
    throughMessageId: string,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });

    if (!conversation) throw new ConversationNotFoundError();

    await this.prisma.$transaction([
      this.prisma.conversationSummary.create({
        data: { conversationId, content, throughMessageId },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          rollingSummary: content,
          summaryThroughMessageId: throughMessageId,
        },
      }),
    ]);
  }
}
