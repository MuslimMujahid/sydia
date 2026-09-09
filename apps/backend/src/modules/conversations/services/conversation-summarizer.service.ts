import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CONVERSATION_REPOSITORY,
  type IConversationRepository,
} from '../../../database/interfaces';
import { LANGUAGE_MODEL } from '../../../infra/model-gateway';
import type { LanguageModelGateway } from '../../../infra/model-gateway/model-gateway.types';
import { estimateTokens } from './context-builder.service';

const MAX_SUMMARY_CHARACTERS = 6000;

type SummaryState = {
  currentObjective: string | null;
  establishedFacts: string[];
  decisions: string[];
  userConstraints: string[];
  completedActions: string[];
  pendingActions: string[];
  unresolvedQuestions: string[];
  relevantEntities: Array<{ name: string; details: string }>;
};

function parseSummary(value: string): SummaryState | null {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match || match[0].length > MAX_SUMMARY_CHARACTERS) return null;

  try {
    const parsed: unknown = JSON.parse(match[0]);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const keys = [
      'establishedFacts',
      'decisions',
      'userConstraints',
      'completedActions',
      'pendingActions',
      'unresolvedQuestions',
    ] as const;

    if (
      !keys.every(
        (key) =>
          Array.isArray(record[key]) &&
          record[key].every((item) => typeof item === 'string'),
      ) ||
      (record.currentObjective !== null &&
        typeof record.currentObjective !== 'string') ||
      !Array.isArray(record.relevantEntities) ||
      !record.relevantEntities.every(
        (entity) =>
          entity !== null &&
          typeof entity === 'object' &&
          typeof (entity as Record<string, unknown>).name === 'string' &&
          typeof (entity as Record<string, unknown>).details === 'string',
      )
    ) {
      return null;
    }

    return parsed as SummaryState;
  } catch {
    return null;
  }
}

@Injectable()
export class ConversationSummarizerService {
  private readonly triggerTokens: number;
  private readonly retainedMessages: number;

  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(LANGUAGE_MODEL) private readonly model: LanguageModelGateway,
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
    const result = await this.model.generate({
      userId,
      conversationId,
      messages: [
        {
          role: 'system',
          content:
            'Perbarui ringkasan keadaan percakapan sebagai JSON tunggal. Skema wajib: {"currentObjective":string|null,"establishedFacts":string[],"decisions":string[],"userConstraints":string[],"completedActions":string[],"pendingActions":string[],"unresolvedQuestions":string[],"relevantEntities":[{"name":string,"details":string}]}. Gabungkan keadaan lama dan pesan baru secara semantik. Pertahankan nama, tanggal, jumlah, ID, negasi, ketidakpastian, keputusan, dan pekerjaan tertunda. Hapus pengulangan, sapaan, dan item yang sudah terselesaikan dari pendingActions. Bedakan pernyataan pengguna dari usulan asisten. Jangan menambah fakta. Maksimum 6000 karakter.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            previousSummary: record.conversation.rollingSummary,
            messages: segment.map(({ role, content }) => ({ role, content })),
          }),
        },
      ],
    });

    const summary = parseSummary(result.text);
    if (!summary) throw new Error('Conversation summary output is invalid.');

    return this.conversations.replaceSummary(
      userId,
      conversationId,
      JSON.stringify(summary),
      throughMessage.id,
      record.conversation.summaryThroughMessageId,
    );
  }
}

export { parseSummary };
