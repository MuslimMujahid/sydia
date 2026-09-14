import type { ModelMessage, ToolSet } from 'ai';

export type { ModelMessage, ToolSet } from 'ai';

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
