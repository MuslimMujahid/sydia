import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
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
