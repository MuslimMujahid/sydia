import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { APICallError, jsonSchema, simulateReadableStream, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import {
  ModelGatewayError,
  OpenRouterLanguageModel,
} from './openrouter-language-model';

import type {
  GenerationTrace,
  GenerationTraceRequest,
  GenerationTraceUpdate,
  GenerationTracer,
} from '../observability';

type TracingSpy = {
  calls: GenerationTraceRequest[];
  updates: GenerationTraceUpdate[];
  errors: unknown[];
  observability: GenerationTracer;
};

function tracingSpy(): TracingSpy {
  const calls: GenerationTraceRequest[] = [];
  const updates: GenerationTraceUpdate[] = [];
  const errors: unknown[] = [];
  const observability: GenerationTracer = {
    traceGeneration: async <T>(
      request: GenerationTraceRequest,
      operation: (trace: GenerationTrace) => Promise<T>,
    ): Promise<T> => {
      calls.push(request);

      try {
        return await operation({ update: (update) => updates.push(update) });
      } catch (error) {
        errors.push(error);
        throw error;
      }
    },
  };

  return { calls, updates, errors, observability };
}

function model(
  values: Record<string, string> = {},
  observability?: GenerationTracer,
) {
  return new OpenRouterLanguageModel(new ConfigService(values), observability);
}

describe('OpenRouterLanguageModel', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the OpenRouter model defaults', () => {
    const gateway = model();

    expect(gateway.provider).toBe('openrouter');
    expect(gateway.model).toBe('qwen/qwen3.8-flash');
  });

  it('rejects missing API keys without tracing or calling the provider', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch');
    const tracing = tracingSpy();

    await expect(
      model({}, tracing.observability).generate({
        messages: [{ role: 'user', content: 'Halo' }],
      }),
    ).rejects.toThrow(
      'The assistant model is not configured. Set BACKEND_MODEL_API_KEY.',
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(tracing.calls).toHaveLength(0);
    expect(tracing.updates).toHaveLength(0);
  });

  it('records normalized successful output and usage in the tracing seam', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'response-1',
          choices: [
            {
              message: { role: 'assistant', content: '  Halo kembali.  ' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const tracing = tracingSpy();

    await expect(
      model(
        { BACKEND_MODEL_API_KEY: 'test-key' },
        tracing.observability,
      ).generate({
        userId: 'user-1',
        conversationId: 'conversation-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'Halo' }],
      }),
    ).resolves.toEqual({
      text: 'Halo kembali.',
      usage: { inputTokens: 11, outputTokens: 7 },
    });

    expect(tracing.calls).toEqual([
      expect.objectContaining({
        provider: 'openrouter',
        model: 'qwen/qwen3.8-flash',
        userId: 'user-1',
        conversationId: 'conversation-1',
        runId: 'run-1',
        attempt: 1,
      }),
    ]);
    expect(tracing.updates).toContainEqual({
      output: 'Halo kembali.',
      inputTokens: 11,
      outputTokens: 7,
      costUsd: undefined,
    });
  });

  it('normalizes text and token usage from a provider response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'response-1',
          choices: [
            {
              message: { role: 'assistant', content: '  Halo kembali.  ' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 7,
            total_tokens: 18,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      model({ BACKEND_MODEL_API_KEY: 'test-key' }).generate({
        messages: [{ role: 'user', content: 'Halo' }],
      }),
    ).resolves.toEqual({
      text: 'Halo kembali.',
      usage: { inputTokens: 11, outputTokens: 7 },
    });
  });

  it('dispatches each text delta before the stream completes', async () => {
    const languageModel = new MockLanguageModelV4({
      doStream: () =>
        Promise.resolve({
          stream: simulateReadableStream({
            chunkDelayInMs: 25,
            chunks: [
              { type: 'text-start' as const, id: 'text-1' },
              {
                type: 'text-delta' as const,
                id: 'text-1',
                delta: 'Halo ',
              },
              {
                type: 'text-delta' as const,
                id: 'text-1',
                delta: 'kembali.',
              },
              { type: 'text-end' as const, id: 'text-1' },
              {
                type: 'finish' as const,
                finishReason: {
                  unified: 'stop' as const,
                  raw: undefined,
                },
                logprobs: undefined,
                usage: {
                  inputTokens: {
                    total: 11,
                    noCache: 11,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: {
                    total: 7,
                    text: 7,
                    reasoning: undefined,
                  },
                },
              },
            ],
          }),
        }),
    });

    const gateway = model({ BACKEND_MODEL_API_KEY: 'test-key' });
    Object.defineProperty(gateway, 'languageModel', { value: languageModel });

    let completed = false;
    let resolveFirstDelta!: () => void;
    const firstDelta = new Promise<void>((resolve) => {
      resolveFirstDelta = resolve;
    });

    const onTextDelta = jest.fn<(delta: string) => void>((delta) => {
      if (delta === 'Halo ') resolveFirstDelta();
    });

    const generation = gateway
      .generate({
        messages: [{ role: 'user', content: 'Halo' }],
        onTextDelta,
      })
      .finally(() => {
        completed = true;
      });

    await firstDelta;
    expect(completed).toBe(false);
    expect(onTextDelta).toHaveBeenCalledTimes(1);
    expect(onTextDelta).toHaveBeenLastCalledWith('Halo ');

    await expect(generation).resolves.toEqual({
      text: 'Halo kembali.',
      usage: { inputTokens: 11, outputTokens: 7 },
    });
    expect(onTextDelta).toHaveBeenCalledTimes(2);
    expect(onTextDelta).toHaveBeenNthCalledWith(2, 'kembali.');
  });

  it('retries one no-output stream before any tool call', async () => {
    let attempt = 0;
    const languageModel = new MockLanguageModelV4({
      doStream: () => {
        attempt += 1;

        return Promise.resolve({
          stream: simulateReadableStream({
            chunks:
              attempt === 1
                ? []
                : [
                    { type: 'text-start' as const, id: 'text-1' },
                    {
                      type: 'text-delta' as const,
                      id: 'text-1',
                      delta: 'Ringkasan dokumen.',
                    },
                    { type: 'text-end' as const, id: 'text-1' },
                    {
                      type: 'finish' as const,
                      finishReason: {
                        unified: 'stop' as const,
                        raw: undefined,
                      },
                      logprobs: undefined,
                      usage: {
                        inputTokens: {
                          total: 3,
                          noCache: 3,
                          cacheRead: undefined,
                          cacheWrite: undefined,
                        },
                        outputTokens: {
                          total: 4,
                          text: 4,
                          reasoning: undefined,
                        },
                      },
                    },
                  ],
          }),
        });
      },
    });

    const tracing = tracingSpy();
    const gateway = model(
      { BACKEND_MODEL_API_KEY: 'test-key' },
      tracing.observability,
    );

    Object.defineProperty(gateway, 'languageModel', { value: languageModel });
    const onTextDelta = jest.fn<(delta: string) => void>();

    await expect(
      gateway.generate({
        userId: 'user-1',
        conversationId: 'conversation-1',
        runId: 'run-1',
        messages: [{ role: 'user', content: 'Ringkas dokumen.' }],
        onTextDelta,
      }),
    ).resolves.toEqual({
      text: 'Ringkasan dokumen.',
      usage: { inputTokens: 3, outputTokens: 4 },
    });
    expect(attempt).toBe(2);
    expect(tracing.calls.map(({ attempt: value }) => value)).toEqual([1, 2]);
    expect(tracing.calls[1]).toMatchObject({
      userId: 'user-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
    });
    expect(tracing.updates.at(-1)).toMatchObject({
      output: 'Ringkasan dokumen.',
      inputTokens: 3,
      outputTokens: 4,
    });
    expect(onTextDelta).toHaveBeenCalledTimes(1);
    expect(onTextDelta).toHaveBeenCalledWith('Ringkasan dokumen.');
  });
  it('retries a retryable API error once and records sanitized diagnostics', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                error_type: 'provider_timeout',
                message: 'provider said: do not expose this whole body',
                api_key: 'secret-key',
              },
            }),
            {
              status: 503,
              headers: {
                'Content-Type': 'application/json',
                'Retry-After': '0',
              },
            },
          ),
        ),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'response-2',
              choices: [
                {
                  message: { role: 'assistant', content: 'Recovered.' },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 2,
                completion_tokens: 1,
                total_tokens: 3,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      );

    const tracing = tracingSpy();

    await expect(
      model(
        { BACKEND_MODEL_API_KEY: 'test-key' },
        tracing.observability,
      ).generate({ messages: [{ role: 'user', content: 'Hello' }] }),
    ).resolves.toEqual({
      text: 'Recovered.',
      usage: { inputTokens: 2, outputTokens: 1 },
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(tracing.calls.map(({ attempt: value }) => value)).toEqual([1, 2]);
    const failedUpdate = tracing.updates.find((update) => update.error);
    expect(failedUpdate?.error).toMatchObject({
      name: 'AI_APICallError',
      statusCode: 503,
      retryable: true,
      providerErrorType: 'provider_timeout',
    });
    const diagnostic = failedUpdate?.error;
    expect(JSON.stringify(diagnostic)).not.toContain('secret-key');
    expect(JSON.stringify(diagnostic)).not.toContain('api_key');
    expect(diagnostic?.providerMessage?.length).toBeLessThanOrEqual(12_000);
  });

  it('does not retry a non-retryable API error', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            error_type: 'invalid_request',
            message: 'sensitive details',
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const tracing = tracingSpy();

    await expect(
      model(
        { BACKEND_MODEL_API_KEY: 'test-key' },
        tracing.observability,
      ).generate({ messages: [{ role: 'user', content: 'Hello' }] }),
    ).rejects.toBeInstanceOf(ModelGatewayError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(tracing.calls.map(({ attempt: value }) => value)).toEqual([1]);
  });

  it.each([
    [
      'text delta',
      { type: 'text-delta', id: 'text-1', delta: 'Already sent.' },
    ],
    [
      'tool call',
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'lookup',
        input: '{}',
      },
    ],
  ] as const)(
    'does not retry a retryable stream error after a %s',
    async (_label, emitted) => {
      const apiError = new APICallError({
        message: 'stream failed',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        requestBodyValues: {},
        statusCode: 503,
        responseBody: JSON.stringify({
          error: {
            error_type: 'upstream_unavailable',
            message: 'secret provider detail',
          },
        }),
        isRetryable: true,
      });

      const languageModel = new MockLanguageModelV4({
        doStream: () =>
          Promise.resolve({
            stream: simulateReadableStream({
              chunks: [emitted, { type: 'error' as const, error: apiError }],
            }),
          }),
      });

      const tracing = tracingSpy();
      const onTextDelta = jest.fn();
      const onToolCall = jest.fn();
      const gateway = model(
        { BACKEND_MODEL_API_KEY: 'test-key' },
        tracing.observability,
      );

      Object.defineProperty(gateway, 'languageModel', { value: languageModel });

      await expect(
        gateway.generate({
          messages: [{ role: 'user', content: 'Hello' }],
          onTextDelta,
          onToolCall,
        }),
      ).rejects.toBeInstanceOf(ModelGatewayError);
      expect(tracing.calls).toHaveLength(1);

      if (emitted.type === 'text-delta') {
        expect(onTextDelta).toHaveBeenCalledWith('Already sent.');
      } else {
        expect(onToolCall).toHaveBeenCalledWith('lookup');
      }
    },
  );

  it('retries transient failures across attempts and exposes sanitized diagnostics', async () => {
    // A Response body can only be read once, so each attempt needs its own.
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              error_type: 'rate_limited',
              message: 'slow down',
              api_key: 'secret-key',
            },
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const tracing = tracingSpy();

    const error = await model(
      { BACKEND_MODEL_API_KEY: 'test-key' },
      tracing.observability,
    )
      .generate({ messages: [{ role: 'user', content: 'Halo' }] })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ModelGatewayError);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(tracing.calls.map(({ attempt }) => attempt)).toEqual([1, 2, 3]);

    const diagnostics = (error as ModelGatewayError).diagnostics;
    expect(diagnostics).toMatchObject({
      errorName: 'AI_APICallError',
      attempts: 3,
      statusCode: 503,
      retryable: true,
      providerErrorType: 'rate_limited',
    });
    expect(JSON.stringify(diagnostics)).not.toContain('secret-key');
  });

  it('retries a rate limit using the provider wait signal in the body', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { error_type: 'rate_limited', retry_after_seconds: 0.001 },
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'response-2',
            choices: [
              {
                message: { role: 'assistant', content: 'Recovered.' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    await expect(
      model({ BACKEND_MODEL_API_KEY: 'test-key' }).generate({
        messages: [{ role: 'user', content: 'Halo' }],
      }),
    ).resolves.toEqual({
      text: 'Recovered.',
      usage: { inputTokens: 2, outputTokens: 1 },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  const streamUsage = {
    inputTokens: {
      total: 3,
      noCache: 3,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 4, text: 4, reasoning: undefined },
  };

  function retryableStreamError(): APICallError {
    return new APICallError({
      message: 'stream failed',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      requestBodyValues: {},
      statusCode: 429,
      responseBody: JSON.stringify({
        error: { error_type: 'rate_limited', message: 'slow down' },
      }),
      isRetryable: true,
    });
  }

  function toolCallStream(toolName: string) {
    return {
      stream: simulateReadableStream({
        chunks: [
          {
            type: 'tool-call' as const,
            toolCallId: 'call-1',
            toolName,
            input: '{}',
          },
          {
            type: 'finish' as const,
            finishReason: { unified: 'tool-calls' as const, raw: undefined },
            logprobs: undefined,
            usage: streamUsage,
          },
        ],
      }),
    };
  }

  function errorStream(error: unknown) {
    return {
      stream: simulateReadableStream({
        chunks: [{ type: 'error' as const, error }],
      }),
    };
  }

  function textStream(text: string) {
    return {
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start' as const, id: 'text-1' },
          { type: 'text-delta' as const, id: 'text-1', delta: text },
          { type: 'text-end' as const, id: 'text-1' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: undefined },
            logprobs: undefined,
            usage: streamUsage,
          },
        ],
      }),
    };
  }

  function fakeTools() {
    const schema = {
      type: 'object' as const,
      properties: {},
      additionalProperties: false,
    };

    return {
      search_documents: tool({
        description: 'Search documents',
        inputSchema: jsonSchema(schema),
        execute: () => Promise.resolve('ok'),
      }),
      create_task: tool({
        description: 'Create task',
        inputSchema: jsonSchema(schema),
        execute: () => Promise.resolve('ok'),
      }),
    };
  }

  it('retries after a retry-safe read-only tool call', async () => {
    let calls = 0;
    const languageModel = new MockLanguageModelV4({
      doStream: () => {
        calls += 1;
        if (calls === 1)
          return Promise.resolve(toolCallStream('search_documents'));
        if (calls === 2)
          return Promise.resolve(errorStream(retryableStreamError()));

        return Promise.resolve(textStream('Ada filenya.'));
      },
    });

    const tracing = tracingSpy();
    const gateway = model(
      { BACKEND_MODEL_API_KEY: 'test-key' },
      tracing.observability,
    );

    Object.defineProperty(gateway, 'languageModel', { value: languageModel });

    await expect(
      gateway.generate({
        messages: [{ role: 'user', content: 'Ada file?' }],
        tools: fakeTools(),
        onTextDelta: jest.fn(),
        onToolCall: jest.fn(),
        retrySafeTools: new Set(['search_documents']),
      }),
    ).resolves.toMatchObject({ text: 'Ada filenya.' });
    expect(tracing.calls.map(({ attempt }) => attempt)).toEqual([1, 2]);
  });

  it('does not retry after a mutating tool call', async () => {
    let calls = 0;
    const languageModel = new MockLanguageModelV4({
      doStream: () => {
        calls += 1;
        if (calls === 1) return Promise.resolve(toolCallStream('create_task'));

        return Promise.resolve(errorStream(retryableStreamError()));
      },
    });

    const tracing = tracingSpy();
    const gateway = model(
      { BACKEND_MODEL_API_KEY: 'test-key' },
      tracing.observability,
    );

    Object.defineProperty(gateway, 'languageModel', { value: languageModel });

    await expect(
      gateway.generate({
        messages: [{ role: 'user', content: 'Buat tugas.' }],
        tools: fakeTools(),
        onTextDelta: jest.fn(),
        onToolCall: jest.fn(),
        retrySafeTools: new Set(['search_documents']),
      }),
    ).rejects.toBeInstanceOf(ModelGatewayError);
    expect(tracing.calls).toHaveLength(1);
  });

  it('hides provider failure details behind a stable gateway error', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: 'secret provider response' } }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const error = await model({ BACKEND_MODEL_API_KEY: 'test-key' })
      .generate({ messages: [{ role: 'user', content: 'Halo' }] })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ModelGatewayError);
    expect((error as Error).message).toBe(
      'The assistant model could not be reached.',
    );
    expect((error as Error).message).not.toContain('secret provider response');
  });
});
