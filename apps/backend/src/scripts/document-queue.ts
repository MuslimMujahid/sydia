import '../worker-runtime';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { QueueService } from '../infra/queue';

async function main(): Promise<void> {
  const [action, ...extra] = process.argv.slice(2);
  if (!['pause', 'status', 'resume'].includes(action ?? '') || extra.length)
    throw new Error('Choose document queue pause, status, or resume.');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const queue = app.get(QueueService).documents;
    if (action === 'pause') await queue.pause();

    if (action === 'resume') {
      const client = await queue.getBackend().client;
      if (await client.get(queue.toKey('reprocessing-lease')))
        throw new Error(
          'A maintenance command still holds the document queue lease.',
        );
      await queue.resume();
    }

    process.stdout.write(
      `${JSON.stringify({ paused: await queue.isPaused(), activeJobs: await queue.getActiveCount() })}\n`,
    );
  } finally {
    await app.close();
  }
}

void main().catch(() => {
  process.stderr.write(
    'Document queue command failed; verify arguments and maintenance/service state.\n',
  );
  process.exitCode = 1;
});
