import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ModelUsageCall } from '../model-usage';
import { EmbeddingsService } from './embeddings.service';

function service(overrides: Record<string, unknown> = {}): EmbeddingsService {
  return new EmbeddingsService(
    new ConfigService({
      BACKEND_MODEL_API_KEY: 'test-key',
      BACKEND_MODEL_BASE_URL: 'https://router.example/v1',
      ...overrides,
    }),
  );
}

function embeddingResponse(values: number[]): Response {
  return new Response(JSON.stringify({ data: [{ embedding: values }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function transportFailure(): Error {
  return new TypeError('fetch failed');
}

describe('EmbeddingsService', () => {
  afterEach(() => jest.restoreAllMocks());

  test('keeps embeddings on their own provider when chat uses a keyless endpoint', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(embeddingResponse([0.5]));

    const embeddings = await service({
      BACKEND_MODEL_API_KEY: '',
      BACKEND_MODEL_BASE_URL: 'http://localhost:20128/v1',
      BACKEND_EMBEDDING_API_KEY: 'embedding-key',
      BACKEND_EMBEDDING_BASE_URL: 'https://openrouter.ai/api/v1',
    }).embed('A document.');

    expect(embeddings).toEqual([0.5]);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/embeddings');
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer embedding-key',
    );
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model: 'openai/text-embedding-3-small',
    });
  });

  test('keeps concurrent requests within the configured limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_url, init) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await sleep(5);
        inFlight -= 1;

        const body = JSON.parse(init?.body as string) as { input: string };
        expect(typeof body.input).toBe('string');

        return embeddingResponse([body.input.length]);
      });

    const texts = Array.from(
      { length: 24 },
      (_value, index) => `chunk-${index}`,
    );

    const embeddings = await service({
      BACKEND_EMBEDDING_CONCURRENCY: 3,
    }).embedMany(texts);

    expect(fetch).toHaveBeenCalledTimes(24);
    expect(peak).toBeLessThanOrEqual(3);
    expect(embeddings).toEqual(texts.map((text) => [text.length]));
  });

  test('retries a transient transport failure instead of failing the document', async () => {
    let calls = 0;
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(transportFailure());

      return Promise.resolve(embeddingResponse([0.5]));
    });

    await expect(service().embedMany(['chunk-0'])).resolves.toEqual([[0.5]]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('does not retry an embedding request the provider rejected', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('nope', {
        status: 400,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    await expect(service().embedMany(['chunk-0'])).rejects.toThrow(
      'Embedding provider returned 400',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('reports the transport failure once the attempts are exhausted', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(transportFailure());

    await expect(service().embedMany(['chunk-0'])).rejects.toThrow(
      'fetch failed',
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('records one ledger entry per call, summing its requests and retries', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ embedding: [1] }],
            usage: { prompt_tokens: 5, cost: 0.001 },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(embeddingResponse([2]));
    const usage: ModelUsageCall[] = [];
    const embeddings = new EmbeddingsService(
      new ConfigService({ BACKEND_MODEL_API_KEY: 'key' }),
      { record: (call) => usage.push(call) },
    );

    Object.defineProperty(embeddings, 'concurrency', { value: 1 });

    await embeddings.embedMany(['one', 'two']);

    // The rejected request is not billed; the unpriced answer makes it partial.
    expect(usage).toEqual([
      {
        stage: 'embedding',
        provider: 'openrouter',
        model: 'openai/text-embedding-3-small',
        status: 'ok',
        inputTokens: 5,
        costUsd: 0.001,
        costPartial: true,
      },
    ]);
  });
});
