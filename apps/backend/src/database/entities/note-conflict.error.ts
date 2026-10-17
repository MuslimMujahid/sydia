/** A conditional persistence write lost a race; callers must resolve it. */
export class NoteConflictError extends Error {
  constructor() {
    super('The note changed after it was read.');
  }
}
