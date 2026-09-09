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

  it('reuses identical document searches within one model run', async () => {
    const pending = {
      id: 'tool-1',
      assistantRunId: 'run-1',
      name: 'search_documents',
      label: 'Mencari dokumen',
      status: 'pending',
      result: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const completed = {
      ...pending,
      status: 'completed',
      result: { sources: [{ documentId: 'document-1' }] },
    };

    const createToolInvocation = resolved(pending);
    const execute = resolved(completed.result);
    const repository = {
      createToolInvocation,
      claimToolInvocation: resolved(true),
      updateToolInvocation: resolved(completed),
    } as unknown as IConversationRepository;

    const executor = new ToolExecutorService(repository, [
      {
        definition: {
          name: 'search_documents',
          label: 'Mencari dokumen',
          description: 'Cari dokumen pengguna.',
          parameters: { type: 'object' },
        },
        parseArguments: (value) => value as never,
        execute,
      },
    ]);

    const search = executor.aiTools(
      'user-1',
      'run-1',
      'message-1',
    ).search_documents;

    if (!search?.execute) throw new Error('Search tool is not executable.');
    const executeSearch = search.execute;
    const firstOptions = {
      toolCallId: 'call-1',
      messages: [],
      abortSignal: undefined,
    } as never;

    await expect(
      executeSearch({ query: 'ringkasan' }, firstOptions),
    ).resolves.toBe('{"sources":[{"documentId":"document-1"}]}');
    await expect(
      executeSearch({ query: 'ringkasan' }, {
        toolCallId: 'call-2',
        messages: [],
        abortSignal: undefined,
      } as never),
    ).resolves.toBe('{"sources":[{"documentId":"document-1"}]}');
    expect(createToolInvocation).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
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

  it('waits for the burst gate before executing a tool', async () => {
    let release!: () => void;
    const toolsReady = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = {
      id: 'tool-1',
      assistantRunId: 'run-1',
      name: 'save_note',
      label: 'Simpan catatan',
      status: 'pending',
      result: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const completed = {
      ...pending,
      status: 'completed',
      result: { saved: true },
    };

    const execute = resolved({ saved: true });
    const repository = {
      createToolInvocation: resolved(pending),
      claimToolInvocation: resolved(true),
      updateToolInvocation: resolved(completed),
    } as unknown as IConversationRepository;

    const executor = new ToolExecutorService(repository, [
      {
        definition: {
          name: 'save_note',
          label: 'Simpan catatan',
          description: 'Simpan.',
          parameters: { type: 'object' },
        },
        parseArguments: (value) => value as never,
        execute,
      },
    ]);

    const save = executor.aiTools(
      'user-1',
      'run-1',
      'message-1',
      undefined,
      toolsReady,
    ).save_note;

    if (!save?.execute) throw new Error('Tool is not executable.');
    const executeSave = save.execute as (
      input: unknown,
      options: unknown,
    ) => Promise<unknown>;

    const operation = executeSave(
      {},
      {
        toolCallId: 'call-1',
        messages: [],
        abortSignal: undefined,
      },
    );

    await Promise.resolve();
    expect(execute).not.toHaveBeenCalled();
    release();
    await expect(operation).resolves.toBe('{"saved":true}');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
