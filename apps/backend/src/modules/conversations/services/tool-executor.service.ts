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
import type { ToolInvocation } from '../../../database/entities';

export type AssistantToolDefinition = {
  name: string;
  label: string;
  description: string;
  parameters: JSONSchema7;
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
  }): Promise<Prisma.InputJsonValue>;
  requiresConfirmation?: boolean;
  internal?: boolean;
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

@Injectable()
export class ToolExecutorService {
  private readonly toolsByName: Readonly<Record<string, AssistantTool>>;

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
  }

  activityLabel(toolName: string): string | null {
    return this.toolsByName[toolName]?.definition.label ?? null;
  }

  aiTools(
    userId: string,
    runId: string,
    inputMessageId: string,
    onExecution?: (result: ToolExecutionResult) => void,
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
            if (assistantTool.internal) {
              const result = await assistantTool.execute({
                userId,
                sourceMessageId: inputMessageId,
                arguments: assistantTool.parseArguments(input),
                idempotencyKey: `${inputMessageId}:${options.toolCallId}`,
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
          errorMessage: 'Dibatalkan oleh pengguna.',
          completedAt: new Date(),
        },
      );

      return {
        invocation: rejected,
        content: 'Perubahan kategori dibatalkan.',
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
            error instanceof Error ? error.message : 'Eksekusi alat gagal.',
          completedAt: new Date(),
        },
      );

      return { invocation: failed, content: 'Alat gagal dijalankan.' };
    }
  }

  async execute(
    userId: string,
    runId: string,
    inputMessageId: string,
    call: AssistantToolCall,
  ): Promise<ToolExecutionResult> {
    const assistantTool = this.toolsByName[call.name];
    const idempotencyKey = `${inputMessageId}:${call.id}`;

    if (!assistantTool) {
      const invocation = await this.conversations.createToolInvocation({
        assistantRunId: runId,
        toolCallId: call.id,
        name: call.name || 'unknown',
        label: call.name || 'Alat tidak dikenal',
        arguments: {},
        idempotencyKey,
      });

      const rejected = await this.conversations.updateToolInvocation(
        invocation.id,
        {
          status: 'rejected',
          errorMessage: 'Alat tidak diizinkan.',
          completedAt: new Date(),
        },
      );

      return {
        invocation: rejected,
        content: 'Alat ditolak: tidak diizinkan.',
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
            error instanceof Error
              ? error.message
              : 'Argumen alat tidak valid.',
          completedAt: new Date(),
        },
      );

      return {
        invocation: rejected,
        content: 'Alat ditolak: argumen tidak valid.',
      };
    }

    const invocation = await this.conversations.createToolInvocation({
      assistantRunId: runId,
      toolCallId: call.id,
      name: call.name,
      label: assistantTool.definition.label,
      arguments: argumentsValue,
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
        content: 'Perubahan kategori menunggu persetujuan pengguna.',
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
            ? 'Alat gagal dijalankan.'
            : invocation.status === 'rejected'
              ? 'Alat ditolak dan tidak dijalankan.'
              : 'Alat ini sedang diproses.';

      return { invocation, content };
    }

    try {
      const result = await assistantTool.execute({
        sourceMessageId: inputMessageId,
        userId,
        arguments: argumentsValue,
        idempotencyKey,
      });

      const completed = await this.conversations.updateToolInvocation(
        invocation.id,
        { status: 'completed', result, completedAt: new Date() },
      );

      return { invocation: completed, content: JSON.stringify(result) };
    } catch (error) {
      const failed = await this.conversations.updateToolInvocation(
        invocation.id,
        {
          status: 'failed',
          errorMessage:
            error instanceof Error ? error.message : 'Eksekusi alat gagal.',
          completedAt: new Date(),
        },
      );

      return { invocation: failed, content: 'Alat gagal dijalankan.' };
    }
  }
}
