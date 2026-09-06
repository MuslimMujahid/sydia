import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CONVERSATION_REPOSITORY,
  type IConversationRepository,
} from '../../../database/interfaces';
import type { Message } from '../../../database/entities';
import { estimateTokens } from './context-builder.service';

function summarizeMessages(
  previous: string | null,
  messages: Message[],
): string {
  const lines = messages.map((message) => {
    const speaker = message.role === 'assistant' ? 'Sydia' : 'Pengguna';
    const content = message.content.replace(/\s+/g, ' ').trim();

    return `${speaker}: ${content.length > 280 ? `${content.slice(0, 277)}…` : content}`;
  });

  return [previous?.trim(), ...lines].filter(Boolean).join('\n').slice(-6000);
}

@Injectable()
export class ConversationSummarizerService {
  private readonly triggerTokens: number;
  private readonly retainedMessages: number;

  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    config: ConfigService,
  ) {
    this.triggerTokens = config.get<number>(
      'BACKEND_SUMMARY_TRIGGER_TOKENS',
      4500,
    );
    this.retainedMessages = config.get<number>(
      'BACKEND_SUMMARY_RETAIN_MESSAGES',
      8,
    );
  }

  async summarizeIfNeeded(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const record = await this.conversations.findContext(userId, conversationId);
    if (!record) return false;

    const summaryIndex = record.conversation.summaryThroughMessageId
      ? record.messages.findIndex(
          (message) =>
            message.id === record.conversation.summaryThroughMessageId,
        )
      : -1;

    const unsummarized = record.messages.slice(summaryIndex + 1);
    const totalTokens = unsummarized.reduce(
      (total, message) => total + estimateTokens(message.content),
      0,
    );

    const segment = unsummarized.slice(0, -this.retainedMessages);

    if (totalTokens < this.triggerTokens || segment.length === 0) return false;

    const throughMessage = segment.at(-1);
    if (!throughMessage) return false;

    await this.conversations.replaceSummary(
      userId,
      conversationId,
      summarizeMessages(record.conversation.rollingSummary, segment),
      throughMessage.id,
    );

    return true;
  }
}

export { summarizeMessages };
