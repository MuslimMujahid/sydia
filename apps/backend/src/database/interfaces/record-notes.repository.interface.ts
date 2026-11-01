import type {
  RecordRow,
  RecordTable,
  RecordSnapshot,
} from '../entities/record-note.entity';

export const RECORD_NOTES_REPOSITORY = Symbol('IRecordNotesRepository');
export interface IRecordNotesRepository {
  /** Shares the owner workspace lock and ambient transaction with presence/work receipts. */
  locked<T>(userId: string, work: () => Promise<T>): Promise<T>;
  editorWrite<T>(
    userId: string,
    noteId: string,
    sessionId: string,
    work: () => Promise<T>,
  ): Promise<T>;
  get(userId: string, noteId: string): Promise<Omit<RecordSnapshot, 'rows'>>;
  page(
    userId: string,
    noteId: string,
    offset: number,
    limit: number,
  ): Promise<RecordRow[]>;
  snapshots(
    userId: string,
    ids: string[],
    maxRows: number,
  ): Promise<RecordSnapshot[]>;
  insert(table: RecordTable): Promise<void>;
  save(
    userId: string,
    snapshot: RecordSnapshot,
    before: RecordRow[],
    sourceType: string,
  ): Promise<void>;
  receipt(
    userId: string,
    key: string,
  ): Promise<{ fingerprint: string; result: unknown } | null>;
  remember(
    userId: string,
    key: string,
    fingerprint: string,
    result: unknown,
  ): Promise<void>;
}
