import type { NoteWork as StoredNoteWork } from '../../generated/prisma/client';

export type NoteWork = Pick<
  StoredNoteWork,
  | 'id'
  | 'userId'
  | 'key'
  | 'sourceKind'
  | 'sourceRef'
  | 'sourceVersion'
  | 'sourceAt'
  | 'timezone'
  | 'sourceContent'
  | 'destinationRef'
  | 'stage'
  | 'status'
  | 'payload'
  | 'result'
  | 'attempts'
  | 'nextAttemptAt'
  | 'lastErrorCode'
>;
export type NoteWorkValue = StoredNoteWork['result'];
export type NoteWorkPayload = { [key: string]: NoteWorkValue | undefined };
