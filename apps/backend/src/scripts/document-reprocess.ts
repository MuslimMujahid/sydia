import '../worker-runtime';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DocumentReprocessingService } from '../modules/documents';
import { parseReprocessingArguments } from './document-reprocess.arguments';

async function main(): Promise<void> {
  const options = parseReprocessingArguments(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const result = await app
      .get(DocumentReprocessingService)
      .batch(options.userId, options.documentIds, {
        dryRun: !options.execute,
        limit: options.limit,
        afterId: options.afterId,
        refreshExtraction: options.refreshExtraction,
        onProgress: (outcome, afterId) =>
          process.stdout.write(
            `${JSON.stringify({ event: 'document-reprocessing-progress', ...outcome, afterId })}\n`,
          ),
      });

    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.interrupted) process.exitCode = 2;
  } finally {
    await app.close();
  }
}

void main().catch(() => {
  process.stderr.write(
    'Document reprocessing failed; verify arguments, owner, parser configuration, and paused queue state.\n',
  );
  process.exitCode = 1;
});
