import { jest } from '@jest/globals';
import type { IConversationRepository } from '../../../database/interfaces';
import type { LanguageModelGateway } from '../../../infra/model-gateway';
import { createSecretaryTools } from '../../secretary/secretary-tools';
import {
  defaultSkillDirectory,
  loadSkillCatalog,
  renderSkillCatalog,
} from '../../secretary/skill-catalog';
import {
  ToolExecutorService,
  type AssistantTool,
} from './tool-executor.service';
import { runNoteAgent } from './note-agent-runner';

function fixture() {
  const catalog = loadSkillCatalog(defaultSkillDirectory());
  const inspect = jest
    .fn<AssistantTool['execute']>()
    .mockResolvedValue({ found: true });

  const mutate = jest
    .fn<AssistantTool['execute']>()
    .mockResolvedValue({ saved: true });

  const executor = new ToolExecutorService({} as IConversationRepository, [
    ...createSecretaryTools({
      skills: catalog,
      context: {} as never,
      availability: {} as never,
      actions: {} as never,
      policy: {} as never,
    }),
    {
      definition: {
        name: 'search_notes',
        label: 'Search notes',
        description: 'Search',
        parameters: { type: 'object' },
      },
      readOnly: true,
      parseArguments: () => ({}),
      execute: inspect,
    },
    {
      definition: {
        name: 'write_daily_note',
        label: 'Write note',
        description: 'Write',
        parameters: { type: 'object' },
      },
      parseArguments: () => ({}),
      execute: mutate,
    },
    {
      definition: {
        name: 'create_task',
        label: 'Task',
        description: 'Unrelated',
        parameters: { type: 'object' },
      },
      parseArguments: () => ({}),
      execute: mutate,
    },
  ]);

  return { executor, inspect, mutate, catalog: renderSkillCatalog(catalog) };
}

test.each([
  { proposalWorkIds: [], available: false },
  { proposalWorkIds: ['preview-1'], available: true },
])(
  'proposal resolution availability follows actual preview evidence: $available',
  async ({ proposalWorkIds, available }) => {
    const f = fixture();
    const model: LanguageModelGateway = {
      provider: 'openrouter',
      model: 'proposal-boundary',
      generate: (request) => {
        expect(request.activeTools!().includes('resolve_note_proposal')).toBe(
          available,
        );

        return Promise.resolve({
          text: 'Pending work remains protected.',
          usage: {},
          finishReason: 'stop',
        });
      },
    };

    await runNoteAgent({
      model,
      executor: f.executor,
      catalog: f.catalog,
      userId: 'owner',
      runId: 'run',
      sourceRef: 'message',
      evidence: {},
      mode: 'apply',
      proposalWorkIds,
    });
  },
);

test('a proposal agent loads the existing skill and chooses repeated searches without write authority', async () => {
  const f = fixture();
  const model: LanguageModelGateway = {
    provider: 'openrouter',
    model: 'agent-boundary',
    generate: async (request) => {
      expect(Object.keys(request.tools!)).not.toContain('write_daily_note');
      expect(Object.keys(request.tools!)).not.toContain('create_task');
      expect(request.activeTools!()).toEqual([
        'load_skill',
        'propose_note_change',
      ]);
      await request.tools!.load_skill!.execute!(
        { name: 'note-capture' },
        { toolCallId: 'load', messages: [], context: {} },
      );
      expect(request.activeTools!()).toContain('search_notes');
      await request.tools!.search_notes!.execute!(
        {},
        { toolCallId: 'search-a', messages: [], context: {} },
      );
      await request.tools!.search_notes!.execute!(
        {},
        { toolCallId: 'search-b', messages: [], context: {} },
      );

      return {
        text: 'Proposed destination after inspecting both searches.',
        usage: {},
        finishReason: 'stop',
      };
    },
  };

  const result = await runNoteAgent({
    model,
    executor: f.executor,
    catalog: f.catalog,
    userId: 'owner',
    runId: 'run',
    sourceRef: 'message',
    evidence: { text: 'Reported record' },
    mode: 'proposal',
  });

  expect(result).toMatchObject({
    text: 'Proposed destination after inspecting both searches.',
    calls: 3,
    loadedSkills: { 'note-capture': '1.6.2' },
  });
  expect(f.inspect).toHaveBeenCalledTimes(2);
  expect(f.mutate).not.toHaveBeenCalled();
});

test('the background execution budget rejects extra calls even within a single model step', async () => {
  const f = fixture();
  const model: LanguageModelGateway = {
    provider: 'openrouter',
    model: 'budget-boundary',
    generate: async (request) => {
      await request.tools!.search_notes!.execute!(
        {},
        { toolCallId: 'first', messages: [], context: {} },
      );
      await request.tools!.search_notes!.execute!(
        {},
        { toolCallId: 'second', messages: [], context: {} },
      );

      return { text: 'Unreachable.', usage: {}, finishReason: 'stop' };
    },
  };

  await expect(
    runNoteAgent({
      model,
      executor: f.executor,
      catalog: f.catalog,
      userId: 'owner',
      runId: 'run',
      sourceRef: 'message',
      evidence: {},
      mode: 'proposal',
      maxCalls: 1,
    }),
  ).rejects.toThrow('tool-call budget');
  expect(f.inspect).toHaveBeenCalledTimes(1);
});

test('an agent may decide no change without executing a prescribed workflow', async () => {
  const f = fixture();
  const model: LanguageModelGateway = {
    provider: 'openrouter',
    model: 'no-op-boundary',
    generate: () =>
      Promise.resolve({
        text: 'No useful note change.',
        usage: {},
        finishReason: 'stop',
      }),
  };

  expect(
    await runNoteAgent({
      model,
      executor: f.executor,
      catalog: f.catalog,
      userId: 'owner',
      runId: 'run',
      sourceRef: 'message',
      evidence: {},
      mode: 'proposal',
    }),
  ).toMatchObject({ calls: 0, text: 'No useful note change.' });
  expect(f.inspect).not.toHaveBeenCalled();
  expect(f.mutate).not.toHaveBeenCalled();
});

test('a model cannot turn a budget rejection into a completed run by answering anyway', async () => {
  const f = fixture();
  const model: LanguageModelGateway = {
    provider: 'openrouter',
    model: 'caught-tool-error-boundary',
    generate: async (request) => {
      await request.tools!.search_notes!.execute!(
        {},
        { toolCallId: 'first', messages: [], context: {} },
      );
      await expect(
        request.tools!.search_notes!.execute!(
          {},
          { toolCallId: 'second', messages: [], context: {} },
        ),
      ).rejects.toThrow('tool-call budget');

      return { text: 'Finished.', usage: {}, finishReason: 'stop' };
    },
  };

  await expect(
    runNoteAgent({
      model,
      executor: f.executor,
      catalog: f.catalog,
      userId: 'owner',
      runId: 'run',
      sourceRef: 'message',
      evidence: {},
      mode: 'proposal',
      maxCalls: 1,
    }),
  ).rejects.toThrow('tool-call budget');
  expect(f.inspect).toHaveBeenCalledTimes(1);
});

test('an empty model ending cannot complete background work after the step limit', async () => {
  const f = fixture();
  const model: LanguageModelGateway = {
    provider: 'openrouter',
    model: 'empty-ending',
    generate: () =>
      Promise.resolve({ text: '', usage: {}, finishReason: 'stop' }),
  };

  await expect(
    runNoteAgent({
      model,
      executor: f.executor,
      catalog: f.catalog,
      userId: 'owner',
      runId: 'run',
      sourceRef: 'message',
      evidence: {},
      mode: 'apply',
    }),
  ).rejects.toThrow('did not complete');
});

test('a tool-call ending cannot complete background work despite nonempty planning text', async () => {
  const f = fixture();
  const model: LanguageModelGateway = {
    provider: 'openrouter',
    model: 'step-limited',
    generate: () =>
      Promise.resolve({
        text: 'I will save the new record.',
        usage: {},
        finishReason: 'tool-calls',
      }),
  };

  await expect(
    runNoteAgent({
      model,
      executor: f.executor,
      catalog: f.catalog,
      userId: 'owner',
      runId: 'run',
      sourceRef: 'message',
      evidence: {},
      mode: 'apply',
    }),
  ).rejects.toThrow('did not complete');
});

test('a final answer cannot complete a run whose mutating tool failed and rolled back', async () => {
  const f = fixture();
  f.mutate.mockRejectedValue(new Error('Write rejected'));
  const model: LanguageModelGateway = {
    provider: 'openrouter',
    model: 'rolled-back-write',
    generate: async (request) => {
      await expect(
        request.tools!.write_daily_note!.execute!(
          {},
          { toolCallId: 'write', messages: [], context: {} },
        ),
      ).rejects.toThrow('Write rejected');

      return {
        text: 'The edit remains unfinished.',
        usage: {},
        finishReason: 'stop',
      };
    },
  };

  await expect(
    runNoteAgent({
      model,
      executor: f.executor,
      catalog: f.catalog,
      userId: 'owner',
      runId: 'run',
      sourceRef: 'message',
      evidence: {},
      mode: 'apply',
    }),
  ).rejects.toThrow('unresolved failed mutations');
});

test('a confirmed retry of the same durable mutation clears its earlier failure', async () => {
  const f = fixture();
  f.mutate.mockRejectedValueOnce(new Error('Revision conflict'));
  const model: LanguageModelGateway = {
    provider: 'openrouter',
    model: 'recovered-write',
    generate: async (request) => {
      await expect(
        request.tools!.write_daily_note!.execute!(
          { operationId: 'same-change' },
          { toolCallId: 'first', messages: [], context: {} },
        ),
      ).rejects.toThrow('Revision conflict');
      await request.tools!.write_daily_note!.execute!(
        { operationId: 'same-change' },
        { toolCallId: 'retry', messages: [], context: {} },
      );

      return { text: 'Confirmed write.', usage: {}, finishReason: 'stop' };
    },
  };

  expect(
    await runNoteAgent({
      model,
      executor: f.executor,
      catalog: f.catalog,
      userId: 'owner',
      runId: 'run',
      sourceRef: 'message',
      evidence: {},
      mode: 'apply',
    }),
  ).toMatchObject({ text: 'Confirmed write.' });
});

async function systemPromptFor(mode: 'proposal' | 'apply'): Promise<string> {
  const f = fixture();
  let prompt = '';
  const model: LanguageModelGateway = {
    provider: 'openrouter',
    model: 'prompt-capture',
    generate: (request) => {
      const system = request.messages.find(({ role }) => role === 'system');
      prompt = typeof system?.content === 'string' ? system.content : '';

      return Promise.resolve({
        text: 'DONE: no change',
        usage: {},
        finishReason: 'stop',
      });
    },
  };

  await runNoteAgent({
    model,
    executor: f.executor,
    catalog: f.catalog,
    userId: 'owner',
    runId: 'run',
    sourceRef: 'message',
    evidence: {},
    mode,
  });

  return prompt;
}

test.each(['proposal', 'apply'] as const)(
  '%s-mode instructions require a final status line, because an empty ending fails the run',
  async (mode) => {
    expect(await systemPromptFor(mode)).toContain('end with exactly one line');
  },
);

test('apply-mode instructions do not carry proposal-only write restrictions', async () => {
  const apply = await systemPromptFor('apply');
  const proposal = await systemPromptFor('proposal');

  expect(apply).not.toContain('no product-note write tools are authorized');
  expect(apply).not.toContain('propose_note_change');
  expect(proposal).toContain('no product-note write tools are authorized');
});
