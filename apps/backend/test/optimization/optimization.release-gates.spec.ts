import {
  semanticReleaseGate,
  wilsonLower95,
} from './optimization.release-gates';

test('nine successful examples cannot establish a 99% semantic gate', () => {
  expect(wilsonLower95(9, 9)).toBeLessThan(0.99);
  expect(wilsonLower95(400, 400)).toBeGreaterThan(0.99);
  expect(wilsonLower95(0, 0)).toBeNull();
  expect(() => wilsonLower95(2, 1)).toThrow();
});
test('labels, held-out split, critical failures and each language gate are independent', () => {
  const evaluation = {
    version: 'reviewed-v1',
    labelsReviewed: true,
    split: 'held-out' as const,
    criticalFailures: 0,
    groups: [
      {
        gate: 'required-tools' as const,
        language: 'en',
        successes: 400,
        samples: 400,
      },
      {
        gate: 'required-tools' as const,
        language: 'id',
        successes: 400,
        samples: 400,
      },
    ],
  };

  expect(semanticReleaseGate(evaluation).passed).toBe(true);
  expect(
    semanticReleaseGate({ ...evaluation, labelsReviewed: false }).passed,
  ).toBe(false);
  expect(
    semanticReleaseGate({ ...evaluation, split: 'development' }).passed,
  ).toBe(false);
  expect(
    semanticReleaseGate({ ...evaluation, criticalFailures: 1 }).passed,
  ).toBe(false);
  expect(
    semanticReleaseGate({
      ...evaluation,
      groups: [
        ...evaluation.groups,
        { gate: 'required-tools', language: 'mixed', successes: 9, samples: 9 },
      ],
    }).passed,
  ).toBe(false);
});
