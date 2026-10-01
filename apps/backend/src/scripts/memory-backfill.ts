import '../worker-runtime';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { HindsightBackfillService } from '../modules/memories/hindsight-backfill.service';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const allowed = new Set(['--user-id', '--after-id', '--limit', '--execute']);
  const values = new Map<string, string>();
  let execute = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!allowed.has(arg)) throw new Error('Unsupported backfill argument.');

    if (arg === '--execute') {
      execute = true;
      continue;
    }

    const value = args[++index];
    if (!value || value.startsWith('--'))
      throw new Error('Missing backfill argument value.');
    values.set(arg, value);
  }

  const userId = values.get('--user-id');
  if (!userId)
    throw new Error(
      'Backfill requires --user-id. Dry run is the default; --execute writes source intents.',
    );
  const limit = Number(values.get('--limit') ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Backfill limit must be 1–100.');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const result = await app.get(HindsightBackfillService).batch(userId, {
      dryRun: !execute,
      afterId: values.get('--after-id'),
      limit,
    });

    // Source identities/outcomes only; source content and provider secrets stay private.
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.interrupted) process.exitCode = 2;
  } finally {
    await app.close();
  }
}

void main().catch(() => {
  process.stderr.write(
    'Memory backfill failed; verify arguments, owner, namespace, and service configuration.\n',
  );
  process.exitCode = 1;
});
