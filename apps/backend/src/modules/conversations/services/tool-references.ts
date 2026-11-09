/** Most candidates an ambiguous reference reports back to the model. */
export const REFERENCE_CANDIDATE_LIMIT = 5;
const CANDIDATE_TITLE_LENGTH = 80;

export type ReferenceKind = 'task' | 'reminder';

/** One item a text reference may mean, shown so the user can choose. */
export type ReferenceCandidate = {
  id: string;
  title: string;
  /** Owner-local `YYYY-MM-DD HH:mm`, or null when the item has no time. */
  when: string | null;
  recurring?: true;
};

/**
 * A text reference matched several items equally well. The tool refuses rather
 * than change whichever one sorted first; the candidates let the model ask the
 * user which one they mean and retry with its id.
 */
export class AmbiguousReferenceError extends Error {
  readonly candidates: readonly ReferenceCandidate[];
  /** Matches left out of `candidates` because of the limit. */
  readonly omitted: number;

  constructor(
    kind: ReferenceKind,
    query: string,
    candidates: readonly ReferenceCandidate[],
  ) {
    super(
      `Several ${kind}s match "${query}". Changed nothing. Ask the user which one they mean, naming each candidate by title and time, then call again with its id.`,
    );
    this.name = 'AmbiguousReferenceError';
    this.candidates = candidates
      .slice(0, REFERENCE_CANDIDATE_LIMIT)
      .map((candidate) => ({
        ...candidate,
        title: candidate.title.slice(0, CANDIDATE_TITLE_LENGTH),
      }));
    this.omitted = Math.max(0, candidates.length - REFERENCE_CANDIDATE_LIMIT);
  }
}

/**
 * The matches a text reference most plausibly names, strongest tier first: an
 * exact title, then a title containing the query, then any other match the
 * search returned (a description or notes hit). A single result is the
 * referenced item; several mean the reference is ambiguous.
 */
export function closestReferences<T extends { title: string }>(
  matches: readonly T[],
  query: string,
): readonly T[] {
  const wanted = query.trim().toLocaleLowerCase();
  const title = (match: T): string => match.title.trim().toLocaleLowerCase();
  const exact = matches.filter((match) => title(match) === wanted);
  if (exact.length) return exact;
  const partial = matches.filter((match) => title(match).includes(wanted));

  return partial.length ? partial : matches;
}
