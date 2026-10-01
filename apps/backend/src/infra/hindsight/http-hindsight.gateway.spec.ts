import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { HttpHindsightGateway } from './http-hindsight.gateway';
import { HindsightError } from './hindsight.types';

const opId = '550e8400-e29b-41d4-a716-446655440000';
const input = {
  documentId: 'chat:segment-1',
  content: 'The user prefers Indonesian.',
  timestamp: '2026-09-30T12:00:00+08:00',
  operationId: opId,
};

function gateway(settings: Record<string, unknown> = {}): HttpHindsightGateway {
  return new HttpHindsightGateway(
    new ConfigService({
      BACKEND_HINDSIGHT_URL: 'http://127.0.0.1:8888',
      BACKEND_HINDSIGHT_API_KEY: 'private-test-key',
      ...settings,
    }),
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('HTTP Hindsight gateway', () => {
  test('uses the pinned retain route, replacement, and persisted async identity', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        success: true,
        bank_id: 'bank-1',
        items_count: 1,
        async: true,
        operation_id: opId,
      }),
    );

    await expect(gateway().retain('bank-1', input)).resolves.toEqual({
      id: opId,
      status: 'pending',
    });
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:8888/v1/default/banks/bank-1/memories');
    expect(request?.redirect).toBe('error');
    expect(request?.headers).toMatchObject({
      Authorization: 'Bearer private-test-key',
    });
    expect(JSON.parse(request?.body as string)).toMatchObject({
      async: true,
      operation_id: opId,
      items: [
        {
          document_id: 'chat:segment-1',
          update_mode: 'replace',
          timestamp: input.timestamp,
        },
      ],
    });
  });

  test('does not treat a foreign operation acknowledgement as our accepted work', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        success: true,
        bank_id: 'bank-1',
        items_count: 1,
        async: true,
        operation_id: 'another-operation',
      }),
    );
    await expect(gateway().retain('bank-1', input)).rejects.toThrow(/identity/);
  });

  test('validates operation identity and does not claim pending work is completed', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({ operation_id: opId, status: 'processing' }),
      );
    await expect(gateway().operation('bank-1', opId)).resolves.toEqual({
      id: opId,
      status: 'processing',
    });
  });

  test('requests source evidence and preserves incomplete evidence for admission checks', async () => {
    const fact = {
      id: 'source-1',
      text: 'User now prefers Vue.',
      type: 'world',
      document_id: 'segment-2',
    };

    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        results: [
          {
            id: 'belief-1',
            text: 'User switched from React to Vue.',
            type: 'observation',
            source_fact_ids: ['source-1', 'source-2'],
          },
        ],
        source_facts: { 'source-1': fact },
        source_facts_truncated: true,
      }),
    );

    const result = await gateway().recall('bank-1', {
      query: 'frontend preference',
      timestamp: input.timestamp,
      maxTokens: 500,
    });

    expect(result.sourceFactsTruncated).toBe(true);
    expect(result.results[0]?.sourceFactIds).toEqual(['source-1', 'source-2']);
    expect(result.sourceFacts['source-1']?.documentId).toBe('segment-2');
    expect(JSON.parse(fetch.mock.calls[0]![1]?.body as string)).toMatchObject({
      query_timestamp: input.timestamp,
      types: ['world', 'observation'],
      include: { entities: null, source_facts: { max_tokens: 2000 } },
    });
    expect(
      JSON.parse(fetch.mock.calls[0]![1]?.body as string),
    ).not.toHaveProperty('min_scores');
  });

  test.each([0, 0.2, 1])(
    'passes the configured semantic floor %s without filtering other retrieval arms',
    async (floor) => {
      const fetch = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(Response.json({ results: [] }));

      await gateway({ BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY: floor }).recall(
        'bank-1',
        {
          query: 'weekend routine',
          timestamp: input.timestamp,
          maxTokens: 800,
        },
      );
      expect(JSON.parse(fetch.mock.calls[0]![1]?.body as string)).toMatchObject(
        { min_scores: { semantic: floor } },
      );
    },
  );

  test.each([
    { results: 'invalid' },
    { results: [{ id: 'fact-1', text: 'Claim', type: 'unknown' }] },
    {
      results: [],
      source_facts: {
        'other-id': { id: 'fact-1', text: 'Claim', type: 'world' },
      },
    },
  ])('rejects malformed recall evidence %j', async (payload) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(payload));
    await expect(
      gateway().recall('bank-1', {
        query: 'query',
        timestamp: input.timestamp,
        maxTokens: 500,
      }),
    ).rejects.toMatchObject({ retryable: false });
  });

  test.each([429, 503, 408])(
    'classifies HTTP %s as retryable without leaking the provider body',
    async (status) => {
      const fetch = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('secret-provider-body', { status }));

      await expect(gateway().version()).rejects.toMatchObject({
        status,
        retryable: true,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  test.each([
    { llm_trace: true, audit_log: false },
    { llm_trace: false, audit_log: true },
    {},
  ])(
    'rejects enabled or unverifiable raw-content capture: %j',
    async (features) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(Response.json({ api_version: '0.10.2', features }));
      await expect(gateway().version()).rejects.toMatchObject({
        retryable: false,
      });
    },
  );

  test('rejects auth errors without retrying or exposing credentials', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('private-test-key', { status: 401 }));

    await expect(gateway().version()).rejects.toMatchObject({
      status: 401,
      retryable: false,
      message: 'Hindsight version returned HTTP 401',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('erasure is idempotent, and source path components cannot escape their bank', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 404 }));

    await expect(
      gateway().deleteDocument('bank-1', 'chat:segment/1'),
    ).resolves.toBeUndefined();
    expect(fetch.mock.calls[0]![0]).toBe(
      'http://127.0.0.1:8888/v1/default/banks/bank-1/documents/chat%3Asegment%2F1',
    );
    await expect(gateway().deleteBank('..')).rejects.toThrow(/identity/);
  });

  test('bounds in-flight requests and includes queue time in the request deadline', async () => {
    let release: ((response: Response) => void) | undefined;
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(
        Response.json({
          api_version: '0.10.2',
          features: { llm_trace: false, audit_log: false },
        }),
      );

    const client = gateway({
      BACKEND_HINDSIGHT_CONCURRENCY: 1,
      BACKEND_HINDSIGHT_TIMEOUT_MS: 40,
    });

    const first = client.version();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(client.version()).rejects.toBeInstanceOf(HindsightError);
    expect(fetch).toHaveBeenCalledTimes(1);
    release?.(
      Response.json({
        api_version: '0.10.2',
        features: { llm_trace: false, audit_log: false },
      }),
    );
    await first;
    await expect(client.version()).resolves.toBe('0.10.2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('queued work starts after a request completes', async () => {
    let release: ((response: Response) => void) | undefined;
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(
        Response.json({
          api_version: '0.10.2',
          features: { llm_trace: false, audit_log: false },
        }),
      );

    const client = gateway({ BACKEND_HINDSIGHT_CONCURRENCY: 1 });
    const first = client.version();
    const second = client.version();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledTimes(1);
    release?.(
      Response.json({
        api_version: '0.10.2',
        features: { llm_trace: false, audit_log: false },
      }),
    );
    await expect(Promise.all([first, second])).resolves.toEqual([
      '0.10.2',
      '0.10.2',
    ]);
  });
});
