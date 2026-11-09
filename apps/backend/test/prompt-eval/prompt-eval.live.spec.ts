import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from '@jest/globals';
import { createHarness, type RunRecord, type Scenario } from './harness';
import { SCENARIOS, SCENARIO_DATE } from './scenarios';
import { DATE_ATTRIBUTION_VERSION } from './date-attribution';
import { ConfigService } from '@nestjs/config';
import { AssistantExecutionSettings } from '../../src/modules/conversations/services/assistant-execution';

// Live: real model and Jev routing, synthetic data, no database or channel
// writes. Run with `bun run eval:prompts`.
const enabled = process.env.PROMPT_EVAL_ENABLED === 'true';
const RUNS = Number(process.env.PROMPT_EVAL_RUNS ?? 3);
const CONCURRENCY = Number(process.env.PROMPT_EVAL_CONCURRENCY ?? 4);
const ONLY = (process.env.PROMPT_EVAL_ONLY ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

// ESM has no __dirname; the eval script runs from apps/backend.
const DIR = join(process.cwd(), 'test/prompt-eval');
const BASELINE = join(DIR, 'baseline.json');
const RESULTS = join(DIR, 'results');

type ScenarioResult = {
  id: string;
  area: string;
  passed: number;
  runs: Array<
    Pick<
      RunRecord,
      | 'text'
      | 'calls'
      | 'unscripted'
      | 'routedTools'
      | 'error'
      | 'usage'
      | 'durationMs'
    > & {
      terminalAcknowledgement: boolean;
      /** Gateway failures retried before this result. */
      retries?: number;
      contextTokens: number | null;
      failures: Array<{ check: string; reason: string }>;
      refused?: Array<{ name: string; args: Record<string, unknown> }>;
    }
  >;
};

type EvalFile = {
  meta: {
    model: string;
    routing: boolean;
    commit: string;
    startedAt: string;
    runsPerScenario: number;
    scoringVersion?: string;
    fixtureDate?: string;
    execution?: AssistantExecutionSettings;
  };
  scenarios: ScenarioResult[];
};

function evaluate(
  scenario: Scenario,
  run: RunRecord,
): ScenarioResult['runs'][number] {
  const failures = scenario.checks.flatMap((check) => {
    const outcome = check.test(run, scenario);

    return outcome === true
      ? []
      : [{ check: check.name, reason: outcome === false ? 'failed' : outcome }];
  });

  return {
    durationMs: run.durationMs,
    text: run.text,
    calls: run.calls,
    refused: run.refused ?? [],
    unscripted: run.unscripted,
    routedTools: run.routedTools,
    error: run.error,
    usage: run.usage,
    terminalAcknowledgement: run.terminalAcknowledgement,
    contextTokens: run.contextTokens?.total ?? null,
    failures,
  };
}

async function pool<T, R>(
  items: T[],
  size: number,
  work: (item: T) => Promise<R>,
) {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]!);
      }
    }),
  );

  return results;
}

/** A run-count drop of 2+ (of 3) is a regression; a 1-run drop is reported as noise. */
function compare(current: EvalFile, baseline: EvalFile | null) {
  const before = new Map(baseline?.scenarios.map((s) => [s.id, s]) ?? []);

  return current.scenarios.map((scenario) => {
    const previous = before.get(scenario.id);
    const drop = previous ? previous.passed - scenario.passed : 0;

    return {
      id: scenario.id,
      area: scenario.area,
      now: `${scenario.passed}/${scenario.runs.length}`,
      before: previous ? `${previous.passed}/${previous.runs.length}` : '—',
      status: !previous
        ? 'new'
        : drop >= 2
          ? 'REGRESSION'
          : drop === 1
            ? 'down 1 (noise?)'
            : drop < 0
              ? 'improved'
              : 'same',
    };
  });
}

function report(current: EvalFile, rows: ReturnType<typeof compare>): string {
  const total = current.scenarios.reduce((sum, s) => sum + s.passed, 0);
  const runs = current.scenarios.reduce((sum, s) => sum + s.runs.length, 0);
  const billedRuns = current.scenarios.flatMap((s) => s.runs);
  const cost =
    billedRuns.length > 0 &&
    billedRuns.every((run) => run.usage.costUsd !== undefined)
      ? `$${billedRuns.reduce((sum, run) => sum + run.usage.costUsd!, 0).toFixed(4)}`
      : 'unavailable';

  const retries = current.scenarios
    .flatMap((s) => s.runs)
    .reduce((sum, run) => sum + (run.retries ?? 0), 0);

  const lines = [
    `# Prompt evaluation — ${current.meta.startedAt}`,
    '',
    `Model ${current.meta.model}, routing ${current.meta.routing ? 'Jev' : 'off'}, commit ${current.meta.commit}, ${current.meta.runsPerScenario} runs per scenario.`,
    `Passed ${total}/${runs} runs. Cost ${cost}. Gateway retries: ${retries}.`,
    '',
    '| Scenario | Area | Now | Baseline | Status |',
    '|---|---|---|---|---|',
    ...rows.map(
      (r) => `| ${r.id} | ${r.area} | ${r.now} | ${r.before} | ${r.status} |`,
    ),
    '',
    '## Failures',
  ];

  for (const scenario of current.scenarios)
    scenario.runs.forEach((run, index) => {
      if (!run.failures.length) return;
      lines.push(
        '',
        `### ${scenario.id} — run ${index + 1}`,
        ...run.failures.map((f) => `- **${f.check}**: ${f.reason}`),
        `- tools: ${run.calls.map((c) => c.name).join(', ') || 'none'}${run.unscripted.length ? ` (unscripted: ${run.unscripted.join(', ')})` : ''}`,
        '',
        '```text',
        run.text || '(empty)',
        '```',
      );
    });

  return lines.join('\n');
}

(enabled ? describe : describe.skip)('Prompt evaluation', () => {
  const harness = enabled ? createHarness(process.env) : null;
  afterAll(async () => harness?.close());

  test(
    'scenarios keep their hard-check pass rate against the baseline',
    async () => {
      const scenarios = SCENARIOS.filter(
        ({ id, area }) =>
          !ONLY.length || ONLY.includes(id) || ONLY.includes(area),
      );

      const jobs = scenarios.flatMap((scenario) =>
        Array.from({ length: RUNS }, () => scenario),
      );

      const records = await pool(jobs, CONCURRENCY, async (scenario) => {
        // Provider hiccups are not prompt behaviour: retry a gateway failure
        // up to twice and record it; a run that still fails counts as failed.
        let run = await harness!.run(scenario);
        let retries = 0;

        while (run.error?.startsWith('ModelGatewayError') && retries < 2) {
          retries += 1;
          run = await harness!.run(scenario);
        }

        return { ...evaluate(scenario, run), retries };
      });

      const current: EvalFile = {
        meta: {
          model: process.env.BACKEND_MODEL_NAME ?? 'unknown',
          routing: process.env.PROMPT_EVAL_ROUTING !== 'off',
          commit: execSync('git rev-parse --short HEAD').toString().trim(),
          startedAt: new Date().toISOString(),
          runsPerScenario: RUNS,
          scoringVersion: DATE_ATTRIBUTION_VERSION,
          fixtureDate: SCENARIO_DATE,
          execution: new AssistantExecutionSettings(
            new ConfigService(process.env),
          ),
        },
        scenarios: scenarios.map((scenario, index) => {
          const runs = records.slice(index * RUNS, (index + 1) * RUNS);

          return {
            id: scenario.id,
            area: scenario.area,
            passed: runs.filter((run) => !run.failures.length).length,
            runs,
          };
        }),
      };

      const baseline = existsSync(BASELINE)
        ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as EvalFile)
        : null;

      const rows = compare(current, baseline);

      mkdirSync(RESULTS, { recursive: true });
      writeFileSync(
        join(RESULTS, 'latest.json'),
        JSON.stringify(current, null, 2),
      );
      writeFileSync(join(RESULTS, 'latest.md'), report(current, rows));
      if (process.env.PROMPT_EVAL_SAVE_BASELINE === 'true')
        writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);

      console.log(report(current, rows).split('\n## Failures')[0]);
      expect(rows.filter((row) => row.status === 'REGRESSION')).toEqual([]);
    },
    60 * 60_000,
  );
});
