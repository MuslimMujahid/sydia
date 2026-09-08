import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, stepCountIs, streamText } from 'ai';
import type { LanguageModel as AiLanguageModel } from 'ai';
import type {
  GenerateRequest,
  GenerateResult,
  LanguageModelGateway,
} from './model-gateway.types';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'z-ai/glm-5.3-flash';
const REQUEST_TIMEOUT_MS = 60_000;

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

@Injectable()
export class OpenRouterLanguageModel implements LanguageModelGateway {
  readonly provider = 'openrouter' as const;
  readonly model: string;

  private readonly apiKey?: string;
  private readonly languageModel: AiLanguageModel;
  private readonly logger = new Logger(OpenRouterLanguageModel.name);

  constructor(config: ConfigService) {
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

    try {
      const options = {
        model: this.languageModel,
        messages: request.messages,
        allowSystemInMessages: true,
        tools: request.tools,
        stopWhen: stepCountIs(3),
        timeout: REQUEST_TIMEOUT_MS,
        abortSignal:
          typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            : undefined,
        maxRetries: 0,
      } as const;

      if (request.onTextDelta || request.onToolCall) {
        const result = streamText({
          ...options,
          onChunk: ({ chunk }) => {
            if (chunk.type === 'text-delta') {
              request.onTextDelta?.(chunk.text);
            } else if (chunk.type === 'tool-call') {
              request.onToolCall?.(chunk.toolName);
            }
          },
        });

        const [text, usage, providerMetadata] = await Promise.all([
          result.text,
          result.usage,
          result.providerMetadata,
        ]);

        return {
          text: text.trim(),
          usage: {
            inputTokens: tokenCount(usage.inputTokens),
            outputTokens: tokenCount(usage.outputTokens),
            costUsd: openRouterCost(providerMetadata),
          },
        };
      }

      const result = await generateText(options);

      return {
        text: result.text.trim(),
        usage: {
          inputTokens: tokenCount(result.usage.inputTokens),
          outputTokens: tokenCount(result.usage.outputTokens),
          costUsd: openRouterCost(result.providerMetadata),
        },
      };
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
