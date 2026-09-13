import { jest } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import type { IConversationRepository } from '../../../database/interfaces';
import { ToolExecutorService, narrowToolNames } from './tool-executor.service';

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
      label: 'Search notes',
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
          label: 'Search notes',
          description: 'Search the user notes.',
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

  it('exposes only read-only tools as retry-safe', () => {
    const repository = {} as unknown as IConversationRepository;
    const definition = (name: string) => ({
      name,
      label: name,
      description: `${name}.`,
      parameters: { type: 'object' as const },
    });

    const executor = new ToolExecutorService(repository, [
      {
        definition: definition('search_documents'),
        readOnly: true,
        parseArguments: () => ({}),
        execute: () => Promise.resolve({}),
      },
      {
        definition: definition('create_task'),
        parseArguments: () => ({}),
        execute: () => Promise.resolve({}),
      },
    ]);

    expect([...executor.retrySafeTools()]).toEqual(['search_documents']);
  });

  it('reuses identical document searches within one model run', async () => {
    const pending = {
      id: 'tool-1',
      assistantRunId: 'run-1',
      name: 'search_documents',
      label: 'Search documents',
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
          label: 'Search documents',
          description: 'Search the user documents.',
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
      label: 'Delete category',
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
          label: 'Delete category',
          description: 'Delete the category.',
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
    expect(proposed.content).toBe('Delete category is awaiting user approval.');
    await executor.resolveConfirmation('user-1', pending.id, true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns a sanitized actionable error to the model', async () => {
    const pending = {
      id: 'tool-1',
      assistantRunId: 'run-1',
      name: 'read_document',
      label: 'Read document',
      status: 'pending',
      result: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const repository = {
      createToolInvocation: resolved(pending),
      claimToolInvocation: resolved(true),
      updateToolInvocation: jest
        .fn()
        .mockImplementation((_id: unknown, update: unknown) =>
          Promise.resolve({ ...pending, ...(update as object) }),
        ),
    } as unknown as IConversationRepository;

    const executor = new ToolExecutorService(repository, [
      {
        definition: {
          name: 'read_document',
          label: 'Read document',
          description: 'Read a document.',
          parameters: { type: 'object' },
        },
        parseArguments: (value) => value as never,
        execute: () => Promise.reject(new Error('Document not found.\nRetry.')),
      },
    ]);

    const result = await executor.execute('user-1', 'run-1', 'message-1', {
      id: 'call-1',
      name: 'read_document',
      arguments: { id: 'missing' },
    });

    expect(JSON.parse(result.content)).toEqual({
      error: 'tool_failed',
      message: 'Document not found. Retry.',
    });
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
      label: 'Save note',
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
          label: 'Save note',
          description: 'Save a note.',
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
  it('executes structured store_secret calls without persisting sensitive data', async () => {
    const pending = {
      id: 'tool-store-secret',
      assistantRunId: 'run-1',
      name: 'store_secret',
      label: 'Store secret',
      status: 'pending',
      result: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const value = 'first line\nsecond line\n\nfinal line  ';

    const argumentsValue = { label: 'VPN credentials', value };

    const createToolInvocation = resolved(pending);

    const updateToolInvocation = jest
      .fn()
      .mockImplementation((_id: unknown, update: unknown) =>
        Promise.resolve({ ...pending, ...(update as object) }),
      );

    const execute = jest.fn<
      (input: {
        userId: string;
        sourceMessageId: string;
        arguments: Prisma.InputJsonValue;
        idempotencyKey: string;
      }) => Promise<Prisma.InputJsonValue>
    >(() =>
      Promise.resolve({
        objectType: 'secret',
        object: { id: 'secret-1', label: 'VPN credentials' },
      }),
    );

    const repository = {
      createToolInvocation,
      claimToolInvocation: resolved(true),
      updateToolInvocation,
    } as unknown as IConversationRepository;

    const executor = new ToolExecutorService(repository, [
      {
        definition: {
          name: 'store_secret',
          label: 'Store secret',
          description: 'Store a structured secret.',
          parameters: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['label', 'value'],
          },
        },
        sensitive: true,
        parseArguments: (input) => input as never,
        execute,
      },
    ]);

    const result = await executor.execute(
      'user-1',
      'run-1',
      'arbitrary-source-text',
      {
        id: 'call-store-secret',
        name: 'store_secret',
        arguments: argumentsValue,
      },
    );

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMessageId: 'arbitrary-source-text',
        arguments: argumentsValue,
      }),
    );
    expect(createToolInvocation).toHaveBeenCalledWith(
      expect.objectContaining({ arguments: {} }),
    );
    expect(updateToolInvocation).toHaveBeenCalledWith(
      'tool-store-secret',
      expect.objectContaining({
        result: {
          objectType: 'secret',
          object: { id: 'secret-1', label: 'VPN credentials' },
        },
      }),
    );
    expect(result.content).toBe(
      '{"objectType":"secret","object":{"id":"secret-1","label":"VPN credentials"}}',
    );
    expect(JSON.stringify(result.invocation)).not.toContain(value);
    expect(JSON.stringify(result.invocation)).not.toContain('second line');
  });

  it('never persists sensitive tool arguments or transient reveal tokens', async () => {
    const pending = {
      id: 'tool-secret',
      assistantRunId: 'run-1',
      name: 'create_secret_reveal_link',
      label: 'Create secret link',
      status: 'pending',
      result: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const createToolInvocation = resolved(pending);
    const updateToolInvocation = jest
      .fn()
      .mockImplementation((_id: unknown, update: unknown) =>
        Promise.resolve({ ...pending, ...(update as object) }),
      );

    const repository = {
      createToolInvocation,
      claimToolInvocation: resolved(true),
      updateToolInvocation,
    } as unknown as IConversationRepository;

    const executor = new ToolExecutorService(repository, [
      {
        definition: {
          name: 'create_secret_reveal_link',
          label: 'Create secret link',
          description: 'Create a secret link.',
          parameters: { type: 'object' },
        },
        sensitive: true,
        exposeTransientResult: true,
        parseArguments: (value) => value as never,
        execute: () =>
          Promise.resolve({
            objectType: 'secret_reveal',
            object: {
              id: 'secret-1',
              label: 'ATM',
              url: 'https://sydia.test/secret-reveal#bearer-token',
            },
          }),
      },
    ]);

    const result = await executor.execute('user-1', 'run-1', 'message-1', {
      id: 'call-1',
      name: 'create_secret_reveal_link',
      arguments: { label: 'ATM' },
    });

    expect(createToolInvocation).toHaveBeenCalledWith(
      expect.objectContaining({ arguments: {} }),
    );
    expect(updateToolInvocation).toHaveBeenCalledWith(
      'tool-secret',
      expect.objectContaining({
        result: {
          objectType: 'secret',
          object: { id: 'secret-1', label: 'ATM' },
        },
      }),
    );
    expect(result.content).toContain('bearer-token');
    expect(JSON.stringify(result.invocation)).not.toContain('bearer-token');
  });
});

describe('narrowToolNames', () => {
  const ALL = [
    'get_current_datetime',
    'create_task',
    'list_tasks',
    'create_reminder',
    'search_memories',
    'send_file',
    'create_calendar_event',
    'store_secret',
  ];

  it('advertises every tool on the first step', () => {
    expect(narrowToolNames(0, ALL, [])).toBeUndefined();
  });

  it('keeps the executed family plus the pinned time tool', () => {
    const active = narrowToolNames(1, ALL, ['create_reminder']);

    expect(active).toEqual(['get_current_datetime', 'create_reminder']);
  });

  it('unions families when the first step chose tools from several', () => {
    const active = narrowToolNames(1, ALL, ['create_task', 'create_reminder']);

    expect(active).toEqual([
      'get_current_datetime',
      'create_task',
      'list_tasks',
      'create_reminder',
    ]);
  });

  it('keeps the full tool set when nothing executable ran', () => {
    expect(narrowToolNames(1, ALL, [])).toBeUndefined();
    expect(narrowToolNames(1, ALL, ['unknown_tool'])).toBeUndefined();
  });
});
