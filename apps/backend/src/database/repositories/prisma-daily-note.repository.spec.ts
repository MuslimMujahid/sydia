import { describe, expect, jest, test } from '@jest/globals';
import type { PrismaService } from '../../infra/prisma';
import { indexSignature } from '../../shared/rich-text';
import { PrismaDailyNoteRepository } from './prisma-daily-note.repository';

type Transaction = {
  dailyNote: {
    findUnique: (input: unknown) => Promise<unknown>;
    update: (input: unknown) => Promise<unknown>;
  };
  dailyNoteChunk: {
    deleteMany: (input: unknown) => Promise<unknown>;
    createMany: (input: unknown) => Promise<unknown>;
    findMany: (input: unknown) => Promise<unknown[]>;
  };
};

function repositoryWith(
  transaction: Partial<Transaction>,
  currentText: string | null,
) {
  const update = jest.fn<(input: unknown) => Promise<unknown>>();
  update.mockResolvedValue({});

  const tx: Transaction = {
    dailyNote: {
      findUnique: jest.fn(() =>
        Promise.resolve({ id: 'note-1', text: currentText ?? '' }),
      ),
      update,
      ...transaction.dailyNote,
    },
    dailyNoteChunk: {
      deleteMany: jest.fn(() => Promise.resolve({})),
      createMany: jest.fn(() => Promise.resolve({})),
      findMany: jest.fn(() => Promise.resolve([])),
      ...transaction.dailyNoteChunk,
    },
  };

  const prisma = {
    $transaction: jest.fn((work: (tx: Transaction) => Promise<unknown>) =>
      work(tx),
    ),
  } as unknown as PrismaService;

  return { repository: new PrismaDailyNoteRepository(prisma), update, tx };
}

describe('PrismaDailyNoteRepository index freshness', () => {
  test('clears the pending flag when the indexed text is the note text', async () => {
    const text = 'Bryan dan Salsa tidak hadir';
    const { repository, update } = repositoryWith({}, text);

    await repository.replaceChunks('user-1', '2026-09-20', {
      signature: indexSignature(text),
      chunks: [text],
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ indexPending: false }),
      }),
    );
  });

  test('keeps the pending flag when a save landed while the index was built', async () => {
    // The note gained new text after this index was computed. Marking the stale
    // index as fresh would drop the note out of the recovery backlog, so the
    // flag must stay set until the newer text is indexed.
    const { repository, update } = repositoryWith({}, 'Teks yang lebih baru');

    await repository.replaceChunks('user-1', '2026-09-20', {
      signature: indexSignature('Teks lama yang sudah usang'),
      chunks: ['Teks lama yang sudah usang'],
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ indexPending: true }),
      }),
    );
  });

  test('does nothing when the day has no note', async () => {
    const { repository, update, tx } = repositoryWith(
      {
        dailyNote: {
          findUnique: jest.fn(() => Promise.resolve(null)),
        } as never,
      },
      null,
    );

    await expect(
      repository.replaceChunks('user-1', '2026-09-20', {
        signature: 'x',
        chunks: ['x'],
      }),
    ).resolves.toEqual([]);
    expect(update).not.toHaveBeenCalled();
    expect(tx.dailyNoteChunk.deleteMany).not.toHaveBeenCalled();
  });
});
