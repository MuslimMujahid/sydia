import { rescoreFiles } from './rescore';

const [backupDirectory, ...files] = process.argv.slice(2);
if (!backupDirectory || !files.length)
  throw new Error(
    'Usage: bun run test/prompt-eval/rescore-cli.ts <backup-directory> <baseline.json> [report.json ...]',
  );

rescoreFiles(backupDirectory, files);
