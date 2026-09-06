import { jest } from '@jest/globals';
import type { IConversationRepository } from '../../../database/interfaces';
import { ToolExecutorService } from './tool-executor.service';

function resolved<T>(value: T) {
  return jest.fn<() => Promise<T>>().mockResolvedValue(value);
}

describe('ToolExecutorService', () => {
  it('persists a rejected invocation for an unknown tool', async () => {
    const pending = {
      id: 'tool-1',
      assistantRunId: 'run-1',
      label: 'dangerous_tool',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const rejected = { ...pending, status: 'rejected' };
    const updateToolInvocation = resolved(rejected);
    const repository = {
      createToolInvocation: resolved(pending),
      claimToolInvocation: resolved(false),
      updateToolInvocation,
    } as unknown as IConversationRepository;

    const executor = new ToolExecutorService(repository, []);

    const result = await executor.execute('user-1', 'run-1', 'message-1', {
      id: 'call-1',
      name: 'dangerous_tool',
      arguments: { userId: 'other-user' },
    });

    expect(result.invocation.status).toBe('rejected');
    expect(updateToolInvocation).toHaveBeenCalledWith(
      'tool-1',
      expect.objectContaining({ status: 'rejected' }),
    );
  });

  it('replays a completed invocation result without executing the tool', async () => {
    const invocation = {
      id: 'tool-1',
      assistantRunId: 'run-1',
      label: 'Cari catatan',
      status: 'completed',
      result: { found: true },
      errorMessage: null,
      startedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const execute = resolved({ found: false });
    const repository = {
      createToolInvocation: resolved(invocation),
      claimToolInvocation: resolved(false),
    } as unknown as IConversationRepository;

    const executor = new ToolExecutorService(repository, [
      {
        definition: {
          name: 'search_notes',
          label: 'Cari catatan',
          description: 'Cari catatan pengguna.',
          parameters: { type: 'object' },
        },
        parseArguments: () => ({}),
        execute,
      },
    ]);

    const result = await executor.execute('user-1', 'run-1', 'message-1', {
      id: 'call-1',
      name: 'search_notes',
      arguments: {},
    });

    expect(result.content).toBe('{"found":true}');
    expect(execute).not.toHaveBeenCalled();
  });

  it('defers confirmed tools and executes only after approval', async () => {
    const pending = {
      id: 'tool-category',
      assistantRunId: 'run-1',
      name: 'delete_category',
      label: 'Menghapus kategori',
      status: 'pending',
      arguments: { id: 'cat-1', name: 'Kerja' },
      idempotencyKey: 'message:call',
      result: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const awaiting = { ...pending, status: 'awaiting_confirmation' };
    const completed = {
      ...pending,
      status: 'completed',
      result: { objectType: 'category' },
    };

    const execute = resolved({ objectType: 'category' });
    const updateToolInvocation =
      jest.fn<(id: string, value: unknown) => Promise<unknown>>();

    updateToolInvocation
      .mockResolvedValueOnce(awaiting)
      .mockResolvedValueOnce(completed);
    const repository = {
      createToolInvocation: resolved(pending),
      updateToolInvocation,
      findToolInvocation: resolved(awaiting),
      claimToolConfirmation: resolved(true),
    } as unknown as IConversationRepository;

    const executor = new ToolExecutorService(repository, [
      {
        definition: {
          name: 'delete_category',
          label: 'Menghapus kategori',
          description: 'Hapus.',
          parameters: { type: 'object' },
        },
        parseArguments: (value) => value as never,
        requiresConfirmation: true,
        execute,
      },
    ]);

    const proposed = await executor.execute('user-1', 'run-1', 'message-1', {
      id: 'call-1',
      name: 'delete_category',
      arguments: pending.arguments,
    });

    expect(proposed.invocation.status).toBe('awaiting_confirmation');
    expect(execute).not.toHaveBeenCalled();
    await executor.resolveConfirmation('user-1', pending.id, true);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
