import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MODEL_USAGE_REPOSITORY,
  type IModelUsageRepository,
} from '../../database/interfaces';

const KEY_URL = 'https://openrouter.ai/api/v1/key';
const SOURCE = 'openrouter-key:hindsight';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Hindsight calls its models outside this backend, so its spend is read from
 * the dedicated OpenRouter key it uses: each poll records the growth of the
 * key's all-time usage since the previous poll. It has no per-user breakdown.
 */
@Injectable()
export class HindsightUsageService {
  private readonly logger = new Logger(HindsightUsageService.name);
  private readonly apiKey?: string;

  constructor(
    config: ConfigService,
    @Inject(MODEL_USAGE_REPOSITORY)
    private readonly usage: IModelUsageRepository,
  ) {
    this.apiKey =
      config.get<string>('BACKEND_HINDSIGHT_OPENROUTER_API_KEY')?.trim() ||
      undefined;
  }

  get configured(): boolean {
    return this.apiKey !== undefined;
  }

  /** Returns the spend recorded by this poll, or null when not configured. */
  async poll(now = new Date()): Promise<number | null> {
    if (!this.apiKey) return null;

    const response = await fetch(KEY_URL, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok)
      throw new Error(`OpenRouter key usage returned ${response.status}`);
    const totalUsd = keyUsage(await response.json());
    if (totalUsd === null)
      throw new Error('OpenRouter key usage response has no numeric usage');

    const spent = await this.usage.recordCumulative({
      source: SOURCE,
      totalUsd,
      takenAt: now,
      entry: {
        userId: null,
        kind: 'hindsight',
        job: 'hindsight',
        stage: 'hindsight',
        provider: 'openrouter',
        model: 'hindsight',
        attempt: 1,
        status: 'ok',
        inputTokens: null,
        outputTokens: null,
        conversationId: null,
        runId: null,
      },
    });

    this.logger.debug(`Hindsight spend since last poll: $${spent}`);

    return spent;
  }
}

/** The all-time credits used by the key, from `GET /api/v1/key`. */
export function keyUsage(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return null;
  const usage = (data as Record<string, unknown>).usage;

  return typeof usage === 'number' && Number.isFinite(usage) && usage >= 0
    ? usage
    : null;
}
