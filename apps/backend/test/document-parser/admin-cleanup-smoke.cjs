const assert = require('node:assert/strict');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const { PrismaService } = require('../../dist/src/infra/prisma');
const { StorageService } = require('../../dist/src/infra/storage');
const {
  PrismaDocumentRepository,
} = require('../../dist/src/database/repositories/prisma-document.repository');
const {
  PrismaAdminRepository,
} = require('../../dist/src/database/repositories/prisma-admin.repository');
const {
  PrismaAuditEventRepository,
} = require('../../dist/src/database/repositories/prisma-audit-event.repository');
const { AdminService } = require('../../dist/src/modules/admin/admin.service');
const { extractionKey } = require('../../dist/src/shared/documents');

async function main() {
  const [databaseUrl, reportPath] = process.argv.slice(2);
  const database = new URL(databaseUrl);
  assert.equal(database.hostname, '127.0.0.1');
  assert.equal(database.pathname, '/parser_fixture');
  const root = await mkdtemp(join(tmpdir(), 'sydia-admin-cleanup-'));
  const config = new ConfigService({
    BACKEND_DB_URL: databaseUrl,
    BACKEND_STORAGE_LOCAL_ROOT: root,
    BACKEND_STORAGE_BUCKET: '',
  });
  const prisma = new PrismaService(config);
  const storage = new StorageService(config);
  const repository = new PrismaDocumentRepository(prisma);
  const adminRepository = new PrismaAdminRepository(prisma);
  const audit = new PrismaAuditEventRepository(prisma);
  const admin = new AdminService(adminRepository, audit, storage);
  const actor = 'parser-admin-actor';
  const other = 'parser-admin-other';
  const owners = [actor, other];
  const results = [];
  const nativeDelete = storage.delete.bind(storage);
  const nativeDeleteUser = adminRepository.deleteUser.bind(adminRepository);
  let targetKey;
  let mode;
  let sidecarDeletes = 0;
  storage.delete = async (key) => {
    if (key === extractionKey(targetKey)) {
      sidecarDeletes++;
      if (
        mode === 'early-outage' ||
        (mode === 'final-outage' && sidecarDeletes === 2)
      )
        throw new Error('Synthetic checkpoint deletion outage');
    }
    return nativeDelete(key);
  };
  adminRepository.deleteUser = async (userId) => {
    if (mode === 'late-write' || mode === 'final-outage')
      await storage.put(
        extractionKey(targetKey),
        Buffer.from('Synthetic worker checkpoint during account deletion'),
        'application/json',
      );
    return nativeDeleteUser(userId);
  };
  async function asset(owner, suffix) {
    const key = `${owner}/${suffix}`;
    const document = await repository.createWithFile(owner, {
      title: 'fixture.txt',
      file: {
        originalName: 'fixture.txt',
        mimeType: 'text/plain',
        size: 7,
        checksum: 'fixture-checksum',
        storageKey: key,
        kind: 'document',
      },
    });
    await storage.put(key, Buffer.from('fixture'), 'text/plain');
    await storage.put(
      extractionKey(key),
      Buffer.from('Synthetic private extraction checkpoint'),
      'application/json',
    );
    return { key, document };
  }
  try {
    await prisma.user.createMany({
      data: [
        {
          id: actor,
          role: 'admin',
          name: 'Fixture admin',
          email: 'parser-admin-actor@example.invalid',
        },
        {
          id: other,
          name: 'Other owner',
          email: 'parser-admin-other@example.invalid',
        },
      ],
    });
    const kept = await asset(other, 'keep');
    for (const scenario of [
      'ordinary',
      'early-outage',
      'late-write',
      'final-outage',
    ]) {
      const owner = `parser-admin-target-${scenario}`;
      owners.push(owner);
      await prisma.user.create({
        data: {
          id: owner,
          name: 'Deletion fixture',
          email: `${owner}@example.invalid`,
        },
      });
      const first = await asset(owner, 'first');
      const second = await asset(owner, 'second');
      targetKey = first.key;
      sidecarDeletes = 0;
      mode = scenario;
      if (scenario === 'early-outage') {
        await assert.rejects(admin.act(actor, owner, 'delete'), (error) => {
          assert.equal(error.getStatus(), 503);
          assert.equal(error.getResponse().error.details.accountDeleted, false);
          return true;
        });
        assert(await prisma.user.findUnique({ where: { id: owner } }));
        assert(await repository.findById(owner, first.document.id));
        assert((await storage.get(first.key)).length);
        assert((await storage.get(extractionKey(first.key))).length);
        mode = 'ordinary';
        await admin.act(actor, owner, 'delete');
      } else if (scenario === 'final-outage') {
        await assert.rejects(admin.act(actor, owner, 'delete'), (error) => {
          assert.equal(error.getStatus(), 503);
          assert.equal(
            error.getResponse().error.details.cleanupIncomplete,
            true,
          );
          assert.match(
            error.getResponse().error.message,
            /Pengguna telah dihapus/,
          );
          return true;
        });
        assert.equal(
          await prisma.user.findUnique({ where: { id: owner } }),
          null,
        );
        assert((await storage.get(extractionKey(first.key))).length);
        await nativeDelete(extractionKey(first.key));
      } else await assert.doesNotReject(admin.act(actor, owner, 'delete'));
      assert.equal(
        await prisma.user.findUnique({ where: { id: owner } }),
        null,
      );
      assert.equal(
        await prisma.document.count({ where: { userId: owner } }),
        0,
      );
      assert.equal(
        await prisma.fileAsset.count({ where: { userId: owner } }),
        0,
      );
      for (const entry of [first, second]) {
        await assert.rejects(storage.get(entry.key), { code: 'ENOENT' });
        await assert.rejects(storage.get(extractionKey(entry.key)), {
          code: 'ENOENT',
        });
      }
      {
        const event = await prisma.auditEvent.findFirst({
          where: {
            userId: actor,
            eventType: 'admin.user.delete',
            metadata: { path: ['targetUserId'], equals: owner },
          },
        });
        assert(
          event,
          'Deletion audit must remain valid after the target identity is removed',
        );
      }
      assert(await repository.findById(other, kept.document.id));
      assert((await storage.get(kept.key)).length);
      assert((await storage.get(extractionKey(kept.key))).length);
      results.push({
        scenario,
        targetRowsRemoved: true,
        originalAndCheckpointsRemoved: true,
        otherOwnerPreserved: true,
        retainedBeforeEarlyFailure: scenario === 'early-outage',
        lateWriteRemoved: scenario === 'late-write',
        finalOutageReportedAndManuallyRecovered: scenario === 'final-outage',
        deletionAuditVerified: true,
      });
    }
    await assert.rejects(
      admin.act(actor, actor, 'delete'),
      (error) => error.getStatus() === 400,
    );
    assert(await prisma.user.findUnique({ where: { id: actor } }));
    await prisma.session.create({
      data: {
        id: 'parser-admin-session-before-ban',
        token: 'parser-fixture-token-before-ban',
        userId: other,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await admin.act(actor, other, 'ban');
    assert.equal(await prisma.session.count({ where: { userId: other } }), 0);
    assert.equal(
      (await prisma.user.findUnique({ where: { id: other } })).banned,
      true,
    );
    await admin.act(actor, other, 'unban');
    assert.equal(
      (await prisma.user.findUnique({ where: { id: other } })).banned,
      false,
    );
    await prisma.session.create({
      data: {
        id: 'parser-admin-session-before-signout',
        token: 'parser-fixture-token-before-signout',
        userId: other,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await admin.act(actor, other, 'force-sign-out');
    assert.equal(await prisma.session.count({ where: { userId: other } }), 0);
    results.push({
      scenario: 'existing-admin-actions',
      selfDeletionRejected: true,
      banUnbanAndSignoutPreserved: true,
    });
    const report = {
      generatedAt: new Date().toISOString(),
      passed: true,
      node: process.version,
      database: 'Real disposable PostgreSQL and Prisma repositories',
      databaseVersion: (await prisma.$queryRawUnsafe('SHOW server_version'))[0]
        .server_version,
      appliedMigrations: (
        await prisma.$queryRawUnsafe(
          'SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
        )
      )[0].count,
      storage:
        'Real local storage with controlled deletion outages and a checkpoint write in the account-delete window',
      checkpoints: 'Synthetic sidecar bytes at the production extraction key',
      paidProviderCalls: 0,
      realConcurrentWorkerVerified: false,
      durableCleanupRecoveryVerified: false,
      results,
    };
    if (reportPath)
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: owners } } });
    await prisma.onModuleDestroy();
    await rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
