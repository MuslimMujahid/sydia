import { describe, expect, jest, test } from '@jest/globals';
import type { DailyNote, DailyNoteChunkMatch } from '../../database/entities';
import type { IDailyNoteRepository } from '../../database/interfaces';
import type { EmbeddingsService } from '../../infra/embeddings';
import type { QueueService } from '../../infra/queue';
import { indexSignature, plainTextToRichText } from '../../shared/rich-text';
import {
  DailyNoteService,
  dayKeyOffset,
  localDayKey,
} from './daily-note.service';

function note(overrides: Partial<DailyNote> = {}): DailyNote {
  const text = overrides.text ?? 'Bryan dan Salsa tidak hadir';

  return {
    id: 'note-1',
    date: '2026-09-20',
    content: plainTextToRichText(text),
    text,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    source: { type: 'dashboard', label: null },
    ...overrides,
  };
}

function chunk(
  date: string,
  chunkIndex: number,
  content: string,
): DailyNoteChunkMatch {
  return { date, chunkIndex, content };
}

function service(
  options: {
    keyword?: DailyNoteChunkMatch[];
    semantic?: DailyNoteChunkMatch[];
    embedding?: number[] | null;
    embedThrows?: boolean;
    existing?: DailyNote | null;
  } = {},
) {
  const searchKeyword = jest
    .fn<IDailyNoteRepository['searchKeyword']>()
    .mockResolvedValue(options.keyword ?? []);

  const searchVector = jest
    .fn<IDailyNoteRepository['searchVector']>()
    .mockResolvedValue(options.semantic ?? []);

  const findByDate = jest
    .fn<IDailyNoteRepository['findByDate']>()
    .mockResolvedValue(options.existing ?? null);

  const upsert = jest
    .fn<IDailyNoteRepository['upsert']>()
    .mockImplementation((_userId, input) =>
      Promise.resolve(note({ date: input.date, text: input.text })),
    );

  const replaceChunks = jest
    .fn<IDailyNoteRepository['replaceChunks']>()
    .mockImplementation((_userId, _date, input) =>
      Promise.resolve(
        input.chunks.map((content, chunkIndex) => ({
          id: `chunk-${chunkIndex}`,
          chunkIndex,
          content,
        })),
      ),
    );

  const markIndexPending = jest
    .fn<IDailyNoteRepository['markIndexPending']>()
    .mockResolvedValue(undefined);

  const remove = jest
    .fn<IDailyNoteRepository['delete']>()
    .mockResolvedValue(true);

  const indexState = jest
    .fn<IDailyNoteRepository['indexState']>()
    .mockResolvedValue(null);

  const setChunkEmbedding = jest
    .fn<IDailyNoteRepository['setChunkEmbedding']>()
    .mockResolvedValue(undefined);

  const repository = {
    searchKeyword,
    searchVector,
    findByDate,
    upsert,
    delete: remove,
    replaceChunks,
    markIndexPending,
    indexState,
    setChunkEmbedding,
  } as unknown as IDailyNoteRepository;

  const embed = jest.fn<EmbeddingsService['embed']>();
  if (options.embedThrows)
    embed.mockRejectedValue(new Error('embedding offline'));
  else embed.mockResolvedValue(options.embedding ?? [0.1, 0.2]);

  const embedMany = jest
    .fn<EmbeddingsService['embedMany']>()
    .mockImplementation((texts) =>
      Promise.resolve(texts.map(() => [0.1, 0.2])),
    );

  const embeddings = {
    embed,
    embedMany,
    modelName: () => 'test-model',
    version: 'v1',
  } as unknown as EmbeddingsService;

  const queue = {
    dailyNoteIndexes: { add: jest.fn(() => Promise.resolve(undefined)) },
  } as unknown as QueueService;

  const users = {
    findById: jest.fn(() => Promise.resolve({ timezone: 'Asia/Jakarta' })),
  };

  return {
    service: new DailyNoteService(
      repository,
      users as never,
      embeddings,
      queue,
    ),
    searchKeyword,
    searchVector,
    findByDate,
    upsert,
    replaceChunks,
    markIndexPending,
    indexState,
    setChunkEmbedding,
    embedMany,
    delete: remove,
    queue,
  };
}

describe('daily note day keys', () => {
  test('reads the calendar day in the owner zone, not UTC', () => {
    // 17:30 UTC is already the next day in Jakarta (UTC+7).
    expect(localDayKey(new Date('2026-09-20T17:30:00Z'), 'Asia/Jakarta')).toBe(
      '2026-09-21',
    );
    expect(localDayKey(new Date('2026-09-20T17:30:00Z'), 'UTC')).toBe(
      '2026-09-20',
    );
  });

  test('shifts across a month and year boundary', () => {
    expect(dayKeyOffset('2026-09-01', -1)).toBe('2026-08-31');
    expect(dayKeyOffset('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('daily note retrieval', () => {
  test('fuses both legs so a passage found by each outranks a single-leg hit', () => {
    const setup = service({
      keyword: [
        chunk('2026-09-19', 0, 'keyword only'),
        chunk('2026-09-20', 0, 'both'),
      ],
      semantic: [
        chunk('2026-09-20', 0, 'both'),
        chunk('2026-09-18', 0, 'semantic only'),
      ],
    });

    return setup.service
      .search('user-1', 'salsa', { limit: 3 })
      .then((hits) => {
        expect(hits.map(({ date }) => date)).toEqual([
          '2026-09-20',
          '2026-09-19',
          '2026-09-18',
        ]);
      });
  });

  test('collapses several matching passages of one day into one entry', () => {
    const setup = service({
      keyword: [
        chunk('2026-09-20', 0, 'Salsa hadir'),
        chunk('2026-09-20', 1, 'Salsa izin'),
      ],
    });

    return setup.service.search('user-1', 'salsa').then((hits) => {
      expect(hits).toHaveLength(1);
      expect(hits[0]?.date).toBe('2026-09-20');
    });
  });

  test('falls back to keyword results when the embedding provider fails', () => {
    const setup = service({
      keyword: [chunk('2026-09-20', 0, 'materi IPA')],
      embedThrows: true,
    });

    return setup.service.search('user-1', 'IPA').then((hits) => {
      expect(hits).toEqual([{ date: '2026-09-20', content: 'materi IPA' }]);
      expect(setup.searchVector).not.toHaveBeenCalled();
    });
  });

  test('applies the date window to both legs', async () => {
    const setup = service({});

    await setup.service.search('user-1', 'salsa', {
      from: '2026-09-14',
      to: '2026-09-20',
    });

    expect(setup.searchKeyword).toHaveBeenCalledWith('user-1', 'salsa', 15, {
      from: '2026-09-14',
      to: '2026-09-20',
    });
    expect(setup.searchVector).toHaveBeenCalledWith('user-1', [0.1, 0.2], 15, {
      from: '2026-09-14',
      to: '2026-09-20',
    });
  });

  test('does not query at all for a blank search', async () => {
    const setup = service({});

    await expect(setup.service.search('user-1', '   ')).resolves.toEqual([]);
    expect(setup.searchKeyword).not.toHaveBeenCalled();
  });
});

describe('daily note indexing', () => {
  test('skips embedding when the stored index already matches the text', async () => {
    const existing = note();
    const setup = service({ existing });
    setup.indexState.mockResolvedValue({
      pending: false,
      signature: indexSignature(existing.text),
      chunkCount: 1,
      embeddedCount: 1,
    });

    await setup.service.index('user-1', '2026-09-20');

    expect(setup.embedMany).not.toHaveBeenCalled();
    expect(setup.replaceChunks).not.toHaveBeenCalled();
  });

  test('reindexes when the stored text moved on from the indexed signature', async () => {
    const existing = note();
    const setup = service({ existing });
    setup.indexState.mockResolvedValue({
      pending: true,
      signature: 'stale-signature',
      chunkCount: 1,
      embeddedCount: 1,
    });

    await setup.service.index('user-1', '2026-09-20');

    expect(setup.embedMany).toHaveBeenCalledWith([existing.text]);
    expect(setup.setChunkEmbedding).toHaveBeenCalledTimes(1);
  });

  test('clears the index of an emptied note without calling the embedder', async () => {
    const setup = service({
      existing: note({ text: '', content: { type: 'doc', content: [] } }),
    });

    await setup.service.index('user-1', '2026-09-20');

    expect(setup.embedMany).not.toHaveBeenCalled();
    expect(setup.replaceChunks).toHaveBeenCalledWith('user-1', '2026-09-20', {
      signature: expect.any(String),
      chunks: [],
    });
  });

  test('keeps the note pending for recovery when embeddings are unavailable', async () => {
    const setup = service({ existing: note() });
    setup.embedMany.mockResolvedValue([null]);

    await setup.service.index('user-1', '2026-09-20');

    expect(setup.markIndexPending).toHaveBeenCalledWith('user-1', '2026-09-20');
    expect(setup.replaceChunks).not.toHaveBeenCalled();
  });
});

describe('daily note writes', () => {
  test('saves the derived plain text alongside the document', async () => {
    const setup = service({ existing: null });

    await setup.service.save('user-1', {
      date: '2026-09-20',
      document: plainTextToRichText('Bryan dan Salsa tidak hadir'),
    });

    expect(setup.upsert).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        date: '2026-09-20',
        timezone: 'Asia/Jakarta',
        text: 'Bryan dan Salsa tidak hadir',
      }),
    );
  });

  test('appends assistant text after the existing prose instead of replacing it', async () => {
    const existing = note({ text: 'Catatan pagi' });
    const setup = service({ existing });

    const saved = await setup.service.append('user-1', {
      date: '2026-09-20',
      text: 'Catatan siang',
    });

    expect(saved.text).toBe('Catatan pagi\nCatatan siang');
  });

  test('deletes the day instead of storing an empty note', async () => {
    // An empty document means "no note for this day". Keeping the row would show
    // a calendar dot and a blank recent-list entry for a note that is not there.
    const existing = note();
    const setup = service({ existing });

    await expect(
      setup.service.save('user-1', {
        date: '2026-09-20',
        document: { type: 'doc', content: [] },
      }),
    ).resolves.toBeNull();

    expect(setup.delete).toHaveBeenCalledWith('user-1', '2026-09-20');
    expect(setup.upsert).not.toHaveBeenCalled();
    expect(setup.markIndexPending).not.toHaveBeenCalled();
  });

  test('does not touch storage when an already-empty day is cleared', async () => {
    const setup = service({ existing: null });

    await expect(
      setup.service.save('user-1', {
        date: '2026-09-20',
        document: { type: 'doc', content: [] },
      }),
    ).resolves.toBeNull();

    expect(setup.delete).not.toHaveBeenCalled();
    expect(setup.upsert).not.toHaveBeenCalled();
  });

  test('does not queue reindexing when the retrievable text is unchanged', async () => {
    const existing = note();
    const setup = service({ existing });

    await setup.service.save('user-1', {
      date: '2026-09-20',
      document: existing.content,
    });

    expect(setup.markIndexPending).not.toHaveBeenCalled();
  });

  test('queues reindexing when the retrievable text changes', async () => {
    const existing = note();
    const setup = service({ existing });

    await setup.service.save('user-1', {
      date: '2026-09-20',
      document: plainTextToRichText('Catatan baru sepenuhnya'),
    });

    expect(setup.markIndexPending).toHaveBeenCalledWith('user-1', '2026-09-20');
    expect(setup.queue.dailyNoteIndexes.add).toHaveBeenCalled();
  });

  test('gives every index enqueue a distinct job id so a resave is never dropped', async () => {
    // BullMQ discards an `add` whose id already exists in any state. A stable id
    // therefore made the second and every later save of a day a silent no-op:
    // the note kept its pending flag and was never reindexed.
    const setup = service({ existing: note() });
    const add = setup.queue.dailyNoteIndexes.add as unknown as jest.Mock;

    await setup.service.save('user-1', {
      date: '2026-09-20',
      document: plainTextToRichText('Versi satu'),
    });
    await setup.service.save('user-1', {
      date: '2026-09-20',
      document: plainTextToRichText('Versi dua'),
    });

    expect(add).toHaveBeenCalledTimes(2);

    const ids = add.mock.calls.map(
      (call) => (call[2] as { jobId: string }).jobId,
    );

    expect(new Set(ids).size).toBe(2);
  });
});
