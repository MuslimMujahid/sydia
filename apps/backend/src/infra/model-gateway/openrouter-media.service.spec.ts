import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { OpenRouterMediaService } from './openrouter-media.service';


describe('OpenRouterMediaService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends audio to the transcription endpoint with the Whisper model', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ text: 'Halo kembali.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      new OpenRouterMediaService(
        new ConfigService({
          BACKEND_MODEL_API_KEY: 'test-key',
          BACKEND_MODEL_BASE_URL: 'https://router.example/v1',
        }),
      ).transcribe(Buffer.from('audio'), 'clip.webm', 'audio/webm'),
    ).resolves.toBe('Halo kembali.');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://router.example/v1/audio/transcriptions');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Authorization: 'Bearer test-key' });
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('model')).toBe(
      'openai/whisper-large-v3-turbo',
    );
  });

  it('honors a custom BACKEND_STT_MODEL value', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ text: 'Halo kembali.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await new OpenRouterMediaService(
      new ConfigService({
        BACKEND_MODEL_API_KEY: 'test-key',
        BACKEND_STT_MODEL: 'openai/whisper-large-v3',
      }),
    ).transcribe(Buffer.from('audio'), 'clip.webm', 'audio/webm');

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://openrouter.ai/api/v1/audio/transcriptions');
    expect((init?.body as FormData).get('model')).toBe(
      'openai/whisper-large-v3',
    );
  });
});
