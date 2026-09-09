import type { Prisma } from '../../generated/prisma/client';
import type { NormalizedInboundMessage } from '../../shared/messaging';
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
  channel?: string;
};

export type UserMessageWriteResult = {
  conversation: Conversation;
  userMessage: Message;
  replayed: boolean;
};

export type ChannelConversationInput = {
  provider: 'whatsapp' | 'telegram';
  externalIdentityId: string;
  chatExternalId: string;
  userId: string;
  title: string;
  activeAfter: Date;
  receivedAt: Date;
};

export type QueuedChannelMessage = {
  message: NormalizedInboundMessage;
};

export type ChannelConversationResolution = {
  channelConversationId: string;
  conversation: Conversation;
};

export type ChannelTurnRecord = {
  id: string;
  channelConversationId: string;
  providerMessageId: string;
  message: QueuedChannelMessage;
  status: string;
  availableAt: Date;
  processingStartedAt: Date | null;
  cancellationRequestedAt: Date | null;
};

export type ClaimedChannelTurns = {
  channelConversationId: string;
  conversationId: string;
  userId: string;
  externalIdentityId: string;
  provider: 'whatsapp' | 'telegram';
  turns: ChannelTurnRecord[];
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
  resolveChannelConversation(
    input: ChannelConversationInput,
  ): Promise<ChannelConversationResolution>;
  enqueueChannelTurn(
    channelConversationId: string,
    providerMessageId: string,
    message: Prisma.InputJsonValue,
    now: Date,
    burstWindowMs: number,
  ): Promise<{ turn: ChannelTurnRecord; supersededTurnId: string | null }>;
  claimChannelTurns(
    channelConversationId: string,
    now: Date,
    staleBefore: Date,
    leaseUntil: Date,
  ): Promise<ClaimedChannelTurns | null>;
  nextChannelTurnAvailableAt(
    channelConversationId: string,
  ): Promise<Date | null>;
  channelTurnCancellationRequested(turnId: string): Promise<boolean>;
  renewChannelTurnLeases(turnIds: string[], leaseUntil: Date): Promise<void>;
  completeChannelTurns(turnIds: string[], now: Date): Promise<void>;
  failChannelTurns(
    turnIds: string[],
    message: string,
    now: Date,
  ): Promise<void>;
  sealChannelTurns(
    channelConversationId: string,
    turnIds: string[],
  ): Promise<boolean>;
  cancelChannelTurns(
    channelConversationId: string,
    now: Date,
  ): Promise<string[]>;
  requeueChannelTurns(turnIds: string[], availableAt: Date): Promise<void>;
  findRecoverableChannelConversationIds(
    provider?: 'whatsapp' | 'telegram',
  ): Promise<string[]>;
  resetChannelConversation(
    provider: 'whatsapp' | 'telegram',
    externalIdentityId: string,
    chatExternalId: string,
  ): Promise<void>;
  rejectPendingToolInvocations(
    userId: string,
    conversationId: string,
    now: Date,
  ): Promise<void>;
  findLatestPendingToolInvocation(
    userId: string,
    conversationId: string,
  ): Promise<ToolInvocationRecord | null>;
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
