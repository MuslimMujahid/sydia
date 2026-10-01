import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import {
  DecisionSettings,
  type DecisionGateway,
  type DecisionResult,
} from '../../infra/decision-gateway';
import type {
  IUserRepository,
  IConversationRepository,
  IHindsightRepository,
} from '../../database/interfaces';
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

  const users = {
    findById: jest.fn<IUserRepository['findById']>().mockResolvedValue({
      name: 'Demo User',
      preferredAddress: 'Kak Muslim',
      locale: 'id',
      timezone: 'Asia/Makassar',
    } as Awaited<ReturnType<IUserRepository['findById']>>),
  };

  const conversations = {
    findUserMemoryEvidence:
      jest.fn<IConversationRepository['findUserMemoryEvidence']>(),
    findContext: jest.fn<IConversationRepository['findContext']>(),
  };

  const ledger = {
    suppressedMessageIds: jest
      .fn<IHindsightRepository['suppressedMessageIds']>()
      .mockResolvedValue([]),
  };

  return {
    decide,
    users,
    conversations,
    ledger,
    eligibility: new MemoryEligibilityService({ decide }, settings),
    facts: new MemoryFactDecisionService(
      { decide },
      settings,
      users as unknown as IUserRepository,
      conversations as unknown as IConversationRepository,
      ledger as unknown as IHindsightRepository,
    ),
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
test('compound facts with incomplete selected-evidence coverage are rejected', async () => {
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
  ).toEqual({ status: 'reject' });
});
test.each([
  ['all', 0.85, 'allow'],
  ['grounded_0', 0.849, 'reject'],
  ['durable_0', 0.849, 'reject'],
  ['support_0_0', 0.849, 'reject'],
  ['coverage_0', 0.849, 'reject'],
] as const)(
  'fact approval boundary: %s at %s yields %s',
  async (question, probability, status) => {
    const { facts, decide } = setup();
    decide.mockImplementation((request): Promise<DecisionResult> =>
      Promise.resolve({
        status: 'ok',
        model: 'typesafe/jev-1.13-20260917',
        answers: Object.fromEntries(
          Object.keys(request.questions).map((key) => [
            key,
            {
              type: 'noul',
              noul: key.startsWith('sensitive_')
                ? 0
                : question === 'all' || key === question
                  ? probability
                  : 0.85,
            },
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
        [{ id: 'f1', text: 'The user is a software developer.' }],
        ['I am a software developer.'],
        [],
      ),
    ).toMatchObject({ status });
  },
);
test('sensitive facts without specific permission are rejected by Jev', async () => {
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
      [],
    ),
  ).toEqual({ status: 'reject' });
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
  ).toEqual({ status: 'unavailable', reason: 'review-not-enabled' });
  expect(decide).not.toHaveBeenCalled();
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
  ).toEqual({ status: 'reject' });
  expect(
    await facts.review(
      'user',
      [{ id: 'f1', text: 'Prefers tea.' }],
      Array.from({ length: 25 }, () => 'I prefer tea.'),
      [],
    ),
  ).toEqual({ status: 'reject' });
  expect(decide).not.toHaveBeenCalled();
});

test.each([0.85, 0.849])(
  'Jev requires specific permission at the approval threshold for sensitive facts (%s)',
  async (permissionScore) => {
    const { facts, decide } = setup();
    decide.mockImplementation((request): Promise<DecisionResult> =>
      Promise.resolve({
        status: 'ok',
        model: 'typesafe/jev-1.13-20260917',
        answers: Object.fromEntries(
          Object.keys(request.questions).map((key) => [
            key,
            {
              type: 'noul',
              noul: key.startsWith('sensitive_')
                ? 0.7
                : key.startsWith('permission_')
                  ? permissionScore
                  : 1,
            },
          ]),
        ),
        inputTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
        costUsd: null,
      }),
    );
    const permission = 'Remember that I have asthma.';
    const result = await facts.review(
      'user',
      [{ id: 'f1', text: 'The user has asthma.' }],
      [permission],
      [permission],
    );

    if (permissionScore === 0.85)
      expect(result).toMatchObject({
        status: 'allow',
        facts: [{ sensitive: true, permissionQuote: permission }],
      });
    else expect(result).toEqual({ status: 'reject' });
  },
);

test.each([
  [0.25, 'allow'],
  [0.251, 'reject'],
] as const)(
  'sensitivity boundary without consent: %s yields %s',
  async (sensitivity, status) => {
    const { facts, decide } = setup();
    const normal = decide.getMockImplementation()!;
    decide.mockImplementationOnce(async (request) => {
      const result = await normal(request);
      if (result.status === 'ok')
        result.answers.sensitive_0 = { type: 'noul', noul: sensitivity };

      return result;
    });
    expect(
      await facts.review(
        'user',
        [{ id: 'f1', text: 'The user prefers tea.' }],
        ['I prefer tea.'],
        [],
      ),
    ).toMatchObject({ status });
  },
);

test.each(['review', 'coverage'])(
  'provider failure during %s remains unavailable rather than rejecting a source',
  async (stage) => {
    const { facts, decide } = setup();

    if (stage === 'coverage') {
      const normal = decide.getMockImplementation()!;
      decide.mockImplementationOnce(normal);
    }

    decide.mockResolvedValueOnce({
      status: 'fallback',
      reason: 'timeout',
      latencyMs: 1,
    });
    expect(
      await facts.review(
        'user',
        [{ id: 'f1', text: 'The user prefers tea.' }],
        ['I prefer tea.'],
        [],
      ),
    ).toEqual({ status: 'unavailable', reason: 'timeout' });
  },
);

test('fact review supplies profile and bounded dialogue to both Jev stages without changing evidence', async () => {
  const { facts, decide, users, conversations, ledger } = setup();
  const createdAt = new Date('2026-10-01T10:00:00Z');
  conversations.findUserMemoryEvidence.mockResolvedValue({
    id: 'anchor',
    conversationId: 'chat',
    content: 'Ingat ya, aku software developer.',
    createdAt,
  });
  const messages = [
    { id: 'forgotten', role: 'user', content: 'A forgotten fact' },
    { id: 'secret', role: 'user', content: 'My password is hunter2' },
    { id: 'fact', role: 'user', content: 'Aku software developer' },
    { id: 'reply', role: 'assistant', content: 'Baik, Kak Muslim.' },
    {
      id: 'anchor',
      role: 'user',
      content: 'Ingat ya, aku software developer.',
    },
    { id: 'future', role: 'user', content: 'Actually, I am a teacher now.' },
  ];

  conversations.findContext.mockResolvedValue({
    conversation: {
      id: 'chat',
      rollingSummary: 'Future contaminated summary',
      summaryThroughMessageId: 'future',
    },
    messages,
  } as unknown as NonNullable<
    Awaited<ReturnType<IConversationRepository['findContext']>>
  >);
  ledger.suppressedMessageIds.mockResolvedValue(['forgotten']);
  const evidence = [
    'Aku software developer',
    'Ingat ya, aku software developer.',
  ];

  expect(
    (
      await facts.review(
        'user',
        [{ id: 'f1', text: 'The user bekerja sebagai software developer.' }],
        evidence,
        [],
        undefined,
        'anchor',
      )
    ).status,
  ).toBe('allow');
  expect(users.findById).toHaveBeenCalledWith('user');
  expect(conversations.findUserMemoryEvidence).toHaveBeenCalledWith(
    'user',
    'anchor',
  );
  expect(conversations.findContext).toHaveBeenCalledWith('user', 'chat');

  for (const [request] of decide.mock.calls) {
    const state = JSON.parse(request.state) as Record<string, unknown>;
    expect(state.userProfile).toEqual({
      name: 'Demo User',
      preferredAddress: 'Kak Muslim',
      locale: 'id',
      timezone: 'Asia/Makassar',
    });
    expect(state.conversationContext).toEqual(
      messages.slice(2, 5).map(({ role, content }) => ({ role, content })),
    );
    expect(request.state).not.toMatch(
      /hunter2|forgotten fact|teacher|contaminated/i,
    );
    const grounding =
      request.questions.grounded_0 ?? request.questions.coverage_0;

    expect(grounding?.instructions).toContain(
      'Assistant statements are never evidence',
    );
  }

  expect(
    (
      JSON.parse(decide.mock.calls[0]![0].state) as {
        approvedEvidence: string[];
      }
    ).approvedEvidence,
  ).toEqual(evidence);
  expect(
    (
      JSON.parse(decide.mock.calls[1]![0].state) as {
        candidates: Array<{ selectedEvidence: string[] }>;
      }
    ).candidates[0]?.selectedEvidence,
  ).toEqual(evidence);
});

test('fact review refuses an unavailable or forgotten conversation anchor before contacting Jev', async () => {
  const { facts, decide, conversations, ledger } = setup();
  conversations.findUserMemoryEvidence.mockResolvedValue(null);
  const review = () =>
    facts.review(
      'user',
      [{ id: 'f1', text: 'The user likes tea.' }],
      ['I like tea'],
      [],
      undefined,
      'anchor',
    );

  await expect(review()).rejects.toThrow('source message is unavailable');
  conversations.findUserMemoryEvidence.mockResolvedValue({
    id: 'anchor',
    conversationId: 'chat',
    content: 'I like tea',
    createdAt: new Date(),
  });
  conversations.findContext.mockResolvedValue({
    conversation: {
      id: 'chat',
      rollingSummary: null,
      summaryThroughMessageId: null,
    },
    messages: [{ id: 'anchor', role: 'user', content: 'I like tea' }],
  } as unknown as NonNullable<
    Awaited<ReturnType<IConversationRepository['findContext']>>
  >);
  ledger.suppressedMessageIds.mockResolvedValue(['anchor']);
  await expect(review()).rejects.toThrow('source message was forgotten');
  expect(decide).not.toHaveBeenCalled();
});

test('rejects extracted facts that still use a mutable profile name as their subject', async () => {
  const { facts, decide } = setup();
  expect(
    await facts.review(
      'user',
      [{ id: 'f1', text: 'Kak Muslim suka makan nasi goreng' }],
      ['Aku suka makan nasi goreng'],
      [],
    ),
  ).toEqual({ status: 'reject' });
  expect(decide).not.toHaveBeenCalled();
});
