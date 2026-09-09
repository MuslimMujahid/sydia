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
const MAX_TRACE_TEXT = 12_000;

export type GenerationTraceRequest = {
  provider: string;
  model: string;
  messages: ModelMessage[];
  userId?: string;
  conversationId?: string;
  runId?: string;
  attempt: number;
};

export type GenerationTraceUpdate = {
  output?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
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
  return value instanceof Error ? value.name : 'UnknownError';
}

function traceText(value: string): string {
  return value.length > MAX_TRACE_TEXT
    ? `${value.slice(0, MAX_TRACE_TEXT)}…`
    : value;
}

function safeMessages(messages: ModelMessage[]): unknown[] {
  return messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === 'string'
        ? traceText(message.content)
        : '[structured message]',
  }));
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
          `${request.provider}.generation`,
          {
            model: request.model,
            input: safeMessages(request.messages),
            metadata,
          },
          { asType: 'generation' },
        );

        const trace: GenerationTrace = {
          update: (update) => {
            const attributes: Parameters<LangfuseGeneration['update']>[0] = {};

            if (update.output !== undefined) {
              attributes.output = traceText(update.output);
            }

            if (
              update.inputTokens !== undefined ||
              update.outputTokens !== undefined
            ) {
              attributes.usageDetails = {
                ...(update.inputTokens === undefined
                  ? {}
                  : { promptTokens: update.inputTokens }),
                ...(update.outputTokens === undefined
                  ? {}
                  : { completionTokens: update.outputTokens }),
              };
            }

            if (update.costUsd !== undefined) {
              attributes.costDetails = { totalCost: update.costUsd };
            }

            generation.update(attributes);
          },
        };

        try {
          return await operation(trace);
        } catch (error) {
          generation.update({
            level: 'ERROR',
            statusMessage: errorName(error),
            output: { error: errorName(error) },
          });
          throw error;
        } finally {
          generation.end();
        }
      },
    );
  }
}
