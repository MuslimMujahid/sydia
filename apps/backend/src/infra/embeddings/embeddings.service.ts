import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  ModelUsageRecorder,
  providerUsage,
  type ModelUsageSink,
} from '../model-usage';

const DEFAULT_CONCURRENCY = 8;
const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 2_000;

/**
 * A failed embedding request. `status` is set when the provider answered with
 * an HTTP error, which separates a throttled or unavailable provider (worth
 * retrying) from a rejected request (not worth retrying).
 */
class EmbeddingRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EmbeddingRequestError';
  }
}

function retryableEmbeddingError(error: unknown): boolean {
  if (error instanceof EmbeddingRequestError)
    return error.status === 429 || (error.status ?? 0) >= 500;

  // A transport failure (DNS, connect timeout, reset socket) is transient.
  return true;
}

function retryDelayMs(attempt: number): number {
  const ceiling = Math.min(
    BASE_RETRY_DELAY_MS * 2 ** (attempt - 1),
    MAX_RETRY_DELAY_MS,
  );

  return Math.floor(ceiling / 2 + Math.random() * (ceiling / 2));
}

/** Spend of one `embed`/`embedMany` call across its requests and retries. */
type EmbeddingTally = {
  requests: number;
  priced: number;
  costUsd: number;
  inputTokens: number;
  failed: boolean;
};

@Injectable()
export class EmbeddingsService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly concurrency: number;
  readonly version = 'v1';

  constructor(
    config: ConfigService,
    @Optional()
    @Inject(ModelUsageRecorder)
    private readonly usage: ModelUsageSink = ModelUsageRecorder.disabled(),
  ) {
    // Optional embedding overrides allow chat to use a different provider.
    this.apiKey =
      config.get<string>('BACKEND_EMBEDDING_API_KEY')?.trim() ||
      config.get<string>('BACKEND_MODEL_API_KEY', '');
    this.baseUrl =
      config.get<string>('BACKEND_EMBEDDING_BASE_URL')?.trim() ||
      config.get<string>(
        'BACKEND_MODEL_BASE_URL',
        'https://openrouter.ai/api/v1',
      );
    this.model = config.get<string>(
      'BACKEND_EMBEDDING_MODEL',
      'openai/text-embedding-3-small',
    );
    this.concurrency = config.get<number>(
      'BACKEND_EMBEDDING_CONCURRENCY',
      DEFAULT_CONCURRENCY,
    );
  }

  async embed(text: string): Promise<number[] | null> {
    if (!this.apiKey) return null;
    const tally = this.tally();

    try {
      return await this.embedWithRetry(text, tally);
    } catch (error) {
      tally.failed = true;
      throw error;
    } finally {
      this.recordTally(tally);
    }
  }

  /**
   * Embeds many texts with bounded concurrency, preserving input order.
   *
   * A long document produces one chunk per page, so embedding every chunk in a
   * single `Promise.all` opens as many simultaneous connections as the file has
   * pages. Hosts and networks drop part of that burst, one rejection rejects
   * the batch, and the document fails even though every chunk is individually
   * embeddable. Requests are therefore pooled, and each is retried so a single
   * transient failure cannot discard a whole document.
   */
  async embedMany(texts: string[]): Promise<Array<number[] | null>> {
    if (!this.apiKey) return texts.map(() => null);
    const embeddings = new Array<number[] | null>(texts.length);
    const tally = this.tally();
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < texts.length) {
        const index = cursor++;
        embeddings[index] = await this.embedWithRetry(texts[index]!, tally);
      }
    };

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(this.concurrency, texts.length) },
          worker,
        ),
      );
    } catch (error) {
      tally.failed = true;
      throw error;
    } finally {
      this.recordTally(tally);
    }

    return embeddings;
  }

  modelName(): string {
    return this.model;
  }

  private tally(): EmbeddingTally {
    return {
      requests: 0,
      priced: 0,
      costUsd: 0,
      inputTokens: 0,
      failed: false,
    };
  }

  private recordTally(tally: EmbeddingTally): void {
    if (tally.requests === 0) return;

    this.usage.record({
      stage: 'embedding',
      provider: 'openrouter',
      model: this.model,
      status: tally.failed ? 'failed' : 'ok',
      inputTokens: tally.inputTokens,
      ...(tally.priced > 0 ? { costUsd: tally.costUsd } : {}),
      costPartial: tally.priced > 0 && tally.priced < tally.requests,
    });
  }

  private async embedWithRetry(
    text: string,
    tally: EmbeddingTally,
  ): Promise<number[]> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.requestEmbedding(text, tally);
      } catch (error: unknown) {
        lastError = error;
        if (attempt === MAX_ATTEMPTS || !retryableEmbeddingError(error)) break;
        await sleep(retryDelayMs(attempt));
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new EmbeddingRequestError('Embedding provider request failed');
  }

  private async requestEmbedding(
    text: string,
    tally: EmbeddingTally,
  ): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        dimensions: 1536,
      }),
    });

    if (!response.ok)
      throw new EmbeddingRequestError(
        `Embedding provider returned ${response.status}`,
        response.status,
      );
    // Only an answered request is billed; a rejected one is retried or fails.
    tally.requests += 1;
    const payload: unknown = await response.json();
    const usage = providerUsage(payload);

    tally.inputTokens += usage.inputTokens ?? 0;

    if (usage.costUsd !== undefined) {
      tally.priced += 1;
      tally.costUsd += usage.costUsd;
    }

    if (!this.isEmbeddingResponse(payload))
      throw new EmbeddingRequestError(
        'Embedding provider returned an invalid response',
      );

    return payload.data[0].embedding;
  }

  private isEmbeddingResponse(
    value: unknown,
  ): value is { data: [{ embedding: number[] }] } {
    if (!value || typeof value !== 'object') return false;

    const record = value as Record<string, unknown>;
    const data = record.data;

    if (!Array.isArray(data) || !data[0] || typeof data[0] !== 'object') {
      return false;
    }

    const item = data[0] as Record<string, unknown>;
    const embedding = item.embedding;

    return (
      Array.isArray(embedding) &&
      embedding.every((element: unknown) => typeof element === 'number')
    );
  }
}
