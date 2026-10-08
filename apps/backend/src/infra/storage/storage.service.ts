import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export class StorageReadLimitError extends Error {
  constructor() {
    super('Storage object exceeds the read limit.');
    this.name = 'StorageReadLimitError';
  }
}

@Injectable()
export class StorageService {
  private readonly bucket?: string;
  private readonly localRoot: string;
  private readonly s3?: S3Client;
  constructor(config: ConfigService) {
    const bucket = parseOptionalS3Setting(
      config.get<unknown>('BACKEND_STORAGE_BUCKET'),
      'BACKEND_STORAGE_BUCKET',
    );

    this.bucket = bucket;
    this.localRoot = config.get<string>(
      'BACKEND_STORAGE_LOCAL_ROOT',
      '.data/files',
    );

    if (this.bucket) {
      const endpoint = parseS3Endpoint(
        config.get<unknown>('BACKEND_STORAGE_ENDPOINT'),
      );

      const region =
        parseOptionalS3Setting(
          config.get<unknown>('BACKEND_STORAGE_REGION'),
          'BACKEND_STORAGE_REGION',
        ) ?? 'auto';

      const accessKeyValue = config.get<unknown>('BACKEND_STORAGE_ACCESS_KEY');
      const secretKeyValue = config.get<unknown>('BACKEND_STORAGE_SECRET_KEY');

      if (hasS3Setting(accessKeyValue) !== hasS3Setting(secretKeyValue)) {
        throw new Error(
          'BACKEND_STORAGE_ACCESS_KEY and BACKEND_STORAGE_SECRET_KEY must be provided together',
        );
      }

      const accessKey = parseOptionalS3Setting(
        accessKeyValue,
        'BACKEND_STORAGE_ACCESS_KEY',
      );

      const secretKey = parseOptionalS3Setting(
        secretKeyValue,
        'BACKEND_STORAGE_SECRET_KEY',
      );

      this.s3 = new S3Client({
        region,
        ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
        ...(accessKey && secretKey
          ? {
              credentials: {
                accessKeyId: accessKey,
                secretAccessKey: secretKey,
              },
            }
          : {}),
      });
    }
  }

  async put(key: string, value: Buffer, contentType: string): Promise<void> {
    if (this.s3 && this.bucket) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: value,
          ContentType: contentType,
        }),
      );

      return;
    }

    const path = join(this.localRoot, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, value);
  }

  async get(key: string, maxBytes?: number): Promise<Buffer> {
    if (
      maxBytes !== undefined &&
      (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    )
      throw new RangeError('Storage read limit must be a positive integer.');

    if (this.s3 && this.bucket) {
      const response = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      if (!response.Body) throw new Error('Objek penyimpanan kosong.');

      if (maxBytes === undefined)
        return Buffer.from(await response.Body.transformToByteArray());

      const reader = response.Body.transformToWebStream().getReader();
      const chunks: Buffer[] = [];
      let size = 0;

      try {
        if (
          response.ContentLength !== undefined &&
          response.ContentLength > maxBytes
        )
          throw new StorageReadLimitError();

        for (;;) {
          const result = await reader.read();
          if (result.done) return Buffer.concat(chunks, size);
          const bytes: unknown = result.value;
          if (!(bytes instanceof Uint8Array))
            throw new Error('Invalid storage response body.');
          size += bytes.byteLength;
          if (size > maxBytes) throw new StorageReadLimitError();
          chunks.push(Buffer.from(bytes));
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    }

    if (maxBytes === undefined) return readFile(join(this.localRoot, key));
    const handle = await open(join(this.localRoot, key), 'r');
    const chunks: Buffer[] = [];
    let size = 0;

    try {
      if ((await handle.stat()).size > maxBytes)
        throw new StorageReadLimitError();

      for (;;) {
        const buffer = Buffer.alloc(Math.min(64 * 1024, maxBytes - size + 1));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) return Buffer.concat(chunks, size);
        size += bytesRead;
        if (size > maxBytes) throw new StorageReadLimitError();
        chunks.push(buffer.subarray(0, bytesRead));
      }
    } finally {
      await handle.close();
    }
  }

  async delete(key: string): Promise<void> {
    if (this.s3 && this.bucket) {
      try {
        await this.s3.send(
          new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        );
      } catch (error: unknown) {
        if (!isMissingObjectError(error)) throw error;
      }

      return;
    }

    await rm(join(this.localRoot, key), { force: true });
  }
}

function hasS3Setting(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    !(typeof value === 'string' && value.trim() === '')
  );
}

function parseOptionalS3Setting(
  value: unknown,
  name: string,
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string when provided`);
  }

  return value.trim();
}

function parseS3Endpoint(value: unknown): string | undefined {
  const endpoint = parseOptionalS3Setting(value, 'BACKEND_STORAGE_ENDPOINT');
  if (!endpoint) return undefined;

  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    throw new Error(
      'BACKEND_STORAGE_ENDPOINT must be an absolute http or https URL with no path, query, or hash',
    );
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new Error(
      'BACKEND_STORAGE_ENDPOINT must be an absolute http or https URL with no path, query, or hash',
    );
  }

  return url.origin;
}

function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    $metadata?: { httpStatusCode?: unknown };
    name?: unknown;
    message?: unknown;
  };

  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === 'NoSuchKey' ||
    candidate.name === 'NotFound' ||
    (typeof candidate.message === 'string' &&
      /NoSuchKey|NotFound|404/.test(candidate.message))
  );
}
