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
test('sends only four preceding messages and the latest message to the classifier', async () => {
  const { service, decide } = setup();
  await service.decide('user', {
    ...input,
    latest: 'Yes, save that file.',
    recent: [
      { role: 'user', content: 'Old unrelated request' },
      { role: 'assistant', content: 'Old unrelated answer' },
      { role: 'user', content: 'I have an invoice.' },
      { role: 'assistant', content: 'What would you like to do with it?' },
      { role: 'user', content: 'Keep it for later.' },
      { role: 'assistant', content: 'Shall I save the attachment?' },
    ],
  });

  expect(JSON.parse(decide.mock.calls[0]![0].state)).toEqual({
    messages: [
      { role: 'user', content: 'I have an invoice.' },
      { role: 'assistant', content: 'What would you like to do with it?' },
      { role: 'user', content: 'Keep it for later.' },
      { role: 'assistant', content: 'Shall I save the attachment?' },
      { role: 'user', content: 'Yes, save that file.' },
    ],
  });
});

test('retains recent attachment context for a file follow-up', async () => {
  const { service, decide } = setup();
  await service.decide('user', {
    ...input,
    latest: 'Save it for later.',
    recent: [
      {
        role: 'user',
        content: 'Here is the invoice.',
        attachments: [{ name: 'invoice.pdf', mimeType: 'application/pdf' }],
      },
    ],
  });

  expect(JSON.parse(decide.mock.calls[0]![0].state)).toEqual({
    messages: [
      {
        role: 'user',
        content: 'Here is the invoice.',
        attachments: [{ name: 'invoice.pdf', mimeType: 'application/pdf' }],
      },
      { role: 'user', content: 'Save it for later.' },
    ],
  });
});

test('keeps attachment metadata on the latest message without routing configuration', async () => {
  const { service, decide } = setup();
  await service.decide('user', {
    ...input,
    latest: 'Save this file.',
    attachments: [{ name: 'invoice.pdf', mimeType: 'application/pdf' }],
  });

  expect(JSON.parse(decide.mock.calls[0]![0].state)).toEqual({
    messages: [
      {
        role: 'user',
        content: 'Save this file.',
        attachments: [{ name: 'invoice.pdf', mimeType: 'application/pdf' }],
      },
    ],
  });
});

test.each([
  [
    'group_tasks',
    'Does responding to the latest message in this conversation require any of these tools: create_task, update_task, list_tasks?',
  ],
  [
    'group_calendar',
    'Does responding to the latest message in this conversation require any of these tools: list_calendar_events, get_calendar_sync_status, create_calendar_event, update_calendar_event, cancel_calendar_event?',
  ],
  [
    'group_reminders',
    'Does responding to the latest message in this conversation require any of these tools: create_reminder, update_reminder, delete_reminder, list_reminders?',
  ],
  [
    'group_documents',
    'Does responding to the latest message in this conversation require any of these tools: list_documents, read_document, save_attached_files, send_file, search_documents?',
  ],
  [
    'recall',
    'Would recalling stored personal facts or preferences help respond to the latest message in this conversation?',
  ],
])('asks a self-contained question for %s', async (key, question) => {
  const { service, decide } = setup();
  await service.decide('user', input);

  expect(decide.mock.calls[0]![0].questions[key]).toEqual({
    type: 'noul',
    instructions: question,
  });
});

test('failed enabled tool selection offers the full registry instead of an empty one', async () => {
  const { service, decide } = setup();
  decide.mockResolvedValueOnce({
    status: 'fallback',
    reason: 'timeout',
    latencyMs: 600,
  });
  const decision = await service.decide('user', input);
  // No toolNames means no pruning: every registered tool stays available.
  expect(decision.toolNames).toBeUndefined();
});
test('outside cohort retains incumbent behavior without calling the decision provider', async () => {
  const { service, decide } = setup();
  expect(await service.decide('other', input)).toEqual({ recall: true });
  expect(decide).not.toHaveBeenCalled();
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
  expect(decide.mock.calls[0]?.[0].state).toContain('I moved');
  expect(decide.mock.calls[0]?.[0].state).not.toContain(
    'Earlier city reference',
  );
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
test('uncertain groups stay available; independent groups can both be selected', async () => {
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
    toolNames: toolNamesForGroups(['tasks']),
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
    toolNamesForGroups(['tasks', 'documents', 'calendar']),
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

test('the default confidence boundary preserves recall behavior and uncertain tools', async () => {
  const { service, decide } = setup();
  scores(decide, { recall: 0.6, group_tasks: 0.6, group_memory: 0.5999 });
  expect(await service.decide('user', input)).toEqual({
    recall: true,
    toolNames: toolNamesForGroups(['tasks', 'memory']),
  });
  scores(decide, { recall: 0.5999, group_tasks: 0.5999 });
  expect(await service.decide('user', input)).toEqual({
    recall: false,
    toolNames: toolNamesForGroups(['tasks']),
  });
});

test('keeps file sending available for the observed uncertain first request', async () => {
  const { service, decide } = setup();
  scores(decide, { group_documents: 0.59 });

  const result = await service.decide('user', {
    ...input,
    latest: 'Kirim foto ktp saya',
    recallEligible: false,
  });

  expect(result.toolNames).toEqual(toolNamesForGroups(['documents']));
  expect(result.toolNames).toContain('send_file');
});

test('prunes confidently irrelevant groups while retaining uncertain ones', async () => {
  const { service, decide } = setup();
  scores(decide, {
    group_documents: 0.41,
    group_tasks: 0.4,
    group_calendar: 0.01,
  });

  const result = await service.decide('user', input);

  expect(result.toolNames).toEqual(toolNamesForGroups(['documents']));
  expect(result.toolNames).not.toContain('create_task');
  expect(result.toolNames).not.toContain('create_calendar_event');
});

test('keeps uncertain groups at custom confidence thresholds without changing recall', async () => {
  const { service, decide } = setup({
    BACKEND_DECISION_THRESHOLDS_JSON: '{"toolInclude":0.8,"recallInclude":0.7}',
  });

  scores(decide, {
    recall: 0.7,
    group_tasks: 0.8,
    group_memory: 0.7999,
    group_documents: 0.5,
    group_calendar: 0.2,
  });
  expect(await service.decide('user', input)).toEqual({
    recall: true,
    toolNames: toolNamesForGroups(['tasks', 'memory', 'documents']),
  });
  scores(decide, { recall: 0.6999, group_memory: 0.7999 });
  expect(await service.decide('user', input)).toEqual({
    recall: false,
    toolNames: toolNamesForGroups(['memory']),
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
test('registry covers 51 distinct tools and rejects missing prerequisites', () => {
  const names = Object.values(TOOL_GROUPS).flat();
  expect(names).toHaveLength(51);
  expect(() => validateToolGroups(names)).not.toThrow();
  expect(() => validateToolGroups(names.slice(1))).toThrow();
});
