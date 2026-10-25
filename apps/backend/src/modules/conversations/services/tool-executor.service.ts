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
import { terminalToolInputSchema } from './terminal-tool-response';

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

/** Turn-scoped skill state: loaded guidance and the tools it unlocked. */
export type AssistantSkillState = {
  loaded: Map<string, string>;
  activeTools: Set<string>;
  /** Hard upper bound on tools (background runs); undefined means all registered. */
  allowedTools?: ReadonlySet<string>;
  loads: number;
  /** Memory/source ids actually retrieved this turn; constraints must cite them. */
  evidence: Set<string>;
};

export type AssistantToolExecutionContext = {
  sourceDocumentIds?: string[];
  channel?: MessageProvider;
  sendFile?: (file: AssistantFile) => Promise<{ providerMessageId: string }>;
  conversationId?: string;
  runId?: string;
  /** Background evaluations are not user instructions and cannot authorize mutations. */
  trigger?: 'user' | 'background';
  /** Evaluation clock for background runs (controlled in QA harnesses). */
  now?: Date;
  skills?: AssistantSkillState;
};

export type AssistantTool = {
  definition: AssistantToolDefinition;
  parseArguments(value: unknown): Prisma.InputJsonValue;
  execute(input: {
    userId: string;
    sourceMessageId: string;
    arguments: Prisma.InputJsonValue;
    idempotencyKey: string;
    context?: AssistantToolExecutionContext;
  }): Promise<Prisma.InputJsonValue>;
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
 * `completeTurn` is orchestration metadata for the loop, not tool input: the
 * model-facing schema advertises it and the model gateway reads it from the
 * step's tool call, but no domain tool or stored invocation may see it. The
 * SDK hands `execute` the same input object it keeps on the completed step, so
 * this copies rather than mutates — deleting the flag in place would erase the
 * only record the gateway has in the non-streaming path.
 */
function stripCompleteTurn(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (!('completeTurn' in value)) return value;

  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'completeTurn'),
  );
}

/** Prisma renders a code frame: a source path, then numbered source lines. */
const PRISMA_CODE_FRAME_LINE =
  /^\s*(?:→\s*)?(?:\d+\s+\S|\S*\.(?:ts|js|mjs|cjs|prisma):\d+(?::\d+)?\s*$)/;

function toolErrorContent(error: unknown): string {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : 'Tool execution failed.';

  // Prisma's gutter and source path are noise that crowd the actual cause out
  // of the truncation window; drop them so the model still sees the reason.
  const readable = message.includes('invocation in')
    ? message
        .split('\n')
        .filter((line) => !PRISMA_CODE_FRAME_LINE.test(line))
        .join(' ')
    : message;

  const sanitized = readable
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
  list_reminders: { en: 'Find reminders', id: 'Mencari pengingat' },
  save_memory: { en: 'Save memory', id: 'Menyimpan memori' },
  update_memory: { en: 'Update memory', id: 'Memperbarui memori' },
  forget_memory: { en: 'Forget memory', id: 'Menghapus memori' },
  search_memories: { en: 'Search memories', id: 'Mencari memori' },
  write_daily_note: { en: 'Write daily note', id: 'Menulis catatan harian' },
  list_notes_workspace: {
    en: 'Browse notes and folders',
    id: 'Melihat catatan dan folder',
  },
  read_custom_note: { en: 'Read custom note', id: 'Membaca catatan' },
  search_notes: { en: 'Search notes', id: 'Mencari catatan' },
  create_custom_note: { en: 'Create custom note', id: 'Membuat catatan' },
  update_custom_note: { en: 'Edit custom note', id: 'Mengubah catatan' },
  manage_notes_item: {
    en: 'Organize notes and folders',
    id: 'Mengatur catatan dan folder',
  },
  read_daily_note: { en: 'Read daily note', id: 'Membaca catatan harian' },
  search_daily_notes: {
    en: 'Search daily notes',
    id: 'Mencari catatan harian',
  },
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
  list_contacts: { en: 'Find contacts', id: 'Mencari kontak' },
  list_contact_groups: {
    en: 'View contact groups',
    id: 'Melihat grup kontak',
  },
  create_contact_group: {
    en: 'Create contact group',
    id: 'Membuat grup kontak',
  },
  update_contact_group: {
    en: 'Update contact group',
    id: 'Memperbarui grup kontak',
  },
  delete_contact_group: {
    en: 'Delete contact group',
    id: 'Menghapus grup kontak',
  },
  assign_contact_groups: {
    en: 'Update contact groups',
    id: 'Memperbarui grup kontak',
  },
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

  aiTools(
    userId: string,
    runId: string,
    inputMessageId: string,
    onExecution?: (result: ToolExecutionResult) => void,
    toolsReady?: Promise<void>,
    abortSignal?: AbortSignal,
    context?: AssistantToolExecutionContext,
    selectedToolNames?: readonly string[],
  ): ToolSet {
    const documentSearches = new Map<string, Promise<ToolExecutionResult>>();

    return Object.fromEntries(
      Object.values(this.toolsByName)
        .filter(
          ({ definition }) =>
            selectedToolNames === undefined ||
            selectedToolNames.includes(definition.name),
        )
        .map((assistantTool) => {
          const { definition } = assistantTool;
          const wrapped = tool({
            description: definition.description,
            inputSchema: jsonSchema(terminalToolInputSchema(definition)),
            execute: async (
              input: unknown,
              options: ToolExecutionOptions<Record<string, unknown>>,
            ) => {
              if (toolsReady) await toolsReady;
              if (abortSignal?.aborted) throw abortSignal.reason;

              if (assistantTool.internal || context?.trigger === 'background') {
                const result = await assistantTool.execute({
                  userId,
                  sourceMessageId: inputMessageId,
                  arguments: assistantTool.parseArguments(
                    stripCompleteTurn(input),
                  ),
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
      argumentsValue = assistantTool.parseArguments(
        stripCompleteTurn(call.arguments),
      );
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
      const scope = this.conversations.findSourceScope
        ? await this.conversations.findSourceScope(userId, inputMessageId)
        : null;

      const scopedContext = scope
        ? { ...context, sourceDocumentIds: scope.documentIds }
        : context;

      if (scope && call.name === 'read_document') {
        const input = argumentsValue as Record<string, unknown>;
        if (!scope.documentIds.includes(String(input.documentId)))
          throw new Error('Read a file from the selected sources.');
      }

      if (
        scope &&
        (call.name === 'read_custom_note' || call.name === 'read_daily_note')
      ) {
        const input = argumentsValue as Record<string, unknown>;
        const ref =
          call.name === 'read_custom_note'
            ? `custom:${String(input.id)}`
            : `daily:${String(input.date)}`;

        if (!scope.noteRefs.includes(ref) && scope.activeNoteRef !== ref)
          throw new Error('Read a note from the selected sources.');
      }

      const result = await assistantTool.execute({
        sourceMessageId: inputMessageId,
        userId,
        arguments: argumentsValue,
        idempotencyKey,
        context: scopedContext,
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
