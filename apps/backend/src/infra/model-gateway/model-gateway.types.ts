import type { ModelMessage, ToolSet } from 'ai';

export type { ModelMessage, ToolSet } from 'ai';

/**
 * One successful tool execution of a completed model step, in call order.
 * `arguments` is the raw model input as the model sent it, including loop
 * orchestration metadata (which the domain layer strips before any tool or
 * stored invocation sees it), and `result` is the tool output, parsed when it
 * arrived as JSON.
 */
export type ToolStepExecution = {
  toolCallId: string;
  toolName: string;
  arguments: unknown;
  result: unknown;
};

/**
 * Resolves a deterministic acknowledgement for a completed step, or `null`
 * when the step must continue through the model.
 *
 * `executions` is every successful call made so far this turn, in call order,
 * so a confirmation can never omit work an earlier step already did.
 * `decidedBy` is the final step's calls: only they decide whether the turn may
 * end, because an earlier call that correctly asked for a follow-up (or a
 * read-only call) must not veto an acknowledgement for the step that finished
 * the request. The domain layer implements this, so the gateway never has to
 * know which tools fully answer the user or how their results are phrased.
 */
export type ToolStepAcknowledger = (
  executions: readonly ToolStepExecution[],
  decidedBy: readonly ToolStepExecution[],
) => string | null;

export type GenerateRequest = {
  messages: ModelMessage[];
  userId?: string;
  conversationId?: string;
  runId?: string;
  tools?: ToolSet;
  /**
   * Names of tools that may safely run again if a generation is retried. A
   * retry re-enters the whole tool loop, so it is only attempted once every
   * tool that already executed is listed here; mutating tools are omitted.
   */
  retrySafeTools?: ReadonlySet<string>;
  temperature?: number;
  maxOutputTokens?: number;
  maxSteps?: number;
  abortSignal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onToolCall?: (toolName: string) => void;
  /**
   * Called for each completed step whose every call produced a result, with
   * every successful call of the turn so far and the calls of the step that
   * just finished. Return the deterministic reply for that step to end the turn
   * without another model call; return `null` to continue the normal multi-step
   * loop. Omit it and generation behaves exactly as before.
   */
  acknowledgeTerminalStep?: ToolStepAcknowledger;
};

export type GenerateResult = {
  text: string;
  usage: { inputTokens?: number; outputTokens?: number; costUsd?: number };
};

export interface LanguageModelGateway {
  readonly provider: 'openrouter';
  readonly model: string;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}

export const LANGUAGE_MODEL = Symbol('LanguageModelGateway');
