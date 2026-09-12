import type { ModelMessage, ToolSet } from 'ai';

export type { ModelMessage, ToolSet } from 'ai';

/**
 * Per-step overrides applied by the model gateway before every tool-loop step.
 * `stepNumber` is zero-based; step 0 carries the full tool set so the first
 * pass can classify intent, and later steps narrow to the tools that already
 * ran. `executedToolNames` accumulates the tools chosen in previous steps.
 */
export type GenerationStepRequest = {
  stepNumber: number;
  toolNames: string[];
  executedToolNames: string[];
};

export type PrepareGenerationStep = (
  request: GenerationStepRequest,
) => string[] | undefined;

export type GenerateRequest = {
  messages: ModelMessage[];
  userId?: string;
  conversationId?: string;
  runId?: string;
  tools?: ToolSet;
  /**
   * Narrows the advertised tool set for a given tool-loop step. Returning
   * `undefined` keeps the full tool set for that step.
   */
  prepareStep?: PrepareGenerationStep;
  temperature?: number;
  maxOutputTokens?: number;
  maxSteps?: number;
  abortSignal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onToolCall?: (toolName: string) => void;
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
