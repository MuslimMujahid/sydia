import 'dotenv/config';
import { hashPassword } from 'better-auth/crypto';
import { createLocalAccountIssuer } from 'better-auth/db';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { Pool } from 'pg';

const DEMO_USER_ID = 'demo-user-seed';
const DEMO_USER_EMAIL = 'demo.user@example.test';
const DEMO_USER_NAME = 'Demo User';
const DEMO_TIMEZONE = 'Asia/Jakarta';
const DEMO_LOCALE = 'id';
const DEMO_USER_PASSWORD = 'DemoSeed1!';
const DEMO_ACCOUNT_ISSUER = createLocalAccountIssuer('credential');
const DEMO_ACCOUNT_ID = `${DEMO_USER_ID}-credential`;

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value;
}

function databasePort(): number {
  const value = Number(process.env.BACKEND_DB_PORT ?? '5432');

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('BACKEND_DB_PORT must be an integer between 1 and 65535');
  }

  return value;
}

const pool = new Pool({
  host: requiredEnvironmentVariable('BACKEND_DB_HOST'),
  port: databasePort(),
  user: requiredEnvironmentVariable('BACKEND_DB_USER'),
  password: requiredEnvironmentVariable('BACKEND_DB_PASSWORD'),
  database: requiredEnvironmentVariable('BACKEND_DB_NAME'),
});

const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function seed(): Promise<void> {
  const password = await hashPassword(DEMO_USER_PASSWORD);

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
    },
    update: {
      name: DEMO_USER_NAME,
      email: DEMO_USER_EMAIL,
      emailVerified: false,
      image: null,
      timezone: DEMO_TIMEZONE,
      locale: DEMO_LOCALE,
      onboardingCompleted: false,
    },
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
