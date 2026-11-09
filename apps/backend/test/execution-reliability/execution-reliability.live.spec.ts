import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createHarness,
  type RunRecord,
  type Scenario,
} from '../prompt-eval/harness';
import {
  called,
  calledAtMost,
  contains,
  noErrors,
  notCalled,
} from '../prompt-eval/checks';
import { SCENARIOS } from '../prompt-eval/scenarios';

// Additional feature checks; the owner-approved baseline scenarios stay intact.
const enabled = process.env.RELIABILITY_EVAL_ENABLED === 'true';
const runs = Number(process.env.PROMPT_EVAL_RUNS ?? 3);

function multiOutcome(channel?: 'telegram' | 'whatsapp'): Scenario {
  return {
    id: `three-outcomes-${channel ?? 'web'}`,
    area: 'execution-reliability',
    channel,
    user: { locale: 'en' },
    message:
      "Create a task titled 'Prepare budget', a second task titled 'Call supplier', and a reminder 'Submit report' tomorrow at 09:00. Then summarize what you saved.",
    tools: {
      create_task: (args: Record<string, unknown>) => ({
        objectType: 'task',
        object: {
          id: `task-${String(args.title)}`,
          title: args.title,
          dueAt: null,
          priority: 'medium',
        },
      }),
      create_reminder: (args: Record<string, unknown>) => {
        const schedules = args.schedules as Array<{
          date: string;
          time: string;
        }>;

        return {
          reminders: [
            {
              id: 'reminder-report',
              title: args.title,
              scheduledAt: new Date(
                `${schedules[0]!.date}T${schedules[0]!.time}:00+07:00`,
              ).toISOString(),
              recurrence: null,
              status: 'scheduled',
            },
          ],
        };
      },
    },
    checks: [
      noErrors(),
      called('create_task', (args) => args.title === 'Prepare budget'),
      called('create_task', (args) => args.title === 'Call supplier'),
      calledAtMost('create_task', 2),
      called(
        'create_reminder',
        (args) =>
          args.title === 'Submit report' &&
          JSON.stringify(args).includes('09:00'),
      ),
      calledAtMost('create_reminder', 1),
      contains('Prepare budget', 'Call supplier', 'Submit report'),
      called('update_plan'),
      {
        name: 'reconciles every plan step',
        test: (run) =>
          Boolean(run.executionPlan?.steps.length) &&
          run.executionPlan!.steps.every((step) => step.status === 'completed'),
      },
    ],
  };
}

(enabled ? describe : describe.skip)(
  'Execution reliability live checks',
  () => {
    const harness = enabled ? createHarness(process.env) : null;
    const records: Array<{ id: string; run: RunRecord; failures: string[] }> =
      [];

    const scenarios = [
      multiOutcome(),
      multiOutcome('telegram'),
      multiOutcome('whatsapp'),
      ...['smalltalk-thanks', 'tasks-tomorrow-web', 'reminder-create'].map(
        (id) => {
          const scenario = SCENARIOS.find((item) => item.id === id);
          if (!scenario) throw new Error(`Missing baseline scenario ${id}`);

          return {
            ...scenario,
            checks: [...scenario.checks, notCalled('update_plan')],
          };
        },
      ),
    ];

    afterAll(async () => {
      const dir = join(process.cwd(), 'test/prompt-eval/results');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'execution-reliability.json'),
        JSON.stringify(records, null, 2),
      );
      await harness?.close();
    });

    const cases = scenarios.flatMap((scenario) =>
      Array.from({ length: runs }, (_, index) => ({
        ...scenario,
        repetition: index + 1,
      })),
    );

    test.each(cases)(
      '$id (run $repetition) completes requested effects without duplicate writes',
      async (scenario) => {
        const run = await harness!.run(scenario);
        const failures = scenario.checks.flatMap((check) => {
          const outcome = check.test(run, scenario);

          return outcome === true ? [] : [`${check.name}: ${String(outcome)}`];
        });

        records.push({ id: scenario.id, run, failures });
        expect(failures).toEqual([]);
      },
      15 * 60_000,
    );
  },
);
