import type {
  PromptEvalBaseline,
  PromptEvalReport,
  PromptEvalScenario,
} from './prompt-eval-report';

type BaselineScenario = PromptEvalBaseline['scenarios'][number];
type ScenarioChange =
  'new' | 'sample-size' | 'regression' | 'down' | 'improved' | 'same';

function compareScenario(
  scenario: PromptEvalScenario,
  baseline?: BaselineScenario,
): ScenarioChange {
  if (!baseline) return 'new';
  if (baseline.total !== scenario.runs.length) return 'sample-size';

  const drop = baseline.passed - scenario.passed;
  if (drop >= 2) return 'regression';
  if (drop === 1) return 'down';
  if (drop < 0) return 'improved';

  return 'same';
}

export function promptEvalRows(
  report: PromptEvalReport,
  baseline: PromptEvalBaseline | null,
) {
  const baseById = new Map(
    baseline?.scenarios.map((scenario) => [scenario.id, scenario]),
  );

  return report.scenarios
    .map((scenario) => {
      const before = baseById.get(scenario.id);

      return {
        scenario,
        before,
        failed: scenario.runs.length - scenario.passed,
        change: baseline ? compareScenario(scenario, before) : null,
      };
    })
    .sort((left, right) => {
      const regressionOrder =
        Number(right.change === 'regression') -
        Number(left.change === 'regression');

      return regressionOrder || right.failed - left.failed;
    });
}

export type PromptEvalRow = ReturnType<typeof promptEvalRows>[number];
