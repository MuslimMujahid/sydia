import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { timingSafeEqual } from 'node:crypto';

type Arm = 'baseline' | 'gpt-oss-20b';
export type ExtractionCharge = {
  sequence: number;
  arm: Arm;
  status: number;
  durationMs: number;
  requestedModel: string;
  model: string | null;
  provider: string | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function label(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9 .:/_-]{1,128}$/i.test(value)
    ? value
    : null;
}

export function extractionCharge(
  value: unknown,
): Pick<
  ExtractionCharge,
  | 'model'
  | 'provider'
  | 'costUsd'
  | 'inputTokens'
  | 'outputTokens'
  | 'cachedTokens'
  | 'reasoningTokens'
> {
  const response = record(value);
  const usage = record(response?.usage);
  const cost = usage?.cost;

  return {
    model: label(response?.model),
    provider: label(response?.provider),
    costUsd:
      typeof cost === 'number' && Number.isFinite(cost) && cost >= 0
        ? cost
        : null,
    inputTokens: count(usage?.prompt_tokens),
    outputTokens: count(usage?.completion_tokens),
    cachedTokens: count(record(usage?.prompt_tokens_details)?.cached_tokens),
    reasoningTokens: count(
      record(usage?.completion_tokens_details)?.reasoning_tokens,
    ),
  };
}

export function totalExtractionCost(
  rows: readonly ExtractionCharge[],
): number | null {
  if (!rows.length || rows.some(({ costUsd }) => costUsd === null)) return null;

  return rows.reduce((sum, row) => sum + row.costUsd!, 0);
}

export async function chargeSnapshot(
  adminUrl: string,
  after = 0,
): Promise<{ sequence: number; rows: ExtractionCharge[] }> {
  const url = new URL('/charges', adminUrl);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  )
    throw new Error('Usage relay administration must stay on loopback');
  url.searchParams.set('after', String(after));
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error('Usage relay snapshot unavailable');
  const snapshot = record((await response.json()) as unknown);
  if (
    !snapshot ||
    count(snapshot.sequence) === null ||
    !Array.isArray(snapshot.rows)
  )
    throw new Error('Invalid usage relay snapshot');
  const rows = snapshot.rows.map((value: unknown) => {
    const row = record(value);
    if (
      !row ||
      count(row.sequence) === null ||
      (row.arm !== 'baseline' && row.arm !== 'gpt-oss-20b') ||
      count(row.status) === null ||
      typeof row.durationMs !== 'number' ||
      !Number.isFinite(row.durationMs) ||
      row.durationMs < 0 ||
      !label(row.requestedModel) ||
      (row.model !== null && !label(row.model)) ||
      (row.provider !== null && !label(row.provider)) ||
      (row.costUsd !== null &&
        (typeof row.costUsd !== 'number' ||
          !Number.isFinite(row.costUsd) ||
          row.costUsd < 0)) ||
      ['inputTokens', 'outputTokens', 'cachedTokens', 'reasoningTokens'].some(
        (key) => row[key] !== null && count(row[key]) === null,
      )
    )
      throw new Error('Invalid usage relay charge');

    return row as ExtractionCharge;
  });

  return { sequence: snapshot.sequence as number, rows };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function body(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as string);

    size += buffer.length;
    if (size > 1024 * 1024) throw new Error('BodyLimit');
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

/** Synthetic experiments only. Payloads pass through memory, never logs or disk.
 * Keep this out of production and route retain only, never all Hindsight calls. */
export function createUsageRelay(config: {
  apiKey: string;
  upstream?: string;
}) {
  const rows: ExtractionCharge[] = [];
  let sequence = 0;
  const expectedModels: Record<Arm, string> = {
    baseline: 'deepseek/deepseek-v4.1-flash',
    'gpt-oss-20b': 'openai/gpt-oss-20b',
  };

  const authorization = Buffer.from(`Bearer ${config.apiKey}`);

  const relay = createServer((request, response) => {
    void (async () => {
      const incoming = Buffer.from(request.headers.authorization ?? '');

      if (
        incoming.length !== authorization.length ||
        !timingSafeEqual(incoming, authorization)
      ) {
        json(response, 401, { error: 'Unauthorized' });

        return;
      }

      const match = /^\/(baseline|gpt-oss-20b)\/v1\/chat\/completions$/.exec(
        request.url ?? '',
      );

      if (request.method !== 'POST' || !match) {
        json(response, 404, { error: 'UnsupportedRoute' });

        return;
      }

      const arm = match[1] as Arm;
      const payload = await body(request);
      const parsed = record(JSON.parse(payload.toString('utf8')) as unknown);

      if (parsed?.model !== expectedModels[arm] || parsed.stream === true) {
        json(response, 400, { error: 'UnsupportedModelOrStream' });

        return;
      }

      const controller = new AbortController();
      response.once('close', () => {
        if (!response.writableEnded) controller.abort();
      });
      const started = performance.now();
      let status = 502;
      let captured = extractionCharge(null);

      try {
        const upstream = await fetch(
          new URL(
            '/api/v1/chat/completions',
            config.upstream ?? 'https://openrouter.ai',
          ),
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${config.apiKey}`,
              'content-type': 'application/json',
            },
            body: payload.toString('utf8'),
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(50000),
            ]),
          },
        );

        status = upstream.status;
        const reply = await upstream.text();

        try {
          captured = extractionCharge(JSON.parse(reply) as unknown);
        } catch {
          /* billing stays unknown */
        }

        // Forward unchanged, preserving Hindsight's schema/error/retry handling.
        response.writeHead(status, {
          'content-type':
            upstream.headers.get('content-type') ?? 'application/json',
        });
        response.end(reply);
      } catch {
        if (!response.destroyed)
          json(response, status, { error: 'UpstreamUnavailable' });
      } finally {
        rows.push({
          sequence: ++sequence,
          arm,
          status,
          durationMs: performance.now() - started,
          requestedModel: expectedModels[arm],
          ...captured,
        });
        if (rows.length > 2048) rows.shift();
      }
    })().catch(() => {
      if (!response.destroyed && !response.headersSent)
        json(response, 400, { error: 'InvalidRequest' });
    });
  });

  const admin = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (request.method !== 'GET' || url.pathname !== '/charges') {
      json(response, 404, { error: 'UnsupportedRoute' });

      return;
    }

    const after = Number(url.searchParams.get('after') ?? 0);

    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      (rows.length === 2048 && after < rows[0]!.sequence - 1)
    ) {
      json(response, 409, { error: 'InvalidOrExpiredCursor' });

      return;
    }

    json(response, 200, {
      sequence,
      rows: rows.filter((row) => row.sequence > after),
    });
  });

  return { relay, admin };
}

if (typeof require !== 'undefined' && require.main === module) {
  const apiKey = process.env.HINDSIGHT_API_LLM_API_KEY?.trim();
  const host = process.env.OPTIMIZATION_RELAY_DOCKER_HOST;

  const container = process.env.OPTIMIZATION_RELAY_CONTAINER === 'true';

  if (
    !apiKey ||
    !host ||
    (!(container && host === '0.0.0.0') &&
      !/^172\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host))
  ) {
    throw new Error(
      'Synthetic relay requires HINDSIGHT_API_LLM_API_KEY and the Docker bridge address',
    );
  }

  const { relay, admin } = createUsageRelay({ apiKey });
  relay.listen(8900, host);
  admin.listen(8901, container ? '0.0.0.0' : '127.0.0.1');

  const stop = () => {
    relay.close();
    admin.close();
  };

  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  process.stdout.write(
    'Synthetic extraction usage relay started; content capture disabled.\n',
  );
}
