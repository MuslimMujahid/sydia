/** Two-sided 95% Wilson score interval, z = 1.959963984540054.
 * These counts must come from reviewed held-out labels, never model self-judging. */
export function wilsonLower95(
  successes: number,
  samples: number,
): number | null {
  if (
    !Number.isSafeInteger(samples) ||
    samples < 0 ||
    !Number.isSafeInteger(successes) ||
    successes < 0 ||
    successes > samples
  )
    throw new Error('Invalid evaluation counts');
  if (!samples) return null;
  const z2 = 1.959963984540054 ** 2;
  const p = successes / samples;

  return (
    (p +
      z2 / (2 * samples) -
      Math.sqrt(z2 * ((p * (1 - p)) / samples + z2 / (4 * samples ** 2)))) /
    (1 + z2 / samples)
  );
}

export type SemanticEvaluation = {
  version: string;
  labelsReviewed: boolean;
  split: 'development' | 'held-out';
  criticalFailures: number;
  // Include each applicable gate separately for every supported language.
  groups: Array<{
    gate: 'eligibility-recall' | 'recall-skip-precision' | 'required-tools';
    language: string;
    successes: number;
    samples: number;
  }>;
};

export function semanticReleaseGate(evaluation: SemanticEvaluation): {
  passed: boolean;
  reasons: string[];
  groups: Array<{ gate: string; language: string; lower95: number | null }>;
} {
  const reasons: string[] = [];
  if (!evaluation.version.trim() || !evaluation.labelsReviewed)
    reasons.push('unreviewed-labels');
  if (evaluation.split !== 'held-out') reasons.push('not-held-out');
  if (
    !Number.isSafeInteger(evaluation.criticalFailures) ||
    evaluation.criticalFailures !== 0
  )
    reasons.push('critical-failures');
  if (!evaluation.groups.length) reasons.push('no-evaluation-groups');
  const groups = evaluation.groups.map(
    ({ gate, language, successes, samples }) => {
      const lower95 = wilsonLower95(successes, samples);
      if (!language.trim() || lower95 === null || lower95 < 0.99)
        reasons.push(`${gate}:${language}:insufficient-parity`);

      return { gate, language, lower95 };
    },
  );

  return { passed: reasons.length === 0, reasons, groups };
}
