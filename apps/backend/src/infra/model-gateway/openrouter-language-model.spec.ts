import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { APICallError, jsonSchema, simulateReadableStream, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type {
  ToolStepAcknowledger,
  ToolStepExecution,
} from './model-gateway.types';
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

  it('withholds memory review content from traces while recording usage and giving the provider its evidence', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'masked-policy',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Synthetic private verdict.',
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const tracing = tracingSpy();
    const gateway = model(
      { BACKEND_MODEL_API_KEY: 'test-key' },
      tracing.observability,
    );

    const result = await gateway.generate({
      messages: [{ role: 'user', content: 'Synthetic private evidence.' }],
      traceContent: false,
      traceName: 'memory-policy.evidence.sydia-admission-v1',
    });

    expect(result.text).toBe('Synthetic private verdict.');
    expect(tracing.calls[0]).toMatchObject({
      name: 'memory-policy.evidence.sydia-admission-v1',
      messages: [],
    });
    expect(tracing.updates).toContainEqual({
      output: undefined,
      inputTokens: 10,
      outputTokens: 5,
      costUsd: undefined,
    });
    const body = fetch.mock.calls[0]![1]?.body;
    expect(body).toEqual(
      expect.stringContaining('Synthetic private evidence.'),
    );
    expect(JSON.stringify(tracing)).not.toContain('Synthetic private');
  });

  it('sends a strict schema for policy review and rejects malformed structured output', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'policy-response',
            choices: [
              {
                message: { role: 'assistant', content: '{"allowed":true}' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 20,
              completion_tokens: 5,
              total_tokens: 25,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const schema = {
      type: 'object' as const,
      properties: { allowed: { type: 'boolean' as const } },
      required: ['allowed'],
      additionalProperties: false,
    };

    const gateway = model({ BACKEND_MODEL_API_KEY: 'test-key' });
    expect(
      (
        await gateway.generate({
          messages: [{ role: 'user', content: 'Review the synthetic fact.' }],
          outputSchema: schema,
        })
      ).text,
    ).toBe('{"allowed":true}');
    const body = fetch.mock.calls[0]![1]?.body;
    if (typeof body !== 'string')
      throw new Error('Expected a JSON request body');
    const requestBody = JSON.parse(body) as {
      response_format: {
        type: string;
        json_schema: { strict: boolean; schema: unknown };
      };
    };

    expect(requestBody.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { strict: true, schema },
    });
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'invalid-policy',
          choices: [
            {
              message: { role: 'assistant', content: 'not JSON' },
              finish_reason: 'stop',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(
      gateway.generate({
        messages: [{ role: 'user', content: 'Review.' }],
        outputSchema: schema,
      }),
    ).rejects.toThrow();
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

  it('drops planning narration emitted in a step that calls a tool', async () => {
    // The model narrates its plan in the same step as a tool call, in its own
    // working language. That text is not an answer and must never reach the
    // user, either as a streamed delta or as the persisted message.
    let calls = 0;
    const languageModel = new MockLanguageModelV4({
      doStream: () => {
        calls += 1;
        if (calls > 1)
          return Promise.resolve(textStream('Grup berhasil dibuat.'));

        return Promise.resolve({
          stream: simulateReadableStream({
            chunks: [
              { type: 'text-start' as const, id: 'text-1' },
              {
                type: 'text-delta' as const,
                id: 'text-1',
                delta: "I'll create the group first, ",
              },
              {
                type: 'text-delta' as const,
                id: 'text-1',
                delta: 'then save the contact into it.',
              },
              { type: 'text-end' as const, id: 'text-1' },
              {
                type: 'tool-call' as const,
                toolCallId: 'call-1',
                toolName: 'create_task',
                input: '{}',
              },
              {
                type: 'finish' as const,
                finishReason: {
                  unified: 'tool-calls' as const,
                  raw: undefined,
                },
                logprobs: undefined,
                usage: streamUsage,
              },
            ],
          }),
        });
      },
    });

    const gateway = model({ BACKEND_MODEL_API_KEY: 'test-key' });
    Object.defineProperty(gateway, 'languageModel', { value: languageModel });
    const onTextDelta = jest.fn<(delta: string) => void>();

    await expect(
      gateway.generate({
        messages: [{ role: 'user', content: 'Simpan kontak.' }],
        tools: fakeTools(),
        onTextDelta,
        onToolCall: jest.fn(),
        retrySafeTools: new Set(['create_task']),
      }),
    ).resolves.toMatchObject({ text: 'Grup berhasil dibuat.' });

    const streamed = onTextDelta.mock.calls.map(([delta]) => delta).join('');
    expect(streamed).toBe('Grup berhasil dibuat.');
    expect(streamed).not.toContain('create the group');
  });

  it('still streams text live when the request has no tools', async () => {
    const languageModel = new MockLanguageModelV4({
      doStream: () =>
        Promise.resolve({
          stream: simulateReadableStream({
            chunks: [
              { type: 'text-start' as const, id: 'text-1' },
              { type: 'text-delta' as const, id: 'text-1', delta: 'Halo ' },
              { type: 'text-delta' as const, id: 'text-1', delta: 'kembali.' },
              { type: 'text-end' as const, id: 'text-1' },
              {
                type: 'finish' as const,
                finishReason: { unified: 'stop' as const, raw: undefined },
                logprobs: undefined,
                usage: streamUsage,
              },
            ],
          }),
        }),
    });

    const gateway = model({ BACKEND_MODEL_API_KEY: 'test-key' });
    Object.defineProperty(gateway, 'languageModel', { value: languageModel });
    const deltas: string[] = [];

    await gateway.generate({
      messages: [{ role: 'user', content: 'Halo' }],
      onTextDelta: (delta) => deltas.push(delta),
    });

    // Without tools nothing can be narration, so deltas stay incremental.
    expect(deltas).toEqual(['Halo ', 'kembali.']);
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

  function toolCallChunk(toolCallId: string, toolName: string, input: unknown) {
    return {
      type: 'tool-call' as const,
      toolCallId,
      toolName,
      input: JSON.stringify(input),
    };
  }

  function toolCallsFinish() {
    return {
      type: 'finish' as const,
      finishReason: { unified: 'tool-calls' as const, raw: undefined },
      logprobs: undefined,
      usage: streamUsage,
    };
  }

  function toolCallResult(
    content: {
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      input: string;
    }[],
    finishReason: 'stop' | 'tool-calls',
  ) {
    return {
      content,
      finishReason: { unified: finishReason, raw: undefined },
      usage: streamUsage,
      warnings: [],
    };
  }

  /**
   * Tools for the terminal-step cases. `create_task` resolves last on purpose:
   * a step with siblings proves the acknowledgement waits for every call and
   * still reports them in call order.
   */
  function terminalTools(overrides: Record<string, unknown> = {}) {
    const schema = {
      type: 'object' as const,
      properties: { title: { type: 'string' as const } },
      additionalProperties: false,
    };

    return {
      create_task: tool({
        description: 'Create task',
        inputSchema: jsonSchema(schema),
        execute: () =>
          new Promise<string>((resolve) => {
            setTimeout(
              () =>
                resolve(
                  JSON.stringify({
                    objectType: 'task',
                    object: { title: 'Kirim laporan', dueAt: null },
                  }),
                ),
              25,
            );
          }),
      }),
      save_memory: tool({
        description: 'Save memory',
        inputSchema: jsonSchema(schema),
        execute: () =>
          Promise.resolve(JSON.stringify({ memory: { content: 'Suka kopi' } })),
      }),
      search_documents: tool({
        description: 'Search documents',
        inputSchema: jsonSchema(schema),
        execute: () => Promise.resolve('ok'),
      }),
      ...overrides,
    };
  }

  /**
   * Stands in for the domain acknowledger: it speaks only for the tools it
   * knows and only when every call completes the turn, which is the exact
   * distinction the gateway must preserve — text ends the loop, `null` hands
   * the step back to the model. It also records what it was shown, so the
   * payload of a completed step is observable.
   */
  function stepAcknowledger() {
    const seen: ToolStepExecution[][] = [];

    const acknowledge: ToolStepAcknowledger = (executions) => {
      seen.push([...executions]);

      const labels: string[] = [];

      for (const execution of executions) {
        const argumentsValue = execution.arguments as {
          completeTurn?: boolean;
        } | null;

        if (argumentsValue?.completeTurn === false) return null;

        if (execution.toolName === 'create_task') {
          const title = (
            execution.result as { object?: { title?: string } } | null
          )?.object?.title;

          if (typeof title !== 'string' || !title) return null;

          labels.push(`Created task “${title}”.`);
          continue;
        }

        if (execution.toolName === 'save_memory') {
          const content = (
            execution.result as { memory?: { content?: string } } | null
          )?.memory?.content;

          if (typeof content !== 'string' || !content) return null;

          labels.push(`Saved memory: “${content}”.`);
          continue;
        }

        return null;
      }

      return labels.join(' ');
    };

    return { acknowledge, seen };
  }

  /** Reads the task title out of a tool result without asserting its shape. */
  function taskTitle(result: unknown): string {
    if (!result || typeof result !== 'object' || !('object' in result)) {
      throw new Error('The tool result carried no object.');
    }

    const { object } = result;

    if (!object || typeof object !== 'object' || !('title' in object)) {
      throw new Error('The tool result carried no title.');
    }

    const { title } = object;

    if (typeof title !== 'string') {
      throw new Error('The tool result title was not a string.');
    }

    return title;
  }

  /** Whether a call declared that another tool call must still run. */
  function declinesTurn(argumentsValue: unknown): boolean {
    if (
      !argumentsValue ||
      typeof argumentsValue !== 'object' ||
      !('completeTurn' in argumentsValue)
    ) {
      return false;
    }

    return argumentsValue.completeTurn === false;
  }

  function gatewayFor(languageModel: MockLanguageModelV4) {
    const gateway = model({ BACKEND_MODEL_API_KEY: 'test-key' });

    Object.defineProperty(gateway, 'languageModel', { value: languageModel });

    return gateway;
  }

  it('ends the turn after one terminal tool call instead of calling the model again', async () => {
    let calls = 0;
    const languageModel = new MockLanguageModelV4({
      doStream: () => {
        calls += 1;

        return Promise.resolve({
          stream: simulateReadableStream({
            chunks: [
              { type: 'text-start' as const, id: 'text-1' },
              {
                type: 'text-delta' as const,
                id: 'text-1',
                delta: 'I will create the task first.',
              },
              { type: 'text-end' as const, id: 'text-1' },
              toolCallChunk('call-1', 'create_task', {
                title: 'Kirim laporan',
              }),
              toolCallsFinish(),
            ],
          }),
        });
      },
    });

    const { acknowledge, seen } = stepAcknowledger();
    const onTextDelta = jest.fn<(delta: string) => void>();

    const result = await gatewayFor(languageModel).generate({
      messages: [{ role: 'user', content: 'Buat tugas.' }],
      tools: terminalTools(),
      onTextDelta,
      onToolCall: jest.fn(),
      acknowledgeTerminalStep: acknowledge,
    });

    // The tools already answered, so the turn ends with their acknowledgement
    // and no second model call is paid for.
    expect(result.text).toBe('Created task “Kirim laporan”.');
    expect(calls).toBe(1);
    expect(languageModel.doStreamCalls).toHaveLength(1);

    // Neither the planning narration nor a restatement reaches the user; the
    // acknowledgement is streamed exactly once.
    expect(onTextDelta).toHaveBeenCalledTimes(1);
    expect(onTextDelta).toHaveBeenCalledWith('Created task “Kirim laporan”.');

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([
      {
        toolCallId: 'call-1',
        toolName: 'create_task',
        arguments: { title: 'Kirim laporan' },
        // The tool output crossed the SDK boundary as a string and is decoded
        // before the domain layer sees it.
        result: {
          objectType: 'task',
          object: { title: 'Kirim laporan', dueAt: null },
        },
      },
    ]);
  });

  it('confirms earlier steps too when a turn takes several tool steps', async () => {
    let calls = 0;
    const languageModel = new MockLanguageModelV4({
      doStream: () => {
        calls += 1;

        return Promise.resolve({
          stream: simulateReadableStream({
            chunks:
              calls === 1
                ? [
                    toolCallChunk('call-1', 'create_task', {
                      title: 'Tugas A',
                      // The model knows a second task must follow, so this call
                      // does not finish the turn.
                      completeTurn: false,
                    }),
                    toolCallsFinish(),
                  ]
                : [
                    toolCallChunk('call-2', 'create_task', {
                      title: 'Tugas B',
                    }),
                    toolCallsFinish(),
                  ],
          }),
        });
      },
    });

    // The first step asks for a follow-up, so the loop runs on; the second step
    // finishes the request and must confirm BOTH tasks, not just its own.
    const calls2: ToolStepExecution[][] = [];

    const acknowledge: ToolStepAcknowledger = (executions, decidedBy) => {
      calls2.push([...executions]);

      const labels = executions.map(
        (execution) => `Created task “${taskTitle(execution.result)}”.`,
      );

      return decidedBy.some((execution) => declinesTurn(execution.arguments))
        ? null
        : labels.join(' ');
    };

    const result = await gatewayFor(languageModel).generate({
      messages: [{ role: 'user', content: 'Buat dua tugas.' }],
      tools: {
        create_task: tool({
          description: 'Create task',
          inputSchema: jsonSchema({
            type: 'object' as const,
            properties: { title: { type: 'string' as const } },
            additionalProperties: false,
          }),
          execute: (input: unknown) =>
            Promise.resolve(
              JSON.stringify({
                objectType: 'task',
                object: { title: taskTitle({ object: input }), dueAt: null },
              }),
            ),
        }),
      },
      onTextDelta: jest.fn(),
      onToolCall: jest.fn(),
      acknowledgeTerminalStep: acknowledge,
    });

    expect(result.text).toBe('Created task “Tugas A”. Created task “Tugas B”.');
    expect(calls).toBe(2);

    // The acknowledger is shown the accumulated turn, and the deciding step
    // holds only the second call.
    expect(calls2).toEqual([
      [expect.objectContaining({ toolCallId: 'call-1' })],
      [
        expect.objectContaining({ toolCallId: 'call-1' }),
        expect.objectContaining({ toolCallId: 'call-2' }),
      ],
    ]);
  });

  it('waits for every sibling call and acknowledges them in call order', async () => {
    const languageModel = new MockLanguageModelV4({
      doStream: () =>
        Promise.resolve({
          stream: simulateReadableStream({
            chunks: [
              toolCallChunk('call-1', 'create_task', {
                title: 'Kirim laporan',
              }),
              toolCallChunk('call-2', 'save_memory', { content: 'Suka kopi' }),
              toolCallsFinish(),
            ],
          }),
        }),
    });

    const { acknowledge, seen } = stepAcknowledger();
    const onTextDelta = jest.fn<(delta: string) => void>();

    const result = await gatewayFor(languageModel).generate({
      messages: [{ role: 'user', content: 'Buat tugas dan simpan memori.' }],
      tools: terminalTools(),
      onTextDelta,
      onToolCall: jest.fn(),
      acknowledgeTerminalStep: acknowledge,
    });

    // The slow first call finishes after its sibling, yet the acknowledgement
    // describes both calls, in the order the model asked for them.
    expect(result.text).toBe(
      'Created task “Kirim laporan”. Saved memory: “Suka kopi”.',
    );
    expect(languageModel.doStreamCalls).toHaveLength(1);
    expect(onTextDelta).toHaveBeenCalledTimes(1);
    expect(onTextDelta).toHaveBeenCalledWith(
      'Created task “Kirim laporan”. Saved memory: “Suka kopi”.',
    );

    expect(seen.flat().map(({ toolCallId }) => toolCallId)).toEqual([
      'call-1',
      'call-2',
    ]);
  });

  it('continues to the model when a call declines to complete the turn', async () => {
    let calls = 0;
    const languageModel = new MockLanguageModelV4({
      doStream: () => {
        calls += 1;

        return calls === 1
          ? Promise.resolve({
              stream: simulateReadableStream({
                chunks: [
                  toolCallChunk('call-1', 'create_task', {
                    title: 'Kirim laporan',
                    completeTurn: false,
                  }),
                  toolCallsFinish(),
                ],
              }),
            })
          : Promise.resolve(textStream('Tugas dan pengingatnya sudah dibuat.'));
      },
    });

    const { acknowledge, seen } = stepAcknowledger();
    const onTextDelta = jest.fn<(delta: string) => void>();

    const result = await gatewayFor(languageModel).generate({
      messages: [{ role: 'user', content: 'Buat tugas lalu pengingatnya.' }],
      tools: terminalTools(),
      onTextDelta,
      onToolCall: jest.fn(),
      acknowledgeTerminalStep: acknowledge,
    });

    expect(result.text).toBe('Tugas dan pengingatnya sudah dibuat.');
    expect(languageModel.doStreamCalls).toHaveLength(2);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0]?.arguments).toEqual({
      title: 'Kirim laporan',
      completeTurn: false,
    });
    expect(onTextDelta.mock.calls.map(([delta]) => delta)).toEqual([
      'Tugas dan pengingatnya sudah dibuat.',
    ]);
  });

  it('continues to the model when a sibling call is not terminal', async () => {
    let calls = 0;
    const languageModel = new MockLanguageModelV4({
      doStream: () => {
        calls += 1;

        return calls === 1
          ? Promise.resolve({
              stream: simulateReadableStream({
                chunks: [
                  toolCallChunk('call-1', 'create_task', {
                    title: 'Kirim laporan',
                  }),
                  toolCallChunk('call-2', 'search_documents', {
                    query: 'laporan',
                  }),
                  toolCallsFinish(),
                ],
              }),
            })
          : Promise.resolve(textStream('Ada filenya.'));
      },
    });

    const { acknowledge, seen } = stepAcknowledger();
    const onTextDelta = jest.fn<(delta: string) => void>();

    const result = await gatewayFor(languageModel).generate({
      messages: [{ role: 'user', content: 'Ada file laporannya?' }],
      tools: terminalTools(),
      onTextDelta,
      onToolCall: jest.fn(),
      acknowledgeTerminalStep: acknowledge,
    });

    expect(result.text).toBe('Ada filenya.');
    expect(languageModel.doStreamCalls).toHaveLength(2);
    expect(seen[0]?.map(({ toolName }) => toolName)).toEqual([
      'create_task',
      'search_documents',
    ]);
    expect(onTextDelta).toHaveBeenCalledTimes(1);
    expect(onTextDelta).toHaveBeenCalledWith('Ada filenya.');
  });

  it('continues to the model when a call in the step failed', async () => {
    let calls = 0;
    const languageModel = new MockLanguageModelV4({
      doStream: () => {
        calls += 1;

        return calls === 1
          ? Promise.resolve({
              stream: simulateReadableStream({
                chunks: [
                  toolCallChunk('call-1', 'create_task', {
                    title: 'Kirim laporan',
                  }),
                  toolCallsFinish(),
                ],
              }),
            })
          : Promise.resolve(textStream('Tugasnya belum bisa disimpan.'));
      },
    });

    const { acknowledge, seen } = stepAcknowledger();
    const onTextDelta = jest.fn<(delta: string) => void>();

    const result = await gatewayFor(languageModel).generate({
      messages: [{ role: 'user', content: 'Buat tugas.' }],
      tools: terminalTools({
        create_task: tool({
          description: 'Create task',
          inputSchema: jsonSchema({ type: 'object' as const }),
          execute: (): Promise<string> =>
            Promise.reject(new Error('Task store unavailable.')),
        }),
      }),
      onTextDelta,
      onToolCall: jest.fn(),
      acknowledgeTerminalStep: acknowledge,
    });

    // A failed call has no result to describe, so the step is not terminal and
    // the model answers instead of a confirmation nobody produced.
    expect(result.text).toBe('Tugasnya belum bisa disimpan.');
    expect(languageModel.doStreamCalls).toHaveLength(2);
    expect(seen).toEqual([]);
    expect(onTextDelta).toHaveBeenCalledTimes(1);
  });

  it('returns the acknowledgement for a non-streamed terminal step', async () => {
    const languageModel = new MockLanguageModelV4({
      doGenerate: () =>
        Promise.resolve(
          toolCallResult(
            [
              {
                type: 'tool-call' as const,
                toolCallId: 'call-1',
                toolName: 'create_task',
                input: JSON.stringify({ title: 'Kirim laporan' }),
              },
            ],
            'tool-calls',
          ),
        ),
    });

    const { acknowledge, seen } = stepAcknowledger();

    const result = await gatewayFor(languageModel).generate({
      messages: [{ role: 'user', content: 'Buat tugas.' }],
      tools: terminalTools(),
      acknowledgeTerminalStep: acknowledge,
    });

    expect(result).toEqual({
      text: 'Created task “Kirim laporan”.',
      usage: { inputTokens: 3, outputTokens: 4 },
    });
    expect(languageModel.doGenerateCalls).toHaveLength(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0]?.result).toEqual({
      objectType: 'task',
      object: { title: 'Kirim laporan', dueAt: null },
    });
  });

  it('leaves generation untouched when the request supplies no acknowledger', async () => {
    let calls = 0;
    const languageModel = new MockLanguageModelV4({
      doStream: () => {
        calls += 1;

        return Promise.resolve(
          calls === 1
            ? toolCallStream('create_task')
            : textStream('Ada filenya.'),
        );
      },
    });

    const result = await gatewayFor(languageModel).generate({
      messages: [{ role: 'user', content: 'Buat tugas.' }],
      tools: terminalTools(),
      onTextDelta: jest.fn(),
      onToolCall: jest.fn(),
    });

    // Without an acknowledger the step continues exactly as before, so the
    // model still gets the last word.
    expect(result.text).toBe('Ada filenya.');
    expect(languageModel.doStreamCalls).toHaveLength(2);
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
