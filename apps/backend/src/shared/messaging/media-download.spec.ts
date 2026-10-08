import { describe, expect, jest, test } from '@jest/globals';
import {
  MAX_MEDIA_BYTES,
  MediaDownloadLimitError,
  readMediaResponse,
} from './media-download';

describe('bounded connector media downloads', () => {
  test('rejects the announced oversized body without consuming it', async () => {
    const cancel = jest.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancel();
        },
      }),
      { headers: { 'content-length': String(MAX_MEDIA_BYTES + 1) } },
    );

    await expect(readMediaResponse(response)).rejects.toBeInstanceOf(
      MediaDownloadLimitError,
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test.each([undefined, '1'])(
    'bounds actual streamed bytes with announced size %p',
    async (declared) => {
      const cancel = jest.fn();
      let chunks = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          chunks++;
          controller.enqueue(new Uint8Array(1024 * 1024));
        },
        cancel() {
          cancel();
        },
      });

      const response = new Response(stream, {
        headers: declared ? { 'content-length': declared } : {},
      });

      await expect(readMediaResponse(response)).rejects.toBeInstanceOf(
        MediaDownloadLimitError,
      );
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(chunks).toBeLessThanOrEqual(27);
    },
  );

  test('retains bytes from an ordinary download and handles an empty body', async () => {
    await expect(
      readMediaResponse(new Response(new Uint8Array([1, 2, 3]))),
    ).resolves.toEqual(Buffer.from([1, 2, 3]));
    await expect(readMediaResponse(new Response(null))).resolves.toEqual(
      Buffer.alloc(0),
    );
  });
});
