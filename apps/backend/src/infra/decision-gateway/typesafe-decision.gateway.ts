import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { TypeSafeClient, APIError } from '@typesafe-ai/sdk';
import { ObservabilityService } from '../observability';
import { containsDecisionCredential } from '../../shared/decision-privacy';
import { DecisionCapacityService } from './decision-capacity.service';
import {
  DECISION_MODEL,
  OPENROUTER_DECISION_SNAPSHOT,
} from './decision.config';
import type {
  DecisionAnswer,
  DecisionGateway,
  DecisionQuestion,
  DecisionRequest,
  DecisionResult,
  DecisionFailure,
} from './decision-gateway.types';

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function probability(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function tokens(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function parseDecisionResponse(
  value: unknown,
  model: string,
  questions: Record<string, DecisionQuestion>,
): {
  answers: Record<string, DecisionAnswer>;
  inputTokens: number;
  outputTokens: number;
  resolvedModel: string;
  reportedCostUsd: number | null;
  upstreamProvider: 'TypeSafe' | null;
} | null {
  const response = record(value);
  const answers = record(response?.answers);
  const usage = record(response?.usage);
  if (
    response?.model !==
      (model === DECISION_MODEL ? OPENROUTER_DECISION_SNAPSHOT : model) ||
    !answers ||
    !usage ||
    !tokens(usage.input_tokens) ||
    !tokens(usage.output_tokens) ||
    Object.keys(answers).length !== Object.keys(questions).length
  )
    return null;
  const parsed: Record<string, DecisionAnswer> = {};

  for (const [id, question] of Object.entries(questions)) {
    const answer = record(answers[id]);
    if (answer?.type !== question.type) return null;

    if (question.type === 'noul') {
      if (!probability(answer.noul)) return null;
      parsed[id] = { type: 'noul', noul: answer.noul };
    } else {
      const distribution = record(answer.probabilities);
      const options = Object.keys(question.criteria);
      if (
        typeof answer.choice !== 'string' ||
        !options.includes(answer.choice) ||
        !probability(answer.confidence) ||
        !distribution ||
        Object.keys(distribution).length !== options.length
      )
        return null;
      const probabilities: Record<string, number> = {};

      for (const option of options) {
        const p = distribution[option];
        if (!probability(p)) return null;
        probabilities[option] = p;
      }

      const choice = answer.choice;
      const chosenProbability = probabilities[choice];
      if (
        chosenProbability === undefined ||
        Math.abs(
          Object.values(probabilities).reduce((sum, p) => sum + p, 0) - 1,
        ) > 0.001 ||
        Object.values(probabilities).some((p) => p > chosenProbability + 0.001)
      )
        return null;
      parsed[id] = {
        type: 'choice',
        choice: answer.choice,
        confidence: answer.confidence,
        probabilities,
      };
    }
  }

  return {
    answers: parsed,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    resolvedModel: response.model,
    upstreamProvider: response.provider === 'TypeSafe' ? 'TypeSafe' : null,
    reportedCostUsd:
      typeof usage.cost === 'number' &&
      Number.isFinite(usage.cost) &&
      usage.cost >= 0
        ? usage.cost
        : null,
  };
}

@Injectable()
export class TypeSafeDecisionGateway implements DecisionGateway {
  private readonly logger = new Logger(TypeSafeDecisionGateway.name);
  private readonly client?: TypeSafeClient;
  private readonly model: string;
  private readonly provider: 'openrouter' | 'typesafe';
  private readonly deadlines: Record<'interactive' | 'background', number>;
  private readonly inputPrice: number | null;
  constructor(
    config: ConfigService,
    private readonly capacity: DecisionCapacityService,
    private readonly observability: ObservabilityService,
  ) {
    this.provider = config.get<'openrouter' | 'typesafe'>(
      'BACKEND_DECISION_PROVIDER',
      'openrouter',
    );
    this.model = config.get<string>(
      'BACKEND_DECISION_MODEL',
      this.provider === 'openrouter' ? DECISION_MODEL : 'jev-1.13.0',
    );
    this.deadlines = {
      interactive: Number(config.get('BACKEND_DECISION_TIMEOUT_MS', 600)),
      background: Number(
        config.get('BACKEND_DECISION_BACKGROUND_TIMEOUT_MS', 5000),
      ),
    };
    const price = config.get<unknown>(
      'BACKEND_DECISION_INPUT_PRICE_PER_MILLION',
    );

    this.inputPrice =
      price !== undefined &&
      price !== '' &&
      Number.isFinite(Number(price)) &&
      Number(price) >= 0
        ? Number(price)
        : null;
    const apiKey =
      config.get<string>('BACKEND_DECISION_API_KEY', '').trim() ||
      (this.provider === 'openrouter'
        ? config.get<string>('BACKEND_MODEL_API_KEY', '').trim()
        : '');

    if (apiKey)
      this.client = new TypeSafeClient({
        apiKey,
        baseURL:
          this.provider === 'openrouter'
            ? 'https://openrouter.ai/api'
            : 'https://api.typesafe.ai',
        defaultModel: this.model,
        logLevel: 'off',
        retry: { maxRetries: 0 },
      });
  }

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    const started = performance.now();
    const fallback = (reason: DecisionFailure): DecisionResult => ({
      status: 'fallback',
      reason,
      latencyMs: performance.now() - started,
    });

    if (!this.client) return fallback('disabled');
    if (request.abortSignal?.aborted) return fallback('cancelled');
    if (containsDecisionCredential(request.state)) return fallback('privacy');
    const questionValues = Object.values(request.questions);
    const stateBytes = Buffer.byteLength(JSON.stringify(request.state), 'utf8');
    const questionBytes = questionValues.map((q) =>
      Buffer.byteLength(JSON.stringify(q), 'utf8'),
    );

    // One byte per token is a conservative upper bound; leave room for protocol
    // framing. Exact token usage comes from the response, never this estimate.
    const bytes =
      stateBytes +
      Buffer.byteLength(JSON.stringify(request.questions), 'utf8') +
      1024;

    if (
      !questionValues.length ||
      stateBytes + Math.max(...questionBytes) + 1024 > 32000 ||
      bytes > (this.provider === 'openrouter' ? 32000 : 64000)
    )
      return fallback('budget');
    const signal = AbortSignal.any([
      AbortSignal.timeout(this.deadlines[request.lane]),
      ...(request.abortSignal ? [request.abortSignal] : []),
    ]);

    let release: (() => Promise<void>) | null;

    try {
      release = await this.capacity.reserve(
        request.lane,
        bytes,
        this.deadlines[request.lane],
      );
    } catch {
      return fallback('capacity');
    }

    if (!release)
      return fallback(
        request.abortSignal?.aborted
          ? 'cancelled'
          : signal.aborted
            ? 'timeout'
            : 'capacity',
      );

    try {
      return await this.observability.traceGeneration(
        {
          name: `decision.${request.stage}`,
          environment: request.environment,
          version: request.version,
          provider: this.provider,
          model: this.model,
          messages: [],
          attempt: 1,
          metadata: {
            stage: request.stage,
            decisionVersion: request.version,
            lane: request.lane,
            featureModes: JSON.stringify(request.featureModes ?? {}),
            stateBytes: String(stateBytes),
            questionCount: String(questionValues.length),
            contentCapture: 'redacted',
            questionRevision: createHash('sha256')
              .update(JSON.stringify(request.questions))
              .digest('hex')
              .slice(0, 16),
          },
        },
        async (trace) => {
          let result: DecisionResult;

          try {
            signal.throwIfAborted();
            const response: unknown = await this.client!.systemOne(
              {
                model: this.model,
                state: request.state,
                questions: request.questions,
              },
              {
                signal,
                retry: { maxRetries: 0 },
                timeout: this.deadlines[request.lane],
              },
            );

            signal.throwIfAborted();

            const parsed = parseDecisionResponse(
              response,
              this.model,
              request.questions,
            );

            if (!parsed) result = fallback('invalid-response');
            else {
              const costUsd =
                parsed.reportedCostUsd ??
                (this.inputPrice === null
                  ? null
                  : (parsed.inputTokens * this.inputPrice) / 1_000_000);

              result = {
                status: 'ok',
                model: parsed.resolvedModel,
                ...parsed,
                costUsd,
                latencyMs: performance.now() - started,
              };
              trace.update({
                model: parsed.resolvedModel,
                metadata: {
                  upstreamProvider: parsed.upstreamProvider ?? 'unknown',
                  costSource:
                    parsed.reportedCostUsd !== null
                      ? 'provider'
                      : costUsd !== null
                        ? 'estimate'
                        : 'unknown',
                },
                inputTokens: parsed.inputTokens,
                outputTokens: parsed.outputTokens,
                ...(costUsd === null ? {} : { costUsd }),
              });
            }
          } catch (error) {
            result = fallback(
              request.abortSignal?.aborted
                ? 'cancelled'
                : signal.aborted
                  ? 'timeout'
                  : error instanceof APIError &&
                      (error.status === 429 || error.status === 529)
                    ? 'rate-limit'
                    : 'provider',
            );
          }

          trace.update({
            output: JSON.stringify({
              status: result.status,
              ...(result.status === 'fallback'
                ? { reason: result.reason }
                : { questionCount: questionValues.length }),
              latencyMs: Math.round(result.latencyMs),
            }),
          });
          this.logger.debug(
            `stage=${request.stage} version=${request.version} model=${this.model} status=${result.status} durationMs=${Math.round(result.latencyMs)} inputTokens=${result.status === 'ok' ? result.inputTokens : 'unknown'} costUsd=${result.status === 'ok' ? (result.costUsd ?? 'unknown') : 'unknown'}`,
          );

          return result;
        },
      );
    } catch {
      // Observability must never turn a routing decision into a failed turn.
      return fallback('provider');
    } finally {
      // Cleanup must not extend the caller's deadline; the distributed lease
      // also expires if shutdown interrupts this bounded Redis command.
      void release().catch(() => undefined);
    }
  }
}
