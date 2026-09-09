import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import {
  ModelGatewayError,
  OpenRouterLanguageModel,
} from './openrouter-language-model';

function model(values: Record<string, string> = {}) {
  return new OpenRouterLanguageModel(new ConfigService(values));
}

describe('OpenRouterLanguageModel', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the OpenRouter model defaults', () => {
    const gateway = model();

    expect(gateway.provider).toBe('openrouter');
    expect(gateway.model).toBe('z-ai/glm-5.3-flash');
  });

  it('rejects missing API keys without calling the provider', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch');

    await expect(
      model().generate({ messages: [{ role: 'user', content: 'Halo' }] }),
    ).rejects.toThrow(
      'Model assistant belum dikonfigurasi. Tetapkan BACKEND_MODEL_API_KEY.',
    );

    expect(fetch).not.toHaveBeenCalled();
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

    const gateway = model({ BACKEND_MODEL_API_KEY: 'test-key' });
    Object.defineProperty(gateway, 'languageModel', { value: languageModel });
    const onTextDelta = jest.fn<(delta: string) => void>();

    await expect(
      gateway.generate({
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
