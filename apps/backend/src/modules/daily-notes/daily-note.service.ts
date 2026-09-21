import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DAILY_NOTE_REPOSITORY,
  USER_REPOSITORY,
  type IDailyNoteRepository,
  type IUserRepository,
} from '../../database/interfaces';
import type {
  DailyNote,
  DailyNoteChunkMatch,
  DailyNoteSearchHit,
  DailyNoteSource,
  DailyNoteSummary,
} from '../../database/entities';
import { EmbeddingsService } from '../../infra/embeddings';
import { QueueService } from '../../infra/queue';
import { zonedParts } from '../../shared/date-time';
import {
  appendPlainText,
  emptyRichTextDocument,
  indexSignature,
  richTextToPlainText,
  type RichTextDocument,
} from '../../shared/rich-text';
import { chunkText } from '../../shared/text';

const RRF_K = 60;
const CANDIDATE_MULTIPLIER = 3;
const MAX_QUERY_LENGTH = 400;
const INDEX_BACKFILL_LIMIT = 25;

/** The owner's local calendar day, in the shape stored on every note. */
export function localDayKey(instant: Date, timezone: string): string {
  const { year, month, day } = zonedParts(instant, timezone);

  return [
    year.toString().padStart(4, '0'),
    month.toString().padStart(2, '0'),
    day.toString().padStart(2, '0'),
  ].join('-');
}

/** Shifts a day key by whole days; the inverse is windowing "last week". */
export function dayKeyOffset(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));

  return [
    shifted.getUTCFullYear().toString().padStart(4, '0'),
    (shifted.getUTCMonth() + 1).toString().padStart(2, '0'),
    shifted.getUTCDate().toString().padStart(2, '0'),
  ].join('-');
}

/**
 * Counts query terms that literally occur in a candidate. The vector leg
 * answers "about this topic"; this leg answers "contains this exact word",
 * which is what keeps a name like "Salsa" findable even when the embedding
 * misses it.
 */
function keywordScore(content: string, query: string): number {
  const normalized = content.toLocaleLowerCase();
  const terms = [
    ...new Set(
      query
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((term) => term.length > 2),
    ),
  ];

  if (terms.length === 0) return 0;

  return (
    terms.filter((term) => normalized.includes(term)).length / terms.length
  );
}

@Injectable()
export class DailyNoteService {
  private readonly logger = new Logger(DailyNoteService.name);

  constructor(
    @Inject(DAILY_NOTE_REPOSITORY)
    private readonly notes: IDailyNoteRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly embeddings: EmbeddingsService,
    private readonly queue: QueueService,
  ) {}

  async timezone(userId: string): Promise<string> {
    return (await this.users.findById(userId))?.timezone ?? 'Asia/Jakarta';
  }

  async today(userId: string, now = new Date()): Promise<string> {
    return localDayKey(now, await this.timezone(userId));
  }

  list(
    userId: string,
    range?: { from?: string; to?: string },
  ): Promise<DailyNoteSummary[]> {
    return this.notes.list(userId, range);
  }

  findByDate(userId: string, date: string): Promise<DailyNote | null> {
    return this.notes.findByDate(userId, date);
  }

  /**
   * Creates or replaces one day's note.
   *
   * An empty document means the day has no note: the row is removed rather than
   * left behind as an empty entry that would show a calendar dot, appear in the
   * recent list with no text, and read back as a note that is not really there.
   * That keeps PUT and GET agreeing on what "this day has no note" means.
   *
   * The note's own text is the source of truth; retrieval indexing is queued so
   * a save stays fast and a slow or failing embedding provider can never fail
   * the user's write.
   */
  async save(
    userId: string,
    input: {
      date: string;
      document: RichTextDocument;
      sourceType?: DailyNoteSource;
      sourceMessageId?: string | null;
    },
  ): Promise<DailyNote | null> {
    const timezone = await this.timezone(userId);
    const text = richTextToPlainText(input.document);
    const before = await this.notes.findByDate(userId, input.date);

    if (!text) {
      // Nothing left to index either; deleting the note cascades its chunks.
      if (before) await this.notes.delete(userId, input.date);

      return null;
    }

    const note = await this.notes.upsert(userId, {
      date: input.date,
      timezone,
      content: input.document,
      text,
      sourceType: input.sourceType ?? 'dashboard',
      sourceMessageId: input.sourceMessageId ?? null,
    });

    // Re-embedding is only warranted when the retrievable text changed.
    if (!before || before.text !== text)
      await this.enqueueIndex(userId, input.date);

    return note;
  }

  /**
   * Appends assistant-authored text to a day's note, creating the note when the
   * day has none. Routing through `save` keeps the stored JSON, the plain text,
   * and the retrieval index derived from a single code path.
   */
  async append(
    userId: string,
    input: {
      date: string;
      text: string;
      sourceType?: DailyNoteSource;
      sourceMessageId?: string | null;
    },
  ): Promise<DailyNote> {
    const existing = await this.notes.findByDate(userId, input.date);
    const document = appendPlainText(
      existing ? existing.content : emptyRichTextDocument(),
      input.text,
    );

    const note = await this.save(userId, {
      date: input.date,
      document,
      sourceType: input.sourceType,
      sourceMessageId: input.sourceMessageId,
    });

    // The appended text is non-empty by construction, so `save` cannot have
    // deleted the day; the assertion documents that invariant.
    if (!note) throw new Error('Catatan harian gagal disimpan.');

    return note;
  }

  remove(userId: string, date: string): Promise<boolean> {
    return this.notes.delete(userId, date);
  }

  /**
   * Hybrid retrieval over the diary: owner-scoped, optionally windowed to a
   * date range, and fused with reciprocal rank so a passage found by both legs
   * outranks one found by either. Falls back to the keyword leg alone when
   * embeddings are unavailable, so a question about a note never depends on the
   * model being reachable.
   */
  async search(
    userId: string,
    query: string,
    options: { limit?: number; from?: string; to?: string } = {},
  ): Promise<DailyNoteSearchHit[]> {
    const limit = options.limit ?? 5;
    const candidateLimit = Math.max(limit, limit * CANDIDATE_MULTIPLIER);
    const range = { from: options.from, to: options.to };
    const normalized = query.trim().slice(0, MAX_QUERY_LENGTH);

    if (!normalized) return [];

    const keyword = await this.notes.searchKeyword(
      userId,
      normalized,
      candidateLimit,
      range,
    );

    try {
      const embedding = await this.embeddings.embed(normalized);
      if (!embedding) return this.rank(keyword, [], normalized, limit);

      const semantic = await this.notes.searchVector(
        userId,
        embedding,
        candidateLimit,
        range,
      );

      this.logger.debug(
        `Daily note retrieval fused keyword=${keyword.length} semantic=${semantic.length}`,
      );

      return this.rank(semantic, keyword, normalized, limit);
    } catch (error) {
      this.logger.warn(
        `Daily note semantic retrieval failed; keyword fallback returned=${keyword.length}`,
        error instanceof Error ? error.stack : undefined,
      );

      return this.rank(keyword, [], normalized, limit);
    }
  }

  /**
   * Fuses the two legs by reciprocal rank and collapses each day to its
   * strongest passage. A day that matched several times reads better as one
   * entry than as the same date repeated.
   */
  private rank(
    semantic: DailyNoteChunkMatch[],
    keyword: DailyNoteChunkMatch[],
    query: string,
    limit: number,
  ): DailyNoteSearchHit[] {
    const byChunk = new Map<
      string,
      { match: DailyNoteChunkMatch; score: number }
    >();

    const add = (match: DailyNoteChunkMatch, rank: number) => {
      const key = `${match.date}:${match.chunkIndex}`;
      const existing = byChunk.get(key);

      byChunk.set(key, {
        match,
        score: (existing?.score ?? 0) + 1 / (RRF_K + rank + 1),
      });
    };

    semantic.forEach((match, index) => add(match, index));
    keyword.forEach((match, index) => add(match, index));

    const byDate = new Map<string, DailyNoteSearchHit>();

    for (const { match } of [...byChunk.values()].sort(
      (left, right) =>
        right.score - left.score ||
        keywordScore(right.match.content, query) -
          keywordScore(left.match.content, query) ||
        right.match.date.localeCompare(left.match.date),
    )) {
      if (byDate.has(match.date)) continue;

      byDate.set(match.date, { date: match.date, content: match.content });
      if (byDate.size >= limit) break;
    }

    return [...byDate.values()];
  }

  /**
   * Rebuilds the retrieval index for one day. Safe to run repeatedly: the text
   * fingerprint and the chunk embedding count are checked first, so a save that
   * only changed formatting — or a retried job for unchanged text — costs
   * nothing.
   */
  async index(
    userId: string,
    date: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const note = await this.notes.findByDate(userId, date);
    if (!note) return;

    const chunks = chunkText(note.text);
    const signature = indexSignature(note.text);

    // An emptied note still needs its stale index cleared; there is nothing to
    // embed, so this completes without the embedding provider.
    if (chunks.length === 0) {
      await this.notes.replaceChunks(userId, date, { signature, chunks: [] });

      return;
    }

    if (!options.force) {
      const state = await this.notes.indexState(userId, date);

      if (
        state &&
        state.signature === signature &&
        state.chunkCount === chunks.length &&
        state.embeddedCount === chunks.length
      )
        return;
    }

    const embeddings = await this.embeddings.embedMany(chunks);

    if (embeddings.some((embedding) => !embedding)) {
      // Leaving the flag set keeps the note in the recovery backlog, so it is
      // picked up once the embedding provider is configured again.
      await this.notes.markIndexPending(userId, date);
      this.logger.warn(
        `Daily note index postponed for an unconfigured embedding service date=${date}`,
      );

      return;
    }

    const rows = await this.notes.replaceChunks(userId, date, {
      signature,
      chunks,
    });

    await Promise.all(
      rows.map((row, position) =>
        this.notes.setChunkEmbedding(
          row.id,
          embeddings[position]!,
          this.embeddings.modelName(),
          this.embeddings.version,
        ),
      ),
    );
  }

  /** Re-indexes notes whose text is still missing from the retrieval index. */
  async recoverPending(): Promise<number> {
    const pending = await this.notes.listPendingIndex(INDEX_BACKFILL_LIMIT);
    let indexed = 0;

    for (const { userId, date } of pending) {
      try {
        await this.index(userId, date, { force: true });
        indexed += 1;
      } catch (error) {
        this.logger.warn(
          `Daily note recovery failed date=${date}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return indexed;
  }

  private async enqueueIndex(userId: string, date: string): Promise<void> {
    await this.notes.markIndexPending(userId, date);

    try {
      // The job id is unique per enqueue on purpose. BullMQ drops an `add` whose
      // id already exists in any state, so a deterministic id would make the
      // second and every later save of a day a silent no-op — the note would
      // keep its pending flag and never be reindexed.
      await this.queue.dailyNoteIndexes.add(
        'index',
        { kind: 'index', userId, date },
        { jobId: `daily-note-${userId}-${date}-${randomUUID()}` },
      );
    } catch (error) {
      // The note is saved and flagged; the recovery sweep retries it.
      this.logger.warn(
        `Daily note index enqueue failed date=${date}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
