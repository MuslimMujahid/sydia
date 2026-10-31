import type { NoteWork, NoteWorkPayload, NoteWorkValue } from '../entities';

export const NOTE_WORK_REPOSITORY = Symbol('INoteWorkRepository');

export interface INoteWorkRepository {
  acceptMessage(input: {
    userId: string;
    sourceMessageId: string;
    key: string;
    stage: string;
    notBefore?: Date;
    destinationRef?: string;
    payload: NoteWorkPayload;
  }): Promise<NoteWork>;
  /** Participates in the note mutation's transaction; replays return the receipt. */
  apply(
    id: string,
    userId: string,
    mutation: () => Promise<NoteWorkValue>,
  ): Promise<NoteWorkValue>;
  defer(id: string, userId: string, reason: string): Promise<void>;
  fail(id: string, userId: string, reason: string): Promise<void>;
  expedite(userId: string, sourceWorkId?: string): Promise<void>;
  pending(
    limit: number,
    userId?: string,
    includeProposals?: boolean,
  ): Promise<NoteWork[]>;
  collectSources(
    limit: number,
    idleMs: number,
    userId?: string,
  ): Promise<number>;
  spawn(
    parent: NoteWork,
    key: string,
    stage: string,
    payload: NoteWorkPayload,
    destinationRef?: string,
  ): Promise<NoteWork>;
  mark(
    id: string,
    userId: string,
    status: string,
    payload?: NoteWorkPayload,
  ): Promise<void>;
  history(userId: string, sourceRef?: string): Promise<NoteWork[]>;
  dailyCaptureLines(userId: string, date: string): Promise<string[]>;
  publishQuestions(
    limit: number,
    userId?: string,
    sourceRef?: string,
  ): Promise<number>;
  questionsForMessage(userId: string, messageId: string): Promise<NoteWork[]>;
  resolveQuestion(
    userId: string,
    workId: string,
    messageId: string,
    action: 'resolve' | 'reject',
    destinationRef?: string,
  ): Promise<boolean>;
  sourceValid(work: NoteWork): Promise<boolean>;
  sourceReady(work: NoteWork, idleMs: number): Promise<boolean>;
  recentMessages(work: NoteWork): Promise<string[]>;
  clarificationContext(
    work: NoteWork,
  ): Promise<
    Array<{ id: string; role: string; content: string; createdAt: Date }>
  >;
  previousRecords(work: NoteWork, destinationRef: string): Promise<NoteWork[]>;
}
