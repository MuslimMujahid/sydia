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

  it('describes an image with the configured vision model and data URL', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'A sunset.' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const image = Buffer.from('image-bytes');

    await expect(
      new OpenRouterMediaService(
        new ConfigService({
          BACKEND_MODEL_API_KEY: 'test-key',
          BACKEND_MODEL_BASE_URL: 'https://router.example/v1',
          BACKEND_VISION_MODEL: 'google/gemini-2.5-flash',
        }),
      ).describeImage(image, 'image/png'),
    ).resolves.toBe('A sunset.');

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://router.example/v1/chat/completions');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          content: [
            {},
            {
              image_url: {
                url: `data:image/png;base64,${image.toString('base64')}`,
              },
            },
          ],
        },
      ],
    });
  });

  it('returns null without an API key and does not fetch', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch');

    await expect(
      new OpenRouterMediaService(new ConfigService()).describeImage(
        Buffer.from('image'),
        'image/png',
      ),
    ).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws when the image provider responds with an error', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('unavailable', { status: 503 }));

    await expect(
      new OpenRouterMediaService(
        new ConfigService({ BACKEND_MODEL_API_KEY: 'test-key' }),
      ).describeImage(Buffer.from('image'), 'image/png'),
    ).rejects.toThrow('Image provider returned 503');
  });

  it('throws when the image provider payload has no content', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: {} }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      new OpenRouterMediaService(
        new ConfigService({ BACKEND_MODEL_API_KEY: 'test-key' }),
      ).describeImage(Buffer.from('image'), 'image/png'),
    ).rejects.toThrow('The image model returned an invalid response.');
  });
});
