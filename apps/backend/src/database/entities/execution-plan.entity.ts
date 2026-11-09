import { z } from 'zod';
import type { AssistantPlanRevision } from '../../generated/prisma/client';

export const executionPlanStepsSchema = z
  .array(
    z
      .object({
        id: z.string().trim().min(1).max(64),
        description: z.string().trim().min(1).max(240),
        status: z.enum([
          'pending',
          'in_progress',
          'completed',
          'blocked',
          'cancelled',
        ]),
        reason: z.string().trim().min(1).max(240).optional(),
      })
      .strict(),
  )
  .max(20)
  .superRefine((steps, context) => {
    if (new Set(steps.map((step) => step.id)).size !== steps.length)
      context.addIssue({ code: 'custom', message: 'Step IDs must be unique.' });
    if (steps.filter((step) => step.status === 'in_progress').length > 1)
      context.addIssue({
        code: 'custom',
        message: 'Only one step may be in_progress.',
      });
    if (
      steps.some(
        (step) =>
          ['blocked', 'cancelled'].includes(step.status) && !step.reason,
      )
    )
      context.addIssue({
        code: 'custom',
        message: 'Blocked and cancelled steps require a reason.',
      });
  });

export type ExecutionPlanStep = z.infer<
  typeof executionPlanStepsSchema
>[number];
export type ExecutionPlan = Pick<
  AssistantPlanRevision,
  'conversationId' | 'runId' | 'sourceMessageId' | 'revision'
> & { steps: ExecutionPlanStep[] };

export type ExecutionPlanWrite = ExecutionPlan & {
  userId: string;
  claimStartedAt: Date;
  idempotencyKey: string;
};
