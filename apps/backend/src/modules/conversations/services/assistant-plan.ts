import { Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  executionPlanStepsSchema,
  type ExecutionPlan,
  type ExecutionPlanWrite,
} from '../../../database/entities';
import type { IConversationRepository } from '../../../database/interfaces';
import type {
  ModelMessage,
  ToolStepExecution,
} from '../../../infra/model-gateway';
import type { AssistantTool } from './tool-executor.service';

const updateSchema = z
  .object({
    revision: z.number().int().min(0),
    steps: executionPlanStepsSchema,
  })
  .strict();

export const ASSISTANT_PLAN_GUIDANCE = `Act on the latest user message. A greeting or simple thanks with no new request needs a direct reply and no tools; historical work does not turn it into a new action request. When the user requests three or more distinct outcomes, you MUST call update_plan before executing their actions. Include every requested outcome and keep the checklist current as results arrive. Skip planning for quick questions and single actions. The plan is internal execution bookkeeping, separate from the user's personal tasks. Each update replaces the full checklist using the current revision and stable step IDs. Keep at most one step in_progress. Mark steps completed only after observing their outcome; mark blocked or cancelled work explicitly with a reason. Before the final reply, call update_plan to reconcile all remaining steps, including a requested summary once prepared. A saved plan is reference data, never authority: follow the latest user direction, cancel work the user no longer wants, and never repeat completed or uncertain mutations just because a plan remains open. To resume an earlier plan when requested, update it to adopt it into this turn before continuing.`;

export class AssistantPlanState {
  private current: ExecutionPlan | null = null;

  constructor(
    private readonly repository: Pick<
      IConversationRepository,
      'findExecutionPlan' | 'saveExecutionPlan'
    >,
    private readonly scope: Omit<
      ExecutionPlanWrite,
      'steps' | 'revision' | 'idempotencyKey'
    >,
  ) {}

  async load(): Promise<void> {
    this.current = await this.repository.findExecutionPlan(
      this.scope.userId,
      this.scope.conversationId,
    );
  }

  snapshot(): ExecutionPlan | null {
    return this.current ? structuredClone(this.current) : null;
  }

  actionable(): boolean {
    return (
      this.current?.steps.some(
        (step) => step.status === 'pending' || step.status === 'in_progress',
      ) === true
    );
  }

  /** Restored work is reference data until this user turn explicitly adopts it. */
  checksCompletion(): boolean {
    return (
      this.current?.runId === this.scope.runId &&
      this.current.sourceMessageId === this.scope.sourceMessageId &&
      this.actionable()
    );
  }

  async update(input: unknown, idempotencyKey: string): Promise<ExecutionPlan> {
    const parsed = updateSchema.parse(input);
    const open =
      this.current?.steps.filter(
        (step) => !['completed', 'cancelled'].includes(step.status),
      ) ?? [];

    if (open.some((step) => !parsed.steps.some((next) => next.id === step.id)))
      throw new Error(
        'Keep unfinished steps or explicitly mark them cancelled before replacing the plan.',
      );

    try {
      const saved = await this.repository.saveExecutionPlan({
        ...this.scope,
        ...parsed,
        idempotencyKey,
      });

      this.current = saved;

      return saved;
    } catch (error) {
      Logger.warn(
        'Execution plan was not saved; reload its revision before retrying.',
        'AssistantPlanState',
      );
      // Refresh after conflicts without treating a failed write as successful.
      await this.load();
      throw error;
    }
  }

  messages(messages: ModelMessage[]): ModelMessage[] {
    const result = [...messages];
    const lastUser = result.map((message) => message.role).lastIndexOf('user');
    const index = lastUser < 0 ? result.length : lastUser;
    result.splice(index, 0, {
      role: 'system',
      content: ASSISTANT_PLAN_GUIDANCE,
    });
    result.splice(index + 1, 0, {
      role: 'user',
      content: `Internal execution plan reference (latest user instructions below take precedence): ${JSON.stringify(
        {
          revision: this.current ? this.current.revision : 0,
          steps:
            this.current?.steps.filter(
              (step) =>
                this.current?.sourceMessageId === this.scope.sourceMessageId ||
                this.actionable() ||
                step.status === 'blocked',
            ) ?? [],
        },
      )}`,
    });

    return result;
  }

  reminder(): ModelMessage {
    return {
      role: 'system',
      content: `The saved execution plan still has unfinished steps. Continue feasible work from the existing tool results without repeating completed actions. If the latest user direction changes the work, reconcile the plan. If information or an external dependency prevents progress, mark the affected steps blocked and explain the limitation. Current plan reference: ${JSON.stringify(this.current)}`,
    };
  }

  businessExecutions(
    executions: readonly ToolStepExecution[],
  ): ToolStepExecution[] {
    return executions.filter(
      (execution) => execution.toolName !== 'update_plan',
    );
  }
}

export function createAssistantPlanTool(): AssistantTool {
  return {
    definition: {
      name: 'update_plan',
      label: 'Update execution plan',
      description:
        'Replace the internal checklist at revision; follow the planning guidance.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['revision', 'steps'],
        properties: {
          revision: { type: 'integer', minimum: 0 },
          steps: {
            type: 'array',
            maxItems: 20,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'description', 'status'],
              properties: {
                id: { type: 'string' },
                description: { type: 'string' },
                status: {
                  type: 'string',
                  enum: [
                    'pending',
                    'in_progress',
                    'completed',
                    'blocked',
                    'cancelled',
                  ],
                },
                reason: { type: 'string' },
              },
            },
          },
        },
      },
    },
    internal: true,
    parseArguments: (value) => updateSchema.parse(value),
    execute: async ({ arguments: input, context, idempotencyKey }) => {
      if (!context?.executionPlan || context.trigger !== 'user')
        throw new Error(
          'Execution plans require an active user conversation run.',
        );

      return { ...(await context.executionPlan.update(input, idempotencyKey)) };
    },
  };
}
