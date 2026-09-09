import type { ModelMessage, ToolSet } from 'ai';

export type { ModelMessage, ToolSet } from 'ai';

export type GenerateRequest = {
  messages: ModelMessage[];
  userId?: string;
  conversationId?: string;
  runId?: string;
  tools?: ToolSet;
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
