export type MemoryEngineMode = 'legacy' | 'shadow' | 'hindsight';

function stringValue(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string') throw new Error(`${key} must be a string`);

  return value.trim();
}

function positiveInteger(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
  max: number,
): number {
  const value = config[key];
  const number = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max)
    throw new Error(`${key} must be an integer between 1 and ${max}`);

  return number;
}

function booleanValue(
  config: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = config[key];
  if (value === undefined || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${key} must be true or false`);
}

function optionalSimilarity(
  config: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = config[key];
  if (value === undefined || (typeof value === 'string' && !value.trim()))
    return undefined;
  const number =
    typeof value === 'string' || typeof value === 'number'
      ? Number(value)
      : NaN;

  if (!Number.isFinite(number) || number < 0 || number > 1)
    throw new Error(`${key} must be a number between 0 and 1, or blank`);

  return number;
}

/** Pure validation, shared by API and worker bootstrap. */
export function validateHindsightEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const mode = stringValue(config, 'BACKEND_MEMORY_ENGINE') || 'legacy';
  if (!['legacy', 'shadow', 'hindsight'].includes(mode))
    throw new Error(
      'BACKEND_MEMORY_ENGINE must be legacy, shadow, or hindsight',
    );

  const baseUrl = stringValue(config, 'BACKEND_HINDSIGHT_URL');
  const apiKey = stringValue(config, 'BACKEND_HINDSIGHT_API_KEY');
  const namespace = stringValue(config, 'BACKEND_HINDSIGHT_NAMESPACE');
  const retiredNamespaces = [
    ...new Set(
      stringValue(config, 'BACKEND_HINDSIGHT_RETIRED_NAMESPACES')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];

  if (
    retiredNamespaces.some((value) => !/^[a-z0-9][a-z0-9-]{0,47}$/.test(value))
  )
    throw new Error(
      'BACKEND_HINDSIGHT_RETIRED_NAMESPACES must list environment namespaces with 1–48 lowercase letters, digits, or hyphens',
    );

  if (baseUrl) {
    let url: URL;

    try {
      url = new URL(baseUrl);
    } catch {
      throw new Error('BACKEND_HINDSIGHT_URL must be an absolute HTTP(S) URL');
    }

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new Error(
        'BACKEND_HINDSIGHT_URL must be an HTTP(S) origin without credentials',
      );
  }

  if (namespace && !/^[a-z0-9][a-z0-9-]{0,47}$/.test(namespace))
    throw new Error(
      'BACKEND_HINDSIGHT_NAMESPACE must contain 1–48 lowercase letters, digits, or hyphens',
    );
  if (mode !== 'legacy' && (!baseUrl || !apiKey || !namespace))
    throw new Error(
      'Hindsight modes require BACKEND_HINDSIGHT_URL, BACKEND_HINDSIGHT_API_KEY, and an environment-specific BACKEND_HINDSIGHT_NAMESPACE',
    );

  return {
    BACKEND_MEMORY_ENGINE: mode,
    BACKEND_HINDSIGHT_URL: baseUrl.replace(/\/$/, ''),
    BACKEND_HINDSIGHT_API_KEY: apiKey,
    BACKEND_HINDSIGHT_NAMESPACE: namespace,
    BACKEND_HINDSIGHT_RETIRED_NAMESPACES: retiredNamespaces.join(','),
    BACKEND_HINDSIGHT_COHORT: stringValue(config, 'BACKEND_HINDSIGHT_COHORT'),
    BACKEND_HINDSIGHT_INGESTION_ENABLED: booleanValue(
      config,
      'BACKEND_HINDSIGHT_INGESTION_ENABLED',
      false,
    ),
    BACKEND_MEMORY_AUTO_RECALL_ENABLED: booleanValue(
      config,
      'BACKEND_MEMORY_AUTO_RECALL_ENABLED',
      false,
    ),
    BACKEND_HINDSIGHT_TIMEOUT_MS: positiveInteger(
      config,
      'BACKEND_HINDSIGHT_TIMEOUT_MS',
      10_000,
      120_000,
    ),
    BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS: positiveInteger(
      config,
      'BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS',
      1_500,
      30_000,
    ),
    BACKEND_HINDSIGHT_RECALL_TOKENS: positiveInteger(
      config,
      'BACKEND_HINDSIGHT_RECALL_TOKENS',
      800,
      8_192,
    ),
    BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY: optionalSimilarity(
      config,
      'BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY',
    ),
    BACKEND_HINDSIGHT_CONCURRENCY: positiveInteger(
      config,
      'BACKEND_HINDSIGHT_CONCURRENCY',
      4,
      64,
    ),
  };
}
