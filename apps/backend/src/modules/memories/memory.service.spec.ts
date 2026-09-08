import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Memory } from '../../database/entities';
import type { IMemoryRepository } from '../../database/interfaces';
import type { EmbeddingsService } from '../../infra/embeddings';
import { MemoryService } from './memory.service';

function memory(id: string, pinned = false): Memory {
  return {
    id,
    content: `memory ${id}`,
    category: null,
    status: 'active',
    pinned,
    supersedesId: null,
    supersededById: null,
    sourceMessageIds: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    source: {
      type: 'automatic',
      label: null,
      messageId: null,
      documentId: null,
    },
  };
}

function service(options: {
  keyword?: Memory[];
  semantic?: Array<{ memory: Memory; cosineDistance: number }>;
}) {
  const searchKeyword = jest
    .fn<IMemoryRepository['searchKeyword']>()
    .mockResolvedValue(options.keyword ?? []);

  const searchVector = jest
    .fn<IMemoryRepository['searchVector']>()
    .mockResolvedValue(options.semantic ?? []);

  const repository = {
    searchKeyword,
    searchVector,
    recordRetrieval: jest.fn<IMemoryRepository['recordRetrieval']>(),
  } as unknown as IMemoryRepository;

  const embeddings = {
    embed: jest.fn<() => Promise<number[]>>().mockResolvedValue([0.1, 0.2]),
  } as unknown as EmbeddingsService;

  return {
    memoryService: new MemoryService(
      repository,
      embeddings,
      new ConfigService({ BACKEND_MEMORY_MAX_COSINE_DISTANCE: 0.25 }),
    ),
    searchKeyword,
    searchVector,
    recordRetrieval: repository.recordRetrieval,
  };
}

describe('MemoryService hybrid retrieval', () => {
  test('passes a distance ceiling and allows an empty result', async () => {
    const setup = service({});

    await expect(
      setup.memoryService.search('user-1', 'unrelated', 5),
    ).resolves.toEqual([]);
    expect(setup.searchVector).toHaveBeenCalledWith(
      'user-1',
      [0.1, 0.2],
      15,
      0.25,
    );
  });

  test('uses reciprocal rank fusion so overlap outranks either single leg', async () => {
    const lexicalOnly = memory('lexical');
    const shared = memory('shared');
    const semanticOnly = memory('semantic');
    const setup = service({
      keyword: [lexicalOnly, shared],
      semantic: [
        { memory: semanticOnly, cosineDistance: 0.1 },
        { memory: shared, cosineDistance: 0.2 },
      ],
    });

    const result = await setup.memoryService.search('user-1', 'preference', 3);

    expect(result.map(({ id }) => id)).toEqual([
      'shared',
      'lexical',
      'semantic',
    ]);
  });

  test('records only memories returned to the model', async () => {
    const first = memory('first');
    const second = memory('second');
    const setup = service({ keyword: [first, second] });

    await setup.memoryService.search('user-1', 'preference', 1);

    expect(setup.recordRetrieval).toHaveBeenCalledWith(['first']);
  });
});
