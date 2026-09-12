import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  APICallError,
  generateText,
  NoOutputGeneratedError,
  stepCountIs,
  streamText,
} from 'ai';
import type { LanguageModel as AiLanguageModel } from 'ai';
import {
  ObservabilityService,
  type GenerationTraceUpdate,
  type GenerationTracer,
} from '../observability';
import type {
  GenerateRequest,
  GenerateResult,
  LanguageModelGateway,
} from './model-gateway.types';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'qwen/qwen3.8-flash';
const REQUEST_TIMEOUT_MS = 180_000;
const MAX_RETRY_AFTER_MS = 2_000;
const MAX_PROVIDER_MESSAGE = 2_000;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_OUTPUT_TOKENS = 1200;
const DEFAULT_MAX_STEPS = 8;
const DEFAULT_PROVIDER_SORT = 'latency';
const DEFAULT_REASONING_EFFORT = 'none';
const SESSION_ID_HEADER = 'x-session-id';

const PROVIDER_SORTS = ['latency', 'throughput', 'price'] as const;
const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'] as const;

type ProviderSort = (typeof PROVIDER_SORTS)[number];
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

function parseProviderSort(value: unknown): ProviderSort | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();

  return (PROVIDER_SORTS as readonly string[]).includes(normalized)
    ? (normalized as ProviderSort)
    : undefined;
}

function parseReasoningEffort(value: unknown): ReasoningEffort | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();

  return (REASONING_EFFORTS as readonly string[]).includes(normalized)
    ? (normalized as ReasoningEffort)
    : undefined;
}

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

/**
 * Prompt-cache read/write counters reported by OpenRouter. Cache reads are the
 * signal that the assembled context is being reused across turns; they collapse
 * to zero the moment any request mutates the stable prompt prefix.
 */
type CacheUsage = { cacheReadTokens?: number; cacheWriteTokens?: number };

function cacheUsage(value: unknown): CacheUsage {
  if (!value || typeof value !== 'object') return {};
  const details = (value as Record<string, unknown>).inputTokenDetails;
  if (!details || typeof details !== 'object') return {};

  const record = details as Record<string, unknown>;

  return {
    cacheReadTokens: tokenCount(record.cacheReadTokens),
    cacheWriteTokens: tokenCount(record.cacheWriteTokens),
  };
}

function errorObject(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error('Unknown model error.', { cause: value });
}

function boundedText(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value
    .replace(/[\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.length === 0 ? undefined : normalized.slice(0, limit);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object') return undefined;

  return value as Record<string, unknown>;
}

function parsedResponseBody(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function providerErrorFields(error: APICallError): {
  providerErrorType?: string;
  providerMessage?: string;
} {
  const response = asRecord(parsedResponseBody(error.responseBody));
  const data = asRecord(error.data);
  const responseError = asRecord(response?.error);
  const dataError = asRecord(data?.error);
  const source = responseError ?? dataError ?? response ?? data;

  return {
    providerErrorType: boundedText(
      source?.error_type ?? response?.error_type ?? data?.error_type,
      120,
    ),
    providerMessage: boundedText(
      source?.message ?? response?.message ?? data?.message,
      MAX_PROVIDER_MESSAGE,
    ),
  };
}

function traceError(error: unknown): GenerationTraceUpdate['error'] {
  if (!APICallError.isInstance(error)) {
    return { name: error instanceof Error ? error.name : 'UnknownError' };
  }

  return {
    name: error.name,
    ...(typeof error.statusCode === 'number' &&
    Number.isFinite(error.statusCode)
      ? { statusCode: error.statusCode }
      : {}),
    ...(typeof error.isRetryable === 'boolean'
      ? { retryable: error.isRetryable }
      : {}),
    ...providerErrorFields(error),
  };
}

function retryAfterMs(error: unknown): number {
  if (!APICallError.isInstance(error) || !error.responseHeaders) return 0;
  const headers = error.responseHeaders;
  const value =
    typeof Headers !== 'undefined' && headers instanceof Headers
      ? headers.get('retry-after')
      : (headers['retry-after'] ?? headers['Retry-After']);

  if (!value || !/^\d+$/.test(value.trim())) return 0;
  const seconds = Number(value.trim());

  return Number.isSafeInteger(seconds)
    ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
    : 0;
}

function retryableApiError(error: unknown): boolean {
  return APICallError.isInstance(error) && error.isRetryable === true;
}

@Injectable()
export class OpenRouterLanguageModel implements LanguageModelGateway {
  readonly provider = 'openrouter' as const;
  readonly model: string;

  private readonly apiKey?: string;
  private readonly languageModel: AiLanguageModel;
  private readonly logger = new Logger(OpenRouterLanguageModel.name);
  private readonly temperature: number;
  private readonly maxOutputTokens: number;
  private readonly maxSteps: number;
  private readonly providerSort: ProviderSort;
  private readonly reasoningEffort: ReasoningEffort;

  constructor(
    config: ConfigService,
    @Inject(ObservabilityService)
    private readonly observability: GenerationTracer = ObservabilityService.disabled(),
  ) {
    this.apiKey =
      config.get<string>('BACKEND_MODEL_API_KEY')?.trim() || undefined;
    this.model =
      config.get<string>('BACKEND_MODEL_NAME')?.trim() || DEFAULT_MODEL;
    this.temperature = DEFAULT_TEMPERATURE;
    this.maxOutputTokens = config.get<number>(
      'BACKEND_MODEL_MAX_OUTPUT_TOKENS',
      DEFAULT_MAX_OUTPUT_TOKENS,
    );
    this.maxSteps = config.get<number>(
      'BACKEND_MODEL_MAX_STEPS',
      DEFAULT_MAX_STEPS,
    );
    // OpenRouter's default routing load-balances on price, which lands requests
    // on cheap shared-pool endpoints and produces multi-second tails. Sorting
    // by measured latency trades a little cost for predictable first-token
    // latency; throughput and price remain available for deliberate tuning.
    this.providerSort =
      parseProviderSort(config.get('BACKEND_MODEL_PROVIDER_SORT')) ??
      DEFAULT_PROVIDER_SORT;
    // Reasoning tokens are billed and generated before the first visible text,
    // and they count against BACKEND_MODEL_MAX_OUTPUT_TOKENS. 'none' keeps the
    // configured budget available for the actual answer.
    this.reasoningEffort =
      parseReasoningEffort(config.get('BACKEND_MODEL_REASONING_EFFORT')) ??
      DEFAULT_REASONING_EFFORT;

    const baseURL =
      config.get<string>('BACKEND_MODEL_BASE_URL')?.trim() || DEFAULT_BASE_URL;

    const openrouter = createOpenRouter({
      apiKey: this.apiKey,
      baseURL,
      compatibility: 'strict',
    });

    this.languageModel = openrouter.chat(this.model, {
      usage: { include: true },
      provider: { sort: this.providerSort },
      reasoning: { enabled: true, exclude: true, effort: this.reasoningEffort },
    });
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    if (!this.apiKey) {
      throw new ModelGatewayError(
        'The assistant model is not configured. Set BACKEND_MODEL_API_KEY.',
      );
    }

    const headers = request.conversationId
      ? { [SESSION_ID_HEADER]: request.conversationId }
      : undefined;

    const prepareStep = request.prepareStep
      ? ({
          stepNumber,
          steps,
        }: {
          stepNumber: number;
          steps: ReadonlyArray<{
            toolCalls?: ReadonlyArray<{ toolName?: string }>;
          }>;
        }) => {
          if (!request.tools) return {};

          const executedToolNames = steps.flatMap((step) =>
            (step.toolCalls ?? []).flatMap((call) =>
              typeof call.toolName === 'string' ? [call.toolName] : [],
            ),
          );

          const active = request.prepareStep?.({
            stepNumber,
            toolNames: Object.keys(request.tools),
            executedToolNames,
          });

          if (!active || active.length === 0) return {};

          return { activeTools: active as never };
        }
      : undefined;

    const options = () => ({
      model: this.languageModel,
      messages: request.messages,
      allowSystemInMessages: true as const,
      tools: request.tools,
      prepareStep,
      headers,
      temperature: request.temperature ?? this.temperature,
      maxOutputTokens: request.maxOutputTokens ?? this.maxOutputTokens,
      stopWhen: stepCountIs(request.maxSteps ?? this.maxSteps),
      timeout: REQUEST_TIMEOUT_MS,
      abortSignal: request.abortSignal
        ? AbortSignal.any([
            request.abortSignal,
            AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          ])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      maxRetries: 0,
    });

    const streaming = Boolean(request.onTextDelta || request.onToolCall);
    let lastToolCallCount = 0;
    let lastTextEmitted = false;

    const runAttempt = async (attempt: number): Promise<GenerateResult> => {
      let toolCallCount = 0;
      let textEmitted = false;
      lastToolCallCount = 0;
      lastTextEmitted = false;

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
            try {
              if (streaming) {
                let streamError: unknown;
                let text = '';
                let usage:
                  { inputTokens?: unknown; outputTokens?: unknown } | undefined;

                let providerMetadata: unknown;
                const result = streamText({
                  ...options(),
                  onError: ({ error }) => {
                    streamError = error;
                  },
                });

                for await (const chunk of result.stream) {
                  if (chunk.type === 'text-delta') {
                    if (chunk.text) {
                      text += chunk.text;
                      textEmitted = true;
                      lastTextEmitted = true;
                      request.onTextDelta?.(chunk.text);
                    }
                  } else if (chunk.type === 'tool-call') {
                    toolCallCount += 1;
                    lastToolCallCount = toolCallCount;
                    request.onToolCall?.(chunk.toolName);
                  } else if (chunk.type === 'finish-step') {
                    usage = chunk.usage;
                    providerMetadata = chunk.providerMetadata;
                  } else if (chunk.type === 'finish') {
                    usage = chunk.totalUsage;
                  }
                }

                if (streamError) throw errorObject(streamError);

                const finalText = text.trim();
                const normalizedUsage = {
                  inputTokens: tokenCount(usage?.inputTokens),
                  outputTokens: tokenCount(usage?.outputTokens),
                  costUsd: openRouterCost(providerMetadata),
                };

                const cache = cacheUsage(usage);

                this.logCacheUsage(request, cache);

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

              this.logCacheUsage(request, cacheUsage(result.usage));

              trace.update({
                output: finalText,
                inputTokens: normalizedUsage.inputTokens,
                outputTokens: normalizedUsage.outputTokens,
                costUsd: normalizedUsage.costUsd,
              });

              return { text: finalText, usage: normalizedUsage };
            } catch (error) {
              trace.update({ error: traceError(error) });
              throw error;
            }
          },
        )
        .catch((error: unknown) => {
          const canRetry =
            attempt === 1 &&
            !textEmitted &&
            toolCallCount === 0 &&
            (retryableApiError(error) ||
              NoOutputGeneratedError.isInstance(error));

          this.logger.warn(
            JSON.stringify({
              event: 'assistant_generation_failed',
              conversationId: request.conversationId ?? null,
              runId: request.runId ?? null,
              attempt,
              errorName: error instanceof Error ? error.name : 'UnknownError',
              toolCallCount,
              retry: canRetry,
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
            !lastTextEmitted &&
            lastToolCallCount === 0 &&
            (retryableApiError(error) ||
              NoOutputGeneratedError.isInstance(error));

          if (!canRetry) throw error;
          const delayMs = retryAfterMs(error);

          if (delayMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
          }
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
      throw new ModelGatewayError('The assistant model could not be reached.');
    }
  }

  /**
   * Emits cache read/write counters so a regression in prompt-prefix stability
   * is visible in logs instead of silently increasing latency and cost.
   */
  private logCacheUsage(request: GenerateRequest, cache: CacheUsage): void {
    if (
      cache.cacheReadTokens === undefined &&
      cache.cacheWriteTokens === undefined
    ) {
      return;
    }

    this.logger.debug(
      JSON.stringify({
        event: 'assistant_prompt_cache',
        conversationId: request.conversationId ?? null,
        runId: request.runId ?? null,
        cacheReadTokens: cache.cacheReadTokens ?? 0,
        cacheWriteTokens: cache.cacheWriteTokens ?? 0,
      }),
    );
  }
}
