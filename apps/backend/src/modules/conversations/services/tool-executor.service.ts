import { Inject, Injectable } from '@nestjs/common';
import {
  jsonSchema,
  tool,
  type JSONSchema7,
  type ToolExecutionOptions,
  type ToolSet,
} from 'ai';
import type { Prisma } from '../../../generated/prisma/client';
import {
  CONVERSATION_REPOSITORY,
  type IConversationRepository,
} from '../../../database/interfaces';
import type {
  ToolInvocation,
  SupportedLocale,
} from '../../../database/entities';
import type { MessageProvider } from '../../../shared/messaging';
import type { GenerateRequest } from '../../../infra/model-gateway/model-gateway.types';

export type AssistantToolDefinition = {
  name: string;
  label: string;
  description: string;
  parameters: JSONSchema7;
};
export type AssistantFile = {
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

export type AssistantToolExecutionContext = {
  channel?: MessageProvider;
  sendFile?: (file: AssistantFile) => Promise<{ providerMessageId: string }>;
};

export type AssistantTool = {
  definition: AssistantToolDefinition;
  parseArguments(value: unknown): Prisma.InputJsonValue;
  execute(input: {
    userId: string;
    sourceMessageId: string;
    arguments: Prisma.InputJsonValue;
    idempotencyKey: string;
    deferConfirmation?: boolean;
    context?: AssistantToolExecutionContext;
  }): Promise<Prisma.InputJsonValue>;
  requiresConfirmation?: boolean;
  internal?: boolean;
  sensitive?: boolean;
  exposeTransientResult?: boolean;
  /** Read-only tools may safely re-run when a generation is retried. */
  readOnly?: boolean;
};

export const ASSISTANT_TOOLS = Symbol('AssistantTools');

export type AssistantToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type ToolExecutionResult = {
  invocation: ToolInvocation;
  content: string;
};

const TOOL_STALE_AFTER_MS = 60_000;
const MAX_TOOL_ERROR_LENGTH = 240;

/**
 * Step 0 advertises every tool so the model can classify intent from the full
 * catalogue. Later steps are narrowed to the families matched by the tools that
 * already ran, which keeps the multi-thousand-token tool schema off the
 * remaining steps of the loop.
 */
const TOOL_FAMILIES: Record<string, readonly string[]> = {
  time: ['get_current_datetime'],
  tasks: ['list_tasks', 'create_task', 'update_task'],
  categories: [
    'list_categories',
    'create_category',
    'update_category',
    'delete_category',
  ],
  reminders: ['create_reminder', 'update_reminder'],
  memories: [
    'search_memories',
    'save_memory',
    'update_memory',
    'forget_memory',
  ],
  documents: [
    'list_documents',
    'read_document',
    'save_attached_files',
    'send_file',
    'search_documents',
  ],
  contacts: ['resolve_contact', 'save_contact'],
  calendar: [
    'list_calendar_events',
    'create_calendar_event',
    'update_calendar_event',
    'cancel_calendar_event',
  ],
  secrets: ['store_secret', 'create_secret_reveal_link'],
};

const FAMILY_BY_TOOL: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_FAMILIES).flatMap(([family, names]) =>
    names.map((name) => [name, family] as const),
  ),
);

/** Tools that stay reachable once advertised, so the turn can still re-check time. */
const PINNED_TOOLS: Record<string, true> = { get_current_datetime: true };

/**
 * Narrows the advertised tool set after the first step. The first pass is the
 * only step that needs the whole catalogue: once the model has chosen tools,
 * the matched families plus the pinned tools are enough to finish the turn.
 */
export function narrowToolNames(
  stepNumber: number,
  allToolNames: readonly string[],
  previousToolNames: readonly string[],
): string[] | undefined {
  if (stepNumber === 0) return undefined;

  const families: Record<string, true> = {};

  for (const name of previousToolNames) {
    const family = FAMILY_BY_TOOL[name];
    if (family !== undefined) families[family] = true;
  }

  if (Object.keys(families).length === 0) return undefined;

  const narrowed = allToolNames.filter((name) => {
    if (PINNED_TOOLS[name]) return true;
    const family = FAMILY_BY_TOOL[name];

    return family !== undefined && families[family] === true;
  });

  return narrowed.length > 0 ? narrowed : undefined;
}

function toolErrorContent(error: unknown): string {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : 'Tool execution failed.';

  const sanitized = message
    .replace(/[\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TOOL_ERROR_LENGTH);

  return JSON.stringify({ error: 'tool_failed', message: sanitized });
}

type LocalizedToolLabel = Record<SupportedLocale, string>;

/**
 * User-facing activity labels are kept separate from tool definitions so the
 * descriptions and canonical labels sent to the model remain English.
 */
const TOOL_ACTIVITY_LABELS: Readonly<Record<string, LocalizedToolLabel>> = {
  get_current_datetime: {
    en: 'View current time',
    id: 'Melihat waktu saat ini',
  },
  create_task: { en: 'Create task', id: 'Membuat tugas' },
  update_task: { en: 'Update task', id: 'Memperbarui tugas' },
  list_tasks: { en: 'Find tasks', id: 'Mencari tugas' },
  create_reminder: { en: 'Create reminder', id: 'Membuat pengingat' },
  update_reminder: { en: 'Update reminder', id: 'Memperbarui pengingat' },
  save_memory: { en: 'Save memory', id: 'Menyimpan memori' },
  update_memory: { en: 'Update memory', id: 'Memperbarui memori' },
  forget_memory: { en: 'Forget memory', id: 'Menghapus memori' },
  search_memories: { en: 'Search memories', id: 'Mencari memori' },
  list_categories: { en: 'View categories', id: 'Melihat kategori' },
  create_category: { en: 'Create category', id: 'Membuat kategori' },
  update_category: { en: 'Update category', id: 'Memperbarui kategori' },
  delete_category: { en: 'Delete category', id: 'Menghapus kategori' },
  store_secret: { en: 'Store secret', id: 'Menyimpan rahasia' },
  create_secret_reveal_link: {
    en: 'Create secret reveal link',
    id: 'Membuat tautan rahasia',
  },
  save_contact: { en: 'Save contact', id: 'Menyimpan kontak' },
  resolve_contact: { en: 'Find contact', id: 'Mencari kontak' },
  list_documents: { en: 'List files', id: 'Menampilkan file' },
  read_document: { en: 'Read document', id: 'Membaca dokumen' },
  save_attached_files: {
    en: 'Save attached files',
    id: 'Menyimpan file terlampir',
  },
  search_documents: { en: 'Search documents', id: 'Mencari dokumen' },
  list_calendar_events: {
    en: 'Find calendar events',
    id: 'Mencari acara kalender',
  },
  create_calendar_event: {
    en: 'Create calendar event',
    id: 'Membuat acara kalender',
  },
  update_calendar_event: {
    en: 'Update calendar event',
    id: 'Memperbarui acara kalender',
  },
  cancel_calendar_event: {
    en: 'Cancel calendar event',
    id: 'Membatalkan acara kalender',
  },
};

@Injectable()
export class ToolExecutorService {
  private readonly toolsByName: Readonly<Record<string, AssistantTool>>;
  private readonly retrySafeToolNames: ReadonlySet<string>;

  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(ASSISTANT_TOOLS) tools: AssistantTool[],
  ) {
    this.toolsByName = Object.fromEntries(
      tools.map((assistantTool) => [
        assistantTool.definition.name,
        assistantTool,
      ]),
    );
    this.retrySafeToolNames = new Set(
      tools
        .filter((assistantTool) => assistantTool.readOnly === true)
        .map((assistantTool) => assistantTool.definition.name),
    );
  }

  retrySafeTools(): ReadonlySet<string> {
    return this.retrySafeToolNames;
  }

  activityLabel(toolName: string, locale: SupportedLocale): string | null {
    const localized = TOOL_ACTIVITY_LABELS[toolName];
    if (localized) return localized[locale];

    // Test-only tools are not part of the production map; retain their
    // definition label as the English fallback.
    return this.toolsByName[toolName]?.definition.label ?? null;
  }

  prepareStep(
    tools: ToolSet,
  ): NonNullable<GenerateRequest['prepareStep']> | undefined {
    const toolNames = Object.keys(tools);
    if (toolNames.length === 0) return undefined;

    return ({ stepNumber, executedToolNames }) =>
      narrowToolNames(stepNumber, toolNames, executedToolNames);
  }

  aiTools(
    userId: string,
    runId: string,
    inputMessageId: string,
    onExecution?: (result: ToolExecutionResult) => void,
    toolsReady?: Promise<void>,
    abortSignal?: AbortSignal,
    context?: AssistantToolExecutionContext,
  ): ToolSet {
    const documentSearches = new Map<string, Promise<ToolExecutionResult>>();

    return Object.fromEntries(
      Object.values(this.toolsByName).map((assistantTool) => {
        const { definition } = assistantTool;
        const wrapped = tool({
          description: definition.description,
          inputSchema: jsonSchema(definition.parameters),
          execute: async (
            input: unknown,
            options: ToolExecutionOptions<Record<string, unknown>>,
          ) => {
            if (toolsReady) await toolsReady;
            if (abortSignal?.aborted) throw abortSignal.reason;

            if (assistantTool.internal) {
              const result = await assistantTool.execute({
                userId,
                sourceMessageId: inputMessageId,
                arguments: assistantTool.parseArguments(input),
                idempotencyKey: `${inputMessageId}:${options.toolCallId}`,
                context,
              });

              return JSON.stringify(result);
            }

            const call = {
              id: options.toolCallId,
              name: definition.name,
              arguments: input,
            };

            const searchKey =
              definition.name === 'search_documents'
                ? JSON.stringify(assistantTool.parseArguments(input))
                : null;

            const existingSearch = searchKey
              ? documentSearches.get(searchKey)
              : undefined;

            const result = existingSearch
              ? await existingSearch
              : await (() => {
                  const execution = this.execute(
                    userId,
                    runId,
                    inputMessageId,
                    call,
                    context,
                  );

                  if (searchKey) documentSearches.set(searchKey, execution);

                  return execution;
                })();

            if (!existingSearch) onExecution?.(result);

            return result.content;
          },
        });

        return [definition.name, wrapped];
      }),
    );
  }

  async resolveConfirmation(
    userId: string,
    invocationId: string,
    approved: boolean,
    context?: AssistantToolExecutionContext,
  ): Promise<ToolExecutionResult | null> {
    const invocation = await this.conversations.findToolInvocation(
      userId,
      invocationId,
    );

    if (!invocation || invocation.status !== 'awaiting_confirmation')
      return null;
    if (!(await this.conversations.claimToolConfirmation(invocation.id)))
      return null;

    if (!approved) {
      const rejected = await this.conversations.updateToolInvocation(
        invocation.id,
        {
          status: 'rejected',
          errorMessage: 'Cancelled by the user.',
          completedAt: new Date(),
        },
      );

      return {
        invocation: rejected,
        content: `${invocation.label} was cancelled by the user.`,
      };
    }

    const assistantTool = this.toolsByName[invocation.name];
    if (!assistantTool) return null;

    try {
      const result = await assistantTool.execute({
        userId,
        sourceMessageId: invocation.id,
        arguments: assistantTool.parseArguments(invocation.arguments),
        idempotencyKey: invocation.idempotencyKey,
        deferConfirmation: false,
        context,
      });

      const completed = await this.conversations.updateToolInvocation(
        invocation.id,
        {
          status: 'completed',
          result,
          completedAt: new Date(),
        },
      );

      return { invocation: completed, content: JSON.stringify(result) };
    } catch (error) {
      const failed = await this.conversations.updateToolInvocation(
        invocation.id,
        {
          status: 'failed',
          errorMessage:
            error instanceof Error ? error.message : 'Tool execution failed.',
          completedAt: new Date(),
        },
      );

      return { invocation: failed, content: toolErrorContent(error) };
    }
  }

  async execute(
    userId: string,
    runId: string,
    inputMessageId: string,
    call: AssistantToolCall,
    context?: AssistantToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const assistantTool = this.toolsByName[call.name];
    const idempotencyKey = `${inputMessageId}:${call.id}`;

    if (!assistantTool) {
      const invocation = await this.conversations.createToolInvocation({
        assistantRunId: runId,
        toolCallId: call.id,
        name: call.name || 'unknown',
        label: call.name || 'Unknown tool',
        arguments: {},
        idempotencyKey,
      });

      const rejected = await this.conversations.updateToolInvocation(
        invocation.id,
        {
          status: 'rejected',
          errorMessage: 'Tool not allowed.',
          completedAt: new Date(),
        },
      );

      return {
        invocation: rejected,
        content: 'Tool rejected: not allowed.',
      };
    }

    let argumentsValue: Prisma.InputJsonValue;

    try {
      argumentsValue = assistantTool.parseArguments(call.arguments);
    } catch (error) {
      const invocation = await this.conversations.createToolInvocation({
        assistantRunId: runId,
        toolCallId: call.id,
        name: call.name,
        label: assistantTool.definition.label,
        arguments: {},
        idempotencyKey,
      });

      const rejected = await this.conversations.updateToolInvocation(
        invocation.id,
        {
          status: 'rejected',
          errorMessage:
            error instanceof Error ? error.message : 'Invalid tool arguments.',
          completedAt: new Date(),
        },
      );

      return {
        invocation: rejected,
        content: 'Tool rejected: invalid arguments.',
      };
    }

    const persistedArguments: Prisma.InputJsonValue = assistantTool.sensitive
      ? {}
      : argumentsValue;

    const invocation = await this.conversations.createToolInvocation({
      assistantRunId: runId,
      toolCallId: call.id,
      name: call.name,
      label: assistantTool.definition.label,
      arguments: persistedArguments,
      idempotencyKey,
    });

    if (assistantTool.requiresConfirmation) {
      const awaiting = await this.conversations.updateToolInvocation(
        invocation.id,
        {
          status: 'awaiting_confirmation',
          result: {
            objectType: 'category_confirmation',
            action: call.name,
            arguments: argumentsValue,
            label: assistantTool.definition.label,
          },
        },
      );

      return {
        invocation: awaiting,
        content: `${assistantTool.definition.label} is awaiting user approval.`,
      };
    }

    const staleBefore = new Date(Date.now() - TOOL_STALE_AFTER_MS);
    const claimed = await this.conversations.claimToolInvocation(
      invocation.id,
      staleBefore,
    );

    if (!claimed) {
      const content =
        invocation.status === 'completed'
          ? JSON.stringify(invocation.result)
          : invocation.status === 'failed'
            ? 'The tool failed to run.'
            : invocation.status === 'rejected'
              ? 'The tool was rejected and not run.'
              : 'This tool is currently being processed.';

      return { invocation, content };
    }

    try {
      const result = await assistantTool.execute({
        sourceMessageId: inputMessageId,
        userId,
        arguments: argumentsValue,
        idempotencyKey,
        context,
      });

      const persistedResult: Prisma.InputJsonValue = assistantTool.sensitive
        ? {
            objectType: 'secret',
            object: this.secretResultMetadata(result) as Prisma.InputJsonObject,
          }
        : result;

      const completed = await this.conversations.updateToolInvocation(
        invocation.id,
        {
          status: 'completed',
          result: persistedResult,
          completedAt: new Date(),
        },
      );

      return {
        invocation: completed,
        content: JSON.stringify(
          assistantTool.exposeTransientResult ? result : persistedResult,
        ),
      };
    } catch (error) {
      const failed = await this.conversations.updateToolInvocation(
        invocation.id,
        {
          status: 'failed',
          errorMessage:
            error instanceof Error ? error.message : 'Tool execution failed.',
          completedAt: new Date(),
        },
      );

      return { invocation: failed, content: toolErrorContent(error) };
    }
  }

  private secretResultMetadata(
    result: Prisma.InputJsonValue,
  ): Record<string, unknown> {
    if (!result || typeof result !== 'object' || Array.isArray(result))
      return {};
    const object = (result as Record<string, unknown>).object;
    if (!object || typeof object !== 'object' || Array.isArray(object))
      return {};
    const record = object as Record<string, unknown>;

    return {
      ...(typeof record.id === 'string' ? { id: record.id } : {}),
      ...(typeof record.label === 'string' ? { label: record.label } : {}),
    };
  }
}

export { toolErrorContent };
