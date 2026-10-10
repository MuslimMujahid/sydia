import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TokenCipher } from '../infra/crypto';
import { PrismaModule, PrismaService } from '../infra/prisma';

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

type MigrationOptions = {
  apply: boolean;
  batchSize: number;
};

type CredentialStatus = 'empty' | 'plaintext' | 'encrypted' | 'invalid';

type CredentialInventory = {
  integrationsScanned: number;
  accessTokenPlaintext: number;
  refreshTokenPlaintext: number;
  encryptedCredentialFields: number;
  invalidVersionedCredentialFields: number;
};

type CalendarIntegrationCredentials = {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
};

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  providers: [TokenCipher],
})
class CalendarCredentialMigrationModule {}

class CredentialMigrationError extends Error {
  override readonly name = 'CredentialMigrationError';
}

function parseOptions(args: string[]): MigrationOptions {
  let apply = false;
  let batchSize = DEFAULT_BATCH_SIZE;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--apply') {
      apply = true;
      continue;
    }

    const inlineBatchSize = argument?.match(/^--batch-size=(\d+)$/)?.[1];

    if (inlineBatchSize !== undefined) {
      batchSize = Number(inlineBatchSize);
      continue;
    }

    if (argument === '--batch-size') {
      const nextArgument = args[index + 1];

      if (!nextArgument || !/^\d+$/.test(nextArgument)) {
        throw new CredentialMigrationError(
          'Provide a positive integer after --batch-size.',
        );
      }

      batchSize = Number(nextArgument);
      index += 1;
      continue;
    }

    throw new CredentialMigrationError(
      'Unknown command-line argument supplied.',
    );
  }

  if (
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_BATCH_SIZE
  ) {
    throw new CredentialMigrationError(
      `Batch size must be between 1 and ${MAX_BATCH_SIZE}.`,
    );
  }

  return { apply, batchSize };
}

function credentialStatus(
  value: string | null,
  tokenCipher: TokenCipher,
): CredentialStatus {
  if (value === null) return 'empty';
  const versionedPayload = /^v\d+\./.test(value);
  if (!value.startsWith('v1.'))
    return versionedPayload ? 'invalid' : 'plaintext';

  try {
    tokenCipher.decrypt(value);

    return 'encrypted';
  } catch {
    // Count unreadable versioned values and block apply below. Never emit the
    // credential or the crypto error because it could contain sensitive data.
    return 'invalid';
  }
}

function emptyInventory(): CredentialInventory {
  return {
    integrationsScanned: 0,
    accessTokenPlaintext: 0,
    refreshTokenPlaintext: 0,
    encryptedCredentialFields: 0,
    invalidVersionedCredentialFields: 0,
  };
}

function addCredentialStatus(
  inventory: CredentialInventory,
  status: CredentialStatus,
  field: 'accessToken' | 'refreshToken',
): void {
  if (status === 'plaintext') inventory[`${field}Plaintext`] += 1;
  if (status === 'encrypted') inventory.encryptedCredentialFields += 1;
  if (status === 'invalid') inventory.invalidVersionedCredentialFields += 1;
}

async function inventoryCredentials(
  prisma: PrismaService,
  tokenCipher: TokenCipher,
  batchSize: number,
): Promise<CredentialInventory> {
  const inventory = emptyInventory();
  let cursor: string | undefined;

  while (true) {
    const rows: CalendarIntegrationCredentials[] =
      await prisma.calendarIntegration.findMany({
        where: {
          provider: 'google',
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: batchSize,
        select: { id: true, accessToken: true, refreshToken: true },
      });

    if (rows.length === 0) return inventory;

    for (const row of rows) {
      inventory.integrationsScanned += 1;
      addCredentialStatus(
        inventory,
        credentialStatus(row.accessToken, tokenCipher),
        'accessToken',
      );
      addCredentialStatus(
        inventory,
        credentialStatus(row.refreshToken, tokenCipher),
        'refreshToken',
      );
    }

    cursor = rows[rows.length - 1]?.id;
  }
}

function reportInventory(label: string, inventory: CredentialInventory): void {
  console.info(
    `${label}: integrations=${inventory.integrationsScanned} ` +
      `accessTokenPlaintext=${inventory.accessTokenPlaintext} ` +
      `refreshTokenPlaintext=${inventory.refreshTokenPlaintext} ` +
      `encryptedFields=${inventory.encryptedCredentialFields} ` +
      `invalidVersionedFields=${inventory.invalidVersionedCredentialFields}`,
  );
}

async function migratePlaintextCredentials(
  prisma: PrismaService,
  tokenCipher: TokenCipher,
  batchSize: number,
): Promise<number> {
  let cursor: string | undefined;
  let migratedIntegrations = 0;

  while (true) {
    const rows: CalendarIntegrationCredentials[] =
      await prisma.calendarIntegration.findMany({
        where: {
          provider: 'google',
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: batchSize,
        select: { id: true, accessToken: true, refreshToken: true },
      });

    if (rows.length === 0) return migratedIntegrations;

    for (const row of rows) {
      const accessStatus = credentialStatus(row.accessToken, tokenCipher);
      const refreshStatus = credentialStatus(row.refreshToken, tokenCipher);

      if (accessStatus === 'invalid' || refreshStatus === 'invalid') {
        throw new CredentialMigrationError(
          'An unreadable versioned credential appeared during apply; no further rows were changed.',
        );
      }

      const data: { accessToken?: string; refreshToken?: string } = {};

      if (accessStatus === 'plaintext' && row.accessToken !== null) {
        data.accessToken = tokenCipher.encrypt(row.accessToken);
      }

      if (refreshStatus === 'plaintext' && row.refreshToken !== null) {
        data.refreshToken = tokenCipher.encrypt(row.refreshToken);
      }

      if (Object.keys(data).length > 0) {
        const updated = await prisma.calendarIntegration.updateMany({
          where: {
            id: row.id,
            accessToken: row.accessToken,
            refreshToken: row.refreshToken,
          },
          data,
        });

        if (updated.count !== 1) {
          throw new CredentialMigrationError(
            'A credential row changed during migration. Any earlier rows remain encrypted; rerun inventory before retrying.',
          );
        }

        migratedIntegrations += 1;
      }
    }

    cursor = rows[rows.length - 1]?.id;
  }
}

async function migrateCalendarCredentials(
  prisma: PrismaService,
  tokenCipher: TokenCipher,
  options: MigrationOptions,
): Promise<void> {
  const inventory = await inventoryCredentials(
    prisma,
    tokenCipher,
    options.batchSize,
  );

  reportInventory(
    options.apply ? 'Pre-apply inventory' : 'Dry-run inventory',
    inventory,
  );

  if (inventory.invalidVersionedCredentialFields > 0) {
    throw new CredentialMigrationError(
      'Unreadable versioned credentials were found. Confirm the configured encryption key and inspect the sanitized inventory before applying.',
    );
  }

  if (!options.apply) {
    console.info('Dry run only; pass --apply after reviewing the inventory.');

    return;
  }

  const migratedIntegrations = await migratePlaintextCredentials(
    prisma,
    tokenCipher,
    options.batchSize,
  );

  console.info(
    `Encrypted credentials in ${migratedIntegrations} integration(s).`,
  );

  const verification = await inventoryCredentials(
    prisma,
    tokenCipher,
    options.batchSize,
  );

  reportInventory('Post-apply verification', verification);

  if (
    verification.accessTokenPlaintext > 0 ||
    verification.refreshTokenPlaintext > 0 ||
    verification.invalidVersionedCredentialFields > 0
  ) {
    throw new CredentialMigrationError(
      'Post-apply verification found credentials that are not readable v1 ciphertext; keep the deployment gated.',
    );
  }
}

function safeFailure(error: unknown): string {
  if (error instanceof CredentialMigrationError) return error.message;
  if (!(error instanceof Error))
    return 'Unknown failure; sensitive details were suppressed.';

  const code =
    'code' in error && typeof error.code === 'string' ? ` (${error.code})` : '';

  return `${error.name}${code}; sensitive details were suppressed.`;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(
    CalendarCredentialMigrationModule,
    { logger: false, abortOnError: false },
  );

  let migrationFailed = false;
  let migrationFailure: unknown;

  try {
    await migrateCalendarCredentials(
      app.get(PrismaService),
      app.get(TokenCipher),
      options,
    );
  } catch (error: unknown) {
    migrationFailed = true;
    migrationFailure = error;
  }

  try {
    await app.close();
  } catch (error: unknown) {
    if (!migrationFailed) throw error;
    console.error(
      `Calendar credential migration cleanup failed: ${safeFailure(error)}`,
    );
  }

  if (migrationFailed) throw migrationFailure;
}

void main().catch((error: unknown) => {
  console.error(`Calendar credential migration failed: ${safeFailure(error)}`);
  process.exitCode = 1;
});
