import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { contains, notContains } from './checks';
import {
  checkDateAttribution,
  DATE_ATTRIBUTION_VERSION,
  dateScopeSpec,
} from './date-attribution';

const failureSchema = z.object({ check: z.string(), reason: z.string() });
const reportSchema = z
  .object({
    meta: z
      .object({
        startedAt: z.iso.datetime(),
        scoringVersion: z.string().optional(),
        fixtureDate: z.iso.date().optional(),
      })
      .passthrough(),
    scenarios: z.array(
      z
        .object({
          id: z.string(),
          area: z.string(),
          passed: z.number().int().nonnegative(),
          runs: z.array(
            z
              .object({ text: z.string(), failures: z.array(failureSchema) })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type SavedReport = z.infer<typeof reportSchema>;

/** Re-evaluate every dated answer; unrelated checks and original outputs remain intact. */
export function rescoreReport(value: unknown): SavedReport {
  reportSchema.parse(value);
  // Validation must not reorder or strip the archived provider/tool fields.
  const report = structuredClone(value) as SavedReport;
  const today =
    report.meta.fixtureDate ??
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(report.meta.startedAt));

  for (const scenario of report.scenarios) {
    const spec = dateScopeSpec(scenario.id, today);
    if (!spec) continue;
    const requested = spec.rows
      .filter((row) => row.date === spec.requestedDate)
      .map((row) => row.fragment);

    const others = spec.rows
      .filter((row) => row.date !== spec.requestedDate)
      .map((row) => row.fragment);

    const name = 'correctly attributes requested-day rows and totals';
    const replaced = new Set([
      contains(...requested).name,
      notContains(...others).name,
      name,
    ]);

    for (const run of scenario.runs) {
      run.failures = run.failures.filter(
        (failure) => !replaced.has(failure.check),
      );
      const result = checkDateAttribution(run.text, spec);
      if (result !== true) run.failures.push({ check: name, reason: result });
    }

    scenario.passed = scenario.runs.filter(
      (run) => !run.failures.length,
    ).length;
  }

  report.meta.scoringVersion = DATE_ATTRIBUTION_VERSION;
  report.meta.fixtureDate = today;

  return report;
}

export function scoreMarkdown(
  report: SavedReport,
  baseline: SavedReport,
): string {
  const before = new Map(
    baseline.scenarios.map((scenario) => [scenario.id, scenario.passed]),
  );

  const passed = report.scenarios.reduce(
    (sum, scenario) => sum + scenario.passed,
    0,
  );

  const total = report.scenarios.reduce(
    (sum, scenario) => sum + scenario.runs.length,
    0,
  );

  const lines = [
    '# Prompt evaluation — automatic date attribution v2',
    '',
    `Passed ${passed}/${total} samples. Rescored saved outputs; no new model calls. Other checks, including language, are unchanged.`,
    '',
    '| Scenario | Passing | Baseline | Gate |',
    '|---|---:|---:|---|',
  ];

  for (const scenario of report.scenarios) {
    const previous = before.get(scenario.id);
    lines.push(
      `| ${scenario.id} | ${scenario.passed}/${scenario.runs.length} | ${previous === undefined ? 'new' : previous} | ${previous !== undefined && previous - scenario.passed >= 2 ? 'REGRESSION' : 'pass'} |`,
    );
  }

  lines.push('', '## Failed checks');

  for (const scenario of report.scenarios) {
    for (const [index, run] of scenario.runs.entries()) {
      if (!run.failures.length) continue;
      lines.push(
        '',
        `### ${scenario.id} — sample ${index + 1}`,
        ...run.failures.map(
          (failure) => `- **${failure.check}**: ${failure.reason}`,
        ),
        '',
        '```text',
        run.text,
        '```',
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

export function rescoreFiles(backupDirectory: string, files: string[]): void {
  if (!backupDirectory || !files.length)
    throw new Error(
      'Usage: bun run test/prompt-eval/rescore.ts <backup-directory> <baseline.json> [report.json ...]',
    );
  mkdirSync(backupDirectory, { recursive: true });
  const inputs = files.map((file) => ({
    file,
    raw: readFileSync(file, 'utf8'),
  }));

  const reports = inputs.map(({ raw }) =>
    rescoreReport(JSON.parse(raw) as unknown),
  );

  for (const [index, input] of inputs.entries()) {
    const original = reportSchema.parse(JSON.parse(input.raw) as unknown);
    const backup = join(backupDirectory, basename(input.file));
    if (resolve(backup) === resolve(input.file))
      throw new Error('Backup must differ from the input.');

    if (original.meta.scoringVersion !== DATE_ATTRIBUTION_VERSION) {
      if (existsSync(backup) && readFileSync(backup, 'utf8') !== input.raw)
        throw new Error(`Refusing to replace different original: ${backup}`);
      if (!existsSync(backup)) writeFileSync(backup, input.raw, { flag: 'wx' });
      const markdown = input.file.replace(/\.json$/, '.md');
      const savedMarkdown = join(backupDirectory, basename(markdown));
      if (existsSync(markdown) && !existsSync(savedMarkdown))
        writeFileSync(savedMarkdown, readFileSync(markdown), { flag: 'wx' });
    }

    const report = reports[index]!;
    if (original.meta.scoringVersion !== DATE_ATTRIBUTION_VERSION)
      report.meta.rescoredFromSha256 = createHash('sha256')
        .update(input.raw)
        .digest('hex');
    writeFileSync(input.file, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(
      join(dirname(input.file), basename(input.file, '.json') + '.md'),
      scoreMarkdown(report, reports[0]!),
    );
    console.log(
      `${input.file}: ${report.scenarios.reduce((sum, s) => sum + s.passed, 0)}/${report.scenarios.reduce((sum, s) => sum + s.runs.length, 0)}`,
    );
  }
}
