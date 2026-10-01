import {
  HindsightError,
  type HindsightFact,
  type HindsightFactPage,
  type HindsightOperation,
  type HindsightOperationStatus,
  type HindsightRecall,
} from './hindsight.types';

export function responseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HindsightError('Hindsight returned an invalid object', false);

  return value as Record<string, unknown>;
}

export function responseString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new HindsightError('Hindsight returned an invalid string', false);

  return value;
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  return responseString(value);
}

function strings(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value))
    throw new HindsightError('Hindsight returned an invalid array', false);

  return value.map(responseString);
}

function fact(value: unknown): HindsightFact {
  const row = responseObject(value);
  if (!['world', 'experience', 'observation'].includes(String(row.type)))
    throw new HindsightError(
      'Hindsight returned an unsupported fact type',
      false,
    );
  const metadata: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;

  if (row.metadata !== undefined && row.metadata !== null)
    for (const [key, entry] of Object.entries(responseObject(row.metadata))) {
      if (typeof entry !== 'string')
        throw new HindsightError(
          'Hindsight returned invalid source metadata',
          false,
        );
      metadata[key] = entry;
    }

  return {
    id: responseString(row.id),
    text: responseString(row.text),
    type: row.type as HindsightFact['type'],
    documentId: optionalString(row.document_id),
    sourceFactIds: strings(row.source_fact_ids),
    metadata,
    occurredStart: optionalString(row.occurred_start),
    mentionedAt: optionalString(row.mentioned_at),
  };
}

export function parseFactPage(value: unknown): HindsightFactPage {
  const row = responseObject(value);
  if (
    !Array.isArray(row.items) ||
    !Number.isSafeInteger(row.total) ||
    Number(row.total) < 0
  )
    throw new HindsightError('Hindsight returned an invalid fact page', false);
  const items = row.items.map((value: unknown) => {
    const item = responseObject(value);
    if (item.state !== 'valid')
      throw new HindsightError(
        'Hindsight returned a retired fact in an active source page',
        false,
      );

    return fact({ ...item, type: item.fact_type });
  });

  return { items, total: row.total as number };
}

export function parseRecall(value: unknown): HindsightRecall {
  const payload = responseObject(value);
  if (!Array.isArray(payload.results))
    throw new HindsightError('Hindsight recall is missing results', false);
  const sourceFacts: Record<string, HindsightFact> = Object.create(
    null,
  ) as Record<string, HindsightFact>;

  if (payload.source_facts !== undefined && payload.source_facts !== null)
    for (const [id, entry] of Object.entries(
      responseObject(payload.source_facts),
    )) {
      const source = fact(entry);
      if (id !== source.id || source.type === 'observation')
        throw new HindsightError(
          'Hindsight returned invalid source evidence',
          false,
        );
      sourceFacts[id] = source;
    }

  if (
    payload.source_facts_truncated !== undefined &&
    typeof payload.source_facts_truncated !== 'boolean'
  )
    throw new HindsightError(
      'Hindsight returned invalid evidence truncation state',
      false,
    );

  return {
    results: payload.results.map(fact),
    sourceFacts,
    sourceFactsTruncated: payload.source_facts_truncated === true,
  };
}

export function parseOperation(
  value: unknown,
  expectedId: string,
): HindsightOperation {
  const row = responseObject(value);
  if (
    row.operation_id !== expectedId ||
    ![
      'pending',
      'processing',
      'completed',
      'failed',
      'cancelled',
      'not_found',
    ].includes(String(row.status))
  )
    throw new HindsightError(
      'Hindsight returned an invalid operation identity or status',
      false,
    );

  return { id: expectedId, status: row.status as HindsightOperationStatus };
}
