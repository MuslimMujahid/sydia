import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

@Injectable()
export class StorageService {
  private readonly bucket?: string;
  private readonly localRoot: string;
  private readonly s3?: S3Client;
  constructor(config: ConfigService) {
    this.bucket = config.get<string>('BACKEND_STORAGE_BUCKET');
    this.localRoot = config.get<string>('BACKEND_STORAGE_LOCAL_ROOT', '.data/files');
    const endpoint = config.get<string>('BACKEND_STORAGE_ENDPOINT');
    if (this.bucket) this.s3 = new S3Client({ region: config.get<string>('BACKEND_STORAGE_REGION', 'auto'), ...(endpoint ? { endpoint, forcePathStyle: true } : {}), credentials: config.get<string>('BACKEND_STORAGE_ACCESS_KEY') ? { accessKeyId: config.getOrThrow<string>('BACKEND_STORAGE_ACCESS_KEY'), secretAccessKey: config.getOrThrow<string>('BACKEND_STORAGE_SECRET_KEY') } : undefined });
  }
  async put(key: string, value: Buffer, contentType: string): Promise<void> {
    if (this.s3 && this.bucket) { await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: value, ContentType: contentType })); return; }
    const path = join(this.localRoot, key); await mkdir(dirname(path), { recursive: true }); await writeFile(path, value);
  }
  async get(key: string): Promise<Buffer> {
    if (this.s3 && this.bucket) { const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key })); if (!response.Body) throw new Error('Objek penyimpanan kosong.'); return Buffer.from(await response.Body.transformToByteArray()); }
    return readFile(join(this.localRoot, key));
  }
  async delete(key: string): Promise<void> {
    if (this.s3 && this.bucket) {
      try {
        await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      } catch (error: unknown) {
        if (!isMissingObjectError(error)) throw error;
      }
      return;
    }
    await rm(join(this.localRoot, key), { force: true });
  }
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
