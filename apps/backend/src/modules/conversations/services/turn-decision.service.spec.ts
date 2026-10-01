import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import {
  DecisionSettings,
  type DecisionGateway,
  type DecisionResult,
} from '../../../infra/decision-gateway';
import {
  TOOL_GROUPS,
  toolNamesForGroups,
  validateToolGroups,
} from './tool-groups';
import {
  TurnDecisionService,
  type TurnDecisionInput,
} from './turn-decision.service';

const input: TurnDecisionInput = {
  latest: 'Create a task to buy milk',
  recent: [],
  summary: '',
  locale: 'en',
  timezone: 'Asia/Makassar',
  attachments: [],
  recallEligible: true,
};

function setup(settings: Record<string, unknown> = {}) {
  const decide = jest
    .fn<DecisionGateway['decide']>()
    .mockImplementation((request) =>
      Promise.resolve({
        status: 'ok',
        model: 'jev-1.13.0',
        answers: Object.fromEntries(
          Object.keys(request.questions).map((key) => [
            key,
            { type: 'noul', noul: key === 'group_tasks' ? 1 : 0 },
          ]),
        ),
        inputTokens: 100,
        outputTokens: 30,
        latencyMs: 1,
        costUsd: null,
      }),
    );

  const service = new TurnDecisionService(
    { decide },
    new DecisionSettings(
      new ConfigService({
        BACKEND_MEMORY_RECALL_DECISION_MODE: 'enabled',
        BACKEND_TOOL_GROUP_SELECTION_MODE: 'enabled',
        BACKEND_DECISION_COHORT: 'user',
        BACKEND_DECISION_CALIBRATION_VERSION: 'synthetic-v1',
        ...settings,
      }),
    ),
  );

  return { service, decide };
}

test('shares one decision and includes task prerequisites', async () => {
  const { service, decide } = setup();
  const result = await service.decide('user', input);
  expect(result.recall).toBe(false);
  expect(result.toolNames).toEqual(toolNamesForGroups(['tasks']));
  expect(result.toolNames).toContain('list_categories');
  expect(result.toolNames).toContain('get_current_datetime');
  expect(decide).toHaveBeenCalledTimes(1);
});
test('provider failure leaves enabled selection empty; outside cohort retains incumbent behavior', async () => {
  const { service, decide } = setup();
  decide.mockResolvedValueOnce({
    status: 'fallback',
    reason: 'timeout',
    latencyMs: 600,
  });
  expect(await service.decide('user', input)).toEqual({
    recall: false,
    toolNames: [],
  });
  expect(await service.decide('other', input)).toEqual({ recall: true });
  expect(decide).toHaveBeenCalledTimes(1);
});
test('keeps context but does not force memory recall or attached-file groups', async () => {
  const { service, decide } = setup();
  const contextual = {
    ...input,
    latest: 'Forget my old city',
    recent: [{ role: 'user', content: 'I moved' }],
    summary: 'Earlier city reference',
    attachments: [{ name: 'note.pdf', mimeType: 'application/pdf' }],
  };

  const result = await service.decide('user', contextual);
  expect(result.recall).toBe(false);
  expect(result.toolNames).toEqual(toolNamesForGroups(['tasks']));
  expect(result.toolNames).not.toContain('forget_memory');
  expect(result.toolNames).not.toContain('read_document');
  expect(decide.mock.calls[0]?.[0].state).toContain('Earlier city reference');
  expect(decide.mock.calls[0]?.[0].questions).not.toHaveProperty('unknown');
});
test('does not send credential-bearing context to Jev', async () => {
  const { service, decide } = setup();
  expect(
    await service.decide('user', {
      ...input,
      latest: 'My password is synthetic-secret',
    }),
  ).toEqual({ recall: false, toolNames: [] });
  expect(decide).not.toHaveBeenCalled();
});
test('uncertain groups stay excluded; independent groups can both be selected', async () => {
  const { service, decide } = setup();
  decide.mockImplementationOnce((request): Promise<DecisionResult> =>
    Promise.resolve({
      status: 'ok',
      model: 'jev-1.13.0',
      answers: Object.fromEntries(
        Object.keys(request.questions).map((key) => [
          key,
          { type: 'noul', noul: key === 'group_tasks' ? 0.5 : 0 },
        ]),
      ),
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      costUsd: null,
    }),
  );
  expect(await service.decide('user', input)).toEqual({
    recall: false,
    toolNames: [],
  });
  decide.mockImplementationOnce((request): Promise<DecisionResult> =>
    Promise.resolve({
      status: 'ok',
      model: 'jev-1.13.0',
      answers: Object.fromEntries(
        Object.keys(request.questions).map((key) => [
          key,
          {
            type: 'noul',
            noul: ['group_documents', 'group_calendar'].includes(key)
              ? 1
              : key === 'group_tasks'
                ? 0.5
                : 0,
          },
        ]),
      ),
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      costUsd: null,
    }),
  );
  expect((await service.decide('user', input)).toolNames).toEqual(
    toolNamesForGroups(['documents', 'calendar']),
  );
});

function scores(
  decide: ReturnType<typeof setup>['decide'],
  probabilities: Record<string, number>,
) {
  decide.mockResolvedValueOnce({
    status: 'ok',
    model: 'jev-1.13.0',
    answers: Object.fromEntries(
      Object.entries(probabilities).map(([key, noul]) => [
        key,
        { type: 'noul', noul },
      ]),
    ),
    inputTokens: 1,
    outputTokens: 1,
    latencyMs: 1,
    costUsd: null,
  });
}

test('the default 0.6 boundary applies independently to recall and groups', async () => {
  const { service, decide } = setup();
  scores(decide, { recall: 0.6, group_tasks: 0.6, group_memory: 0.5999 });
  expect(await service.decide('user', input)).toEqual({
    recall: true,
    toolNames: toolNamesForGroups(['tasks']),
  });
  scores(decide, { recall: 0.5999, group_tasks: 0.5999 });
  expect(await service.decide('user', input)).toEqual({
    recall: false,
    toolNames: [],
  });
});

test('scores at the configured threshold qualify; scores below it and missing scores do not', async () => {
  const { service, decide } = setup({
    BACKEND_DECISION_THRESHOLDS_JSON: '{"toolInclude":0.8,"recallInclude":0.7}',
  });

  scores(decide, {
    recall: 0.7,
    group_tasks: 0.8,
    group_memory: 0.7999,
    group_documents: 0.5,
  });
  expect(await service.decide('user', input)).toEqual({
    recall: true,
    toolNames: toolNamesForGroups(['tasks']),
  });
  scores(decide, { recall: 0.6999, group_memory: 0.7999 });
  expect(await service.decide('user', input)).toEqual({
    recall: false,
    toolNames: [],
  });
  scores(decide, {});
  expect(await service.decide('user', input)).toEqual({
    recall: false,
    toolNames: [],
  });
});

test.each(Object.keys(TOOL_GROUPS) as Array<keyof typeof TOOL_GROUPS>)(
  'selects %s independently and adds only its dependencies',
  async (group) => {
    const { service, decide } = setup();
    scores(decide, { [`group_${group}`]: 0.99, recall: 0.5 });
    expect(await service.decide('user', input)).toEqual({
      recall: false,
      toolNames: toolNamesForGroups([group]),
    });
  },
);

test('recall and tool selection operate independently', async () => {
  const { service, decide } = setup();
  scores(decide, { recall: 0.99 });
  expect(await service.decide('user', input)).toEqual({
    recall: true,
    toolNames: [],
  });
  scores(decide, { recall: 1, group_memory: 1 });
  expect(
    await service.decide('user', { ...input, recallEligible: false }),
  ).toEqual({
    recall: false,
    toolNames: toolNamesForGroups(['memory']),
  });
  expect(decide.mock.calls[1]?.[0].questions).not.toHaveProperty('recall');
});

test('empty requests select nothing without calling the provider', async () => {
  const { service, decide } = setup();
  expect(await service.decide('user', { ...input, latest: ' ' })).toEqual({
    recall: false,
    toolNames: [],
  });
  expect(decide).not.toHaveBeenCalled();
});

test('shadow modes preserve incumbent behavior while recording empty candidates', async () => {
  const { service, decide } = setup({
    BACKEND_MEMORY_RECALL_DECISION_MODE: 'shadow',
    BACKEND_TOOL_GROUP_SELECTION_MODE: 'shadow',
    BACKEND_DECISION_SHADOW_SAMPLE_PERCENT: 100,
  });

  scores(decide, {});
  expect(await service.decide('user', input)).toEqual({ recall: true });
  await service.onModuleDestroy();
  expect(decide).toHaveBeenCalledTimes(1);
});

test.each([
  ['BACKEND_MEMORY_RECALL_DECISION_MODE', { recall: true, toolNames: [] }],
  ['BACKEND_TOOL_GROUP_SELECTION_MODE', { recall: false }],
] as const)(
  'preserves the disabled feature when %s is off',
  async (flag, expected) => {
    const { service, decide } = setup({ [flag]: 'off' });
    scores(decide, {});
    expect(await service.decide('user', input)).toEqual(expected);
  },
);
test('registry covers 37 distinct tools and rejects missing prerequisites', () => {
  const names = Object.values(TOOL_GROUPS).flat();
  expect(names).toHaveLength(37);
  expect(() => validateToolGroups(names)).not.toThrow();
  expect(() => validateToolGroups(names.slice(1))).toThrow();
});
