import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Message } from '../../../database/entities';
import type { IConversationRepository } from '../../../database/interfaces';
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

    const config = new ConfigService({ BACKEND_ASSISTANT_CONTEXT_TOKENS: 80 });
    const builder = new ContextBuilderService(repository, config);

    const context = await builder.build(
      {
        id: 'user-1',
        name: 'Ayu',
        timezone: 'Asia/Jakarta',
        locale: 'id',
        persona: 'supportive',
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
    expect(context.length).toBeLessThan(messages.length + 3);
    expect(context.at(-1)?.content).toContain('Pesan 9');
  });

  it('summarizes only the oldest segment and retains recent turns verbatim', async () => {
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

    const config = new ConfigService({
      BACKEND_SUMMARY_TRIGGER_TOKENS: 1,
      BACKEND_SUMMARY_RETAIN_MESSAGES: 4,
    });

    const summarizer = new ConversationSummarizerService(repository, config);

    await expect(
      summarizer.summarizeIfNeeded('user-1', 'conversation-1'),
    ).resolves.toBe(true);
    expect(replaceSummary).toHaveBeenCalledWith(
      'user-1',
      'conversation-1',
      expect.any(String),
      'message-5',
    );
  });
});
