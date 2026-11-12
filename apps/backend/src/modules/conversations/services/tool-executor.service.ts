import type { AssistantPlanState } from './assistant-plan';
import { ApiException } from '../../../shared/errors';
import { Inject, Injectable, Logger } from '@nestjs/common';
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
import type { NoteWork } from '../../../database/entities';
import { advertisedInputSchema } from './advertised-tool-schema';
import { ToolLoopGuard } from './tool-loop-guard';
import { AmbiguousReferenceError } from './tool-references';

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
  executionPlan?: AssistantPlanState;
  sourceDocumentIds?: string[];
  sourceNoteRefs?: string[];
  channel?: MessageProvider;
  sendFile?: (file: AssistantFile) => Promise<{ providerMessageId: string }>;
  conversationId?: string;
  runId?: string;
  /** Background evaluations are not user instructions and cannot authorize mutations. */
  trigger?: 'user' | 'background';
  /** Evaluation clock for background runs (controlled in QA harnesses). */
  now?: Date;
  skills?: AssistantSkillState;
  /** Shared across all calls and SDK steps in a bounded agent run. */
  toolBudget?: { remaining: number; exceeded?: boolean };
  /** Unresolved failed note mutations in a bounded background run. */
  noteMutationFailures?: Set<string>;
  /** Authenticated durable source supplied by the note recovery coordinator. */
  noteSourceWork?: NoteWork;
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

function toolErrorMessage(error: unknown): string {
  let message =
    error instanceof Error && error.message.trim()
      ? error.message
      : 'Tool execution failed.';

  if (error instanceof ApiException) {
    const response = error.getResponse();
    if (
      typeof response === 'object' &&
      response &&
      'error' in response &&
      response.error &&
      typeof response.error === 'object' &&
      'message' in response.error &&
      typeof response.error.message === 'string'
    )
      message = response.error.message;
  }

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

  return sanitized;
}

function toolErrorContent(error: unknown): string {
  // Candidates are the point of this error, so they bypass the message cap.
  if (error instanceof AmbiguousReferenceError)
    return JSON.stringify({
      error: 'ambiguous_reference',
      message: error.message.replace(/[\p{Cc}]/gu, ' '),
      candidates: error.candidates.map((candidate) => ({
        ...candidate,
        title: candidate.title.replace(/[\p{Cc}]/gu, ' '),
      })),
      ...(error.omitted ? { omitted: error.omitted } : {}),
    });

  return JSON.stringify({
    error: 'tool_failed',
    message: toolErrorMessage(error),
  });
}

type ToolFailureDetails = {
  error: 'tool_failed';
  message: string;
  code?: string;
  statusCode?: number;
  reason?: string;
};

/** Persist only bounded messages and named diagnostic fields, never raw payloads. */
function toolFailureDetails(
  error: unknown,
  sensitive = false,
): ToolFailureDetails {
  const details: ToolFailureDetails = {
    error: 'tool_failed',
    message: sensitive
      ? 'Sensitive tool failed; error details were redacted.'
      : toolErrorMessage(error),
  };

  if (error instanceof ApiException) {
    details.code = error.code;
    details.statusCode = error.getStatus();
    // ApiException owns this envelope; arbitrary details may include source data.
    const response = error.getResponse() as {
      error: { details: Record<string, unknown> };
    };

    const reason = response.error.details.reason;
    if (!sensitive && typeof reason === 'string')
      details.reason = reason
        .replace(/[\p{Cc}]/gu, ' ')
        .trim()
        .slice(0, 80);
  }

  return details;
}

type LocalizedToolLabel = Record<SupportedLocale, string>;

/**
 * User-facing activity labels are kept separate from tool definitions so the
 * descriptions and canonical labels sent to the model remain English.
 */
const TOOL_ACTIVITY_LABELS: Readonly<Record<string, LocalizedToolLabel>> = {
  update_plan: { en: 'Update execution plan', id: 'Memperbarui rencana kerja' },
  get_record_note_metadata: {
    en: 'View table structure',
    id: 'Melihat struktur tabel',
  },
  read_record_note_content: {
    en: 'Read table rows',
    id: 'Membaca baris tabel',
  },
  create_record_note: { en: 'Create record note', id: 'Membuat catatan tabel' },
  change_record_schema: {
    en: 'Change table columns',
    id: 'Mengubah kolom tabel',
  },
  add_record_rows: { en: 'Add table rows', id: 'Menambah baris tabel' },
  update_record_rows: { en: 'Edit table rows', id: 'Mengubah baris tabel' },
  delete_record_rows: { en: 'Delete table rows', id: 'Menghapus baris tabel' },
  query_record_notes: {
    en: 'Analyze saved records',
    id: 'Menganalisis catatan tersimpan',
  },
  export_record_note_csv: { en: 'Export table CSV', id: 'Mengunduh CSV tabel' },
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
    const loopGuard = new ToolLoopGuard();

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
            inputSchema: jsonSchema(advertisedInputSchema(definition)),
            execute: async (
              input: unknown,
              options: ToolExecutionOptions<Record<string, unknown>>,
            ) => {
              if (toolsReady) await toolsReady;
              if (abortSignal?.aborted) throw abortSignal.reason;

              if (
                context?.skills?.allowedTools &&
                !context.skills.allowedTools.has(definition.name)
              ) {
                Logger.warn(
                  'Rejected tool outside the bounded agent authority.',
                  'ToolExecutorService',
                );
                throw new Error('Tool is outside this agent run authority.');
              }

              if (context?.toolBudget) {
                if (context.toolBudget.remaining <= 0) {
                  context.toolBudget.exceeded = true;
                  Logger.warn(
                    'Bounded agent exhausted its tool-call budget.',
                    'ToolExecutorService',
                  );
                  throw new Error(
                    'Agent tool-call budget exhausted; unfinished work must remain pending.',
                  );
                }

                context.toolBudget.remaining -= 1;
              }

              if (assistantTool.internal || context?.trigger === 'background') {
                const tracksFailure =
                  context?.noteMutationFailures &&
                  assistantTool.readOnly !== true;

                const operation =
                  input &&
                  typeof input === 'object' &&
                  !Array.isArray(input) &&
                  'operationId' in input &&
                  typeof input.operationId === 'string'
                    ? input.operationId
                    : options.toolCallId;

                const failureKey = `${definition.name}:${operation}`;

                try {
                  const result = await assistantTool.execute({
                    userId,
                    sourceMessageId: inputMessageId,
                    arguments: assistantTool.parseArguments(
                      stripCompleteTurn(input),
                    ),
                    idempotencyKey: `${inputMessageId}:${options.toolCallId}`,
                    context,
                  });

                  if (tracksFailure)
                    context.noteMutationFailures!.delete(failureKey);

                  return JSON.stringify(result);
                } catch (error) {
                  if (tracksFailure)
                    context.noteMutationFailures!.add(failureKey);
                  Logger.warn(
                    `${context?.trigger === 'background' ? 'Background' : 'Internal'} tool ${definition.name} failed; unfinished work must remain recoverable.`,
                    'ToolExecutorService',
                  );
                  throw new Error(toolErrorContent(error), { cause: error });
                }
              }

              const call = {
                id: options.toolCallId,
                name: definition.name,
                arguments: input,
              };

              const loopArguments = stripCompleteTurn(input);
              const refusal = loopGuard.refusal(definition.name, loopArguments);

              if (refusal) {
                Logger.warn(
                  `Refused ${definition.name}: it kept failing the same way in this turn.`,
                  'ToolExecutorService',
                );
                const refused = await this.reject(
                  runId,
                  inputMessageId,
                  call,
                  definition.label,
                  'Refused after repeated identical failures.',
                  refusal,
                );

                onExecution?.(refused);

                return refused.content;
              }

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

              if (!existingSearch) {
                loopGuard.record(
                  definition.name,
                  loopArguments,
                  ['failed', 'rejected'].includes(result.invocation.status)
                    ? result.content
                    : null,
                );
                onExecution?.(result);
              }

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

    if (!assistantTool)
      return this.reject(
        runId,
        inputMessageId,
        call,
        call.name || 'Unknown tool',
        'Tool not allowed.',
        'Tool rejected: not allowed.',
      );

    let argumentsValue: Prisma.InputJsonValue;

    try {
      argumentsValue = assistantTool.parseArguments(
        stripCompleteTurn(call.arguments),
      );
    } catch (error) {
      const details = toolFailureDetails(error, assistantTool.sensitive);

      return this.reject(
        runId,
        inputMessageId,
        call,
        assistantTool.definition.label,
        details.message,
        'Tool rejected: invalid arguments.',
        details,
      );
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
        ? {
            ...context,
            sourceDocumentIds: scope.documentIds,
            sourceNoteRefs: [
              ...scope.noteRefs,
              ...(scope.activeNoteRef ? [scope.activeNoteRef] : []),
            ],
          }
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
      const details = toolFailureDetails(error, assistantTool.sensitive);
      Logger.warn(
        JSON.stringify({
          event: 'assistant_tool_failed',
          runId,
          invocationId: invocation.id,
          toolName: call.name,
          code: details.code ?? null,
          statusCode: details.statusCode ?? null,
        }),
        'ToolExecutorService',
      );
      const failed = await this.conversations.updateToolInvocation(
        invocation.id,
        {
          status: 'failed',
          errorMessage: details.message,
          result: details,
          completedAt: new Date(),
        },
      );

      return {
        invocation: failed,
        content: assistantTool.sensitive
          ? JSON.stringify(details)
          : toolErrorContent(error),
      };
    }
  }

  /** Records a call that was never run, with the reason the model sees. */
  private async reject(
    runId: string,
    inputMessageId: string,
    call: AssistantToolCall,
    label: string,
    errorMessage: string,
    content: string,
    details?: ToolFailureDetails,
  ): Promise<ToolExecutionResult> {
    Logger.warn(
      JSON.stringify({
        event: 'assistant_tool_rejected',
        runId,
        toolCallId: call.id,
        toolName: call.name,
        code: details?.code ?? null,
        statusCode: details?.statusCode ?? null,
      }),
      'ToolExecutorService',
    );
    const invocation = await this.conversations.createToolInvocation({
      assistantRunId: runId,
      toolCallId: call.id,
      name: call.name || 'unknown',
      label,
      arguments: {},
      idempotencyKey: `${inputMessageId}:${call.id}`,
    });

    const rejected = await this.conversations.updateToolInvocation(
      invocation.id,
      {
        status: 'rejected',
        errorMessage,
        ...(details ? { result: details } : {}),
        completedAt: new Date(),
      },
    );

    return { invocation: rejected, content };
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
