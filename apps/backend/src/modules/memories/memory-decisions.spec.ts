import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import {
  DecisionSettings,
  type DecisionGateway,
  type DecisionResult,
} from '../../infra/decision-gateway';
import { MemoryEligibilityService } from './memory-eligibility.service';
import { MemoryFactDecisionService } from './memory-fact-decision.service';

function setup(extra: Record<string, unknown> = {}) {
  const settings = new DecisionSettings(
    new ConfigService({
      BACKEND_MEMORY_ELIGIBILITY_MODE: 'enabled',
      BACKEND_MEMORY_FACT_REVIEW_MODE: 'enabled',
      BACKEND_DECISION_CALIBRATION_VERSION: 'synthetic-v1',
      BACKEND_DECISION_COHORT: 'user',
      ...extra,
    }),
  );

  const decide = jest
    .fn<DecisionGateway['decide']>()
    .mockImplementation((request): Promise<DecisionResult> =>
      Promise.resolve({
        status: 'ok',
        model: 'typesafe/jev-1.13-20260917',
        answers: Object.fromEntries(
          Object.keys(request.questions).map((key) => [
            key,
            { type: 'noul', noul: key.startsWith('sensitive_') ? 0 : 1 },
          ]),
        ),
        inputTokens: 100,
        outputTokens: 30,
        latencyMs: 1,
        costUsd: 0.0000042,
      }),
    );

  return {
    decide,
    eligibility: new MemoryEligibilityService({ decide }, settings),
    facts: new MemoryFactDecisionService({ decide }, settings),
  };
}

test('eligibility skips only a confident negative; uncertainty and failure retain evidence review', async () => {
  const { decide, eligibility } = setup();
  decide.mockResolvedValueOnce({
    status: 'ok',
    model: 'typesafe/jev-1.13-20260917',
    answers: { eligible: { type: 'noul', noul: 0 } },
    inputTokens: 1,
    outputTokens: 1,
    latencyMs: 1,
    costUsd: null,
  });
  expect(await eligibility.shouldReview('user', 'Hello')).toBe(false);
  expect(
    await eligibility.shouldReview('user', 'Saya suka jawaban singkat'),
  ).toBe(true);
  decide.mockResolvedValueOnce({
    status: 'fallback',
    reason: 'rate-limit',
    latencyMs: 1,
  });
  expect(await eligibility.shouldReview('user', 'Another fact')).toBe(true);
  expect(await eligibility.shouldReview('other', 'Hello')).toBe(true);
  expect(decide).toHaveBeenCalledTimes(3);
});
test('shadow eligibility never drops a source', async () => {
  const { decide, eligibility } = setup({
    BACKEND_MEMORY_ELIGIBILITY_MODE: 'shadow',
    BACKEND_DECISION_SHADOW_SAMPLE_PERCENT: 100,
  });

  decide.mockResolvedValueOnce({
    status: 'ok',
    model: 'typesafe/jev-1.13-20260917',
    answers: { eligible: { type: 'noul', noul: 0 } },
    inputTokens: 1,
    outputTokens: 1,
    latencyMs: 1,
    costUsd: null,
  });
  expect(await eligibility.shouldReview('user', 'Hello')).toBe(true);
});
test('fact allows preserve full exact spans and recheck coverage after renewing the lease', async () => {
  const { facts, decide } = setup();
  const renew = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  expect(
    await facts.review(
      'user',
      [{ id: 'f1', text: 'The user prefers short replies.' }],
      ['I prefer short replies.'],
      [],
      renew,
    ),
  ).toEqual({
    status: 'allow',
    facts: [
      {
        id: 'f1',
        grounded: true,
        durable: true,
        sensitive: false,
        permissionQuote: null,
        evidenceQuotes: ['I prefer short replies.'],
      },
    ],
  });
  expect(renew).toHaveBeenCalledTimes(1);
  expect(decide).toHaveBeenCalledTimes(2);
  expect(decide.mock.calls[1]?.[0].state).toContain('I prefer short replies.');
});
test('compound facts with incomplete selected-evidence coverage fall back', async () => {
  const { facts, decide } = setup();
  decide.mockImplementationOnce((request): Promise<DecisionResult> =>
    Promise.resolve({
      status: 'ok',
      model: 'typesafe/jev-1.13-20260917',
      answers: Object.fromEntries(
        Object.keys(request.questions).map((key) => [
          key,
          { type: 'noul', noul: key.startsWith('sensitive_') ? 0 : 1 },
        ]),
      ),
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      costUsd: null,
    }),
  );
  decide.mockResolvedValueOnce({
    status: 'ok',
    model: 'typesafe/jev-1.13-20260917',
    answers: { coverage_0: { type: 'noul', noul: 0.4 } },
    inputTokens: 1,
    outputTokens: 1,
    latencyMs: 1,
    costUsd: null,
  });
  expect(
    await facts.review(
      'user',
      [{ id: 'f1', text: 'The user likes tea and coffee.' }],
      ['I like tea.'],
      [],
    ),
  ).toEqual({ status: 'fallback' });
});
test('sensitive and uncertain facts remain on the existing permission reviewer', async () => {
  const { facts, decide } = setup();
  decide.mockImplementationOnce((request): Promise<DecisionResult> =>
    Promise.resolve({
      status: 'ok',
      model: 'typesafe/jev-1.13-20260917',
      answers: Object.fromEntries(
        Object.keys(request.questions).map((key) => [
          key,
          { type: 'noul', noul: key.startsWith('sensitive_') ? 0.7 : 1 },
        ]),
      ),
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      costUsd: null,
    }),
  );
  expect(
    await facts.review(
      'user',
      [{ id: 'f1', text: 'The user has a health condition.' }],
      ['Remember my condition.'],
      ['Remember my condition.'],
    ),
  ).toEqual({ status: 'fallback' });
  expect(decide).toHaveBeenCalledTimes(1);
});
test('reject-only never allows facts or makes an evidence allow request', async () => {
  const { facts, decide } = setup({
    BACKEND_MEMORY_FACT_REVIEW_MODE: 'reject-only',
  });

  expect(
    await facts.review(
      'user',
      [{ id: 'f1', text: 'Prefers tea.' }],
      ['I prefer tea.'],
      [],
    ),
  ).toEqual({ status: 'fallback' });
  expect(decide).toHaveBeenCalledTimes(1);
});
test('credentials and oversized evidence collections never enter Jev fact requests', async () => {
  const { facts, decide } = setup();
  expect(
    await facts.review(
      'user',
      [{ id: 'f1', text: 'My password is synthetic' }],
      ['My password is synthetic'],
      [],
    ),
  ).toEqual({ status: 'fallback' });
  expect(
    await facts.review(
      'user',
      [{ id: 'f1', text: 'Prefers tea.' }],
      Array.from({ length: 25 }, () => 'I prefer tea.'),
      [],
    ),
  ).toEqual({ status: 'fallback' });
  expect(decide).not.toHaveBeenCalled();
});
