import { jest } from '@jest/globals';
import type {
  ExecutionPlan,
  ExecutionPlanWrite,
} from '../../../database/entities';
import { AssistantPlanState, createAssistantPlanTool } from './assistant-plan';

const scope = {
  userId: 'owner',
  conversationId: 'chat',
  runId: 'run',
  sourceMessageId: 'message',
  claimStartedAt: new Date('2026-11-09T00:00:00Z'),
};

const pending = {
  id: 'capture',
  description: 'Capture the requested note',
  status: 'pending' as const,
};

function fixture(saved: ExecutionPlan | null = null) {
  const repository = {
    findExecutionPlan: jest
      .fn<() => Promise<ExecutionPlan | null>>()
      .mockResolvedValue(saved),
    saveExecutionPlan: jest
      .fn<(input: ExecutionPlanWrite) => Promise<ExecutionPlan>>()
      .mockImplementation((input) =>
        Promise.resolve({ ...input, revision: input.revision + 1 }),
      ),
  };

  return { repository, plan: new AssistantPlanState(repository, scope) };
}

describe('Assistant execution plans', () => {
  it('restores an unfinished plan before the latest user direction', async () => {
    const { plan } = fixture({ ...scope, revision: 3, steps: [pending] });
    await plan.load();

    const messages = plan.messages([
      { role: 'user', content: 'Cancel that work.' },
    ]);

    expect(messages[messages.length - 1]).toEqual({
      role: 'user',
      content: 'Cancel that work.',
    });
    expect(messages[messages.length - 2]?.content).toContain(
      'Capture the requested note',
    );
    expect(plan.actionable()).toBe(true);
  });

  it('persists the claim and revision before exposing the new plan', async () => {
    const { repository, plan } = fixture();
    const saved = await plan.update(
      { revision: 0, steps: [pending] },
      'message:tool-1',
    );

    expect(saved.revision).toBe(1);
    expect(repository.saveExecutionPlan).toHaveBeenCalledWith({
      ...scope,
      revision: 0,
      steps: [pending],
      idempotencyKey: 'message:tool-1',
    });
    expect(plan.snapshot()?.steps).toEqual([pending]);
  });

  it('does not activate old work until the current turn adopts it', async () => {
    const { plan } = fixture({
      ...scope,
      runId: 'previous-run',
      sourceMessageId: 'previous-message',
      revision: 1,
      steps: [pending],
    });

    await plan.load();

    expect(plan.actionable()).toBe(true);
    expect(plan.checksCompletion()).toBe(false);

    await plan.update({ revision: 1, steps: [pending] }, 'adopt');

    expect(plan.checksCompletion()).toBe(true);
  });

  it('keeps completed outcomes visible when retrying their original request', async () => {
    const { plan } = fixture({
      ...scope,
      runId: 'previous-run',
      revision: 2,
      steps: [{ ...pending, status: 'completed' }],
    });

    await plan.load();

    const context = plan.messages([
      { role: 'user', content: 'Capture the note.' },
    ]);

    expect(context.at(-2)?.content).toContain('Capture the requested note');
    expect(context.at(-2)?.content).toContain('completed');
    expect(plan.checksCompletion()).toBe(false);
  });

  it('does not expose an update whose database write failed', async () => {
    const { repository, plan } = fixture();
    repository.saveExecutionPlan.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      plan.update({ revision: 0, steps: [pending] }, 'tool-1'),
    ).rejects.toThrow('database unavailable');

    expect(plan.snapshot()).toBeNull();
  });

  it('rejects a plan with multiple active steps instead of silently changing it', async () => {
    const { repository, plan } = fixture();

    await expect(
      plan.update(
        {
          revision: 0,
          steps: [
            { ...pending, status: 'in_progress' },
            {
              id: 'review',
              description: 'Review the result',
              status: 'in_progress',
            },
          ],
        },
        'tool-1',
      ),
    ).rejects.toThrow('Only one step');

    expect(repository.saveExecutionPlan).not.toHaveBeenCalled();
  });

  it('requires a reason when unfinished work is blocked', async () => {
    const { plan } = fixture();

    await expect(
      plan.update(
        { revision: 0, steps: [{ ...pending, status: 'blocked' }] },
        'tool-1',
      ),
    ).rejects.toThrow('require a reason');
  });

  it('retains cancelled history without trying to continue it', async () => {
    const { plan } = fixture({ ...scope, revision: 1, steps: [pending] });
    await plan.load();
    await plan.update(
      {
        revision: 1,
        steps: [
          { ...pending, status: 'cancelled', reason: 'The user cancelled.' },
        ],
      },
      'tool-2',
    );

    expect(plan.actionable()).toBe(false);
    expect(plan.snapshot()?.steps[0]?.status).toBe('cancelled');
  });

  it('rejects silently dropping unfinished steps', async () => {
    const { plan } = fixture({ ...scope, revision: 1, steps: [pending] });
    await plan.load();

    await expect(
      plan.update({ revision: 1, steps: [] }, 'tool-2'),
    ).rejects.toThrow('explicitly mark them cancelled');
  });

  it('rejects execution-plan writes from background agents', async () => {
    const { plan } = fixture();

    await expect(
      createAssistantPlanTool().execute({
        userId: 'owner',
        sourceMessageId: 'message',
        arguments: { revision: 0, steps: [] },
        idempotencyKey: 'tool',
        context: { executionPlan: plan, trigger: 'background' },
      }),
    ).rejects.toThrow('active user conversation');
  });
});
