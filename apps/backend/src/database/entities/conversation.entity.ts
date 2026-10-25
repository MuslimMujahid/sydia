import type {
  AssistantRun as PrismaAssistantRun,
  Conversation as PrismaConversation,
  Document as PrismaDocument,
  FileAsset as PrismaFileAsset,
  Message as PrismaMessage,
  Prisma,
  ToolInvocation as PrismaToolInvocation,
} from '../../generated/prisma/client';

export const MESSAGE_ROLES = ['user', 'assistant'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const ASSISTANT_RUN_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
] as const;
export type AssistantRunStatus = (typeof ASSISTANT_RUN_STATUSES)[number];

export const TOOL_INVOCATION_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'rejected',
] as const;
export type ToolInvocationStatus = (typeof TOOL_INVOCATION_STATUSES)[number];

export type Conversation = Pick<
  PrismaConversation,
  'id' | 'title' | 'createdAt' | 'updatedAt'
>;

export type ConversationSummary = Conversation & {
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
};

export type MessageAttachment = Pick<
  PrismaFileAsset,
  'id' | 'originalName' | 'mimeType' | 'size' | 'kind'
> & {
  document: Pick<PrismaDocument, 'id' | 'title'> | null;
};

export type Message = Pick<
  PrismaMessage,
  'id' | 'conversationId' | 'role' | 'content' | 'createdAt'
> & {
  attachments?: Array<{ fileAsset: MessageAttachment }>;
} & Partial<
    Pick<
      PrismaMessage,
      'activeNoteRef' | 'sourceSegments' | 'sourceDocumentIds'
    >
  >;

export type ChatSource = {
  kind: 'file' | 'folder' | 'note';
  id: string;
  label: string;
  path?: string;
};
export type ChatSegment =
  { type: 'text'; text: string } | { type: 'source'; source: ChatSource };

export type AssistantRun = Pick<
  PrismaAssistantRun,
  | 'id'
  | 'conversationId'
  | 'assistantMessageId'
  | 'status'
  | 'errorMessage'
  | 'createdAt'
  | 'updatedAt'
>;

export type AssistantRunRecord = AssistantRun &
  Pick<PrismaAssistantRun, 'inputMessageId' | 'startedAt'>;

export type ToolInvocation = Pick<
  PrismaToolInvocation,
  | 'id'
  | 'assistantRunId'
  | 'name'
  | 'label'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
> & {
  objectId: string | null;
  objectType: 'task' | 'reminder' | 'category' | null;
  state: Record<string, unknown> | null;
  output: Prisma.JsonValue | null;
};

export type ToolInvocationRecord = ToolInvocation &
  Pick<
    PrismaToolInvocation,
    'result' | 'arguments' | 'idempotencyKey' | 'errorMessage' | 'startedAt'
  >;

export type ConversationDetail = {
  conversation: Conversation;
  messages: Message[];
  assistantRuns: AssistantRun[];
  toolInvocations: ToolInvocation[];
};

export type ConversationContextRecord = {
  conversation: Pick<
    PrismaConversation,
    'id' | 'rollingSummary' | 'summaryThroughMessageId'
  >;
  messages: Message[];
};

export type RecentConversationContext = Pick<
  PrismaConversation,
  'id' | 'title' | 'lastMessageAt' | 'rollingSummary'
> & {
  messages: Array<Pick<PrismaMessage, 'role' | 'content' | 'createdAt'>>;
};

export type NewAssistantRun = {
  conversationId: string;
  inputMessageId: string;
  idempotencyKey: string;
  retryOfRunId?: string;
  provider: string;
  model: string;
};

export type NewToolInvocation = {
  assistantRunId: string;
  toolCallId: string;
  name: string;
  label: string;
  arguments: Prisma.InputJsonValue;
  idempotencyKey: string;
};

export class ChatSourceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatSourceUnavailableError';
  }
}
export class ChatSourceConflictError extends Error {
  constructor() {
    super(
      'Pesan ini sudah dikirim dengan sumber berbeda. Kirim sebagai pesan baru.',
    );
    this.name = 'ChatSourceConflictError';
  }
}
