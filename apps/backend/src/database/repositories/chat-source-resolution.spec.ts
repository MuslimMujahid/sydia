import { jest } from '@jest/globals';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../infra/prisma';
import type { ChatSegment } from '../entities/conversation.entity';
import {
  resolveChatSources,
  chatSourceSignature,
} from './chat-source-resolution';
import { PrismaConversationRepository } from './prisma-conversation.repository';

const folder: ChatSegment = {
  type: 'source',
  source: { kind: 'folder', id: 'work', label: 'Old name' },
};

const file: ChatSegment = {
  type: 'source',
  source: { kind: 'file', id: 'budget', label: 'Untrusted name' },
};

function database() {
  const tx = {
    document: {
      findFirst: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ id: 'budget', title: 'Budget.pdf' }),
    },
    fileFolder: {
      findFirst: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ name: 'Work' }),
    },
    workspaceItem: {
      findFirst: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ title: 'Plan' }),
    },
    dailyNote: {
      findUnique: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ date: '2026-10-25' }),
    },
    $queryRaw: jest
      .fn<() => Promise<Array<{ id: string }>>>()
      .mockResolvedValue([{ id: 'budget' }, { id: 'schedule' }]),
  };

  return { tx, client: tx as unknown as Prisma.TransactionClient };
}

describe('message source resolution', () => {
  it('deduplicates direct and folder membership while retaining reference order', async () => {
    const { client } = database();
    const result = await resolveChatSources(client, 'owner', [
      { type: 'text', text: 'Compare ' },
      folder,
      file,
      folder,
    ]);

    expect(result.documentIds).toEqual(['budget', 'schedule']);
    expect(result.segments).toEqual([
      { type: 'text', text: 'Compare ' },
      { type: 'source', source: { kind: 'folder', id: 'work', label: 'Work' } },
      {
        type: 'source',
        source: { kind: 'file', id: 'budget', label: 'Budget.pdf' },
      },
      { type: 'source', source: { kind: 'folder', id: 'work', label: 'Work' } },
    ]);
  });
  it('rejects an unavailable file instead of replacing it by name', async () => {
    const { client, tx } = database();
    tx.document.findFirst.mockResolvedValue(null);
    await expect(resolveChatSources(client, 'owner', [file])).rejects.toThrow(
      'File sumber tidak tersedia',
    );
  });
  it('requires owner scope and live availability when resolving files', async () => {
    const { client, tx } = database();
    await resolveChatSources(client, 'owner', [file]);
    expect(tx.document.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'budget',
        userId: 'owner',
        deletingOperationId: null,
        status: 'ready',
      },
      select: { id: true, title: true },
    });
  });
  it('rejects a note in Trash or owned by someone else', async () => {
    const { client, tx } = database();
    tx.workspaceItem.findFirst.mockResolvedValue(null);
    await expect(
      resolveChatSources(client, 'owner', [
        {
          type: 'source',
          source: { kind: 'note', id: 'custom:plan', label: 'Plan' },
        },
      ]),
    ).rejects.toThrow('Catatan sumber tidak tersedia');
  });
  it('uses canonical note identity rather than a client title', async () => {
    const { client } = database();
    const result = await resolveChatSources(client, 'owner', [
      {
        type: 'source',
        source: { kind: 'note', id: 'custom:plan', label: 'Wrong' },
      },
    ]);

    expect(result.segments).toEqual([
      {
        type: 'source',
        source: { kind: 'note', id: 'custom:plan', label: 'Plan' },
      },
    ]);
  });
  it('treats label changes as the same request but order changes as different', () => {
    expect(chatSourceSignature([folder, file])).toBe(
      chatSourceSignature([
        {
          type: 'source',
          source: { kind: 'folder', id: 'work', label: 'Renamed' },
        },
        file,
      ]),
    );
    expect(chatSourceSignature([folder, file])).not.toBe(
      chatSourceSignature([file, folder]),
    );
  });
});
describe('accepted source message replay', () => {
  const saved = {
    id: 'message',
    content: 'Compare',
    sourceSegments: [folder],
    sourceDocumentIds: ['budget'],
    conversation: { id: 'chat' },
  };

  it('returns the fixed original membership without querying the folder again', async () => {
    const prisma = {
      message: {
        findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(saved),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;

    const result = await new PrismaConversationRepository(
      prisma,
    ).writeUserMessage({
      userId: 'owner',
      content: 'Compare',
      idempotencyKey: 'key',
      sourceSegments: [folder],
    });

    expect(result.userMessage.sourceDocumentIds).toEqual(['budget']);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects reusing a send identity with another source', async () => {
    const prisma = {
      message: {
        findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(saved),
      },
    } as unknown as PrismaService;

    await expect(
      new PrismaConversationRepository(prisma).writeUserMessage({
        userId: 'owner',
        content: 'Compare',
        idempotencyKey: 'key',
        sourceSegments: [file],
      }),
    ).rejects.toThrow('sumber berbeda');
  });
  it('keeps normal text messages outside source scope', async () => {
    const prisma = {
      message: {
        findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue({
          sourceSegments: [{ type: 'text', text: 'Hello' }],
          sourceDocumentIds: [],
        }),
      },
    } as unknown as PrismaService;

    expect(
      await new PrismaConversationRepository(prisma).findSourceScope(
        'owner',
        'message',
      ),
    ).toBeNull();
  });
});
