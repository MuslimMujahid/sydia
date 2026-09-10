import 'dotenv/config';
import { hashPassword } from 'better-auth/crypto';
import { createLocalAccountIssuer } from 'better-auth/db';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { Pool } from 'pg';
import {
  DEFAULT_CATEGORIES,
  normalizeCategoryName,
} from '../src/database/entities/category.entity';

const DEMO_USER_ID = 'demo-user-seed';
const DEMO_USER_EMAIL = 'demo.user@example.test';
const DEMO_USER_NAME = 'Demo User';
const DEMO_TIMEZONE = 'Asia/Jakarta';
const DEMO_LOCALE = 'id';
const DEMO_USER_PASSWORD = 'DemoSeed1!';
const DEMO_ACCOUNT_ISSUER = createLocalAccountIssuer('credential');
const DEMO_ACCOUNT_ID = `${DEMO_USER_ID}-credential`;
const ADMIN_USER_ID = 'admin-user-seed';
const ADMIN_USER_EMAIL = 'admin.user@example.test';
const ADMIN_USER_NAME = 'Sydia Admin';
const ADMIN_USER_PASSWORD = 'AdminSeed1!';
const ADMIN_ACCOUNT_ID = `${ADMIN_USER_ID}-credential`;

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value;
}

const pool = new Pool({
  connectionString: requiredEnvironmentVariable('BACKEND_DB_URL'),
});

const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function seed(): Promise<void> {
  const password = await hashPassword(DEMO_USER_PASSWORD);
  const adminPassword = await hashPassword(ADMIN_USER_PASSWORD);

  await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    create: {
      id: DEMO_USER_ID,
      name: DEMO_USER_NAME,
      email: DEMO_USER_EMAIL,
      emailVerified: false,
      image: null,
      timezone: DEMO_TIMEZONE,
      locale: DEMO_LOCALE,
      onboardingCompleted: false,
      role: 'user',
    },
    update: {
      name: DEMO_USER_NAME,
      email: DEMO_USER_EMAIL,
      emailVerified: false,
      image: null,
      timezone: DEMO_TIMEZONE,
      locale: DEMO_LOCALE,
      onboardingCompleted: false,
      role: 'user',
    },
  });

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((category) => ({
      userId: DEMO_USER_ID,
      ...category,
      normalizedName: normalizeCategoryName(category.name),
    })),
    skipDuplicates: true,
  });

  await prisma.account.upsert({
    where: {
      issuer_accountId: {
        issuer: DEMO_ACCOUNT_ISSUER,
        accountId: DEMO_USER_ID,
      },
    },
    create: {
      id: DEMO_ACCOUNT_ID,
      accountId: DEMO_USER_ID,
      providerId: 'credential',
      issuer: DEMO_ACCOUNT_ISSUER,
      userId: DEMO_USER_ID,
      password,
    },
    update: {
      providerId: 'credential',
      userId: DEMO_USER_ID,
      password,
    },
  });

  await prisma.user.upsert({
    where: { id: ADMIN_USER_ID },
    create: {
      id: ADMIN_USER_ID,
      name: ADMIN_USER_NAME,
      email: ADMIN_USER_EMAIL,
      emailVerified: true,
      image: null,
      timezone: DEMO_TIMEZONE,
      locale: DEMO_LOCALE,
      onboardingCompleted: true,
      role: 'admin',
    },
    update: {
      name: ADMIN_USER_NAME,
      email: ADMIN_USER_EMAIL,
      emailVerified: true,
      timezone: DEMO_TIMEZONE,
      locale: DEMO_LOCALE,
      onboardingCompleted: true,
      role: 'admin',
      banned: false,
      banReason: null,
      banExpires: null,
    },
  });

  await prisma.account.upsert({
    where: {
      issuer_accountId: {
        issuer: DEMO_ACCOUNT_ISSUER,
        accountId: ADMIN_USER_ID,
      },
    },
    create: {
      id: ADMIN_ACCOUNT_ID,
      accountId: ADMIN_USER_ID,
      providerId: 'credential',
      issuer: DEMO_ACCOUNT_ISSUER,
      userId: ADMIN_USER_ID,
      password: adminPassword,
    },
    update: {
      providerId: 'credential',
      userId: ADMIN_USER_ID,
      password: adminPassword,
    },
  });

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((category) => ({
      userId: ADMIN_USER_ID,
      ...category,
      normalizedName: normalizeCategoryName(category.name),
    })),
    skipDuplicates: true,
  });

  console.log(`Seeded admin user ${ADMIN_USER_ID} (${ADMIN_USER_EMAIL})`);
  console.log(
    `Admin credentials: ${ADMIN_USER_EMAIL} / ${ADMIN_USER_PASSWORD}`,
  );

  console.log(`Seeded demo user ${DEMO_USER_ID} (${DEMO_USER_EMAIL})`);
  console.log(`Demo credentials: ${DEMO_USER_EMAIL} / ${DEMO_USER_PASSWORD}`);
}

seed()
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);

    console.error(`Database seed failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
