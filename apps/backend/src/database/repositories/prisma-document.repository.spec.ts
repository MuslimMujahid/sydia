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
        where: { id: 'doc-1', userId: 'user-1' },
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
