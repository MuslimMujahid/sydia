export type RetainCounters = Record<string, number>;

/** Counters are attributable only on dedicated instances with no other retains.
 * The provider label names Hindsight's adapter, not OpenRouter's hosting route. */
export async function retainCounters(
  url: string,
): Promise<RetainCounters | null> {
  try {
    const response = await fetch(new URL('/metrics', url), {
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) return null;
    const counters: RetainCounters = {};

    for (const line of (await response.text()).split('\n')) {
      if (!line.includes('scope="retain_extract_facts"')) continue;
      const match =
        /^(hindsight_llm_(?:calls_total|tokens_[a-z_]+_total))\{[^}]+\}\s+([0-9.eE+-]+)$/.exec(
          line,
        );

      if (!match) continue;
      const value = Number(match[2]);
      if (!Number.isFinite(value) || value < 0) continue;
      const model = /model="([^"]+)"/.exec(line)?.[1] ?? 'unknown';
      const success = /success="([^"]+)"/.exec(line)?.[1] ?? 'unknown';
      const key = `${model}:${success}:${match[1]}`;
      counters[key] = (counters[key] ?? 0) + value;
    }

    return counters;
  } catch {
    return null;
  }
}

export function retainCounterDelta(
  before: RetainCounters | null,
  after: RetainCounters | null,
): RetainCounters | null {
  if (before === null || after === null) return null;
  const delta: RetainCounters = {};

  for (const [key, value] of Object.entries(after)) {
    const change = value - (before[key] ?? 0);
    if (change < 0) return null; // instance restart makes attribution invalid
    if (change > 0) delta[key] = change;
  }

  return delta;
}
