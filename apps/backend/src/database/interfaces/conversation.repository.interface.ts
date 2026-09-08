import type { Prisma } from '../../generated/prisma/client';
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
  attachmentIds?: string[];
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
    costUsd?: number;
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
  findToolInvocation(
    userId: string,
    id: string,
  ): Promise<ToolInvocationRecord | null>;
  claimToolConfirmation(id: string): Promise<boolean>;
  replaceSummary(
    userId: string,
    conversationId: string,
    content: string,
    throughMessageId: string,
    expectedPreviousThroughMessageId: string | null,
  ): Promise<boolean>;
  findMemoryDreamSegment(
    userId: string,
    conversationId: string,
    throughMessageId: string,
  ): Promise<MemoryDreamSegment | null>;
  beginMemoryDream(
    segment: MemoryDreamSegment,
    dreamerVersion: string,
  ): Promise<MemoryDreamRun | null>;
  completeMemoryDream(
    runId: string,
    segment: MemoryDreamSegment,
    candidateCount: number,
    mutationCount: number,
  ): Promise<boolean>;
  failMemoryDream(runId: string, errorMessage: string): Promise<void>;
  findPendingMemoryDreams(
    idleBefore: Date,
  ): Promise<
    Array<{ userId: string; conversationId: string; throughMessageId: string }>
  >;
  delete(userId: string, conversationId: string): Promise<boolean>;
}

export const CONVERSATION_REPOSITORY = Symbol('IConversationRepository');

export class ConversationNotFoundError extends Error {
  constructor() {
    super('Conversation not found for user');
    this.name = 'ConversationNotFoundError';
  }
}
