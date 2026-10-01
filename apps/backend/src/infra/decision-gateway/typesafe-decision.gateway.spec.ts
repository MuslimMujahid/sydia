import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { ObservabilityService } from '../observability';
import type { DecisionCapacityService } from './decision-capacity.service';
import type { DecisionRequest } from './decision-gateway.types';
import {
  parseDecisionResponse,
  TypeSafeDecisionGateway,
} from './typesafe-decision.gateway';

const request: DecisionRequest = {
  stage: 'contract',
  version: 'test-v1',
  lane: 'interactive',
  state: 'synthetic text',
  questions: { yes: { type: 'noul', instructions: 'Yes?' } },
};

const response = {
  model: 'jev-1.13.0',
  answers: { yes: { type: 'noul', noul: 0.9 } },
  usage: { input_tokens: 200, output_tokens: 20 },
};

afterEach(() => jest.restoreAllMocks());

function setup(extra: Record<string, unknown> = {}) {
  const release = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const reserve = jest
    .fn<DecisionCapacityService['reserve']>()
    .mockResolvedValue(release);

  const gateway = new TypeSafeDecisionGateway(
    new ConfigService({
      BACKEND_DECISION_PROVIDER: 'typesafe',
      BACKEND_DECISION_API_KEY: 'synthetic-key',
      BACKEND_DECISION_INPUT_PRICE_PER_MILLION: 0.042,
      ...extra,
    }),
    { reserve } as unknown as DecisionCapacityService,
    ObservabilityService.disabled(),
  );

  return { gateway, reserve, release };
}

describe('TypeSafe gateway contract', () => {
  test('validates complete answers, model and usage', () => {
    expect(
      parseDecisionResponse(response, 'jev-1.13.0', request.questions)
        ?.inputTokens,
    ).toBe(200);
    for (const invalid of [
      null,
      { ...response, model: 'other' },
      { ...response, answers: {} },
      { ...response, usage: { input_tokens: -1, output_tokens: 1 } },
      { ...response, answers: { yes: { type: 'noul', noul: NaN } } },
      { ...response, answers: { yes: { type: 'choice', choice: 'yes' } } },
    ])
      expect(
        parseDecisionResponse(invalid, 'jev-1.13.0', request.questions),
      ).toBeNull();
  });
  test('rejects a choice with missing options, invalid mass or inconsistent winner', () => {
    const questions = {
      pick: {
        type: 'choice' as const,
        instructions: 'Pick',
        criteria: { a: 'A', b: 'B' },
      },
    };

    const valid = {
      ...response,
      answers: {
        pick: {
          type: 'choice',
          choice: 'a',
          confidence: 0.8,
          probabilities: { a: 0.9, b: 0.1 },
        },
      },
    };

    expect(
      parseDecisionResponse(valid, response.model, questions),
    ).not.toBeNull();
    for (const probabilities of [
      { a: 0.9 },
      { a: 0.9, b: 0.9 },
      { a: 0.1, b: 0.9 },
    ])
      expect(
        parseDecisionResponse(
          {
            ...valid,
            answers: { pick: { ...valid.answers.pick, probabilities } },
          },
          response.model,
          questions,
        ),
      ).toBeNull();
  });
  test('uses the pinned model, no retries, content-free tracing and actual usage', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(response), { status: 200 }),
      );

    const { gateway, release } = setup();
    const result = await gateway.decide(request);
    expect(result).toMatchObject({
      status: 'ok',
      model: response.model,
      inputTokens: 200,
    });
    if (result.status === 'ok')
      expect(result.costUsd).toBeCloseTo(0.0000084, 12);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    const init = fetch.mock.calls[0]?.[1];
    expect(
      JSON.parse(typeof init?.body === 'string' ? init.body : '{}'),
    ).toMatchObject({
      model: response.model,
      state: request.state,
    });
  });
  test.each([429, 529, 503])(
    'falls back without retry on HTTP %s',
    async (status) => {
      const fetch = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}', { status }));

      const { gateway, release } = setup();
      expect(await gateway.decide(request)).toMatchObject({
        status: 'fallback',
        reason: status === 503 ? 'provider' : 'rate-limit',
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
    },
  );
  test('uses the existing OpenRouter key and preserves billed cost and resolved snapshot', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...response,
          model: 'typesafe/jev-1.13-20260917',
          provider: 'TypeSafe',
          usage: { ...response.usage, cost: 0.000012 },
        }),
      ),
    );

    const { gateway } = setup({
      BACKEND_DECISION_PROVIDER: 'openrouter',
      BACKEND_DECISION_API_KEY: '',
      BACKEND_MODEL_API_KEY: 'synthetic-openrouter-key',
    });

    const result = await gateway.decide(request);
    expect(result).toMatchObject({
      status: 'ok',
      model: 'typesafe/jev-1.13-20260917',
      costUsd: 0.000012,
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://openrouter.ai/api/v1/systemone',
    );
    expect(
      JSON.parse(
        typeof fetch.mock.calls[0]?.[1]?.body === 'string'
          ? fetch.mock.calls[0][1].body
          : '{}',
      ),
    ).toMatchObject({
      model: 'typesafe/jev-1.13',
    });
  });
  test('keeps absent pricing unknown and rejects malformed model replies', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(response)));
    expect(
      await setup({
        BACKEND_DECISION_INPUT_PRICE_PER_MILLION: '',
      }).gateway.decide(request),
    ).toMatchObject({ status: 'ok', costUsd: null });
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ...response, answers: {} })),
      );
    expect(await setup().gateway.decide(request)).toMatchObject({
      status: 'fallback',
    });
  });
  test('does not dispatch disabled, oversized, cancelled or capacity-denied requests', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch');
    const { gateway, reserve } = setup();
    expect(
      await setup({ BACKEND_DECISION_API_KEY: '' }).gateway.decide(request),
    ).toMatchObject({ reason: 'disabled' });
    expect(
      await gateway.decide({ ...request, state: 'a'.repeat(33000) }),
    ).toMatchObject({ reason: 'budget' });
    expect(
      await gateway.decide({ ...request, abortSignal: AbortSignal.abort() }),
    ).toMatchObject({ reason: 'cancelled' });
    reserve.mockResolvedValueOnce(null);
    expect(await gateway.decide(request)).toMatchObject({ reason: 'capacity' });
    expect(fetch).not.toHaveBeenCalled();
  });
  test('aborts provider work at the single overall deadline', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const { gateway, release } = setup({ BACKEND_DECISION_TIMEOUT_MS: 20 });
    expect(await gateway.decide(request)).toMatchObject({
      status: 'fallback',
      reason: 'timeout',
    });
    expect(release).toHaveBeenCalledTimes(1);
  });
  test('does not forward secret-management dialogue, even without a recognizable key format', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch');
    const { gateway, reserve } = setup();
    for (const state of [
      'Store my password hunter2',
      'Simpan kata sandi saya hunter2',
      'Retrieve my API key',
      'My recovery code is a synthetic value',
    ])
      expect(await gateway.decide({ ...request, state })).toMatchObject({
        status: 'fallback',
        reason: 'privacy',
      });
    expect(fetch).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });
  test('capacity errors fall back and slow cleanup does not block the caller', async () => {
    const { gateway, reserve, release } = setup();
    reserve.mockRejectedValueOnce(new Error('Redis unavailable'));
    expect(await gateway.decide(request)).toMatchObject({ reason: 'capacity' });
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(response)));
    release.mockImplementationOnce(() => new Promise(() => undefined));
    const result = await gateway.decide(request);
    expect(result.status).toBe('ok');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
