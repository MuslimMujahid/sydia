import type {
  EvalConversationTurn,
  FixtureSource,
  PromptEvalRun,
  PromptEvalScenario,
} from './prompt-eval-report';
import type { PromptEvalRow } from './prompt-eval-review';

const changes = {
  new: 'New',
  'sample-size': 'Different run counts',
  regression: 'Regression',
  down: 'Down 1',
  improved: 'Improved',
  same: 'Unchanged',
} satisfies Record<NonNullable<PromptEvalRow['change']>, string>;

const compact = window.matchMedia('(max-width: 39rem)');

compact.addEventListener('change', ({ matches }) => {
  for (const cell of document.querySelectorAll<HTMLTableCellElement>(
    'td[data-comparison-span]',
  )) {
    cell.colSpan = matches ? 2 : 4;
  }
});

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;

  return node;
}

function toolCalls(
  label: string,
  calls: PromptEvalRun['calls'],
): HTMLElement[] {
  if (!calls.length) return [];

  const details = element('details', 'tool-calls');
  const list = element('ol');

  for (const { name, args } of calls) {
    const item = element('li');
    item.append(
      element('code', undefined, name),
      element('pre', undefined, args),
    );
    list.append(item);
  }

  details.append(
    element('summary', undefined, `${label} (${calls.length})`),
    list,
  );

  return [details];
}

function fixtureNote(source: FixtureSource): HTMLParagraphElement {
  return element(
    'p',
    'metadata message-source',
    source === 'committed-fixture'
      ? 'Recovered from the scenario fixture at the report’s commit.'
      : 'Recovered from the current fixture. It may differ from the original run.',
  );
}

function conversationTurn(
  speaker: EvalConversationTurn['role'],
  label: string,
  text: string | undefined,
  unavailable?: string,
): HTMLLIElement {
  const turn = element('li', 'conversation-turn');
  turn.dataset.speaker = speaker;

  const body =
    text === undefined
      ? element('p', 'metadata', unavailable)
      : element('p', 'message-bubble', text || '(Empty message)');

  body.prepend(element('span', 'conversation-speaker', `${label}. `));
  turn.append(body);

  return turn;
}

function showConversation(
  scenario: PromptEvalScenario,
  run: PromptEvalRun,
): HTMLElement {
  const conversation = element('section', 'conversation');
  conversation.append(element('h3', undefined, 'Conversation'));

  if (scenario.summary) {
    const summary = element('details', 'conversation-summary');
    summary.append(
      element('summary', undefined, 'Conversation summary'),
      element('p', 'reply', scenario.summary),
    );
    if (scenario.summarySource)
      summary.append(fixtureNote(scenario.summarySource));
    conversation.append(summary);
  }

  if (scenario.history === undefined) {
    conversation.append(
      element(
        'p',
        'metadata',
        'Earlier messages are unavailable for this report.',
      ),
    );
  }

  const transcript = element('ol', 'conversation-turns');
  transcript.setAttribute('role', 'list');

  for (const turn of scenario.history ?? []) {
    transcript.append(
      conversationTurn(
        turn.role,
        turn.role === 'user'
          ? 'Earlier user message'
          : 'Earlier assistant message',
        turn.content,
      ),
    );
  }

  const input = conversationTurn(
    'user',
    'User message',
    scenario.message,
    'This report did not save the message, and no matching fixture is available.',
  );

  const reply = conversationTurn(
    'assistant',
    'Assistant reply',
    run.text || undefined,
    'No reply was saved.',
  );

  reply.append(
    ...toolCalls('Tool calls', run.calls),
    ...toolCalls('Refused tool calls', run.refused ?? []),
  );

  if (run.unscripted.length) {
    reply.append(
      element(
        'p',
        'metadata unscripted-tools',
        `Unscripted tools: ${run.unscripted.join(', ')}`,
      ),
    );
  }

  transcript.append(input, reply);
  conversation.append(transcript);

  return conversation;
}

function showRun(
  scenario: PromptEvalScenario,
  run: PromptEvalRun,
  content: HTMLElement,
) {
  content.replaceChildren();

  if (run.failures.length) {
    const list = element('ul', 'failed-checks');

    for (const { check, reason } of run.failures) {
      const item = element('li');
      item.append(
        element('code', undefined, check),
        element('span', undefined, reason),
      );
      list.append(item);
    }

    content.append(element('h3', 'negative', 'Failed checks'), list);
  } else {
    content.append(element('p', 'checks-passed', 'All checks passed'));
  }

  if (run.error) content.append(element('p', 'negative run-error', run.error));

  content.append(showConversation(scenario, run));

  const { inputTokens, outputTokens, costUsd } = run.usage;
  const metrics = [
    run.durationMs === undefined
      ? null
      : `${(run.durationMs / 1_000).toFixed(1)} s`,
    inputTokens === undefined
      ? null
      : `${inputTokens.toLocaleString('en')} input tokens`,
    outputTokens === undefined
      ? null
      : `${outputTokens.toLocaleString('en')} output tokens`,
    costUsd === undefined ? null : `$${costUsd.toFixed(5)}`,
    run.retries
      ? `${run.retries} ${run.retries === 1 ? 'retry' : 'retries'}`
      : null,
  ].filter(Boolean);

  if (metrics.length)
    content.append(element('p', 'metadata run-metrics', metrics.join(' · ')));
}

function inspectScenario(scenario: PromptEvalScenario): HTMLElement {
  const panel = element('div', 'run-inspector');
  const runs = element('div', 'run-buttons');
  runs.setAttribute('role', 'group');
  runs.setAttribute('aria-label', 'Saved runs');
  const content = element('div', 'run-content');
  const buttons = scenario.runs.map((run, index) => {
    const label = `Run ${index + 1}`;
    const failed = run.failures.length > 0;
    const button = element(
      'button',
      undefined,
      failed ? `${label} · Failed` : label,
    );

    button.type = 'button';
    button.dataset.failed = String(failed);
    button.setAttribute(
      'aria-label',
      `${label}, ${failed ? 'failed' : 'passed'}`,
    );
    button.addEventListener('click', () => selectRun(index, run));
    runs.append(button);

    return button;
  });

  function selectRun(index: number, run: PromptEvalRun) {
    buttons.forEach((button, position) =>
      button.setAttribute('aria-pressed', String(position === index)),
    );
    showRun(scenario, run, content);
  }

  const firstFailure = Math.max(
    0,
    scenario.runs.findIndex((run) => run.failures.length > 0),
  );

  selectRun(firstFailure, scenario.runs[firstFailure] ?? scenario.runs[0]);
  panel.append(runs, content);

  return panel;
}

function spanningCell(
  compare: boolean,
  className?: string,
): HTMLTableCellElement {
  const cell = element('td', className);
  cell.colSpan = compare && !compact.matches ? 4 : 2;
  if (compare) cell.dataset.comparisonSpan = '';

  return cell;
}

export function showRows(
  table: HTMLTableSectionElement,
  rows: PromptEvalRow[],
  compare: boolean,
  emptyMessage: string,
): void {
  const fragment = document.createDocumentFragment();
  let open: { button: HTMLButtonElement; row: HTMLTableRowElement } | undefined;

  for (const { scenario, before, failed, change } of rows) {
    const row = element('tr', 'scenario');
    const title = element('th');
    title.scope = 'row';
    const button = element('button', 'scenario-toggle');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    const label = element('span', 'scenario-label');
    label.append(
      element('code', undefined, scenario.id),
      element('span', 'metadata', scenario.area),
    );
    button.append(element('span', 'chevron'), label);
    title.append(button);

    const score = element('td', 'score');
    score.append(
      element(
        'span',
        failed ? 'negative run-count' : 'run-count',
        `${scenario.passed}/${scenario.runs.length}`,
      ),
    );
    row.append(title, score);

    if (compare) {
      const baseline = before ? `${before.passed}/${before.total}` : '—';
      const changeLabel = change ? changes[change] : '—';
      const tone = change === 'regression' ? 'negative' : 'metadata';
      const mobile = element('div', 'mobile mobile-comparison');
      if (before)
        mobile.append(element('span', 'metadata', `Baseline ${baseline}`));
      mobile.append(element('span', tone, changeLabel));
      score.append(mobile);
      row.append(
        element('td', 'baseline-column run-count metadata', baseline),
        element('td', `change-column ${tone}`, changeLabel),
      );
    }

    button.addEventListener('click', () => {
      const wasOpen = open?.button === button;
      open?.button.setAttribute('aria-expanded', 'false');
      open?.row.remove();
      open = undefined;
      if (wasOpen) return;

      const inspectorRow = element('tr', 'inspector-row');
      const cell = spanningCell(compare);
      cell.append(inspectScenario(scenario));
      inspectorRow.append(cell);
      row.after(inspectorRow);
      button.setAttribute('aria-expanded', 'true');
      open = { button, row: inspectorRow };
    });
    fragment.append(row);
  }

  if (!rows.length) {
    const row = element('tr');
    const cell = spanningCell(compare, 'empty');
    const status = element('p', undefined, emptyMessage);
    status.setAttribute('role', 'status');
    cell.append(status);
    row.append(cell);
    fragment.append(row);
  }

  table.replaceChildren(fragment);
}
