import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import {
  propagateAttributes,
  startObservation,
  type LangfuseGeneration,
} from '@langfuse/tracing';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type { ModelMessage } from 'ai';

const DEFAULT_BASE_URL = 'https://cloud.langfuse.com';

export type GenerationTraceRequest = {
  name?: string;
  environment?: string;
  version?: string;
  provider: string;
  model: string;
  messages: ModelMessage[];
  userId?: string;
  conversationId?: string;
  runId?: string;
  attempt: number;
  metadata?: Record<string, string>;
};

export type GenerationTraceError = {
  name: string;
  statusCode?: number;
  retryable?: boolean;
  providerErrorType?: string;
  providerMessage?: string;
};

export type GenerationTraceUpdate = {
  model?: string;
  metadata?: Record<string, string>;
  output?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  error?: GenerationTraceError;
};

export interface GenerationTracer {
  traceGeneration<T>(
    request: GenerationTraceRequest,
    operation: (trace: GenerationTrace) => Promise<T>,
  ): Promise<T>;
}

export type GenerationTrace = {
  update(update: GenerationTraceUpdate): void;
};

function errorName(value: unknown): string {
  if (Array.isArray(value))
    return value.slice(0, 3).map(errorName).join(', ') || 'UnknownError';
  if (!(value instanceof Error)) return 'UnknownError';
  // OTLP may reject flush with an array of transport errors. Report only the
  // class and numeric status, never request headers, source text or URLs.
  const code = 'code' in value ? value.code : undefined;

  return typeof code === 'number' && Number.isFinite(code)
    ? `${value.name}(${code})`
    : value.name;
}

@Injectable()
export class ObservabilityService
  implements GenerationTracer, OnModuleInit, OnModuleDestroy
{
  private static sdk: NodeSDK | undefined;
  private static processor: LangfuseSpanProcessor | undefined;
  private static started = false;
  private static shuttingDown: Promise<void> | undefined;

  private readonly logger = new Logger(ObservabilityService.name);
  private readonly publicKey?: string;
  private readonly secretKey?: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.publicKey =
      config.get<string>('BACKEND_LANGFUSE_PUBLIC_KEY')?.trim() || undefined;
    this.secretKey =
      config.get<string>('BACKEND_LANGFUSE_SECRET_KEY')?.trim() || undefined;
    this.baseUrl =
      config.get<string>('BACKEND_LANGFUSE_BASE_URL')?.trim() ||
      DEFAULT_BASE_URL;
  }

  static disabled(): ObservabilityService {
    return new ObservabilityService(new ConfigService());
  }

  private get enabled(): boolean {
    return this.publicKey !== undefined && this.secretKey !== undefined;
  }

  onModuleInit(): void {
    if (!this.enabled || ObservabilityService.started) return;

    try {
      const processor = new LangfuseSpanProcessor({
        publicKey: this.publicKey,
        secretKey: this.secretKey,
        baseUrl: this.baseUrl,
      });

      const sdk = new NodeSDK({ spanProcessors: [processor] });
      sdk.start();
      ObservabilityService.processor = processor;
      ObservabilityService.sdk = sdk;
      ObservabilityService.started = true;
    } catch (error) {
      this.logger.warn(`Langfuse observability disabled: ${errorName(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!ObservabilityService.sdk || ObservabilityService.shuttingDown) return;

    ObservabilityService.shuttingDown = (async () => {
      try {
        await ObservabilityService.processor?.forceFlush();
        await ObservabilityService.sdk?.shutdown();
      } catch (error) {
        this.logger.warn(`Langfuse shutdown failed: ${errorName(error)}`);
      } finally {
        ObservabilityService.processor = undefined;
        ObservabilityService.sdk = undefined;
        ObservabilityService.started = false;
        ObservabilityService.shuttingDown = undefined;
      }
    })();

    await ObservabilityService.shuttingDown;
  }

  async traceGeneration<T>(
    request: GenerationTraceRequest,
    operation: (trace: GenerationTrace) => Promise<T>,
  ): Promise<T> {
    if (!this.enabled || !ObservabilityService.started) {
      return operation({ update: () => undefined });
    }

    const metadata: Record<string, string> = {
      ...request.metadata,
      provider: request.provider,
      attempt: String(request.attempt),
    };

    if (request.runId) metadata.runId = request.runId;

    return propagateAttributes(
      {
        userId: request.userId,
        sessionId: request.conversationId,
        metadata,
      },
      async () => {
        const generation = startObservation(
          request.name ?? `${request.provider}.generation`,
          {
            input: request.messages,
            model: request.model,
            environment: request.environment,
            version: request.version,
            metadata,
          },
          { asType: 'generation' },
        );

        let errorReported = false;
        const trace: GenerationTrace = {
          update: (update) => {
            const attributes: Parameters<LangfuseGeneration['update']>[0] = {};
            if (update.model !== undefined) attributes.model = update.model;
            if (update.metadata !== undefined)
              attributes.metadata = { ...metadata, ...update.metadata };

            if (update.output !== undefined) {
              attributes.output = update.output;
            }

            if (
              update.inputTokens !== undefined ||
              update.outputTokens !== undefined
            ) {
              attributes.usageDetails = {
                ...(update.inputTokens === undefined
                  ? {}
                  : { input: update.inputTokens }),
                ...(update.outputTokens === undefined
                  ? {}
                  : { output: update.outputTokens }),
              };
            }

            if (update.costUsd !== undefined) {
              attributes.costDetails = { total: update.costUsd };
            }

            if (update.error !== undefined) {
              errorReported = true;
              attributes.level = 'ERROR';
              attributes.statusMessage = update.error.name;
              attributes.output = {
                error: update.error.name,
                ...(update.error.statusCode === undefined
                  ? {}
                  : { statusCode: update.error.statusCode }),
                ...(update.error.retryable === undefined
                  ? {}
                  : { retryable: update.error.retryable }),
                ...(update.error.providerErrorType === undefined
                  ? {}
                  : { providerErrorType: update.error.providerErrorType }),
              };
            }

            generation.update(attributes);
          },
        };

        try {
          return await operation(trace);
        } catch (error) {
          if (!errorReported) {
            generation.update({
              level: 'ERROR',
              statusMessage: errorName(error),
              output: { error: errorName(error) },
            });
          }

          throw error;
        } finally {
          generation.end();
        }
      },
    );
  }
}
