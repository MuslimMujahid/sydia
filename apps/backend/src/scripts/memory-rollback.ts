import '../worker-runtime';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MemoryRollbackService } from '../modules/memories/memory-rollback.service';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let userId: string | undefined;
  let execute = false;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--execute') {
      execute = true;
      continue;
    }

    if (args[index] !== '--user-id' || userId)
      throw new Error('Unsupported rollback argument.');
    userId = args[++index];
    if (!userId || userId.startsWith('--'))
      throw new Error('Missing rollback owner.');
  }

  if (!userId)
    throw new Error('Rollback requires --user-id. Dry run is the default.');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const result = await app
      .get(MemoryRollbackService)
      .reconcile(userId, { dryRun: !execute });

    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await app.close();
  }
}

void main().catch(() => {
  process.stderr.write(
    'Memory rollback failed; verify owner/configuration, stop writes, drain deliveries, and check service availability.\n',
  );
  process.exitCode = 1;
});
