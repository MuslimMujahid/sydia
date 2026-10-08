import { describe, expect, jest, test } from '@jest/globals';
import type { PrismaService } from '../../infra/prisma';
import { PrismaDocumentRepository } from './prisma-document.repository';

const createdAt = new Date('2026-09-01T00:00:00.000Z');
const document = {
  id: 'doc-1',
  title: 'deck.pdf',
  status: 'ready',
  createdAt,
  updatedAt: createdAt,
  fileAsset: {
    id: 'file-1',
    originalName: 'deck.pdf',
    mimeType: 'application/pdf',
    size: 1234,
    kind: 'document',
    createdAt,
  },
};

describe('PrismaDocumentRepository ordered reads', () => {
  test('returns an ordered page and cursor when more chunks exist', async () => {
    const findFirst = jest.fn<(input: unknown) => Promise<unknown>>();
    findFirst.mockResolvedValue({
      ...document,
      chunks: [
        { id: 'chunk-3', chunkIndex: 3, pageNumber: 2, content: 'Three' },
        { id: 'chunk-4', chunkIndex: 4, pageNumber: 3, content: 'Four' },
        { id: 'chunk-5', chunkIndex: 5, pageNumber: 3, content: 'Five' },
      ],
    });
    const repository = new PrismaDocumentRepository({
      document: { findFirst },
    } as unknown as PrismaService);

    const result = await repository.readChunks('user-1', 'doc-1', 3, 2);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1', userId: 'user-1', status: 'ready' },
        select: expect.objectContaining({
          chunks: expect.objectContaining({
            where: { chunkIndex: { gte: 3 } },
            orderBy: { chunkIndex: 'asc' },
            take: 3,
          }),
        }),
      }),
    );
    expect(result?.chunks.map(({ chunkIndex }) => chunkIndex)).toEqual([3, 4]);
    expect(result?.nextCursor).toBe(5);
  });

  test('returns no cursor on the final page', async () => {
    const findFirst = jest.fn<(input: unknown) => Promise<unknown>>();
    findFirst.mockResolvedValue({
      ...document,
      chunks: [
        { id: 'chunk-5', chunkIndex: 5, pageNumber: 3, content: 'Five' },
      ],
    });
    const repository = new PrismaDocumentRepository({
      document: { findFirst },
    } as unknown as PrismaService);

    await expect(
      repository.readChunks('user-1', 'doc-1', 5, 2),
    ).resolves.toEqual(expect.objectContaining({ nextCursor: null }));
  });
});

describe('PrismaDocumentRepository processing state guards', () => {
  test.each(['ready', 'failed', 'deleted'] as const)(
    'late worker writes preserve a %s document',
    async (initialStatus) => {
      let status: string | null =
        initialStatus === 'deleted' ? null : initialStatus;

      const updateMany = jest
        .fn<
          (input: {
            where: { id: string; status?: string };
            data: { status?: string };
          }) => Promise<{ count: number }>
        >()
        .mockImplementation(({ where, data }) => {
          if (status === null || (where.status && status !== where.status))
            return Promise.resolve({ count: 0 });
          status = data.status ?? status;

          return Promise.resolve({ count: 1 });
        });

      const repository = new PrismaDocumentRepository({
        document: { updateMany },
      } as unknown as PrismaService);

      await repository.saveExtraction('doc-1', {
        imageDescription: 'Cached visible text',
      });
      await repository.complete('doc-1', {
        textContent: 'Completed extraction',
      });
      await repository.fail('doc-1', 'Late failure');

      expect(status).toBe(initialStatus === 'deleted' ? null : initialStatus);
      expect(updateMany).toHaveBeenCalledTimes(3);
    },
  );

  test('a processing document can save extraction and become ready', async () => {
    const updateMany = jest
      .fn<(input: unknown) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 });

    const repository = new PrismaDocumentRepository({
      document: { updateMany },
    } as unknown as PrismaService);

    await repository.saveExtraction('doc-1', {
      transcript: 'Saved transcript',
    });
    await repository.complete('doc-1', { transcript: 'Saved transcript' });

    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1', status: 'processing' },
        data: expect.objectContaining({
          status: 'ready',
          transcript: 'Saved transcript',
        }),
      }),
    );
  });
});

describe('PrismaDocumentRepository attachment content visibility', () => {
  test.each(['processing', 'failed'] as const)(
    'keeps %s attachment metadata without exposing cached content',
    async (status) => {
      const findMany = jest
        .fn<(input: unknown) => Promise<unknown[]>>()
        .mockResolvedValue([
          {
            ...document,
            status,
            textContent: 'Unfinished document extraction',
            transcript: 'Unfinished transcript',
            imageDescription: 'Unfinished image interpretation',
            structuredData: { amount: 125000 },
            chunks: [
              {
                id: 'chunk-1',
                chunkIndex: 0,
                pageNumber: 1,
                content: 'Unfinished chunk',
              },
            ],
          },
        ]);

      const repository = new PrismaDocumentRepository({
        document: { findMany },
      } as unknown as PrismaService);

      const attached = await repository.findByMessageId('user-1', 'message-1');
      const assets = await repository.findByAssetIds('user-1', ['file-1']);

      for (const result of [attached, assets]) {
        expect(result).toEqual([
          expect.objectContaining({
            id: 'doc-1',
            title: 'deck.pdf',
            status,
            textContent: null,
            transcript: null,
            imageDescription: null,
            structuredData: null,
            chunks: [],
          }),
        ]);
      }
    },
  );

  test('ready attachment content remains readable', async () => {
    const findMany = jest
      .fn<(input: unknown) => Promise<unknown[]>>()
      .mockResolvedValue([
        {
          ...document,
          textContent: 'Reviewed invoice total 125000',
          chunks: [
            {
              id: 'chunk-1',
              chunkIndex: 0,
              pageNumber: 1,
              content: 'Reviewed invoice total 125000',
            },
          ],
        },
      ]);

    const repository = new PrismaDocumentRepository({
      document: { findMany },
    } as unknown as PrismaService);

    const [attached] = await repository.findByMessageId('user-1', 'message-1');

    expect(attached?.textContent).toBe('Reviewed invoice total 125000');
    expect(attached?.chunks).toHaveLength(1);
  });
});
