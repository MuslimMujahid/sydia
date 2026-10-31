export const NOTE_PRESENCE_REPOSITORY = Symbol('INotePresenceRepository');

export type NoteWriteResult<T> =
  | { status: 'deferred'; reason: 'note_open' }
  | { status: 'completed'; value: T };

/** The callback must contain only the version-checked mutation, never model work. */
export interface INotePresenceRepository {
  acquire(
    userId: string,
    ref: string,
    sessionId: string,
  ): Promise<{ expiresAt: Date }>;
  release(userId: string, ref: string, sessionId: string): Promise<void>;
  write<T>(
    userId: string,
    refs: readonly string[] | (() => Promise<readonly string[]>),
    mutation: () => Promise<T>,
  ): Promise<NoteWriteResult<T>>;
}
