import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma';
import { PrismaFileLibraryRepository } from './prisma-file-library.repository';
import { PrismaFileDeletionRepository } from './prisma-file-deletion.repository';
import { PrismaDocumentRepository } from './prisma-document.repository';
import { FileDeletionWorker } from '../../modules/documents/file-deletion.worker';
import type { QueueService } from '../../infra/queue';
import type { StorageService } from '../../infra/storage';
import type { DocumentExtractionService } from '../../modules/documents/document-extraction.service';
import type { DocumentArtifactCleanupService } from '../../modules/document-artifacts/document-artifact-cleanup.service';

const url = process.env.FILES_CONTRACT_DB_URL;
if (url && new URL(url).pathname !== '/sydia_files_contract')
  throw new Error(
    'Files contract tests require the dedicated sydia_files_contract database.',
  );
const live = url ? describe : describe.skip;

live('Files and folders PostgreSQL contracts', () => {
  let db: PrismaService;
  let library: PrismaFileLibraryRepository;
  let deletions: PrismaFileDeletionRepository;
  const owner = 'files-contract-owner';
  const stranger = 'files-contract-stranger';
  const now = new Date('2026-10-18T04:00:00Z');

  beforeAll(async () => {
    db = new PrismaService(new ConfigService({ BACKEND_DB_URL: url }));
    await db.$connect();
    library = new PrismaFileLibraryRepository(db);
    deletions = new PrismaFileDeletionRepository(db);
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe('TRUNCATE TABLE "user" CASCADE');
    await db.user.createMany({
      data: [
        { id: owner, name: 'Owner', email: 'files-owner@example.test' },
        {
          id: stranger,
          name: 'Stranger',
          email: 'files-stranger@example.test',
        },
      ],
    });
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  async function file(
    id: string,
    folderId: string | null = null,
    title = 'Invoice.pdf',
  ) {
    await db.fileAsset.create({
      data: {
        id: `asset-${id}`,
        userId: owner,
        originalName: title,
        mimeType: 'application/pdf',
        size: 1024,
        checksum: 'fixture',
        storageKey: `files-contract/${id}`,
        kind: 'document',
      },
    });
    const row = await db.document.create({
      data: {
        id,
        userId: owner,
        title,
        fileAssetId: `asset-${id}`,
        folderId,
        status: 'processing',
      },
    });

    return {
      kind: 'file' as const,
      id: row.id,
      revision: row.organizationRevision,
    };
  }

  function filters(folderId: string | null = null) {
    return {
      folderId,
      offset: 0,
      limit: 50,
      sort: 'name' as const,
      direction: 'asc' as const,
    };
  }

  async function finish(
    remove: (key: string) => Promise<void> = async () => {},
  ) {
    for (let count = 0; count < 20; count++) {
      const claim = await deletions.claim(new Date('2026-10-18T04:01:00Z'));
      if (!claim) return;
      await deletions.processBatch(claim, remove);
    }

    throw new Error('Deletion did not finish within fixture work bound.');
  }

  test('account deletion removes a private nested hierarchy without a foreign key failure', async () => {
    const parent = await library.createFolder(owner, 'Private', null);
    const child = await library.createFolder(owner, 'Nested', parent.id);
    await file('account-file', child.id);
    await db.user.delete({ where: { id: owner } });
    expect(await db.fileFolder.count()).toBe(0);
    expect(await db.document.count()).toBe(0);
    expect(await db.fileAsset.count()).toBe(0);
  });

  test('root sibling names are unique ignoring case and surrounding whitespace', async () => {
    await library.createFolder(owner, 'Work', null);
    await expect(
      library.createFolder(owner, ' work ', null),
    ).rejects.toMatchObject({ reason: 'duplicate_name' });
  });
  test('concurrent duplicate folder creation commits exactly one folder', async () => {
    const outcomes = await Promise.allSettled([
      library.createFolder(owner, 'Work', null),
      library.createFolder(owner, 'WORK', null),
    ]);

    expect(outcomes.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(await db.fileFolder.count({ where: { userId: owner } })).toBe(1);
  });
  test('identical folder names are allowed under different parents', async () => {
    const work = await library.createFolder(owner, 'Work', null);
    const personal = await library.createFolder(owner, 'Personal', null);
    await library.createFolder(owner, 'Receipts', work.id);
    await library.createFolder(owner, 'Receipts', personal.id);
    expect(await db.fileFolder.count({ where: { name: 'Receipts' } })).toBe(2);
  });
  test('cross-owner parent assignment is rejected by the database', async () => {
    const work = await library.createFolder(owner, 'Work', null);
    await expect(
      db.fileFolder.create({
        data: {
          userId: stranger,
          name: 'Private',
          normalizedName: 'private',
          parentId: work.id,
        },
      }),
    ).rejects.toThrow();
  });
  test('browse is paginated, folders first, and restricted to immediate children', async () => {
    const work = await library.createFolder(owner, 'Work', null);
    await library.createFolder(owner, 'Nested', work.id);
    await file('root-file', null, 'A.pdf');
    const result = await library.list(owner, { ...filters(), limit: 1 });
    expect(result.total).toBe(2);
    expect(result.items.map((row) => row.name)).toEqual(['Work']);
  });
  test('global name search includes current ancestor paths', async () => {
    const work = await library.createFolder(owner, 'Work', null);
    const project = await library.createFolder(owner, 'Project', work.id);
    await file('nested-invoice', project.id);
    const result = await library.list(owner, { ...filters(), query: 'VOICE' });
    expect(result.items[0]).toMatchObject({
      name: 'Invoice.pdf',
      path: [
        { id: work.id, name: 'Work' },
        { id: project.id, name: 'Project' },
      ],
    });
  });
  test('selecting an ancestor and descendant for move preserves the subtree', async () => {
    const work = await library.createFolder(owner, 'Work', null);
    const target = await library.createFolder(owner, 'Personal', null);
    const document = await file('move-me', work.id);
    await library.move(
      owner,
      [{ kind: 'folder', id: work.id, revision: 1 }, document],
      target.id,
    );
    expect(
      await db.document.findUnique({ where: { id: document.id } }),
    ).toMatchObject({
      folderId: work.id,
      status: 'processing',
      fileAssetId: 'asset-move-me',
    });
    expect(
      await db.fileFolder.findUnique({ where: { id: work.id } }),
    ).toMatchObject({ parentId: target.id });
  });
  test('a naming collision rejects all moves without a partial change', async () => {
    const work = await library.createFolder(owner, 'Work', null);
    const personal = await library.createFolder(owner, 'Personal', null);
    const first = await library.createFolder(owner, 'Receipts', work.id);
    const second = await library.createFolder(owner, 'Receipts', personal.id);
    await expect(
      library.move(
        owner,
        [
          { kind: 'folder', id: first.id, revision: 1 },
          { kind: 'folder', id: second.id, revision: 1 },
        ],
        null,
      ),
    ).rejects.toMatchObject({ reason: 'duplicate_name' });
    expect(
      await db.fileFolder.findUnique({ where: { id: first.id } }),
    ).toMatchObject({ parentId: work.id });
  });
  test('competing moves cannot create a cycle', async () => {
    const a = await library.createFolder(owner, 'A', null);
    const b = await library.createFolder(owner, 'B', null);
    const outcomes = await Promise.allSettled([
      library.move(owner, [{ kind: 'folder', id: a.id, revision: 1 }], b.id),
      library.move(owner, [{ kind: 'folder', id: b.id, revision: 1 }], a.id),
    ]);

    expect(outcomes.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
  });
  test('deletion preview counts overlapping selections once', async () => {
    const work = await library.createFolder(owner, 'Work', null);
    const document = await file('overlap', work.id);
    const preview = await deletions.preview(
      owner,
      [{ kind: 'folder', id: work.id, revision: 1 }, document],
      now,
    );

    expect(preview.files.total).toBe(1);
    expect(preview.folders.total).toBe(1);
    expect(await db.document.count()).toBe(1);
  });
  test('adding a descendant invalidates deletion confirmation', async () => {
    const work = await library.createFolder(owner, 'Work', null);
    const preview = await deletions.preview(
      owner,
      [{ kind: 'folder', id: work.id, revision: 1 }],
      now,
    );

    await file('new-descendant', work.id);
    await expect(
      deletions.start(owner, preview.id, 'stale-start', now),
    ).rejects.toMatchObject({ reason: 'stale_confirmation' });
  });
  test('running deletion prevents uploads into its selected subtree', async () => {
    const work = await library.createFolder(owner, 'Work', null);
    const preview = await deletions.preview(
      owner,
      [{ kind: 'folder', id: work.id, revision: 1 }],
      now,
    );

    await deletions.start(owner, preview.id, 'upload-lock', now);
    await expect(file('racing-upload', work.id)).rejects.toThrow();
  });
  test('deletion start is idempotent after an unknown network outcome', async () => {
    const ref = await file('idempotent');
    const preview = await deletions.preview(owner, [ref], now);
    const first = await deletions.start(owner, preview.id, 'same-key', now);
    const second = await deletions.start(owner, preview.id, 'same-key', now);
    expect(first.id).toBe(second.id);
  });

  test('retry cleans the saved artifacts after logical removal without deleting a same-named replacement', async () => {
    const ref = await file('removed-before-retry');
    const preview = await deletions.preview(owner, [ref], now);
    await deletions.start(owner, preview.id, 'removed-before-retry', now);
    await finish(() => Promise.reject(new Error('Storage unavailable')));
    await db.fileAsset.delete({ where: { id: 'asset-removed-before-retry' } });
    const replacement = await file('replacement-after-removal');
    const cleaned: string[] = [];

    await deletions.retry(owner, preview.id, undefined, now);
    await finish((key) => {
      cleaned.push(key);

      return Promise.resolve();
    });

    expect(cleaned).toEqual(['files-contract/removed-before-retry']);
    expect((await deletions.detail(owner, preview.id)).status).toBe(
      'completed',
    );
    expect(
      await db.document.findUnique({ where: { id: replacement.id } }),
    ).not.toBeNull();
  });

  test('renewed confirmation retains cleanup for logically removed files alongside new folder content', async () => {
    const root = await library.createFolder(owner, 'Retained cleanup', null);
    const ref = await file('missing-cleanup-child', root.id);
    const preview = await deletions.preview(
      owner,
      [{ kind: 'folder', id: root.id, revision: root.revision }],
      now,
    );

    await deletions.start(owner, preview.id, 'missing-cleanup-child', now);
    await finish(() => Promise.reject(new Error('Storage unavailable')));
    await db.fileAsset.delete({ where: { id: 'asset-missing-cleanup-child' } });
    const added = await file('new-child-for-confirmation', root.id);
    const renewed = await deletions.retryPreview(owner, preview.id, now);
    const cleaned: string[] = [];

    expect(renewed.files.total).toBe(2);
    await deletions.retry(owner, preview.id, renewed.id, now);
    await finish((key) => {
      cleaned.push(key);

      return Promise.resolve();
    });

    expect(cleaned.sort()).toEqual([
      'files-contract/missing-cleanup-child',
      'files-contract/new-child-for-confirmation',
    ]);
    expect((await deletions.detail(owner, preview.id)).status).toBe(
      'completed',
    );
    expect(await db.document.findUnique({ where: { id: ref.id } })).toBeNull();
    expect(
      await db.document.findUnique({ where: { id: added.id } }),
    ).toBeNull();
  });

  test('expired cancelled previews release their manifests without removing library items', async () => {
    const ref = await file('cancelled-preview');
    const preview = await deletions.preview(owner, [ref], now);

    expect(
      await deletions.pruneExpiredPreviews(new Date('2026-10-18T04:11:00Z')),
    ).toBe(1);
    expect(await db.fileDeletionOperation.count()).toBe(0);
    expect(await db.fileDeletionItem.count()).toBe(0);
    expect(
      await db.document.findUnique({ where: { id: ref.id } }),
    ).not.toBeNull();
    expect(preview.status).toBe('preview');
  });

  test('preview expiry preserves unexpired previews and confirmed operations', async () => {
    const first = await file('confirmed-preview');
    const second = await file('fresh-preview');
    const confirmed = await deletions.preview(owner, [first], now);
    await deletions.start(owner, confirmed.id, 'confirmed-preview', now);
    const fresh = await deletions.preview(
      owner,
      [second],
      new Date('2026-10-18T04:05:00Z'),
    );

    await deletions.pruneExpiredPreviews(new Date('2026-10-18T04:11:00Z'));

    expect((await deletions.detail(owner, confirmed.id)).status).toBe(
      'running',
    );
    expect((await deletions.detail(owner, fresh.id)).status).toBe('preview');
    expect(await db.fileDeletionItem.count()).toBe(2);
  });

  test('preview expiry bounds each sweep and leaves the remainder for the next sweep', async () => {
    const ref = await file('many-previews');
    await Promise.all(
      Array.from({ length: 7 }, () => deletions.preview(owner, [ref], now)),
    );
    const expiredAt = new Date('2026-10-18T04:11:00Z');

    expect(await deletions.pruneExpiredPreviews(expiredAt)).toBe(5);
    expect(await db.fileDeletionOperation.count()).toBe(2);
    expect(await deletions.pruneExpiredPreviews(expiredAt)).toBe(2);
    expect(await db.fileDeletionItem.count()).toBe(0);
  });
  test('partial deletion keeps its folder and retry deletes only failed work', async () => {
    const work = await library.createFolder(owner, 'Work', null);
    await file('delete-ok', work.id);
    await file('delete-fails', work.id);
    const preview = await deletions.preview(
      owner,
      [{ kind: 'folder', id: work.id, revision: 1 }],
      now,
    );

    await deletions.start(owner, preview.id, 'partial-start', now);
    await finish((key) => {
      if (key.endsWith('delete-fails'))
        return Promise.reject(new Error('Injected storage outage'));

      return Promise.resolve();
    });
    expect(await deletions.detail(owner, preview.id)).toMatchObject({
      status: 'partial',
      files: { completed: 1, failed: 1 },
      folders: { retained: 1 },
    });
    expect(await db.fileFolder.count()).toBe(1);
    await deletions.retry(owner, preview.id, undefined, now);
    const retried: string[] = [];
    await finish((key) => {
      retried.push(key);

      return Promise.resolve();
    });
    expect(retried).toEqual(['files-contract/delete-fails']);
    expect(await deletions.detail(owner, preview.id)).toMatchObject({
      status: 'completed',
      files: { completed: 2 },
      folders: { completed: 1 },
    });
  });
  test('new content after partial deletion requires fresh confirmation before retry', async () => {
    const work = await library.createFolder(owner, 'Work', null);
    await file('failed-original', work.id);
    const preview = await deletions.preview(
      owner,
      [{ kind: 'folder', id: work.id, revision: 1 }],
      now,
    );

    await deletions.start(owner, preview.id, 'changed-retry', now);
    await finish(async () => {
      return Promise.reject(new Error('Injected storage outage'));

      return Promise.resolve();
    });
    await file('new-content', work.id);
    await expect(
      deletions.retry(owner, preview.id, undefined, now),
    ).rejects.toMatchObject({ reason: 'stale_confirmation' });
    expect(await db.document.count()).toBe(2);
  });

  function uploadedAsset(storageKey: string) {
    return {
      originalName: 'Synthetic upload.txt',
      mimeType: 'text/plain',
      size: 32,
      checksum: 'fixture',
      storageKey,
      kind: 'document' as const,
    };
  }

  test('an upload without a destination remains at root for chat ingress', async () => {
    const documents = new PrismaDocumentRepository(db);
    await library.createFolder(owner, 'Open elsewhere', null);
    const document = await documents.createWithFile(owner, {
      title: 'Chat.txt',
      file: uploadedAsset('chat-ingress'),
    });

    expect(
      await db.document.findUnique({ where: { id: document.id } }),
    ).toMatchObject({ folderId: null });
  });
  test('an upload stores its explicitly captured folder in the document transaction', async () => {
    const documents = new PrismaDocumentRepository(db);
    const work = await library.createFolder(owner, 'Work', null);
    const document = await documents.createWithFile(owner, {
      title: 'Folder.txt',
      folderId: work.id,
      file: uploadedAsset('folder-ingress'),
    });

    expect(
      await db.document.findUnique({ where: { id: document.id } }),
    ).toMatchObject({ folderId: work.id });
  });
  test('a destination deleted before upload commit rejects the record and its asset', async () => {
    const documents = new PrismaDocumentRepository(db);
    const work = await library.createFolder(owner, 'Work', null);
    await db.fileFolder.delete({ where: { id: work.id } });
    await expect(
      documents.createWithFile(owner, {
        title: 'Race.txt',
        folderId: work.id,
        file: uploadedAsset('deleted-folder-ingress'),
      }),
    ).rejects.toMatchObject({ reason: 'not_found' });
    expect(await db.fileAsset.count()).toBe(0);
  });
  test('the existing metadata edit path rejects a file locked by deletion', async () => {
    const documents = new PrismaDocumentRepository(db);
    const ref = await file('locked-metadata');
    const preview = await deletions.preview(owner, [ref], now);
    await deletions.start(owner, preview.id, 'locked-metadata', now);
    await expect(
      documents.update(owner, ref.id, { title: 'Changed.pdf' }),
    ).rejects.toMatchObject({ reason: 'operation_in_progress' });
    expect(
      await db.document.findUnique({ where: { id: ref.id } }),
    ).toMatchObject({ title: 'Invoice.pdf' });
  });

  test('a selected ancestor cannot move while one of its descendants is being deleted', async () => {
    const ancestor = await library.createFolder(owner, 'Ancestor', null);
    const nested = await library.createFolder(owner, 'Nested', ancestor.id);
    const target = await library.createFolder(owner, 'Target', null);
    const ref = await file('locked-descendant', nested.id);
    const preview = await deletions.preview(owner, [ref], now);
    await deletions.start(owner, preview.id, 'descendant-lock', now);
    await expect(
      library.move(
        owner,
        [{ kind: 'folder', id: ancestor.id, revision: ancestor.revision }],
        target.id,
      ),
    ).rejects.toMatchObject({ reason: 'operation_in_progress' });
    expect(
      await db.fileFolder.findUnique({ where: { id: ancestor.id } }),
    ).toMatchObject({ parentId: null });
  });

  test('renewed confirmation allows retrying changed folder contents without replaying completed files', async () => {
    const work = await library.createFolder(owner, 'Work', null);
    await file('already-completed', work.id);
    await file('failed-original', work.id);
    const preview = await deletions.preview(
      owner,
      [{ kind: 'folder', id: work.id, revision: 1 }],
      now,
    );

    await deletions.start(owner, preview.id, 'reconfirm-positive', now);
    await finish((key) =>
      key.endsWith('failed-original')
        ? Promise.reject(new Error('Injected outage'))
        : Promise.resolve(),
    );
    await file('new-confirmed-content', work.id);
    const renewed = await deletions.retryPreview(owner, preview.id, now);
    expect(renewed.files.total).toBe(2);
    await deletions.retry(owner, preview.id, renewed.id, now);
    const keys: string[] = [];
    await finish((key) => {
      keys.push(key);

      return Promise.resolve();
    });
    expect(keys.sort()).toEqual([
      'files-contract/failed-original',
      'files-contract/new-confirmed-content',
    ]);
    expect(await deletions.detail(owner, preview.id)).toMatchObject({
      status: 'completed',
      files: { total: 3, completed: 3 },
    });
  });

  test('a deleted folder resolves to its nearest surviving parent without exposing another owner', async () => {
    const parent = await library.createFolder(owner, 'Parent', null);
    const removed = await library.createFolder(owner, 'Removed', parent.id);
    const child = await library.createFolder(owner, 'Child', removed.id);
    const preview = await deletions.preview(
      owner,
      [{ kind: 'folder', id: removed.id, revision: 1 }],
      now,
    );

    await deletions.start(owner, preview.id, 'location-recovery', now);
    await finish();
    await expect(library.folder(owner, child.id)).rejects.toMatchObject({
      reason: 'not_found',
      details: { deleted: true, destinationId: parent.id },
    });
    await expect(library.folder(stranger, child.id)).rejects.toMatchObject({
      reason: 'not_found',
      details: undefined,
    });
  });

  test('deletion waits for an active parser before removing its files or reporting completion', async () => {
    const ref = await file('active-parser');
    const preview = await deletions.preview(owner, [ref], now);
    await deletions.start(owner, preview.id, 'active-parser', now);
    let active = true;
    const removed: string[] = [];
    const worker = new FileDeletionWorker(
      deletions,
      {
        delete: () => {
          removed.push('original');

          return Promise.resolve();
        },
      } as unknown as StorageService,
      {
        deleteCheckpoint: () => {
          removed.push('checkpoint');

          return Promise.resolve();
        },
      } as unknown as DocumentExtractionService,
      {
        requestCleanup: () => Promise.resolve(),
      } as unknown as DocumentArtifactCleanupService,
      {
        documents: {
          getActive: () => Promise.resolve([]),
          getJob: () =>
            Promise.resolve({
              isActive: () => Promise.resolve(active),
              remove: () => Promise.resolve(),
            }),
        },
      } as unknown as QueueService,
    );

    await worker.tick();

    expect(removed).toEqual([]);
    expect((await deletions.detail(owner, preview.id)).files).toMatchObject({
      pending: 1,
      completed: 0,
    });
    expect(await db.document.count()).toBe(1);
    expect(
      await new PrismaDocumentRepository(db).storageKey(owner, ref.id),
    ).toBeNull();

    active = false;
    await db.fileDeletionOperation.update({
      where: { id: preview.id },
      data: { leaseUntil: null },
    });
    await worker.tick();

    expect(removed).toEqual(['original', 'checkpoint']);
    expect((await deletions.detail(owner, preview.id)).status).toBe(
      'completed',
    );
    expect(await db.document.count()).toBe(0);
  });

  test('an active retry with a different queue ID keeps deletion pending and preserves artifacts', async () => {
    const ref = await file('active-manual-retry');
    const preview = await deletions.preview(owner, [ref], now);
    await deletions.start(owner, preview.id, 'manual-retry', now);
    const removed: string[] = [];
    const worker = new FileDeletionWorker(
      deletions,
      {
        delete: () => {
          removed.push('original');

          return Promise.resolve();
        },
      } as unknown as StorageService,
      {
        deleteCheckpoint: () => {
          removed.push('checkpoint');

          return Promise.resolve();
        },
      } as unknown as DocumentExtractionService,
      {
        requestCleanup: () => Promise.resolve(),
      } as unknown as DocumentArtifactCleanupService,
      {
        documents: {
          getJob: () => Promise.resolve(undefined),
          getActive: () =>
            Promise.resolve([
              {
                id: `${ref.id}-retry-unique`,
                data: { documentId: ref.id, userId: owner },
              },
            ]),
        },
      } as unknown as QueueService,
    );

    await worker.tick();

    expect(removed).toEqual([]);
    expect(await db.document.count()).toBe(1);
    expect(await deletions.detail(owner, preview.id)).toMatchObject({
      status: 'running',
      files: { pending: 1, completed: 0 },
    });
  });

  test('an indefinitely active parser becomes a visible retryable deletion failure', async () => {
    const ref = await file('stalled-parser');
    const preview = await deletions.preview(owner, [ref], now);
    await deletions.start(owner, preview.id, 'stalled-parser', now);
    await db.fileDeletionItem.updateMany({
      where: { operationId: preview.id },
      data: { attempts: 120 },
    });
    const claim = await deletions.claim(now);
    expect(claim).not.toBeNull();

    await deletions.processBatch(claim!, () =>
      Promise.resolve('pending' as const),
    );
    await finish();

    expect((await deletions.detail(owner, preview.id)).status).toBe('partial');
    expect(
      (await deletions.failures(owner, preview.id, 0, 50)).items[0],
    ).toMatchObject({ state: 'failed', itemId: ref.id });
    expect(await db.document.count()).toBe(1);
  });

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });

    return { promise, resolve };
  }

  test('slow artifact cleanup does not retain a database transaction or owner write lock', async () => {
    const ref = await file('slow-cleanup');
    const preview = await deletions.preview(owner, [ref], now);
    await deletions.start(owner, preview.id, 'slow-cleanup', now);
    const claim = await deletions.claim(now);
    if (!claim) throw new Error('Expected deletion claim.');
    const started = deferred();
    const release = deferred();
    const work = deletions.processBatch(claim, () => {
      started.resolve();

      return release.promise;
    });

    await started.promise;
    const created = await library.createFolder(
      owner,
      'Available during storage wait',
      null,
    );

    expect(created.name).toBe('Available during storage wait');
    expect(await deletions.detail(owner, preview.id)).toMatchObject({
      files: { completed: 0, pending: 1 },
    });
    release.resolve();
    expect(await work).toBe(true);
  });
  test('an expired worker cannot publish completion after a newer worker claims its operation', async () => {
    const ref = await file('fenced-worker');
    const preview = await deletions.preview(owner, [ref], now);
    await deletions.start(owner, preview.id, 'fenced-worker', now);
    const old = await deletions.claim(now);
    if (!old) throw new Error('Expected original deletion claim.');
    const started = deferred();
    const release = deferred();
    const work = deletions.processBatch(old, () => {
      started.resolve();

      return release.promise;
    });

    await started.promise;
    const current = await deletions.claim(new Date('2026-10-18T04:02:00Z'));
    expect(current?.operationId).toBe(preview.id);
    release.resolve();
    expect(await work).toBe(false);
    expect(await deletions.detail(owner, preview.id)).toMatchObject({
      files: { completed: 0 },
    });
    if (!current) throw new Error('Expected replacement claim.');
    await deletions.processBatch(current, () => Promise.resolve());
    expect(await db.document.count()).toBe(0);
  });

  async function largeSubtree() {
    const root = await library.createFolder(owner, 'Large root', null);
    let parent = root;
    for (let depth = 1; depth <= 40; depth++)
      parent = await library.createFolder(owner, `Level ${depth}`, parent.id);
    const assets = Array.from({ length: 1000 }, (_, index) => ({
      id: `subtree-asset-${index}`,
      userId: owner,
      originalName: `Nested ${index}.pdf`,
      mimeType: 'application/pdf',
      size: 1024,
      checksum: 'fixture',
      storageKey: `subtree/${index}`,
      kind: 'document',
    }));

    await db.fileAsset.createMany({ data: assets });
    await db.document.createMany({
      data: assets.map((asset, index) => ({
        id: `subtree-file-${index}`,
        userId: owner,
        fileAssetId: asset.id,
        title: asset.originalName,
        folderId: index % 2 ? parent.id : root.id,
      })),
    });

    return { root, leaf: parent };
  }

  test('a large deep subtree remains paginated and its deletion resumes across repository instances', async () => {
    const { root, leaf } = await largeSubtree();
    const page = await library.list(owner, {
      ...filters(),
      query: 'Nested 99',
    });

    expect(page.total).toBe(11);
    expect(page.items[0]!.path.length).toBeGreaterThan(0);
    expect((await library.folder(owner, leaf.id)).path).toHaveLength(41);
    const preview = await deletions.preview(
      owner,
      [{ kind: 'folder', id: root.id, revision: root.revision }],
      now,
    );

    expect(preview.files.total).toBe(1000);
    expect(preview.folders.total).toBe(41);
    await deletions.start(owner, preview.id, 'large-resume', now);
    let processor = deletions;

    for (let index = 0; index < 1042; index++) {
      if (index === 250) processor = new PrismaFileDeletionRepository(db);
      const claim = await processor.claim(new Date('2026-10-18T04:01:00Z'));
      if (!claim) throw new Error(`Expected deletion work at item ${index}`);
      await processor.processBatch(claim, () => Promise.resolve());
    }

    expect(await processor.detail(owner, preview.id)).toMatchObject({
      status: 'completed',
      files: { total: 1000, completed: 1000 },
      folders: { total: 41, completed: 41 },
    });
    expect(await db.document.count()).toBe(0);
    expect(await db.fileFolder.count()).toBe(0);
  }, 120_000);

  test('worker failures stop after three attempts and unlock surviving items', async () => {
    const ref = await file('worker-budget');
    const preview = await deletions.preview(owner, [ref], now);
    await deletions.start(owner, preview.id, 'worker-budget', now);
    const first = await deletions.claim(now);
    if (!first) throw new Error('Expected first deletion claim.');
    await deletions.recordClaimFailure(first);
    const second = await deletions.claim(now);
    if (!second) throw new Error('Expected second deletion claim.');
    await deletions.recordClaimFailure(second);
    const third = await deletions.claim(now);
    if (!third) throw new Error('Expected third deletion claim.');
    await deletions.recordClaimFailure(third);
    expect(await deletions.detail(owner, preview.id)).toMatchObject({
      status: 'partial',
      files: { failed: 1 },
    });
    expect(
      await db.document.findUnique({ where: { id: ref.id } }),
    ).toMatchObject({ deletingOperationId: null });
  });

  test('expired worker leases are recovered without creating another operation', async () => {
    const ref = await file('worker-restart');
    const preview = await deletions.preview(owner, [ref], now);
    await deletions.start(owner, preview.id, 'worker-restart', now);
    const original = await deletions.claim(now);
    expect(original?.operationId).toBe(preview.id);
    expect(await deletions.claim(new Date('2026-10-18T04:00:30Z'))).toBeNull();
    const recovered = await deletions.claim(new Date('2026-10-18T04:02:00Z'));
    expect(recovered?.operationId).toBe(preview.id);
    expect(
      await db.fileDeletionOperation.count({ where: { status: 'running' } }),
    ).toBe(1);
  });

  async function seedLargeLibrary() {
    await db.fileFolder.createMany({
      data: Array.from({ length: 1000 }, (_, index) => ({
        id: `load-folder-${index}`,
        userId: owner,
        name: `Folder ${index}`,
        normalizedName: `folder ${index}`,
      })),
    });

    for (let offset = 0; offset < 10001; offset += 500) {
      const entries = Array.from(
        { length: Math.min(500, 10001 - offset) },
        (_, index) => ({
          id: `load-asset-${offset + index}`,
          userId: owner,
          originalName: `Invoice ${offset + index}.pdf`,
          mimeType: 'application/pdf',
          size: 1024,
          checksum: 'fixture',
          storageKey: `load/${offset + index}`,
          kind: 'document',
        }),
      );

      await db.fileAsset.createMany({ data: entries });
      await db.document.createMany({
        data: entries.map((entry, index) => ({
          id: `load-document-${offset + index}`,
          userId: owner,
          title: entry.originalName,
          fileAssetId: entry.id,
        })),
      });
    }
  }

  test('more than ten thousand files remain browsable and searchable without a file-count cap', async () => {
    await seedLargeLibrary();
    const first = await library.list(owner, filters());
    expect(first.total).toBe(11001);
    expect(first.items).toHaveLength(50);
    const match = await library.list(owner, {
      ...filters(),
      query: 'Invoice 10000.pdf',
    });

    expect(match.items.map((row) => row.id)).toEqual(['load-document-10000']);
    const samples: number[] = [];
    const searchSamples: number[] = [];

    for (let index = 0; index < 20; index++) {
      const started = performance.now();
      await library.list(owner, { ...filters(), offset: index * 50 });
      samples.push(performance.now() - started);
      const searchStarted = performance.now();
      await library.list(owner, {
        ...filters(),
        query: 'Invoice',
        offset: index * 50,
      });
      searchSamples.push(performance.now() - searchStarted);
    }

    samples.sort((a, b) => a - b);
    searchSamples.sort((a, b) => a - b);
    console.info(
      `Files load fixture: 10001 files, 1000 folders; warm browse p95 ${samples[18]!.toFixed(1)} ms; warm search p95 ${searchSamples[18]!.toFixed(1)} ms; first browse payload ${Buffer.byteLength(JSON.stringify(first))} bytes`,
    );
    const documents = new PrismaDocumentRepository(db);
    const uploaded = await documents.createWithFile(owner, {
      title: 'Beyond fixture.txt',
      folderId: 'load-folder-0',
      file: uploadedAsset('beyond-fixture'),
    });

    await library.move(
      owner,
      [{ kind: 'file', id: uploaded.id, revision: 1 }],
      'load-folder-1',
    );
    expect(await db.document.count()).toBe(10002);
    expect(
      (await library.list(owner, filters('load-folder-1'))).items.map(
        (item) => item.id,
      ),
    ).toEqual([uploaded.id]);
  }, 60_000);

  test('deletion operations and failure details cannot be accessed by another owner', async () => {
    const ref = await file('private');
    const preview = await deletions.preview(owner, [ref], now);
    await expect(deletions.detail(stranger, preview.id)).rejects.toMatchObject({
      reason: 'not_found',
    });
    await expect(
      deletions.failures(stranger, preview.id, 0, 50),
    ).rejects.toMatchObject({ reason: 'not_found' });
  });
});
