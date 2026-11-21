import assert from 'node:assert/strict';
import {
  promptEvalReport,
  type PromptEvalBaseline,
} from './prompt-eval-report';
import { promptEvalRows } from './prompt-eval-review';
import {
  parseScenarioConversations,
  restoreScenarioConversations,
} from './scenario-messages.server';

const meta = {
  model: 'test-model',
  routing: true,
  commit: 'a1b2c3d',
  startedAt: '2026-11-09T06:14:18.156Z',
  runsPerScenario: 3,
};

// Archived reports predate per-run timing and may omit declined tool calls.
const passedRun = {
  text: 'I found your task.',
  calls: [{ name: 'list_tasks', args: { due: 'today' } }],
  routedTools: null,
  unscripted: [],
  usage: { inputTokens: 48, outputTokens: 20 },
  failures: [],
};

const failedRun = {
  ...passedRun,
  failures: [
    { check: 'task-title', reason: 'Expected the task title in the reply.' },
  ],
};

const baseline: PromptEvalBaseline = {
  meta,
  scenarios: [
    { id: 'tasks-today', passed: 3, total: 3 },
    { id: 'tasks-tomorrow', passed: 2, total: 3 },
  ],
};

test('archived reports decode tool call arguments without requiring timing', () => {
  const report = promptEvalReport.parse({
    meta,
    scenarios: [
      { id: 'tasks-today', area: 'tasks', passed: 1, runs: [passedRun] },
    ],
  });

  assert.deepEqual(report.scenarios[0]?.runs[0].calls, [
    { name: 'list_tasks', args: '{\n  "due": "today"\n}' },
  ]);
});

test('reports with inconsistent pass counts are rejected', () => {
  const report = promptEvalReport.safeParse({
    meta,
    scenarios: [
      { id: 'tasks-today', area: 'tasks', passed: 1, runs: [failedRun] },
    ],
  });

  assert.equal(report.success, false);
});

test('a saved conversation takes precedence over fixture text', async () => {
  const saved = promptEvalReport.parse({
    meta,
    scenarios: [
      {
        id: 'tasks-today',
        area: 'tasks',
        message: 'What is due today?\nOnly list open tasks.',
        history: [{ role: 'assistant', content: 'You have two tasks today.' }],
        summary: null,
        passed: 1,
        runs: [passedRun],
      },
    ],
  });

  const report = await restoreScenarioConversations(
    '/unused-fixture-path',
    saved,
  );

  assert.deepEqual(report.scenarios[0]?.history, [
    { role: 'assistant', content: 'You have two tasks today.' },
  ]);
  assert.equal(
    report.scenarios[0]?.message,
    'What is due today?\nOnly list open tasks.',
  );
});

test('a committed fixture recovers messages from literals and the stock lookup factory', () => {
  const conversations = parseScenarioConversations(`
    export const SCENARIOS = [
      { id: 'reminder-reply', message: 'ok, done' },
      stockLookup('open-today', 'Buka stok hari ini'),
    ];
  `);

  assert.deepEqual(
    [...conversations].map(([id, { message }]) => [id, message]),
    [
      ['reminder-reply', 'ok, done'],
      ['open-today', 'Buka stok hari ini'],
    ],
  );
});

test('a legacy reply fixture recovers the user’s words after the computed reference', () => {
  const source =
    'export const SCENARIOS = [{ id: "snooze", message: `Reference: ${fixture()}\\n\\nCurrent message:\\nSnooze for 15 minutes` }];';

  const conversations = parseScenarioConversations(source);

  assert.equal(conversations.get('snooze')?.message, 'Snooze for 15 minutes');
});

test('a legacy fixture recovers earlier turns in order and preserves their roles', () => {
  const conversations = parseScenarioConversations(`
    const REMINDER = { role: 'assistant' as const, content: 'Take medicine.' };
    const REMINDERS = [{
      id: 'reminder-snooze',
      history: [{ role: 'user', content: 'Remind me to take medicine.' }, REMINDER],
      message: 'Snooze for 15 minutes.',
    }];
    export const SCENARIOS = [...REMINDERS];
  `);

  assert.deepEqual(conversations.get('reminder-snooze')?.context?.history, [
    { role: 'user', content: 'Remind me to take medicine.' },
    { role: 'assistant', content: 'Take medicine.' },
  ]);
});

test('a fixture with a computed earlier turn never returns a partial history', () => {
  const conversations = parseScenarioConversations(`
    export const SCENARIOS = [{
      id: 'follow-up',
      history: [{ role: 'user', content: 'First message.' }, getEarlierReply()],
      message: 'Can you check again?',
    }];
  `);

  assert.deepEqual(conversations.get('follow-up'), {
    message: 'Can you check again?',
    context: undefined,
  });
});

test('losing two passing runs flags a regression and brings it to the top', () => {
  const report = promptEvalReport.parse({
    meta,
    scenarios: [
      {
        id: 'tasks-tomorrow',
        area: 'tasks',
        passed: 1,
        runs: [passedRun, failedRun, failedRun],
      },
      {
        id: 'tasks-today',
        area: 'tasks',
        passed: 1,
        runs: [failedRun, passedRun, failedRun],
      },
    ],
  });

  assert.deepEqual(
    promptEvalRows(report, baseline).map(({ scenario, change }) => [
      scenario.id,
      change,
    ]),
    [
      ['tasks-today', 'regression'],
      ['tasks-tomorrow', 'down'],
    ],
  );
});

test('a single passing run is marked as a different sample size against three passing baseline runs', () => {
  const report = promptEvalReport.parse({
    meta: { ...meta, runsPerScenario: 1 },
    scenarios: [
      { id: 'tasks-today', area: 'tasks', passed: 1, runs: [passedRun] },
    ],
  });

  assert.equal(promptEvalRows(report, baseline)[0]?.change, 'sample-size');
});
