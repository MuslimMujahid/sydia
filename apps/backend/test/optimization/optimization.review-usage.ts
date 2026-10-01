import type {
  GenerationTracer,
  GenerationTraceRequest,
  GenerationTrace,
} from '../../src/infra/observability';

export type ReviewCharge = {
  provider: string;
  model: string;
  status: 'completed' | 'failed';
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

/** Local synthetic accounting only. Do not retain input/output or identifiers. */
export class ReviewUsage implements GenerationTracer {
  readonly charges: ReviewCharge[] = [];

  async traceGeneration<T>(
    request: GenerationTraceRequest,
    operation: (trace: GenerationTrace) => Promise<T>,
  ): Promise<T> {
    const charge: ReviewCharge = {
      provider: request.provider,
      model: request.model,
      status: 'failed',
      costUsd: null,
      inputTokens: null,
      outputTokens: null,
    };

    try {
      const result = await operation({
        update: ({ costUsd, inputTokens, outputTokens, model }) => {
          if (costUsd !== undefined) charge.costUsd = costUsd;
          if (inputTokens !== undefined) charge.inputTokens = inputTokens;
          if (outputTokens !== undefined) charge.outputTokens = outputTokens;
          if (model !== undefined) charge.model = model;
        },
      });

      charge.status = 'completed';

      return result;
    } finally {
      this.charges.push(charge);
    }
  }
}

export function totalReviewCost(
  charges: readonly ReviewCharge[],
): number | null {
  if (
    !charges.length ||
    charges.some(
      ({ costUsd }) =>
        costUsd === null || !Number.isFinite(costUsd) || costUsd < 0,
    )
  )
    return null;

  return charges.reduce((sum, { costUsd }) => sum + costUsd!, 0);
}
