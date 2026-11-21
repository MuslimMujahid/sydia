import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import {
  BASELINE_REPORT,
  LATEST_REPORT,
  promptEvalReport,
  reportMetadata,
  type PromptEvalReview,
} from './prompt-eval-report';
import { restoreScenarioConversations } from './scenario-messages.server';

const archiveHeader = z.object({
  meta: reportMetadata,
  scenarios: z.array(z.object({ id: z.string(), runs: z.array(z.unknown()) })),
});

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

async function readJson(directory: string, id: string) {
  try {
    const value: unknown = JSON.parse(
      await readFile(resolve(directory, id), 'utf8'),
    );

    return { status: 'ready', value } as const;
  } catch (error) {
    console.warn(`[prompt-evals] Could not read ${id}`, error);

    return isMissing(error)
      ? ({
          status: 'missing',
          message: `${id} has not been saved in this checkout.`,
        } as const)
      : ({
          status: 'invalid',
          message: `Could not read ${id}. Check that it contains valid JSON and is readable.`,
        } as const);
  }
}

async function readReport(
  directory: string,
  id: string,
): Promise<PromptEvalReview['selected']> {
  const source = await readJson(directory, id);
  if (source.status !== 'ready') return source;

  const parsed = promptEvalReport.safeParse(source.value);
  if (parsed.success) return { status: 'ready', report: parsed.data };

  console.warn(`[prompt-evals] Invalid report ${id}`, parsed.error.issues);

  return {
    status: 'invalid',
    message: `${id} does not match the prompt eval report format.`,
  };
}

async function listArchives(
  directory: string,
): Promise<Pick<PromptEvalReview, 'archives' | 'issues'>> {
  try {
    const entries = await readdir(resolve(directory, 'results'), {
      withFileTypes: true,
      recursive: true,
    });

    const archives: PromptEvalReview['archives'] = [];
    const issues: string[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const id = relative(directory, resolve(entry.parentPath, entry.name))
        .split(sep)
        .join('/');

      if (id === LATEST_REPORT) continue;

      const source = await readJson(directory, id);

      if (source.status !== 'ready') {
        issues.push(source.message);
        continue;
      }

      // The results directory also holds comparison summaries and other eval outputs.
      const parsed = archiveHeader.safeParse(source.value);
      if (parsed.success)
        archives.push({ id, startedAt: parsed.data.meta.startedAt });
    }

    archives.sort(
      (a, b) =>
        Date.parse(b.startedAt) - Date.parse(a.startedAt) ||
        a.id.localeCompare(b.id),
    );

    return { archives, issues };
  } catch (error) {
    console.warn('[prompt-evals] Could not list archived reports', error);

    return {
      archives: [],
      issues: isMissing(error)
        ? []
        : [
            'Could not list archived reports. Check that test/prompt-eval/results is readable.',
          ],
    };
  }
}

export async function readPromptEvalReview(
  directory: string,
  id: string,
): Promise<PromptEvalReview> {
  const [baseline, { archives, issues }] = await Promise.all([
    readReport(directory, BASELINE_REPORT),
    listArchives(directory),
  ]);

  let selected: PromptEvalReview['selected'];

  if (id === BASELINE_REPORT) {
    selected = baseline;
  } else if (
    id === LATEST_REPORT ||
    archives.some((archive) => archive.id === id)
  ) {
    selected = await readReport(directory, id);
  } else {
    selected = {
      status: 'missing',
      message:
        'This archived report is unavailable. Choose another saved report.',
    };
  }

  return {
    archives,
    issues:
      id !== BASELINE_REPORT && baseline.status !== 'ready'
        ? [baseline.message, ...issues]
        : issues,
    baseline:
      baseline.status === 'ready'
        ? {
            meta: baseline.report.meta,
            scenarios: baseline.report.scenarios.map(
              ({ id, passed, runs }) => ({
                id,
                passed,
                total: runs.length,
              }),
            ),
          }
        : null,
    selected:
      selected.status === 'ready'
        ? {
            status: 'ready',
            report: await restoreScenarioConversations(
              directory,
              selected.report,
            ),
          }
        : selected,
  };
}
