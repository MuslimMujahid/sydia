import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type {
  ExecutionPlan,
  ExecutionPlanWrite,
} from '../../../database/entities';
import type {
  GenerateResult,
  LanguageModelGateway,
  ModelMessage,
} from '../../../infra/model-gateway';
import { AssistantPlanState } from './assistant-plan';
import {
  AssistantExecutionSettings,
  generateAssistantTurn,
} from './assistant-execution';

const pending = {
  id: 'summary',
  description: 'Summarize the saved results',
  status: 'pending' as const,
};

const scope = {
  userId: 'owner',
  conversationId: 'chat',
  runId: 'run',
  sourceMessageId: 'message',
  claimStartedAt: new Date('2026-11-09T00:00:00Z'),
};

const messages: ModelMessage[] = [
  { role: 'user', content: 'Save the notes and summarize the results.' },
];

const responseMessages: ModelMessage[] = [
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'save-1',
        toolName: 'save_note',
        input: { title: 'Report' },
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'save-1',
        toolName: 'save_note',
        output: { type: 'json', value: { id: 'saved-note' } },
      },
    ],
  },
  { role: 'assistant', content: 'The note was saved.' },
];

const result = (text = 'Done.'): GenerateResult => ({
  text,
  finishReason: 'stop',
  stepCount: 3,
  responseMessages,
  usage: { inputTokens: 100, outputTokens: 30, costUsd: 0.01 },
});

function fixture(open: boolean | ExecutionPlan = false) {
  const repository = {
    findExecutionPlan: () =>
      Promise.resolve(
        typeof open === 'boolean'
          ? open
            ? { ...scope, revision: 1, steps: [pending] }
            : null
          : open,
      ),
    saveExecutionPlan: (input: ExecutionPlanWrite): Promise<ExecutionPlan> =>
      Promise.resolve({ ...input, revision: input.revision + 1 }),
  };

  const plan = new AssistantPlanState(repository, scope);
  const generate = jest.fn<LanguageModelGateway['generate']>();
  const model: LanguageModelGateway = {
    provider: 'openrouter',
    model: 'test',
    generate,
  };

  const settings = new AssistantExecutionSettings(
    new ConfigService({
      BACKEND_ASSISTANT_REASONING_EFFORT: 'medium',
      BACKEND_ASSISTANT_MAX_STEPS: 16,
      BACKEND_ASSISTANT_MAX_OUTPUT_TOKENS: 4096,
      BACKEND_ASSISTANT_TIMEOUT_MS: 180000,
      BACKEND_ASSISTANT_PLANNING_ENABLED: true,
    }),
  );

  return { plan, generate, model, settings };
}

describe('Main conversation execution', () => {
  it('enables reasoning and the larger budget only on the main generation request', async () => {
    const { model, generate, settings } = fixture();
    generate.mockResolvedValue(result());

    await generateAssistantTurn(model, { messages }, settings);

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoningEffort: 'medium',
        maxOutputTokens: 4096,
        maxSteps: 16,
      }),
    );
  });

  it('suppresses an early terminal receipt while the plan has actionable work', async () => {
    const { model, generate, settings, plan } = fixture(true);
    await plan.load();
    const receipt = jest.fn(() => 'Saved.');
    generate.mockImplementation((request) => {
      expect(
        request.acknowledgeTerminalStep?.(
          [
            {
              toolCallId: 'save-1',
              toolName: 'save_note',
              arguments: {},
              result: { id: 'saved-note' },
            },
          ],
          [],
        ),
      ).toBeNull();

      return Promise.resolve({ ...result(), finishReason: 'tool-calls' });
    });

    const output = await generateAssistantTurn(
      model,
      { messages, acknowledgeTerminalStep: receipt },
      settings,
      plan,
    );

    expect(receipt).not.toHaveBeenCalled();
    expect(output.text).toContain(
      'Unfinished work: Summarize the saved results',
    );
  });

  it('continues from the completed tool transcript and only delivers the reconciled final answer', async () => {
    const { model, generate, settings, plan } = fixture(true);
    await plan.load();
    const delivered = jest.fn();
    generate.mockResolvedValueOnce(result('The note was saved.'));
    generate.mockImplementationOnce(async () => {
      await plan.update(
        { revision: 1, steps: [{ ...pending, status: 'completed' }] },
        'finish',
      );

      return result('Saved the note and summarized the results.');
    });

    const output = await generateAssistantTurn(
      model,
      { messages, onTextDelta: delivered },
      settings,
      plan,
    );

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0].maxSteps).toBe(13);
    expect(generate.mock.calls[1]?.[0].messages).toEqual(
      expect.arrayContaining(responseMessages),
    );
    expect(delivered.mock.calls).toEqual([
      ['Saved the note and summarized the results.'],
    ]);
    expect(output.usage).toEqual({
      inputTokens: 200,
      outputTokens: 60,
      costUsd: 0.02,
    });
  });

  it('bounds completion reminders and reports the still-open work', async () => {
    const { model, generate, settings, plan } = fixture(true);
    await plan.load();
    generate.mockResolvedValue(result());

    const output = await generateAssistantTurn(
      model,
      { messages },
      settings,
      plan,
    );

    expect(generate).toHaveBeenCalledTimes(2);
    expect(output.text).toContain(
      'Unfinished work: Summarize the saved results',
    );
    expect(plan.actionable()).toBe(true);
  });

  it('keeps total cost unknown when a continuation omits billing', async () => {
    const { model, generate, settings, plan } = fixture(true);
    await plan.load();
    generate.mockResolvedValueOnce(result());
    generate.mockResolvedValueOnce({
      ...result(),
      usage: { inputTokens: 50, outputTokens: 20 },
    });

    const output = await generateAssistantTurn(
      model,
      { messages },
      settings,
      plan,
    );

    expect(output.usage).toEqual({ inputTokens: 150, outputTokens: 50 });
    expect(output.usage.costUsd).toBeUndefined();
  });

  it('does not retry or claim success after an output-length stop', async () => {
    const { model, generate, settings, plan } = fixture(true);
    await plan.load();
    const delivered = jest.fn();
    generate.mockResolvedValue({
      ...result('Partially generated'),
      finishReason: 'length',
    });

    await expect(
      generateAssistantTurn(
        model,
        { messages, onTextDelta: delivered },
        settings,
        plan,
      ),
    ).rejects.toThrow('ended before completing');

    expect(generate).toHaveBeenCalledTimes(1);
    expect(delivered).not.toHaveBeenCalled();
    expect(plan.actionable()).toBe(true);
  });

  it('does not continue work blocked on user information', async () => {
    const { model, generate, settings, plan } = fixture(true);
    await plan.load();
    await plan.update(
      {
        revision: 1,
        steps: [
          {
            ...pending,
            status: 'blocked',
            reason: 'The user must identify the destination.',
          },
        ],
      },
      'block',
    );
    generate.mockResolvedValue(result('Which destination should I use?'));

    await generateAssistantTurn(model, { messages }, settings, plan);

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('does not resume an earlier plan when the new message only says thanks', async () => {
    const oldPlan = {
      ...scope,
      runId: 'old-run',
      sourceMessageId: 'old-message',
      revision: 1,
      steps: [pending],
    };

    const { model, generate, settings, plan } = fixture(oldPlan);
    await plan.load();
    generate.mockResolvedValue(result('You are welcome.'));

    const output = await generateAssistantTurn(
      model,
      { messages: [{ role: 'user', content: 'Thanks!' }] },
      settings,
      plan,
    );

    expect(output.text).toBe('You are welcome.');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(plan.snapshot()).toEqual(oldPlan);
  });

  it('honours cancellation before any provider call', async () => {
    const { model, generate, settings } = fixture();
    const controller = new AbortController();
    controller.abort(new Error('Superseded by a newer request.'));

    await expect(
      generateAssistantTurn(
        model,
        { messages, abortSignal: controller.signal },
        settings,
      ),
    ).rejects.toThrow('Superseded');

    expect(generate).not.toHaveBeenCalled();
  });

  it('withholds the final answer when cancellation arrives during generation', async () => {
    const { model, generate, settings } = fixture();
    const controller = new AbortController();
    const delivered = jest.fn();
    generate.mockImplementation(() => {
      controller.abort(new Error('New direction received.'));

      return Promise.resolve(result());
    });

    await expect(
      generateAssistantTurn(
        model,
        { messages, abortSignal: controller.signal, onTextDelta: delivered },
        settings,
      ),
    ).rejects.toThrow('New direction');

    expect(delivered).not.toHaveBeenCalled();
  });

  it('rejects continuation metadata that would bypass the step budget', async () => {
    const { model, generate, settings, plan } = fixture(true);
    await plan.load();
    generate.mockResolvedValue({ ...result(), stepCount: 0 });

    await expect(
      generateAssistantTurn(model, { messages }, settings, plan),
    ).rejects.toThrow('continuation metadata');

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsupported reasoning setting', () => {
    expect(
      () =>
        new AssistantExecutionSettings(
          new ConfigService({ BACKEND_ASSISTANT_REASONING_EFFORT: 'typo' }),
        ),
    ).toThrow('REASONING_EFFORT');
  });
});
