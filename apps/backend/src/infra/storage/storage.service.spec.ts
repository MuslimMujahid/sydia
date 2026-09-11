import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StorageService } from './storage.service';

type PrivateStorage = { s3?: S3Client };

describe('StorageService', () => {
  test('accepts an origin-only S3 endpoint', () => {
    expect(
      () =>
        new StorageService(
          new ConfigService({
            BACKEND_STORAGE_BUCKET: 'dev-sydia',
            BACKEND_STORAGE_ENDPOINT: 'https://sin1.contabostorage.com/',
            BACKEND_STORAGE_REGION: 'SIN',
          }),
        ),
    ).not.toThrow();
  });

  test('rejects an S3 endpoint with a bucket path', () => {
    expect(
      () =>
        new StorageService(
          new ConfigService({
            BACKEND_STORAGE_BUCKET: 'dev-sydia',
            BACKEND_STORAGE_ENDPOINT:
              'https://sin1.contabostorage.com/dev-sydia',
          }),
        ),
    ).toThrow(
      'BACKEND_STORAGE_ENDPOINT must be an absolute http or https URL with no path, query, or hash',
    );
  });

  test('rejects one-sided S3 credentials', () => {
    expect(
      () =>
        new StorageService(
          new ConfigService({
            BACKEND_STORAGE_BUCKET: 'dev-sydia',
            BACKEND_STORAGE_ACCESS_KEY: true,
          }),
        ),
    ).toThrow(
      'BACKEND_STORAGE_ACCESS_KEY and BACKEND_STORAGE_SECRET_KEY must be provided together',
    );
  });
  test('local deletion resolves when the path is already missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'storage-service-'));
    const service = new StorageService(
      new ConfigService({ BACKEND_STORAGE_LOCAL_ROOT: root }),
    );

    await expect(service.delete('missing/file.txt')).resolves.toBeUndefined();
    await rm(root, { recursive: true, force: true });
  });

  test('S3 deletion swallows a missing-key response', async () => {
    const service = new StorageService(
      new ConfigService({ BACKEND_STORAGE_BUCKET: 'documents' }),
    );

    const send = jest
      .fn<(command: DeleteObjectCommand) => Promise<unknown>>()
      .mockRejectedValue({ $metadata: { httpStatusCode: 404 } });

    (service as unknown as PrivateStorage).s3 = { send } as unknown as S3Client;

    await expect(service.delete('missing-key')).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });

  test('S3 deletion rethrows non-missing-key errors', async () => {
    const service = new StorageService(
      new ConfigService({ BACKEND_STORAGE_BUCKET: 'documents' }),
    );

    const error = new Error('Access denied');
    const send = jest
      .fn<(command: DeleteObjectCommand) => Promise<unknown>>()
      .mockRejectedValue(error);

    (service as unknown as PrivateStorage).s3 = { send } as unknown as S3Client;

    await expect(service.delete('protected-key')).rejects.toBe(error);
  });
});
