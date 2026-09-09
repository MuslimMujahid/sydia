import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type {
  AssistantRun,
  Conversation,
  Message,
  User,
} from '../../../database/entities';
import type { IConversationRepository } from '../../../database/interfaces';
import type { LanguageModelGateway } from '../../../infra/model-gateway';
import { AssistantOrchestratorService } from './assistant-orchestrator.service';
import { ContextBuilderService } from './context-builder.service';
import { ConversationSummarizerService } from './conversation-summarizer.service';
import { ToolExecutorService } from './tool-executor.service';

function resolved<T>(value: T) {
  return jest.fn<() => Promise<T>>().mockResolvedValue(value);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

const now = new Date('2026-09-06T00:00:00.000Z');
const conversation: Conversation = {
  id: 'conversation-1',
  title: 'Halo',
  createdAt: now,
  updatedAt: now,
};

const userMessage: Message = {
  id: 'message-1',
  conversationId: conversation.id,
  role: 'user',
  content: 'Halo',
  createdAt: now,
};

const user = {
  id: 'user-1',
  name: 'Ayu',
  timezone: 'Asia/Jakarta',
  locale: 'id',
  persona: 'personal_assistant',
  preferredAddress: null,
} satisfies Pick<
  User,
  'id' | 'name' | 'timezone' | 'locale' | 'persona' | 'preferredAddress'
>;

function createRun(status = 'queued'): AssistantRun {
  return {
    id: 'run-1',
    conversationId: conversation.id,
    assistantMessageId: null,
    status,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('AssistantOrchestratorService', () => {
  it('persists a successful assistant turn', async () => {
    const completedRun = createRun('completed');
    const assistantMessage: Message = {
      ...userMessage,
      id: 'message-2',
      role: 'assistant',
      content: 'Halo, Ayu.',
    };

    const completeRun = resolved({
      assistantMessage,
      assistantRun: completedRun,
    });

    const repository = {
      writeUserMessage: resolved({
        conversation,
        userMessage,
        replayed: false,
      }),
      findLatestRunForMessage: resolved(null),
      createRun: resolved(createRun()),
      claimRun: resolved(true),
      findContext: resolved({
        conversation: {
          id: conversation.id,
          rollingSummary: null,
          summaryThroughMessageId: null,
        },
        messages: [userMessage],
      }),
      completeRun,
      updateRun: resolved(completedRun),
      replaceSummary: jest.fn(),
    } as unknown as IConversationRepository;

    const generation = deferred<{
      text: string;
      usage: Record<string, never>;
    }>();

    const generate = jest.fn<LanguageModelGateway['generate']>(
      () => generation.promise,
    );

    const model: LanguageModelGateway = {
      provider: 'openrouter',
      model: 'test-model',
      generate,
    };

    const config = new ConfigService();
    const contextBuilder = new ContextBuilderService(repository, config);
    const summarizer = new ConversationSummarizerService(
      repository,
      model,
      config,
    );

    const toolExecutor = new ToolExecutorService(repository, []);
    const scheduleMemoryDream = resolved(undefined);
    const addConversationSummary = resolved({});
    const orchestrator = new AssistantOrchestratorService(
      repository,
      model,
      contextBuilder,
      summarizer,
      toolExecutor,
      { conversationSummaries: { add: addConversationSummary } } as never,
      { schedule: scheduleMemoryDream } as never,
    );

    const result = await orchestrator.sendQueued(user, {
      content: 'Halo',
      idempotencyKey: '9ad63d74-6c9d-4e1c-9ec7-31ce196ccf33',
    });

    expect(result.assistantMessage).toBeNull();
    expect(result.assistantRun).toEqual(
      expect.objectContaining({ status: 'queued' }),
    );

    generation.resolve({ text: assistantMessage.content, usage: {} });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        content: assistantMessage.content,
      }),
    );
    expect(scheduleMemoryDream).toHaveBeenCalledWith(
      user.id,
      conversation.id,
      assistantMessage.id,
    );
    expect(addConversationSummary).toHaveBeenCalledWith(
      'summarize',
      { userId: user.id, conversationId: conversation.id },
      { jobId: `summary-${conversation.id}-${userMessage.id}` },
    );
  });

  it('resumes a queued run when an idempotent message is replayed', async () => {
    const queuedRun = {
      ...createRun(),
      inputMessageId: userMessage.id,
      startedAt: null,
    };

    const completedRun = createRun('completed');
    const assistantMessage: Message = {
      ...userMessage,
      id: 'message-2',
      role: 'assistant',
      content: 'Halo lagi.',
    };

    const completeRun = resolved({
      assistantMessage,
      assistantRun: completedRun,
    });

    const repository = {
      writeUserMessage: resolved({
        conversation,
        userMessage,
        replayed: true,
      }),
      findLatestRunForMessage: resolved(queuedRun),
      claimRun: resolved(true),
      findContext: resolved({
        conversation: {
          id: conversation.id,
          rollingSummary: null,
          summaryThroughMessageId: null,
        },
        messages: [userMessage],
      }),
      completeRun,
      replaceSummary: jest.fn(),
    } as unknown as IConversationRepository;

    const generate = resolved({
      text: assistantMessage.content,
      usage: {},
    });

    const model: LanguageModelGateway = {
      provider: 'openrouter',
      model: 'test-model',
      generate,
    };

    const config = new ConfigService();
    const scheduleMemoryDream = resolved(undefined);
    const addConversationSummary = resolved({});
    const orchestrator = new AssistantOrchestratorService(
      repository,
      model,
      new ContextBuilderService(repository, config),
      new ConversationSummarizerService(repository, model, config),
      new ToolExecutorService(repository, []),
      { conversationSummaries: { add: addConversationSummary } } as never,
      { schedule: scheduleMemoryDream } as never,
    );

    const result = await orchestrator.sendQueued(user, {
      content: 'Halo',
      idempotencyKey: '9ad63d74-6c9d-4e1c-9ec7-31ce196ccf33',
    });

    expect(result.assistantMessage).toBeNull();
    expect(result.assistantRun).toEqual(queuedRun);

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(generate).toHaveBeenCalledTimes(1);
    expect(completeRun).toHaveBeenCalledTimes(1);
    expect(scheduleMemoryDream).toHaveBeenCalledTimes(1);
  });

  it('streams only the final model text while preserving the completed turn', async () => {
    const completedRun = createRun('completed');
    const assistantMessage: Message = {
      ...userMessage,
      id: 'message-2',
      role: 'assistant',
      content: 'Halo, Ayu.',
    };

    const repository = {
      writeUserMessage: resolved({
        conversation,
        userMessage,
        replayed: false,
      }),
      findLatestRunForMessage: resolved(null),
      createRun: resolved(createRun()),
      claimRun: resolved(true),
      findContext: resolved({
        conversation: {
          id: conversation.id,
          rollingSummary: null,
          summaryThroughMessageId: null,
        },
        messages: [userMessage],
      }),
      completeRun: resolved({ assistantMessage, assistantRun: completedRun }),
      updateRun: resolved(completedRun),
      replaceSummary: jest.fn(),
    } as unknown as IConversationRepository;

    const generate = jest.fn<LanguageModelGateway['generate']>((request) => {
      request.onToolCall?.('search_documents');
      request.onTextDelta?.(assistantMessage.content);

      return Promise.resolve({ text: assistantMessage.content, usage: {} });
    });

    const model: LanguageModelGateway = {
      provider: 'openrouter',
      model: 'test-model',
      generate,
    };

    const config = new ConfigService();
    const orchestrator = new AssistantOrchestratorService(
      repository,
      model,
      new ContextBuilderService(repository, config),
      new ConversationSummarizerService(repository, model, config),
      new ToolExecutorService(repository, []),
      { conversationSummaries: { add: resolved({}) } } as never,
      { schedule: resolved(undefined) } as never,
    );

    const chunks: Array<{ type: string; data?: unknown; delta?: string }> = [];

    for await (const chunk of orchestrator.stream(user, {
      content: 'Halo',
      idempotencyKey: '9ad63d74-6c9d-4e1c-9ec7-31ce196ccf33',
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'data-activity',
          data: expect.objectContaining({ phase: 'queued' }) as unknown,
        }),
        expect.objectContaining({
          type: 'text-delta',
          delta: assistantMessage.content,
        }),
        expect.objectContaining({
          type: 'data-turn',
          data: expect.objectContaining({
            assistantMessage,
            assistantRun: completedRun,
          }) as unknown,
        }),
      ]),
    );
  });

  it('fails instead of persisting tool confirmations as an answer', async () => {
    const failedRun = createRun('failed');
    const completeRun = jest.fn();
    const updateRun = resolved(failedRun);
    const repository = {
      writeUserMessage: resolved({
        conversation,
        userMessage,
        replayed: false,
      }),
      findLatestRunForMessage: resolved(null),
      createRun: resolved(createRun()),
      claimRun: resolved(true),
      findContext: resolved({
        conversation: {
          id: conversation.id,
          rollingSummary: null,
          summaryThroughMessageId: null,
        },
        messages: [userMessage],
      }),
      completeRun,
      updateRun,
      replaceSummary: jest.fn(),
    } as unknown as IConversationRepository;

    const invocation = {
      id: 'tool-1',
      assistantRunId: 'run-1',
      name: 'search_documents',
      label: 'Mencari dokumen',
      status: 'completed',
      objectId: null,
      objectType: null,
      state: null,
      output: { sources: [] },
      createdAt: now,
      updatedAt: now,
    } as never;

    const toolExecutor = {
      aiTools: (
        _userId: string,
        _runId: string,
        _messageId: string,
        onExecution: (result: { invocation: typeof invocation }) => void,
      ) => {
        onExecution({ invocation });

        return {};
      },
      activityLabel: () => 'Mencari dokumen',
    } as unknown as ToolExecutorService;

    const model: LanguageModelGateway = {
      provider: 'openrouter',
      model: 'test-model',
      generate: resolved({ text: '', usage: {} }),
    };

    const config = new ConfigService();
    const orchestrator = new AssistantOrchestratorService(
      repository,
      model,
      new ContextBuilderService(repository, config),
      new ConversationSummarizerService(repository, model, config),
      toolExecutor,
      { conversationSummaries: { add: resolved({}) } } as never,
      { schedule: resolved(undefined) } as never,
    );

    const result = await orchestrator.sendAndWait(user, {
      content: 'Ringkas dokumennya',
      idempotencyKey: '9ad63d74-6c9d-4e1c-9ec7-31ce196ccf33',
    });

    expect(result.assistantMessage).toBeNull();
    expect(result.assistantRun.status).toBe('failed');
    expect(completeRun).not.toHaveBeenCalled();
    expect(updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('replays an idempotent message without invoking the model again', async () => {
    const run = createRun('completed');
    const repository = {
      writeUserMessage: resolved({
        conversation,
        userMessage,
        replayed: true,
      }),
      findLatestRunForMessage: resolved(run),
      findDetail: resolved({
        conversation,
        messages: [userMessage],
        assistantRuns: [run],
        toolInvocations: [],
      }),
    } as unknown as IConversationRepository;

    const generate = jest.fn<LanguageModelGateway['generate']>();
    const model: LanguageModelGateway = {
      provider: 'openrouter',
      model: 'test-model',
      generate,
    };

    const config = new ConfigService();
    const scheduleMemoryDream = resolved(undefined);
    const addConversationSummary = resolved({});
    const orchestrator = new AssistantOrchestratorService(
      repository,
      model,
      new ContextBuilderService(repository, config),
      new ConversationSummarizerService(repository, model, config),
      new ToolExecutorService(repository, []),
      { conversationSummaries: { add: addConversationSummary } } as never,
      { schedule: scheduleMemoryDream } as never,
    );

    await orchestrator.sendQueued(user, {
      content: 'Halo',
      idempotencyKey: '9ad63d74-6c9d-4e1c-9ec7-31ce196ccf33',
    });

    expect(generate).not.toHaveBeenCalled();
    expect('createRun' in repository).toBe(false);
    expect(scheduleMemoryDream).not.toHaveBeenCalled();
  });
});
