import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type {
  MemoryDreamRun,
  MemoryDreamSegment,
  User,
} from '../../database/entities';
import type {
  IConversationRepository,
  IUserRepository,
} from '../../database/interfaces';
import type { LanguageModelGateway } from '../../infra/model-gateway';
import type { MemoryService } from './memory.service';
import { MemoryDreamService } from './memory-dream.service';

const segment: MemoryDreamSegment = {
  userId: 'user-1',
  conversationId: 'conversation-1',
  previousThroughMessageId: null,
  throughMessageId: 'message-4',
  messages: [1, 2, 3, 4].map((number) => ({
    id: `message-${number}`,
    role: 'user' as const,
    content: number === 4 ? 'Saya lebih suka rapat pagi.' : `Pesan ${number}`,
    createdAt: new Date(number),
  })),
};

function enabledUser(): User {
  return { automaticMemoryEnabled: true } as User;
}

describe('MemoryDreamService', () => {
  test('extracts a finalized segment and advances its checkpoint', async () => {
    const completeMemoryDream = jest
      .fn<IConversationRepository['completeMemoryDream']>()
      .mockResolvedValue(true);

    const conversations = {
      findMemoryDreamSegment: jest
        .fn<IConversationRepository['findMemoryDreamSegment']>()
        .mockResolvedValue(segment),
      beginMemoryDream: jest
        .fn<IConversationRepository['beginMemoryDream']>()
        .mockResolvedValue({ id: 'dream-1' } as MemoryDreamRun),
      completeMemoryDream,
      failMemoryDream: jest.fn<IConversationRepository['failMemoryDream']>(),
    } as unknown as IConversationRepository;

    const model = {
      provider: 'openrouter',
      model: 'test',
      generate: jest
        .fn<LanguageModelGateway['generate']>()
        .mockResolvedValueOnce({
          text: JSON.stringify({
            candidates: [
              {
                content: 'Pengguna lebih suka rapat pagi.',
                category: 'preference',
                confidence: 0.95,
                sourceMessageIds: ['message-4'],
              },
            ],
          }),
          usage: {},
        }),
    } satisfies LanguageModelGateway;

    const create = jest
      .fn<MemoryService['create']>()
      .mockResolvedValue({} as never);

    const memories = {
      search: jest.fn<MemoryService['search']>().mockResolvedValue([]),
      create,
      findBySourceKey: jest
        .fn<MemoryService['findBySourceKey']>()
        .mockResolvedValue(null),
    } as unknown as MemoryService;

    const service = new MemoryDreamService(
      conversations,
      {
        findById: jest
          .fn<IUserRepository['findById']>()
          .mockResolvedValue(enabledUser()),
      } as unknown as IUserRepository,
      model,
      memories,
      new ConfigService(),
    );

    await expect(
      service.run('user-1', 'conversation-1', 'message-4'),
    ).resolves.toEqual({
      status: 'completed',
      candidateCount: 1,
      mutationCount: 1,
    });
    expect(create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        sourceMessageId: 'message-4',
        sourceMessageIds: ['message-4'],
        dreamRunId: 'dream-1',
        sourceKey: expect.any(String),
      }),
    );
    expect(completeMemoryDream).toHaveBeenCalledWith('dream-1', segment, 1, 1);
  });

  test.each([
    ['cut off mid-JSON', '{"candidates":[{"content":"Pengguna lebih suka rap'],
    ['not JSON', 'Tidak ada fakta.'],
    ['no candidates list', '{"facts":[]}'],
  ])(
    'fails without advancing the checkpoint when extraction output is %s',
    async (_case, text) => {
      const completeMemoryDream =
        jest.fn<IConversationRepository['completeMemoryDream']>();

      const failMemoryDream = jest
        .fn<IConversationRepository['failMemoryDream']>()
        .mockResolvedValue(undefined);

      const conversations = {
        findMemoryDreamSegment: jest
          .fn<IConversationRepository['findMemoryDreamSegment']>()
          .mockResolvedValue(segment),
        beginMemoryDream: jest
          .fn<IConversationRepository['beginMemoryDream']>()
          .mockResolvedValue({ id: 'dream-1' } as MemoryDreamRun),
        completeMemoryDream,
        failMemoryDream,
      } as unknown as IConversationRepository;

      const service = new MemoryDreamService(
        conversations,
        {
          findById: jest
            .fn<IUserRepository['findById']>()
            .mockResolvedValue(enabledUser()),
        } as unknown as IUserRepository,
        {
          provider: 'openrouter',
          model: 'test',
          generate: jest
            .fn<LanguageModelGateway['generate']>()
            .mockResolvedValue({ text, usage: {} }),
        },
        {} as MemoryService,
        new ConfigService(),
      );

      // Returning no candidates here used to complete the run, so the
      // segment's facts were never extracted again.
      await expect(
        service.run('user-1', 'conversation-1', 'message-4'),
      ).rejects.toThrow('Memory dream extraction output');
      expect(completeMemoryDream).not.toHaveBeenCalled();
      expect(failMemoryDream).toHaveBeenCalledWith(
        'dream-1',
        expect.stringContaining('Memory dream extraction output'),
      );
    },
  );

  test('requests schema-enforced candidates with room for a full list', async () => {
    const generate = jest
      .fn<LanguageModelGateway['generate']>()
      .mockResolvedValue({ text: '{"candidates":[]}', usage: {} });

    const service = new MemoryDreamService(
      {
        findMemoryDreamSegment: jest
          .fn<IConversationRepository['findMemoryDreamSegment']>()
          .mockResolvedValue(segment),
        beginMemoryDream: jest
          .fn<IConversationRepository['beginMemoryDream']>()
          .mockResolvedValue({ id: 'dream-1' } as MemoryDreamRun),
        completeMemoryDream: jest
          .fn<IConversationRepository['completeMemoryDream']>()
          .mockResolvedValue(true),
      } as unknown as IConversationRepository,
      {
        findById: jest
          .fn<IUserRepository['findById']>()
          .mockResolvedValue(enabledUser()),
      } as unknown as IUserRepository,
      { provider: 'openrouter', model: 'test', generate },
      {} as MemoryService,
      new ConfigService(),
    );

    await expect(
      service.run('user-1', 'conversation-1', 'message-4'),
    ).resolves.toMatchObject({ status: 'completed', candidateCount: 0 });

    const request = generate.mock.calls[0]?.[0];
    expect(request?.outputSchema?.required).toEqual(['candidates']);
    // The 1200-token default cut long candidate lists off mid-JSON.
    expect(request?.maxOutputTokens).toBeGreaterThan(1200);
  });

  test('defers a short segment without opening a dream run', async () => {
    const shortSegment = { ...segment, messages: segment.messages.slice(0, 1) };
    const beginMemoryDream =
      jest.fn<IConversationRepository['beginMemoryDream']>();

    const service = new MemoryDreamService(
      {
        findMemoryDreamSegment: jest
          .fn<IConversationRepository['findMemoryDreamSegment']>()
          .mockResolvedValue(shortSegment),
        beginMemoryDream,
      } as unknown as IConversationRepository,
      {
        findById: jest
          .fn<IUserRepository['findById']>()
          .mockResolvedValue(enabledUser()),
      } as unknown as IUserRepository,
      {
        provider: 'openrouter',
        model: 'test',
        generate: jest.fn(),
      } as unknown as LanguageModelGateway,
      {} as MemoryService,
      new ConfigService(),
    );

    await expect(
      service.run('user-1', 'conversation-1', 'message-4'),
    ).resolves.toEqual({ status: 'deferred' });
    expect(beginMemoryDream).not.toHaveBeenCalled();
  });

  test('reviews a single-message segment once it is allowed as short', async () => {
    const shortSegment = { ...segment, messages: segment.messages.slice(3) };
    const beginMemoryDream = jest
      .fn<IConversationRepository['beginMemoryDream']>()
      .mockResolvedValue({ id: 'dream-1' } as MemoryDreamRun);

    const service = new MemoryDreamService(
      {
        findMemoryDreamSegment: jest
          .fn<IConversationRepository['findMemoryDreamSegment']>()
          .mockResolvedValue(shortSegment),
        beginMemoryDream,
        completeMemoryDream: jest
          .fn<IConversationRepository['completeMemoryDream']>()
          .mockResolvedValue(true),
      } as unknown as IConversationRepository,
      {
        findById: jest
          .fn<IUserRepository['findById']>()
          .mockResolvedValue(enabledUser()),
      } as unknown as IUserRepository,
      {
        provider: 'openrouter',
        model: 'test',
        generate: jest
          .fn<LanguageModelGateway['generate']>()
          .mockResolvedValue({ text: '{"candidates":[]}', usage: {} }),
      },
      {} as MemoryService,
      new ConfigService(),
    );

    // One message used to stay deferred forever, even after the idle window.
    await expect(
      service.run('user-1', 'conversation-1', 'message-4', true),
    ).resolves.toMatchObject({ status: 'completed' });
    expect(beginMemoryDream).toHaveBeenCalled();
  });

  test('rejects candidates sourced only from assistant messages', async () => {
    const mixedSegment: MemoryDreamSegment = {
      ...segment,
      messages: [
        ...segment.messages,
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Anda suka rapat malam.',
          createdAt: new Date(5),
        },
      ],
    };

    const completeMemoryDream = jest
      .fn<IConversationRepository['completeMemoryDream']>()
      .mockResolvedValue(true);

    const service = new MemoryDreamService(
      {
        findMemoryDreamSegment: jest
          .fn<IConversationRepository['findMemoryDreamSegment']>()
          .mockResolvedValue(mixedSegment),
        beginMemoryDream: jest
          .fn<IConversationRepository['beginMemoryDream']>()
          .mockResolvedValue({ id: 'dream-1' } as MemoryDreamRun),
        completeMemoryDream,
        failMemoryDream: jest.fn(),
      } as unknown as IConversationRepository,
      {
        findById: jest
          .fn<IUserRepository['findById']>()
          .mockResolvedValue(enabledUser()),
      } as unknown as IUserRepository,
      {
        provider: 'openrouter',
        model: 'test',
        generate: jest
          .fn<LanguageModelGateway['generate']>()
          .mockResolvedValue({
            text: JSON.stringify({
              candidates: [
                {
                  content: 'Pengguna suka rapat malam.',
                  confidence: 0.99,
                  sourceMessageIds: ['assistant-1'],
                },
              ],
            }),
            usage: {},
          }),
      },
      {} as MemoryService,
      new ConfigService(),
    );

    await expect(
      service.run('user-1', 'conversation-1', 'message-4'),
    ).resolves.toEqual({
      status: 'completed',
      candidateCount: 0,
      mutationCount: 0,
    });
  });

  test('consolidates all candidates in one model call', async () => {
    const completeMemoryDream = jest
      .fn<IConversationRepository['completeMemoryDream']>()
      .mockResolvedValue(true);

    const conversations = {
      findMemoryDreamSegment: jest
        .fn<IConversationRepository['findMemoryDreamSegment']>()
        .mockResolvedValue(segment),
      beginMemoryDream: jest
        .fn<IConversationRepository['beginMemoryDream']>()
        .mockResolvedValue({ id: 'dream-1' } as MemoryDreamRun),
      completeMemoryDream,
      failMemoryDream: jest.fn<IConversationRepository['failMemoryDream']>(),
    } as unknown as IConversationRepository;

    const generate = jest
      .fn<LanguageModelGateway['generate']>()
      .mockResolvedValueOnce({
        text: JSON.stringify({
          candidates: [
            {
              content: 'Pengguna suka kopi.',
              category: 'preference',
              confidence: 0.9,
              sourceMessageIds: ['message-1'],
            },
            {
              content: 'Pengguna suka rapat pagi.',
              category: 'routine',
              confidence: 0.9,
              sourceMessageIds: ['message-4'],
            },
          ],
        }),
        usage: {},
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          decisions: [
            { index: 0, action: 'create' },
            {
              index: 1,
              action: 'merge',
              targetId: 'memory-1',
              content: 'Pengguna suka rapat pagi.',
            },
          ],
        }),
        usage: {},
      });

    const create = jest
      .fn<MemoryService['create']>()
      .mockResolvedValue({} as never);

    const consolidate = jest
      .fn<MemoryService['consolidate']>()
      .mockResolvedValue({} as never);

    const memories = {
      search: jest
        .fn<MemoryService['search']>()
        .mockResolvedValue([
          { id: 'memory-1', content: 'Rapat pagi lama.', category: null },
        ] as never),
      findBySourceKey: jest
        .fn<MemoryService['findBySourceKey']>()
        .mockResolvedValue(null),
      create,
      consolidate,
    } as unknown as MemoryService;

    const service = new MemoryDreamService(
      conversations,
      {
        findById: jest
          .fn<IUserRepository['findById']>()
          .mockResolvedValue(enabledUser()),
      } as unknown as IUserRepository,
      { provider: 'openrouter', model: 'test', generate },
      memories,
      new ConfigService(),
    );

    await expect(
      service.run('user-1', 'conversation-1', 'message-4'),
    ).resolves.toEqual({
      status: 'completed',
      candidateCount: 2,
      mutationCount: 2,
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
    expect(consolidate).toHaveBeenCalledTimes(1);
  });
});
