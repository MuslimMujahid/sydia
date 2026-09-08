import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Document, Message } from '../../../database/entities';
import type {
  IConversationRepository,
  IDocumentRepository,
} from '../../../database/interfaces';
import type { ModelMessage } from '../../../infra/model-gateway';
import {
  ContextBuilderService,
  estimateTokens,
} from './context-builder.service';

const user = {
  id: 'user-1',
  name: 'Ayu',
  timezone: 'Asia/Jakarta',
  locale: 'id',
  persona: 'supportive' as const,
};

function resolved<T>(value: T) {
  return jest.fn<() => Promise<T>>().mockResolvedValue(value);
}

function document(textContent: string, originalName = 'catatan.txt'): Document {
  return {
    id: 'document-1',
    title: originalName,
    textContent,
    transcript: null,
    imageDescription: null,
    structuredData: null,
    errorMessage: null,
    status: 'ready',
    file: {
      id: 'file-1',
      originalName,
      mimeType: 'text/plain',
      size: textContent.length,
      kind: 'document',
      createdAt: new Date(0),
    },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function message(id: string, role: Message['role'], content: string): Message {
  return {
    id,
    conversationId: 'conversation-1',
    role,
    content,
    createdAt: new Date(0),
  };
}

type RepositoryOptions = {
  messages?: Message[];
  documents?: Document[];
  memorySearch?: (
    userId: string,
    query: string,
    limit: number,
  ) => Promise<never[]>;
};

function createBuilder(
  tokenBudget: number,
  options: RepositoryOptions = {},
): ContextBuilderService {
  const conversations = {
    findContext: resolved({
      conversation: {
        id: 'conversation-1',
        rollingSummary: null,
        summaryThroughMessageId: null,
      },
      messages: options.messages ?? [],
    }),
  } as unknown as IConversationRepository;

  const documents = {
    findMetadataByMessageId: resolved(options.documents ?? []),
  } as unknown as IDocumentRepository;

  return new ContextBuilderService(
    conversations,
    new ConfigService({ BACKEND_ASSISTANT_CONTEXT_TOKENS: tokenBudget }),
    documents,
    options.memorySearch
      ? ({ search: options.memorySearch } as never)
      : undefined,
  );
}

function attachmentMessageContent(context: ModelMessage[]): string {
  const attachment = context.find(
    (entry) =>
      entry.role === 'system' &&
      typeof entry.content === 'string' &&
      entry.content.startsWith(
        'File terlampir pada pesan ini (metadata saja):',
      ),
  );

  if (!attachment || typeof attachment.content !== 'string') {
    throw new Error('attachment manifest was not returned');
  }

  return attachment.content;
}

describe('ContextBuilderService personas', () => {
  it('injects the selected persona without changing assistant authority', async () => {
    const { messages } = await createBuilder(1_000).build(
      { ...user, persona: 'casual' },
      'conversation-1',
    );

    const persona = messages.find(
      (entry) =>
        entry.role === 'system' &&
        typeof entry.content === 'string' &&
        entry.content.startsWith('Gaya respons terpilih:'),
    );

    expect(persona?.content).toContain('gue/lo');
    expect(persona?.content).toContain('tidak mengubah fakta');
    expect(persona?.content).toContain('kemampuan, alat, izin');
  });
});
describe('ContextBuilderService attachments', () => {
  it('includes attachment metadata without extracted file content', async () => {
    const secretBody = 'isi rahasia yang tidak boleh masuk ke prompt';
    const { messages, tokenUsage } = await createBuilder(1_000, {
      documents: [document(secretBody)],
    }).build(user, 'conversation-1', 'message-1');

    const attachment = attachmentMessageContent(messages);

    expect(attachment).toContain('catatan.txt');
    expect(attachment).toContain('text/plain');
    expect(attachment).toContain('status: ready');
    expect(attachment).not.toContain(secretBody);
    expect(tokenUsage.attachmentManifest).toBe(estimateTokens(attachment));
  });

  it('keeps the complete context within the configured token budget', async () => {
    const tokenBudget = 1_000;
    const { messages, tokenUsage } = await createBuilder(tokenBudget, {
      documents: [document('x'.repeat(100_000))],
      messages: [
        message('message-1', 'user', 'Pertanyaan pengguna '.repeat(20)),
        message('message-2', 'assistant', 'Jawaban asisten '.repeat(20)),
        message('message-3', 'user', 'Tindak lanjut '.repeat(20)),
      ],
    }).build(user, 'conversation-1', 'message-1');

    const totalTokens = messages.reduce(
      (total, entry) =>
        total +
        (typeof entry.content === 'string' ? estimateTokens(entry.content) : 0),
      0,
    );

    expect(totalTokens).toBeLessThanOrEqual(tokenBudget);
    expect(tokenUsage.total).toBe(totalTokens);
  });
});

describe('ContextBuilderService memory retrieval', () => {
  it('injects a bounded memory brief for a personal-context request', async () => {
    const search = jest
      .fn<(userId: string, query: string, limit: number) => Promise<never[]>>()
      .mockResolvedValue([{ content: 'Ayu lebih suka rapat pagi.' } as never]);

    const { messages } = await createBuilder(1_000, {
      messages: [message('message-1', 'user', 'Apa preferensi rapat saya?')],
      memorySearch: search,
    }).build(user, 'conversation-1', 'message-1');

    expect(search).toHaveBeenCalledWith(
      user.id,
      'Apa preferensi rapat saya?',
      4,
    );
    const memoryContext = messages.find(
      (entry) =>
        entry.role === 'system' &&
        typeof entry.content === 'string' &&
        entry.content.includes('Ayu lebih suka rapat pagi.'),
    );

    expect(memoryContext).toBeDefined();
  });

  it('does not retrieve memory for an acknowledgement', async () => {
    const search =
      jest.fn<
        (userId: string, query: string, limit: number) => Promise<never[]>
      >();

    await createBuilder(1_000, {
      messages: [message('message-1', 'user', 'iya lanjut')],
      memorySearch: search,
    }).build(user, 'conversation-1', 'message-1');

    expect(search).not.toHaveBeenCalled();
  });
});
