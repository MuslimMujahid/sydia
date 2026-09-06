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
  persona: 'supportive',
} satisfies Pick<User, 'id' | 'name' | 'timezone' | 'locale' | 'persona'>;

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
    const contextBuilder = new ContextBuilderService(repository, config);
    const summarizer = new ConversationSummarizerService(repository, config);
    const toolExecutor = new ToolExecutorService(repository, []);
    const orchestrator = new AssistantOrchestratorService(
      repository,
      model,
      contextBuilder,
      summarizer,
      toolExecutor,
    );

    const result = await orchestrator.send(user, {
      content: 'Halo',
      idempotencyKey: '9ad63d74-6c9d-4e1c-9ec7-31ce196ccf33',
    });

    expect(result.assistantMessage).toEqual(assistantMessage);
    expect(completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        content: assistantMessage.content,
      }),
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
    const orchestrator = new AssistantOrchestratorService(
      repository,
      model,
      new ContextBuilderService(repository, config),
      new ConversationSummarizerService(repository, config),
      new ToolExecutorService(repository, []),
    );

    const result = await orchestrator.send(user, {
      content: 'Halo',
      idempotencyKey: '9ad63d74-6c9d-4e1c-9ec7-31ce196ccf33',
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(completeRun).toHaveBeenCalledTimes(1);
    expect(result.assistantMessage).toEqual(assistantMessage);
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
    const orchestrator = new AssistantOrchestratorService(
      repository,
      model,
      new ContextBuilderService(repository, config),
      new ConversationSummarizerService(repository, config),
      new ToolExecutorService(repository, []),
    );

    await orchestrator.send(user, {
      content: 'Halo',
      idempotencyKey: '9ad63d74-6c9d-4e1c-9ec7-31ce196ccf33',
    });

    expect(generate).not.toHaveBeenCalled();
    expect('createRun' in repository).toBe(false);
  });
});
