import type { PromptEvalReport, PromptEvalReview } from './prompt-eval-report';
import { promptEvalRows, type PromptEvalRow } from './prompt-eval-review';
import { element, showRows } from './report-view';

function required<T extends HTMLElement>(id: string): T {
  const node = document.querySelector<T>(`#${id}`);
  if (!node) throw new Error(`Prompt eval reviewer is missing #${id}`);

  return node;
}

const picker = required<HTMLSelectElement>('report');
const refresh = required<HTMLButtonElement>('refresh');
const archives = required<HTMLOptGroupElement>('archives');
const notice = required('notice');
const issues = required('issues');
const review = required('review');
const totals = required('totals');
const metadata = required('metadata');
const scoring = required('scoring');
const table = required<HTMLTableSectionElement>('rows');
const search = required<HTMLInputElement>('search');

const filters = {
  all: {
    button: required('all'),
    label: 'All',
    empty: 'This report contains no scenarios.',
  },
  failed: {
    button: required('failed'),
    label: 'Has failures',
    empty: 'No failed runs in this report.',
  },
  regression: {
    button: required('regression'),
    label: 'Regressions',
    empty: 'No scenarios lost two or more passing runs.',
  },
};

const filterKeys = ['all', 'failed', 'regression'] as const;
let filter: (typeof filterKeys)[number] = 'all';
let rows: PromptEvalRow[] = [];
let compare = false;

const reportDate = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

function showSummary({ meta, scenarios }: PromptEvalReport) {
  const passed = scenarios.reduce(
    (total, scenario) => total + scenario.passed,
    0,
  );

  const runs = scenarios.flatMap((scenario) => scenario.runs);
  const costs = runs.map(({ usage }) => usage.costUsd);
  const cost =
    costs.length && costs.every((value) => value !== undefined)
      ? `$${costs.reduce((total, value) => total + value, 0).toFixed(4)}`
      : 'Unavailable';

  const count = element('span', 'summary-stat');
  count.append(
    element('strong', 'run-count', `${passed}/${runs.length}`),
    ' runs passed',
  );
  const scenarioCount = element('span', 'summary-stat');
  scenarioCount.append(
    element('strong', 'run-count', `${scenarios.length}`),
    ' scenarios',
  );
  const costStat = element('span', 'summary-stat');
  costStat.append('Cost ', element('strong', undefined, cost));
  totals.replaceChildren(count, scenarioCount, costStat);

  const time = element(
    'time',
    undefined,
    `${reportDate.format(new Date(meta.startedAt))} UTC`,
  );

  time.dateTime = meta.startedAt;
  metadata.replaceChildren(
    time,
    element('span', undefined, meta.model),
    element('code', undefined, meta.commit),
    element('span', undefined, meta.routing ? 'Routing on' : 'Routing off'),
  );
}

function redraw() {
  const byFilter = {
    all: rows,
    failed: rows.filter((row) => row.failed > 0),
    regression: rows.filter((row) => row.change === 'regression'),
  };

  for (const key of filterKeys) {
    const { button, label } = filters[key];
    button.replaceChildren(
      label,
      element('span', 'run-count', ` ${byFilter[key].length}`),
    );
    button.setAttribute('aria-pressed', String(key === filter));
  }

  const needle = search.value.trim().toLowerCase();
  const visible = byFilter[filter].filter(({ scenario }) =>
    `${scenario.id} ${scenario.area}`.toLowerCase().includes(needle),
  );

  showRows(
    table,
    visible,
    compare,
    needle ? 'No scenarios match your search.' : filters[filter].empty,
  );
}

function showReport(payload: PromptEvalReview, id: string) {
  const { selected } = payload;
  archives.replaceChildren(
    ...payload.archives.map(
      ({ id: archive }) =>
        new Option(archive.slice('results/'.length, -'.json'.length), archive),
    ),
  );
  archives.hidden = !payload.archives.length;
  picker.value = id;

  if (!picker.value) {
    const missing = new Option('Unavailable archive', id, false, true);
    archives.append(missing);
    archives.hidden = false;
  }

  issues.hidden = !payload.issues.length;
  required('issue-list').replaceChildren(
    ...payload.issues.map((issue) => element('li', undefined, issue)),
  );

  if (selected.status !== 'ready') {
    notice.className = 'message';
    notice.replaceChildren(element('p', undefined, selected.message));

    if (id === 'results/latest.json' && selected.status === 'missing') {
      const hint = element('p', 'metadata');
      hint.append(
        'Run ',
        element('code', undefined, 'bun run eval:prompts'),
        ' in apps/backend and refresh, or choose the Git baseline.',
      );
      notice.append(hint);
    }

    return;
  }

  const baseline = id === 'baseline.json' ? null : payload.baseline;
  compare = baseline !== null;
  rows = promptEvalRows(selected.report, baseline);
  if (!compare && filter === 'regression') filter = 'all';
  filters.regression.button.hidden = !compare;
  required('baseline-heading').hidden = !compare;
  required('change-heading').hidden = !compare;
  scoring.hidden =
    !baseline ||
    baseline.meta.scoringVersion === selected.report.meta.scoringVersion;
  showSummary(selected.report);
  redraw();
  notice.hidden = true;
  review.hidden = false;
}

async function load() {
  const id = picker.value;
  picker.disabled = true;
  refresh.disabled = true;
  review.hidden = true;
  issues.hidden = true;
  notice.className = 'loading';
  notice.textContent = 'Loading saved reports…';
  notice.hidden = false;

  try {
    const response = await fetch(
      `/api/reports?${new URLSearchParams({ report: id })}`,
    );

    if (!response.ok)
      throw new Error(`Report request failed with HTTP ${response.status}`);
    const payload = (await response.json()) as PromptEvalReview;
    showReport(payload, id);
  } catch (error) {
    console.error('[prompt-evals] Could not load the selected report', error);
    notice.className = 'message negative';
    notice.textContent =
      'Could not load the saved reports. Check the reviewer terminal and select Refresh.';
  } finally {
    picker.disabled = false;
    refresh.disabled = false;
  }
}

for (const key of filterKeys) {
  filters[key].button.addEventListener('click', () => {
    filter = key;
    redraw();
  });
}

search.addEventListener('input', redraw);
picker.addEventListener('change', () => {
  filter = 'all';
  search.value = '';
  void load();
});
refresh.addEventListener('click', () => void load());
void load();
