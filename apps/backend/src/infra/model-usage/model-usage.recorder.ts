import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import {
  MODEL_USAGE_REPOSITORY,
  type IModelUsageRepository,
} from '../../database/interfaces';
import {
  USAGE_FEATURES,
  allocateStepCosts,
  usageFeature,
  type GenerationStep,
} from '../../shared/activity/usage-features';
import { currentModelUsageScope } from './model-usage.scope';

/** One provider call as a gateway saw it. */
export type ModelUsageCall = {
  /** What the call was for, e.g. assistant.reply, decision.turn, embedding. */
  stage: string;
  provider: string;
  model: string;
  attempt?: number;
  status: 'ok' | 'failed';
  inputTokens?: number;
  outputTokens?: number;
  /** Known billed cost. Omit when the provider reported none. */
  costUsd?: number;
  /** Set when `costUsd` covers only part of the call. */
  costPartial?: boolean;
  /** Input tokens read from the provider's prompt cache. */
  cachedInputTokens?: number;
  /** Per-step cost and tool calls of a multi-step generation. */
  steps?: readonly GenerationStep[];
  userId?: string;
  conversationId?: string;
  runId?: string;
};

export interface ModelUsageSink {
  record(call: ModelUsageCall): void;
}

/** Version suffixes (`.v1`, `.2026-05-01`) would split one stage into many rows. */
export function normalizeStage(stage: string): string {
  return (
    stage
      .split('.')
      .filter((part, index) => index === 0 || !/^v?\d[\w-]*$|-v\d+$/.test(part))
      .join('.')
      .slice(0, 80) || 'generation'
  );
}

/**
 * Writes every provider call to the usage ledger without delaying the caller.
 * A failed write is logged and never fails the model call it describes.
 */
@Injectable()
export class ModelUsageRecorder implements ModelUsageSink, OnModuleDestroy {
  private readonly logger = new Logger(ModelUsageRecorder.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @Optional()
    @Inject(MODEL_USAGE_REPOSITORY)
    private readonly usage?: IModelUsageRepository,
  ) {}

  static disabled(): ModelUsageSink {
    return { record: () => undefined };
  }

  record(call: ModelUsageCall): void {
    if (!this.usage) return;
    const scope = currentModelUsageScope();
    const kind = scope?.kind ?? 'other';
    const job = scope?.job ?? null;
    const stage = normalizeStage(call.stage);
    const feature = usageFeature({ stage, job, kind });
    // A generation that called tools is split per step; otherwise the call's
    // stage decides. A split with a single feature is stored as that feature.
    const split =
      call.steps && call.steps.some((step) => step.tools.length)
        ? allocateStepCosts(call.steps)
        : null;

    const splitFeatures = split
      ? USAGE_FEATURES.filter((name) => split[name] !== undefined)
      : [];

    const write = this.usage
      .record({
        userId: call.userId ?? scope?.userId ?? null,
        kind,
        job,
        stage,
        feature: splitFeatures.length === 1 ? splitFeatures[0]! : feature,
        featureCosts: splitFeatures.length > 1 ? split : null,
        cachedInputTokens: count(call.cachedInputTokens),
        provider: call.provider,
        model: call.model,
        attempt: call.attempt ?? 1,
        status: call.status,
        inputTokens: count(call.inputTokens),
        outputTokens: count(call.outputTokens),
        costUsd:
          call.costUsd !== undefined &&
          Number.isFinite(call.costUsd) &&
          call.costUsd >= 0
            ? call.costUsd
            : null,
        costMissing: call.costUsd === undefined || call.costPartial === true,
        conversationId: call.conversationId ?? scope?.conversationId ?? null,
        runId: call.runId ?? scope?.runId ?? null,
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Model usage was not recorded (stage=${call.stage} model=${call.model} costUsd=${call.costUsd ?? 'unknown'}); admin cost totals will be low.`,
          error instanceof Error ? error.stack : String(error),
        );
      })
      .finally(() => this.pending.delete(write));

    this.pending.add(write);
  }

  /** Lets in-flight writes land before the database client closes. */
  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.pending);
  }
}

function count(value: number | undefined): number | null {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

/** Tokens and cost from an OpenAI-compatible response's `usage` object. */
export function providerUsage(payload: unknown): {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
} {
  const usage =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).usage
      : undefined;

  if (!usage || typeof usage !== 'object') return {};
  const fields = usage as Record<string, unknown>;
  const number = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : undefined;

  const inputTokens = number(fields.prompt_tokens ?? fields.input_tokens);
  const outputTokens = number(fields.completion_tokens ?? fields.output_tokens);
  const costUsd = number(fields.cost);

  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(costUsd === undefined ? {} : { costUsd }),
  };
}
