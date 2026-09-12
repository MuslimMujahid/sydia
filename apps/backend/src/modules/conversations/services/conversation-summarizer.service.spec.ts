import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Message } from '../../../database/entities';
import type { IConversationRepository } from '../../../database/interfaces';
import type { LanguageModelGateway } from '../../../infra/model-gateway';
import { ContextBuilderService } from './context-builder.service';
import { ConversationSummarizerService } from './conversation-summarizer.service';

function resolved<T>(value: T) {
  return jest.fn<() => Promise<T>>().mockResolvedValue(value);
}

const messages: Message[] = Array.from({ length: 10 }, (_, index) => ({
  id: `message-${index}`,
  conversationId: 'conversation-1',
  role: index % 2 === 0 ? 'user' : 'assistant',
  content: `Pesan ${index} ${'isi '.repeat(20)}`,
  createdAt: new Date(index),
}));

describe('conversation context lifecycle', () => {
  it('bounds recent messages from the configured token budget', async () => {
    const repository = {
      findContext: resolved({
        conversation: {
          id: 'conversation-1',
          rollingSummary: 'Ringkasan lama',
          summaryThroughMessageId: 'message-3',
        },
        messages,
      }),
    } as unknown as IConversationRepository;

    // Budget must stay above the fixed system policy plus the always-emitted
    // turn context, otherwise optional context truncates to a bare ellipsis.
    const config = new ConfigService({ BACKEND_ASSISTANT_CONTEXT_TOKENS: 760 });
    const builder = new ContextBuilderService(repository, config);

    const { messages: context } = await builder.build(
      {
        id: 'user-1',
        name: 'Ayu',
        timezone: 'Asia/Jakarta',
        locale: 'id',
        persona: 'professional',
        preferredAddress: null,
      },
      'conversation-1',
    );

    expect(
      context.some(
        (entry) =>
          typeof entry.content === 'string' &&
          entry.content.includes('Ringkasan lama'),
      ),
    ).toBe(true);
    expect(context.length).toBeLessThan(messages.length + 4);
    // Volatile blocks (summary, memories) and the turn context follow the
    // stable history, so the newest retained message is no longer last.
    expect(
      context.some(
        (entry) =>
          typeof entry.content === 'string' &&
          entry.content.includes('Pesan 9'),
      ),
    ).toBe(true);
    expect(context.at(-1)?.content).toContain('current instant');
  });

  it('summarizes only the oldest segment and retains recent turns verbatim', async () => {
    const replaceSummary = jest
      .fn<IConversationRepository['replaceSummary']>()
      .mockResolvedValue(true);

    const repository = {
      findContext: resolved({
        conversation: {
          id: 'conversation-1',
          rollingSummary: null,
          summaryThroughMessageId: null,
        },
        messages,
      }),
      replaceSummary,
    } as unknown as IConversationRepository;

    const generate = jest
      .fn<LanguageModelGateway['generate']>()
      .mockResolvedValue({
        text: JSON.stringify({
          currentObjective: 'Menyelesaikan percakapan',
          establishedFacts: [],
          decisions: [],
          userConstraints: [],
          completedActions: [],
          pendingActions: ['Lanjutkan pekerjaan'],
          unresolvedQuestions: [],
          relevantEntities: [],
        }),
        usage: {},
      });

    const config = new ConfigService({
      BACKEND_SUMMARY_TRIGGER_TOKENS: 1,
      BACKEND_SUMMARY_RETAIN_MESSAGES: 4,
    });

    const summarizer = new ConversationSummarizerService(
      repository,
      { provider: 'openrouter', model: 'test-model', generate },
      config,
    );

    await expect(
      summarizer.summarizeIfNeeded('user-1', 'conversation-1'),
    ).resolves.toBe(true);
    expect(replaceSummary).toHaveBeenCalledWith(
      'user-1',
      'conversation-1',
      expect.stringContaining('currentObjective'),
      'message-5',
      null,
    );
  });

  it('does not advance the checkpoint when model output is invalid', async () => {
    const replaceSummary = jest.fn<IConversationRepository['replaceSummary']>();
    const repository = {
      findContext: resolved({
        conversation: {
          id: 'conversation-1',
          rollingSummary: null,
          summaryThroughMessageId: null,
        },
        messages,
      }),
      replaceSummary,
    } as unknown as IConversationRepository;

    const summarizer = new ConversationSummarizerService(
      repository,
      {
        provider: 'openrouter',
        model: 'test-model',
        generate: resolved({ text: 'not-json', usage: {} }),
      },
      new ConfigService({
        BACKEND_SUMMARY_TRIGGER_TOKENS: 1,
        BACKEND_SUMMARY_RETAIN_MESSAGES: 4,
      }),
    );

    await expect(
      summarizer.summarizeIfNeeded('user-1', 'conversation-1'),
    ).rejects.toThrow('Conversation summary output is invalid.');
    expect(replaceSummary).not.toHaveBeenCalled();
  });
});
