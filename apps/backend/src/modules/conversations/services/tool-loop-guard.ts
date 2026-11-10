/** Identical failures of one call allowed per turn before it is refused. */
export const REPEATED_FAILURE_LIMIT = 3;

type FailureRecord = { count: number; error: string };

/** Key order must not make two otherwise identical calls look different. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;

  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;

  return JSON.stringify(value) ?? 'null';
}

/** Tool errors reach the model as JSON or as a plain sentence. */
function readable(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return content;
  }
}

/**
 * Turn-scoped record of tool calls that keep failing the same way. A model
 * that retries a call unchanged after the same error spends a step of the turn
 * budget each time for an outcome it has already seen; after
 * {@link REPEATED_FAILURE_LIMIT} such failures the call is refused unrun and
 * the model is told to change course. Counting is per call (tool plus
 * arguments), so unrelated calls between the retries do not hide the loop.
 */
export class ToolLoopGuard {
  private readonly failures = new Map<string, FailureRecord>();

  /** The refusal for a call that already failed too often, or `null` to run it. */
  refusal(toolName: string, args: unknown): string | null {
    const failure = this.failures.get(this.key(toolName, args));
    if (!failure || failure.count < REPEATED_FAILURE_LIMIT) return null;

    return JSON.stringify({
      error: 'repeated_failure',
      message: `This exact ${toolName} call already failed ${failure.count} times in this turn and was not run again. Do not repeat it unchanged: change the arguments as the error suggests, take a different approach, or tell the user what could not be done.`,
      lastError: readable(failure.error),
    });
  }

  /** Records a call's outcome; `error` is the content the model saw on failure. */
  record(toolName: string, args: unknown, error: string | null): void {
    const key = this.key(toolName, args);

    if (error === null) {
      this.failures.delete(key);

      return;
    }

    const previous = this.failures.get(key);

    // A different error means the call is reaching new ground, not looping.
    this.failures.set(key, {
      count: previous?.error === error ? previous.count + 1 : 1,
      error,
    });
  }

  private key(toolName: string, args: unknown): string {
    return `${toolName}:${stableJson(args)}`;
  }
}
