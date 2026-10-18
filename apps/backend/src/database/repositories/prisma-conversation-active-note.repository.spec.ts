import { jest } from '@jest/globals';
import type { PrismaService } from '../../infra/prisma';
import { PrismaConversationRepository } from './prisma-conversation.repository';

const at = new Date('2026-10-18T08:00:00Z');
const conversation = {
  id: 'chat',
  title: 'Notes',
  createdAt: at,
  updatedAt: at,
};

const message = {
  id: 'message',
  conversationId: 'chat',
  role: 'user',
  content: 'Summarize this note',
  createdAt: at,
  activeNoteRef: 'custom:original',
};

describe('persisted active note identity', () => {
  it('stores the selected identity on the message in its write transaction', async () => {
    const create = jest
      .fn<(input: unknown) => Promise<typeof message>>()
      .mockResolvedValue(message);

    const transaction = {
      conversation: {
        findFirst: jest
          .fn<() => Promise<typeof conversation>>()
          .mockResolvedValue(conversation),
        update: jest
          .fn<() => Promise<typeof conversation>>()
          .mockResolvedValue(conversation),
      },
      message: { create },
    };

    const prisma = {
      message: {
        findFirst: jest.fn<() => Promise<null>>().mockResolvedValue(null),
      },
      $transaction: (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
    } as unknown as PrismaService;

    const result = await new PrismaConversationRepository(
      prisma,
    ).writeUserMessage({
      userId: 'owner',
      conversationId: 'chat',
      content: message.content,
      idempotencyKey: 'send',
      activeNoteRef: 'custom:original',
    });

    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: { activeNoteRef: 'custom:original', userId: 'owner' },
    });
    expect(result.userMessage.activeNoteRef).toBe('custom:original');
  });

  it('returns the originally persisted identity when the same send is replayed', async () => {
    const findFirst = jest
      .fn<(input: unknown) => Promise<unknown>>()
      .mockResolvedValue({ ...message, conversation });

    const transaction = jest.fn();
    const prisma = {
      message: { findFirst },
      $transaction: transaction,
    } as unknown as PrismaService;

    const result = await new PrismaConversationRepository(
      prisma,
    ).writeUserMessage({
      userId: 'owner',
      content: message.content,
      idempotencyKey: 'send',
      activeNoteRef: 'custom:other',
    });

    expect(result.replayed).toBe(true);
    expect(result.userMessage.activeNoteRef).toBe('custom:original');
    expect(transaction).not.toHaveBeenCalled();
    expect(findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { userId: 'owner', idempotencyKey: 'send' },
    });
  });
});
