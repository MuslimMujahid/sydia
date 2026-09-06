import type { Prisma } from '../../generated/prisma/client';
import type {
  AssistantRun,
  AssistantRunStatus,
  AssistantRunRecord,
  Conversation,
  ConversationContextRecord,
  ConversationDetail,
  ConversationSummary,
  Message,
  NewAssistantRun,
  NewToolInvocation,
  ToolInvocationStatus,
  ToolInvocationRecord,
} from '../entities';

export type UserMessageWrite = {
  userId: string;
  conversationId?: string;
  content: string;
  idempotencyKey: string;
};

export type UserMessageWriteResult = {
  conversation: Conversation;
  userMessage: Message;
  replayed: boolean;
};

export interface IConversationRepository {
  list(userId: string): Promise<ConversationSummary[]>;
  findDetail(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDetail | null>;
  findContext(
    userId: string,
    conversationId: string,
  ): Promise<ConversationContextRecord | null>;
  writeUserMessage(input: UserMessageWrite): Promise<UserMessageWriteResult>;
  findRun(
    userId: string,
    conversationId: string,
    runId: string,
  ): Promise<AssistantRunRecord | null>;
  findLatestRunForMessage(
    userId: string,
    messageId: string,
  ): Promise<AssistantRunRecord | null>;
  createRun(input: NewAssistantRun): Promise<AssistantRun>;
  claimRun(id: string, staleBefore: Date): Promise<boolean>;
  updateRun(
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
  ): Promise<AssistantRun>;
  completeRun(input: {
    runId: string;
    conversationId: string;
    userId: string;
    content: string;
    inputTokens?: number;
    outputTokens?: number;
  }): Promise<{ assistantMessage: Message; assistantRun: AssistantRun }>;
  createToolInvocation(input: NewToolInvocation): Promise<ToolInvocationRecord>;
  claimToolInvocation(id: string, staleBefore: Date): Promise<boolean>;
  updateToolInvocation(
    id: string,
    update: {
      status: ToolInvocationStatus;
      result?: Prisma.InputJsonValue;
      errorMessage?: string | null;
      startedAt?: Date;
      completedAt?: Date;
    },
  ): Promise<ToolInvocationRecord>;
  replaceSummary(
    userId: string,
    conversationId: string,
    content: string,
    throughMessageId: string,
  ): Promise<void>;
}

export const CONVERSATION_REPOSITORY = Symbol('IConversationRepository');

export class ConversationNotFoundError extends Error {
  constructor() {
    super('Conversation not found for user');
    this.name = 'ConversationNotFoundError';
  }
}
