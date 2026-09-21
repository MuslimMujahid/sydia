import type {
  DailyNote,
  DailyNoteChunk,
  DailyNoteChunkMatch,
  DailyNoteSummary,
  DailyNoteWrite,
} from '../entities';

/** Inclusive owner-local day bounds in YYYY-MM-DD form. */
export type DailyNoteRange = { from?: string; to?: string };

export interface IDailyNoteRepository {
  list(userId: string, range?: DailyNoteRange): Promise<DailyNoteSummary[]>;
  findByDate(userId: string, date: string): Promise<DailyNote | null>;
  upsert(userId: string, input: DailyNoteWrite): Promise<DailyNote>;
  delete(userId: string, date: string): Promise<boolean>;
  /**
   * Replaces the day's retrieval index and records whether that index is still
   * current, in one transaction.
   *
   * `indexPending` is recomputed rather than simply cleared: a save can land
   * while this note is mid-index, and clearing the flag unconditionally would
   * mark a stale index as fresh and drop the note out of the recovery backlog.
   * Comparing the indexed signature against the note's *current* text — read
   * inside the transaction — keeps that race harmless.
   */
  replaceChunks(
    userId: string,
    date: string,
    input: { signature: string; chunks: string[] },
  ): Promise<DailyNoteChunk[]>;
  markIndexPending(userId: string, date: string): Promise<void>;
  /** What the indexer needs to decide whether a rebuild is required. */
  indexState(
    userId: string,
    date: string,
  ): Promise<{
    pending: boolean;
    signature: string | null;
    chunkCount: number;
    embeddedCount: number;
  } | null>;
  setChunkEmbedding(
    id: string,
    embedding: number[],
    model: string,
    version: string,
  ): Promise<void>;
  searchKeyword(
    userId: string,
    query: string,
    limit: number,
    range?: DailyNoteRange,
  ): Promise<DailyNoteChunkMatch[]>;
  searchVector(
    userId: string,
    embedding: number[],
    limit: number,
    range: DailyNoteRange | undefined,
  ): Promise<DailyNoteChunkMatch[]>;
  /** Notes whose text is still missing from the retrieval index, oldest first. */
  listPendingIndex(
    limit: number,
  ): Promise<Array<{ userId: string; date: string }>>;
}

export const DAILY_NOTE_REPOSITORY = Symbol('IDailyNoteRepository');
