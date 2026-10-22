import { Logger } from '@nestjs/common';
import { BILLING_FILE_BYTES } from '../billing-policy';

export const MAX_MEDIA_BYTES = BILLING_FILE_BYTES;

export class MediaDownloadLimitError extends Error {
  constructor() {
    super('Ukuran file maksimal 100 MB. Perkecil file lalu unggah kembali.');
    this.name = 'MediaDownloadLimitError';
  }
}

export async function readMediaResponse(response: Response): Promise<Buffer> {
  const declared = Number(response.headers?.get('content-length'));

  if (Number.isFinite(declared) && declared > MAX_MEDIA_BYTES) {
    await response.body?.cancel().catch(() => {
      Logger.warn(
        'Media stream cancellation failed during bounded cleanup; no retry will be attempted.',
        'MediaDownload',
      );
    });
    throw new MediaDownloadLimitError();
  }

  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_MEDIA_BYTES) throw new MediaDownloadLimitError();

    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;

  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) return Buffer.concat(chunks, size);
      size += result.value.byteLength;
      if (size > MAX_MEDIA_BYTES) throw new MediaDownloadLimitError();
      chunks.push(Buffer.from(result.value));
    }
  } finally {
    await reader.cancel().catch(() => {
      Logger.warn(
        'Media stream cancellation failed during bounded cleanup; no retry will be attempted.',
        'MediaDownload',
      );
    });
    reader.releaseLock();
  }
}
