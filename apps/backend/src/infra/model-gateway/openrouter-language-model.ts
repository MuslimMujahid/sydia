import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  generateText,
  NoOutputGeneratedError,
  stepCountIs,
  streamText,
} from 'ai';
import type { LanguageModel as AiLanguageModel } from 'ai';
import { ObservabilityService, type GenerationTracer } from '../observability';
import type {
  GenerateRequest,
  GenerateResult,
  LanguageModelGateway,
} from './model-gateway.types';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'z-ai/glm-5.3-flash';
const REQUEST_TIMEOUT_MS = 180_000;

export class ModelGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelGatewayError';
  }
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function openRouterCost(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const openrouter = (metadata as Record<string, unknown>).openrouter;
  if (!openrouter || typeof openrouter !== 'object') return undefined;

  const usage = (openrouter as Record<string, unknown>).usage;
  if (!usage || typeof usage !== 'object') return undefined;

  return tokenCount((usage as Record<string, unknown>).cost);
}

function errorObject(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error('Unknown model error.', { cause: value });
}

@Injectable()
export class OpenRouterLanguageModel implements LanguageModelGateway {
  readonly provider = 'openrouter' as const;
  readonly model: string;

  private readonly apiKey?: string;
  private readonly languageModel: AiLanguageModel;
  private readonly logger = new Logger(OpenRouterLanguageModel.name);

  constructor(
    config: ConfigService,
    @Inject(ObservabilityService)
    private readonly observability: GenerationTracer = ObservabilityService.disabled(),
  ) {
    this.apiKey =
      config.get<string>('BACKEND_MODEL_API_KEY')?.trim() || undefined;
    this.model =
      config.get<string>('BACKEND_MODEL_NAME')?.trim() || DEFAULT_MODEL;

    const baseURL =
      config.get<string>('BACKEND_MODEL_BASE_URL')?.trim() || DEFAULT_BASE_URL;

    const openrouter = createOpenRouter({
      apiKey: this.apiKey,
      baseURL,
      compatibility: 'strict',
    });

    this.languageModel = openrouter.chat(this.model, {
      usage: { include: true },
    });
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    if (!this.apiKey) {
      throw new ModelGatewayError(
        'Model assistant belum dikonfigurasi. Tetapkan BACKEND_MODEL_API_KEY.',
      );
    }

    const options = () => ({
      model: this.languageModel,
      messages: request.messages,
      allowSystemInMessages: true as const,
      tools: request.tools,
      stopWhen: stepCountIs(15),
      timeout: REQUEST_TIMEOUT_MS,
      abortSignal:
        typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
          : undefined,
      maxRetries: 0,
    });

    const streaming = Boolean(request.onTextDelta || request.onToolCall);
    let lastToolCallCount = 0;

    const runAttempt = async (attempt: number): Promise<GenerateResult> => {
      let toolCallCount = 0;
      lastToolCallCount = 0;

      return this.observability
        .traceGeneration(
          {
            provider: this.provider,
            model: this.model,
            messages: request.messages,
            userId: request.userId,
            conversationId: request.conversationId,
            runId: request.runId,
            attempt,
          },
          async (trace) => {
            if (streaming) {
              let streamError: unknown;
              const result = streamText({
                ...options(),
                onChunk: ({ chunk }) => {
                  if (chunk.type === 'tool-call') {
                    toolCallCount += 1;
                    lastToolCallCount = toolCallCount;
                    request.onToolCall?.(chunk.toolName);
                  }
                },
                onError: ({ error }) => {
                  streamError = error;
                },
              });

              const [text, usage, providerMetadata] = await Promise.all([
                result.text,
                result.usage,
                result.providerMetadata,
              ]);

              if (streamError) throw errorObject(streamError);

              const finalText = text.trim();
              if (finalText) request.onTextDelta?.(finalText);
              const normalizedUsage = {
                inputTokens: tokenCount(usage.inputTokens),
                outputTokens: tokenCount(usage.outputTokens),
                costUsd: openRouterCost(providerMetadata),
              };

              trace.update({
                output: finalText,
                inputTokens: normalizedUsage.inputTokens,
                outputTokens: normalizedUsage.outputTokens,
                costUsd: normalizedUsage.costUsd,
              });

              if (attempt === 2) {
                this.logger.log(
                  JSON.stringify({
                    event: 'assistant_generation_retry_succeeded',
                    conversationId: request.conversationId ?? null,
                    runId: request.runId ?? null,
                    attempt,
                  }),
                );
              }

              return { text: finalText, usage: normalizedUsage };
            }

            const result = await generateText(options());
            const finalText = result.text.trim();
            const normalizedUsage = {
              inputTokens: tokenCount(result.usage.inputTokens),
              outputTokens: tokenCount(result.usage.outputTokens),
              costUsd: openRouterCost(result.providerMetadata),
            };

            trace.update({
              output: finalText,
              inputTokens: normalizedUsage.inputTokens,
              outputTokens: normalizedUsage.outputTokens,
              costUsd: normalizedUsage.costUsd,
            });

            return { text: finalText, usage: normalizedUsage };
          },
        )
        .catch((error: unknown) => {
          this.logger.warn(
            JSON.stringify({
              event: 'assistant_generation_failed',
              conversationId: request.conversationId ?? null,
              runId: request.runId ?? null,
              attempt,
              errorName: error instanceof Error ? error.name : 'UnknownError',
              toolCallCount,
              retry:
                attempt === 1 &&
                NoOutputGeneratedError.isInstance(error) &&
                (streaming ? toolCallCount === 0 : request.tools === undefined),
            }),
          );
          throw error;
        });
    };

    try {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          return await runAttempt(attempt);
        } catch (error) {
          const canRetry =
            attempt === 1 &&
            NoOutputGeneratedError.isInstance(error) &&
            (streaming ? lastToolCallCount === 0 : request.tools === undefined);

          if (!canRetry) throw error;
        }
      }

      throw new NoOutputGeneratedError();
    } catch (error) {
      if (error instanceof ModelGatewayError) throw error;

      const errorName = error instanceof Error ? error.name : 'UnknownError';
      const statusCode =
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        typeof error.statusCode === 'number'
          ? error.statusCode
          : undefined;

      this.logger.error(
        `OpenRouter request failed (${errorName}${statusCode === undefined ? '' : `, status ${statusCode}`})`,
      );
      throw new ModelGatewayError('Model assistant tidak dapat dihubungi.');
    }
  }
}
