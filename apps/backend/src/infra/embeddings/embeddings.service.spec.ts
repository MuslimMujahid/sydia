import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
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
});
