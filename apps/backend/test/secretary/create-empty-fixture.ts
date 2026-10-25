import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../../src/generated/prisma/client';

async function main(): Promise<void> {
  const manifestPath = process.argv[2];
  const databaseUrl = process.env.BACKEND_DB_URL;
  if (
    !manifestPath ||
    !databaseUrl ||
    !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)
  )
    throw new Error(
      'An existing QA manifest and loopback database are required.',
    );
  const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !('accounts' in manifest) ||
    !Array.isArray(manifest.accounts)
  )
    throw new Error('Missing QA manifest accounts.');
  const original: unknown = manifest.accounts.find(
    (account: unknown) =>
      account &&
      typeof account === 'object' &&
      'role' in account &&
      account.role === 'empty',
  );

  if (
    !original ||
    typeof original !== 'object' ||
    !('id' in original) ||
    typeof original.id !== 'string' ||
    !/^secretary-qa-[a-f0-9]+-empty$/.test(original.id)
  )
    throw new Error('An existing dedicated empty QA account is required.');
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const credential = await prisma.account.findFirstOrThrow({
      where: { userId: original.id, providerId: 'credential' },
    });

    const id = `${original.id}-${randomBytes(4).toString('hex')}`;
    const email = `${id}@example.test`;
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id,
          email,
          name: 'Secretary QA empty',
          emailVerified: true,
          timezone: 'Asia/Makassar',
          locale: 'id',
          onboardingCompleted: true,
          automaticMemoryEnabled: false,
        },
      });
      await tx.account.create({
        data: {
          id: `${id}-credential`,
          userId: id,
          accountId: id,
          providerId: credential.providerId,
          issuer: credential.issuer,
          password: credential.password,
        },
      });
      await tx.billingAccount.create({
        data: {
          userId: id,
          trialStartsAt: new Date(),
          trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
        },
      });
    });
    const counts = {
      conversations: await prisma.conversation.count({ where: { userId: id } }),
      notes: await prisma.workspaceItem.count({ where: { userId: id } }),
      tasks: await prisma.task.count({ where: { userId: id } }),
      events: await prisma.calendarEvent.count({ where: { userId: id } }),
      memoryBanks: await prisma.hindsightBank.count({ where: { userId: id } }),
    };

    if (Object.values(counts).some((value) => value !== 0))
      throw new Error('New empty account is not empty.');
    const path = resolve(dirname(manifestPath), `manifest-${id}.json`);
    await writeFile(
      path,
      JSON.stringify(
        {
          ...manifest,
          accounts: [{ role: 'empty', id, email }],
          emptyVerifiedAt: new Date().toISOString(),
          emptyCounts: counts,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(JSON.stringify({ manifest: path, counts }, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Empty QA fixture creation failed.', error);
  process.exitCode = 1;
});
