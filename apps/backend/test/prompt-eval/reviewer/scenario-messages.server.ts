import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ts from 'typescript';
import type {
  EvalConversationTurn,
  FixtureSource,
  PromptEvalReport,
  PromptEvalScenario,
} from './prompt-eval-report';

const runGit = promisify(execFile);
const FIXTURE_PATH = 'apps/backend/test/prompt-eval/scenarios.ts';
const CURRENT_MESSAGE = '\n\nCurrent message:\n';

type FixtureConversation = {
  message?: string;
  context?: { history: EvalConversationTurn[]; summary: string | null };
};
type FixtureBindings = ReadonlyMap<string, ts.Expression | undefined>;

function property(node: ts.ObjectLiteralExpression, key: string) {
  return node.properties.find(
    (item): item is ts.PropertyAssignment =>
      ts.isPropertyAssignment(item) &&
      (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) &&
      item.name.text === key,
  )?.initializer;
}

function literal(node: ts.Node | undefined): string | undefined {
  if (node && ts.isAsExpression(node)) return literal(node.expression);

  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function fixtureContext(
  entry: ts.ObjectLiteralExpression,
  bindings: FixtureBindings,
): FixtureConversation['context'] {
  const history = property(entry, 'history');
  if (history && !ts.isArrayLiteralExpression(history)) return undefined;

  const turns: EvalConversationTurn[] = [];

  for (const item of history?.elements ?? []) {
    const turn = ts.isIdentifier(item) ? bindings.get(item.text) : item;
    if (!turn || !ts.isObjectLiteralExpression(turn)) return undefined;

    const role = literal(property(turn, 'role'));
    const content = literal(property(turn, 'content'));
    if ((role !== 'user' && role !== 'assistant') || content === undefined)
      return undefined;

    turns.push({ role, content });
  }

  const summary = property(entry, 'summary');
  const text = literal(summary);
  if (summary && text === undefined) return undefined;

  return { history: turns, summary: text ?? null };
}

function* fixtureEntries(
  list: ts.ArrayLiteralExpression,
  bindings: FixtureBindings,
  visited: Set<ts.ArrayLiteralExpression>,
): Iterable<ts.Expression> {
  if (visited.has(list)) return;
  visited.add(list);

  for (const entry of list.elements) {
    if (!ts.isSpreadElement(entry)) {
      yield entry;
      continue;
    }

    const source = ts.isIdentifier(entry.expression)
      ? bindings.get(entry.expression.text)
      : entry.expression;

    if (source && ts.isArrayLiteralExpression(source))
      yield* fixtureEntries(source, bindings, visited);
  }
}

export function parseScenarioConversations(
  source: string,
): Map<string, FixtureConversation> {
  const file = ts.createSourceFile(
    'scenarios.ts',
    source,
    ts.ScriptTarget.Latest,
  );

  const bindings = new Map(
    file.statements
      .filter(ts.isVariableStatement)
      .flatMap(({ declarationList }) => [...declarationList.declarations])
      .flatMap(({ name, initializer }) =>
        ts.isIdentifier(name) ? [[name.text, initializer] as const] : [],
      ),
  );

  const scenarios = bindings.get('SCENARIOS');

  const conversations = new Map<string, FixtureConversation>();
  if (!scenarios || !ts.isArrayLiteralExpression(scenarios))
    return conversations;

  for (const entry of fixtureEntries(scenarios, bindings, new Set())) {
    if (ts.isObjectLiteralExpression(entry)) {
      const id = literal(property(entry, 'id'));
      const input = property(entry, 'message');
      let message = literal(input);

      if (input && ts.isTemplateExpression(input)) {
        // Reply fixtures append the user's words after a computed reference.
        const tail = input.templateSpans.at(-1)?.literal.text;
        if (tail?.startsWith(CURRENT_MESSAGE))
          message = tail.slice(CURRENT_MESSAGE.length);
      }

      if (id !== undefined)
        conversations.set(id, {
          message,
          context: fixtureContext(entry, bindings),
        });
    } else if (
      ts.isCallExpression(entry) &&
      ts.isIdentifier(entry.expression) &&
      entry.expression.text === 'stockLookup'
    ) {
      // This fixture factory forwards its first two arguments unchanged.
      const id = literal(entry.arguments[0]);
      const message = literal(entry.arguments[1]);
      if (id !== undefined)
        conversations.set(id, {
          message,
          context: { history: [], summary: null },
        });
    }
  }

  return conversations;
}

async function readFixtureConversations(
  read: () => Promise<string>,
  source: string,
) {
  try {
    return parseScenarioConversations(await read());
  } catch (error) {
    console.warn(
      `[prompt-evals] Could not recover conversations from ${source}`,
      error instanceof Error ? error.message : String(error),
    );

    return new Map<string, FixtureConversation>();
  }
}

function needsFixture(
  scenario: PromptEvalScenario,
  fixture?: FixtureConversation,
): boolean {
  return (
    (scenario.message === undefined && fixture?.message === undefined) ||
    ((scenario.history === undefined || scenario.summary === undefined) &&
      fixture?.context === undefined)
  );
}

function fillFromFixture(
  scenario: PromptEvalScenario,
  fixture: FixtureConversation | undefined,
  source: FixtureSource,
): PromptEvalScenario {
  if (!fixture) return scenario;

  const context = fixture.context;

  return {
    ...scenario,
    ...(scenario.message === undefined && fixture.message !== undefined
      ? { message: fixture.message, messageSource: source }
      : {}),
    ...(scenario.history === undefined && context
      ? { history: context.history, historySource: source }
      : {}),
    ...(scenario.summary === undefined && context
      ? { summary: context.summary, summarySource: source }
      : {}),
  };
}

export async function restoreScenarioConversations(
  directory: string,
  report: PromptEvalReport,
): Promise<PromptEvalReport> {
  const missing = report.scenarios.filter((scenario) => needsFixture(scenario));

  if (!missing.length) return report;

  const commit = report.meta.commit;
  const committed = /^[0-9a-f]{4,64}$/i.test(commit)
    ? await readFixtureConversations(async () => {
        const { stdout } = await runGit(
          'git',
          ['show', `${commit}:${FIXTURE_PATH}`],
          { cwd: directory, encoding: 'utf8' },
        );

        return stdout;
      }, `commit ${commit}`)
    : new Map<string, FixtureConversation>();

  const current = missing.some((scenario) =>
    needsFixture(scenario, committed.get(scenario.id)),
  )
    ? await readFixtureConversations(
        () => readFile(join(directory, 'scenarios.ts'), 'utf8'),
        'the current checkout',
      )
    : undefined;

  return {
    ...report,
    scenarios: report.scenarios.map((scenario) =>
      fillFromFixture(
        fillFromFixture(
          scenario,
          committed.get(scenario.id),
          'committed-fixture',
        ),
        current?.get(scenario.id),
        'current-fixture',
      ),
    ),
  };
}
