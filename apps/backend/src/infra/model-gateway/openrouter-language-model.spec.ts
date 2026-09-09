import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { simulateReadableStream } from 'ai';
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
    expect(gateway.model).toBe('z-ai/glm-5.3-flash');
  });

  it('rejects missing API keys without tracing or calling the provider', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch');
    const tracing = tracingSpy();

    await expect(
      model({}, tracing.observability).generate({
        messages: [{ role: 'user', content: 'Halo' }],
      }),
    ).rejects.toThrow(
      'Model assistant belum dikonfigurasi. Tetapkan BACKEND_MODEL_API_KEY.',
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
        model: 'z-ai/glm-5.3-flash',
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
      'Model assistant tidak dapat dihubungi.',
    );
    expect((error as Error).message).not.toContain('secret provider response');
  });
});
