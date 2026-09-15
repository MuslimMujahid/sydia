import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';

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

@Injectable()
export class EmbeddingsService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly concurrency: number;
  readonly version = 'v1';

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('BACKEND_MODEL_API_KEY', '');
    this.baseUrl = config.get<string>(
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

    return this.embedWithRetry(text);
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
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < texts.length) {
        const index = cursor++;
        embeddings[index] = await this.embedWithRetry(texts[index]!);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(this.concurrency, texts.length) }, worker),
    );

    return embeddings;
  }

  modelName(): string {
    return this.model;
  }

  private async embedWithRetry(text: string): Promise<number[]> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.requestEmbedding(text);
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

  private async requestEmbedding(text: string): Promise<number[]> {
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
    const payload: unknown = await response.json();
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
