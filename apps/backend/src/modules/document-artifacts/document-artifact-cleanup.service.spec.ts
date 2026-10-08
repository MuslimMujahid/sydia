import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { DocumentArtifactCleanupService } from './document-artifact-cleanup.service';
import type { IDocumentArtifactCleanupRepository } from '../../database/interfaces';
import { StorageService } from '../../infra/storage';

function dependencies() {
  const artifacts = {
    trackUpload: jest
      .fn<(ownerId: string, storageKey: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    renewUpload: jest
      .fn<(key: string, expiry: Date) => Promise<void>>()
      .mockResolvedValue(undefined),
    requestCleanup: jest
      .fn<(ownerId: string, storageKey: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    activateUpload: jest
      .fn<(storageKey: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    claimOrphaned: jest
      .fn<
        (
          limit: number,
          expiredBefore: Date,
          claimedAt: Date,
        ) => Promise<Array<{ ownerId: string; storageKey: string }>>
      >()
      .mockResolvedValue([
        { ownerId: 'owner-1', storageKey: 'owner-1/document-1' },
      ]),
    recordAttempt: jest
      .fn<(storageKey: string, attemptedAt: Date) => Promise<void>>()
      .mockResolvedValue(undefined),
    remove: jest
      .fn<(storageKey: string) => Promise<void>>()
      .mockResolvedValue(undefined),
  } satisfies jest.Mocked<IDocumentArtifactCleanupRepository>;

  const storage = {
    delete: jest
      .fn<(key: string) => Promise<void>>()
      .mockResolvedValue(undefined),
  };

  const service = new DocumentArtifactCleanupService(
    artifacts,
    storage as unknown as StorageService,
  );

  return { service, artifacts, storage };
}

describe('DocumentArtifactCleanupService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('removes both stored objects before clearing the durable cleanup record', async () => {
    const { service, artifacts, storage } = dependencies();

    await expect(service.sweep()).resolves.toBe(1);

    expect(storage.delete).toHaveBeenNthCalledWith(1, 'owner-1/document-1');
    expect(storage.delete).toHaveBeenNthCalledWith(
      2,
      'owner-1/document-1.extraction-v1.json',
    );
    expect(artifacts.remove).toHaveBeenCalledWith('owner-1/document-1');
  });

  test('retains cleanup work when deleting a derived object fails', async () => {
    const { service, artifacts, storage } = dependencies();
    storage.delete
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(service.sweep()).resolves.toBe(0);

    expect(artifacts.recordAttempt).toHaveBeenCalledWith(
      'owner-1/document-1',
      expect.any(Date),
    );
    expect(artifacts.remove).not.toHaveBeenCalled();
  });

  test('renews upload leases while a request is active and stops on release', async () => {
    jest.useFakeTimers();
    const { service, artifacts } = dependencies();
    const stop = service.startUploadLease('owner-1/document-1');

    await jest.advanceTimersByTimeAsync(60_000);

    expect(artifacts.renewUpload).toHaveBeenCalledWith(
      'owner-1/document-1',
      expect.any(Date),
    );
    stop();
    artifacts.renewUpload.mockClear();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(artifacts.renewUpload).not.toHaveBeenCalled();
  });

  test('shares an in-flight sweep rather than deleting the same batch twice', async () => {
    const { service, artifacts } = dependencies();
    let release!: () => void;
    artifacts.claimOrphaned.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve([]);
        }),
    );

    const first = service.sweep();
    const second = service.sweep();
    expect(artifacts.claimOrphaned).toHaveBeenCalledTimes(1);
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([0, 0]);
  });
});
