import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  parseOperation,
  parseRecall,
  parseFactPage,
  responseObject,
  responseString,
} from './hindsight.response';
import {
  HindsightError,
  type HindsightGateway,
  type HindsightFactPage,
  type HindsightOperation,
  type HindsightRecall,
  type HindsightRecallInput,
  type HindsightRetainInput,
} from './hindsight.types';

type Waiter = {
  enter: () => void;
  abort: () => void;
  signal: AbortSignal;
};

function segment(value: string): string {
  if (
    !value ||
    value === '.' ||
    value === '..' ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    throw new HindsightError('Invalid Hindsight resource identity', false);

  return encodeURIComponent(value);
}

function operationId(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    throw new HindsightError(
      'Hindsight operation identity must be a lowercase UUID',
      false,
    );

  return segment(value);
}

/** v0.10.2 REST adapter. Durable callers own retries; this layer never replays writes. */
@Injectable()
export class HttpHindsightGateway implements HindsightGateway {
  private readonly logger = new Logger(HttpHindsightGateway.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly recallTimeoutMs: number;
  private readonly recallMinSimilarity: number | undefined;
  private readonly concurrency: number;
  private active = 0;
  private readonly waiters: Waiter[] = [];

  constructor(config: ConfigService) {
    this.baseUrl = config
      .get<string>('BACKEND_HINDSIGHT_URL', '')
      .replace(/\/$/, '');
    this.apiKey = config.get<string>('BACKEND_HINDSIGHT_API_KEY', '');
    this.timeoutMs = config.get<number>('BACKEND_HINDSIGHT_TIMEOUT_MS', 10_000);
    this.recallTimeoutMs = config.get<number>(
      'BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS',
      1_500,
    );
    this.concurrency = config.get<number>('BACKEND_HINDSIGHT_CONCURRENCY', 4);
    this.recallMinSimilarity = config.get<number>(
      'BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY',
    );
  }

  async version(): Promise<string> {
    const row = responseObject(
      await this.request('version', 'GET', '/version'),
    );

    const features = responseObject(row.features);
    if (features.llm_trace !== false || features.audit_log !== false)
      throw new HindsightError(
        'Hindsight raw-content tracing and audit capture must be disabled',
        false,
      );

    return responseString(row.api_version);
  }

  async ready(): Promise<void> {
    await this.request('ready', 'GET', '/health/ready');
  }

  async configureBank(bankId: string, retainMission: string): Promise<void> {
    const row = responseObject(
      await this.request('configure', 'PUT', this.bank(bankId), {
        retain_mission: retainMission,
        enable_observations: true,
      }),
    );

    if (row.bank_id !== bankId)
      throw new HindsightError(
        'Hindsight returned a different bank identity',
        false,
      );
  }

  async retain(
    bankId: string,
    input: HindsightRetainInput,
  ): Promise<HindsightOperation> {
    operationId(input.operationId);
    segment(input.documentId);
    if (!input.content.trim() || !Number.isFinite(Date.parse(input.timestamp)))
      throw new HindsightError(
        'Retain requires content and an event timestamp',
        false,
      );
    const row = responseObject(
      await this.request('retain', 'POST', `${this.bank(bankId)}/memories`, {
        async: true,
        operation_id: input.operationId,
        items: [
          {
            document_id: input.documentId,
            content: input.content,
            timestamp: input.timestamp,
            context: input.context,
            metadata: input.metadata,
            update_mode: 'replace',
            observation_scopes: 'shared',
          },
        ],
      }),
    );

    if (row.success !== true || row.bank_id !== bankId || row.items_count !== 1)
      throw new HindsightError(
        'Hindsight did not acknowledge the retained source',
        false,
      );
    if (row.async === false)
      return { id: input.operationId, status: 'completed' };
    if (row.async !== true || row.operation_id !== input.operationId)
      throw new HindsightError(
        'Hindsight did not acknowledge the operation identity',
        false,
      );

    return { id: input.operationId, status: 'pending' };
  }

  async operation(bankId: string, id: string): Promise<HindsightOperation> {
    return parseOperation(
      await this.request(
        'operation',
        'GET',
        `${this.bank(bankId)}/operations/${operationId(id)}`,
      ),
      id,
    );
  }

  async recall(
    bankId: string,
    input: HindsightRecallInput,
  ): Promise<HindsightRecall> {
    if (
      !input.query.trim() ||
      !Number.isInteger(input.maxTokens) ||
      input.maxTokens < 1 ||
      !Number.isFinite(Date.parse(input.timestamp))
    )
      throw new HindsightError(
        'Recall requires a query, event timestamp, and positive token budget',
        false,
      );

    return parseRecall(
      await this.request(
        'recall',
        'POST',
        `${this.bank(bankId)}/memories/recall`,
        {
          query: input.query,
          query_timestamp: input.timestamp,
          types:
            input.includeObservations === false
              ? ['world']
              : ['world', 'observation'],
          prefer_observations: input.includeObservations !== false,
          budget: input.budget ?? 'low',
          max_tokens: input.maxTokens,
          ...(this.recallMinSimilarity !== undefined
            ? { min_scores: { semantic: this.recallMinSimilarity } }
            : {}),
          include: {
            entities: null,
            chunks: null,
            source_facts: { max_tokens: input.maxTokens * 4 },
          },
        },
        this.recallTimeoutMs,
      ),
    );
  }

  async deleteDocument(bankId: string, documentId: string): Promise<void> {
    await this.remove(
      'delete-document',
      `${this.bank(bankId)}/documents/${segment(documentId)}`,
    );
  }

  async listFacts(
    bankId: string,
    documentId: string,
    offset = 0,
  ): Promise<HindsightFactPage> {
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new HindsightError('Invalid Hindsight page offset', false);
    const query = new URLSearchParams({
      document_id: documentId,
      type: 'world',
      state: 'valid',
      limit: '100',
      offset: String(offset),
    });

    const page = parseFactPage(
      await this.request(
        'list-facts',
        'GET',
        `${this.bank(bankId)}/memories/list?${query}`,
      ),
    );

    if (
      page.items.some(
        (fact) => fact.documentId !== documentId || fact.type !== 'world',
      )
    )
      throw new HindsightError(
        'Hindsight returned facts outside the requested source',
        false,
      );

    return page;
  }

  async correctFact(
    bankId: string,
    factId: string,
    text: string,
  ): Promise<void> {
    if (!text.trim())
      throw new HindsightError('A correction cannot be empty', false);
    const row = responseObject(
      await this.request(
        'correct',
        'PATCH',
        `${this.bank(bankId)}/memories/${segment(factId)}`,
        { text, reason: 'Explicit user correction' },
      ),
    );

    if (row.id !== factId || row.text !== text)
      throw new HindsightError(
        'Hindsight did not confirm the corrected fact',
        false,
      );
  }

  async deleteBank(bankId: string): Promise<void> {
    await this.remove('delete-bank', this.bank(bankId));
  }

  private async remove(operation: string, path: string): Promise<void> {
    try {
      const row = responseObject(await this.request(operation, 'DELETE', path));
      if (row.success !== true)
        throw new HindsightError('Hindsight did not confirm erasure', false);
    } catch (error) {
      // Absence is already the intended result of a replayed erasure.
      if (!(error instanceof HindsightError && error.status === 404))
        throw error;
    }
  }

  private bank(id: string): string {
    return `/v1/default/banks/${segment(id)}`;
  }

  private async request(
    operation: string,
    method: string,
    path: string,
    body?: unknown,
    deadlineMs = this.timeoutMs,
  ): Promise<unknown> {
    if (!this.baseUrl || !this.apiKey)
      throw new HindsightError('Hindsight is not configured', false);
    const signal = AbortSignal.timeout(deadlineMs);
    const started = performance.now();
    let entered = false;

    try {
      await this.enter(signal);
      entered = true;
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      if (!response.ok) {
        await response.body?.cancel();
        throw new HindsightError(
          `Hindsight ${operation} returned HTTP ${response.status}`,
          response.status === 408 ||
            response.status === 429 ||
            response.status >= 500,
          response.status,
        );
      }

      const payload: unknown = await response.json();

      return payload;
    } catch (error: unknown) {
      if (error instanceof HindsightError) throw error;
      if (error instanceof SyntaxError)
        throw new HindsightError('Hindsight returned invalid JSON', false);
      // Do not propagate provider bodies, URLs, credentials, or source text into errors/logs.
      throw new HindsightError(
        signal.aborted
          ? `Hindsight ${operation} deadline exceeded`
          : `Hindsight ${operation} transport failed`,
        true,
      );
    } finally {
      if (entered) this.leave();
      this.logger.debug(
        `Hindsight operation=${operation} durationMs=${Math.round(performance.now() - started)}`,
      );
    }
  }

  private enter(signal: AbortSignal): Promise<void> {
    if (signal.aborted)
      return Promise.reject(
        new HindsightError('Hindsight queue deadline exceeded', true),
      );

    if (this.active < this.concurrency) {
      this.active += 1;

      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        signal,
        enter: () => {
          signal.removeEventListener('abort', waiter.abort);
          resolve();
        },
        abort: () => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new HindsightError('Hindsight queue deadline exceeded', true));
        },
      };

      this.waiters.push(waiter);
      signal.addEventListener('abort', waiter.abort, { once: true });
    });
  }

  private leave(): void {
    const next = this.waiters.shift();
    if (next) next.enter();
    else this.active -= 1;
  }
}
