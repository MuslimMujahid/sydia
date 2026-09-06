import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, stepCountIs } from 'ai';
import type { LanguageModel as AiLanguageModel } from 'ai';
import type {
  GenerateRequest,
  GenerateResult,
  LanguageModelGateway,
} from './model-gateway.types';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'z-ai/glm-5.3-flash';
const REQUEST_TIMEOUT_MS = 30_000;

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

    this.languageModel = openrouter.chat(this.model);
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    if (!this.apiKey) {
      throw new ModelGatewayError(
        'Model assistant belum dikonfigurasi. Tetapkan BACKEND_MODEL_API_KEY.',
      );
    }

    try {
      const result = await generateText({
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
      });

      return {
        text: result.text.trim(),
        usage: {
          inputTokens: tokenCount(result.usage.inputTokens),
          outputTokens: tokenCount(result.usage.outputTokens),
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
