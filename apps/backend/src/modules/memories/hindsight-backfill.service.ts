import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  HINDSIGHT_REPOSITORY,
  MEMORY_REPOSITORY,
  USER_REPOSITORY,
  CONVERSATION_REPOSITORY,
  type IHindsightRepository,
  type IMemoryRepository,
  type IUserRepository,
  type IConversationRepository,
} from '../../database/interfaces';
import { MemoryEngineService } from './memory-engine.service';
import { containsMemoryCredential, memoryChecksum } from './memory-admission';
import { MemoryPolicyService } from './memory-policy.service';

export type HindsightBackfillBatch = {
  dryRun: boolean;
  /** Resume from nextCursor after an interruption; null means start at the beginning. */
  interrupted: boolean;
  nextCursor: string | null;
  counts: Record<string, number>;
  outcomes: Array<{
    legacyId: string;
    status: string;
    sourceId?: string;
    generation?: number;
  }>;
};

function batchResult(
  result: Omit<HindsightBackfillBatch, 'counts'>,
): HindsightBackfillBatch {
  const counts = new Map<string, number>();
  for (const { status } of result.outcomes)
    counts.set(status, (counts.get(status) ?? 0) + 1);

  return { ...result, counts: Object.fromEntries(counts) };
}

/** Explicit, bounded migration of saved facts, never an archive extraction job. */
@Injectable()
export class HindsightBackfillService {
  constructor(
    @Inject(MEMORY_REPOSITORY) private readonly memories: IMemoryRepository,
    @Inject(HINDSIGHT_REPOSITORY) private readonly ledger: IHindsightRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly engine: MemoryEngineService,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Optional() private readonly policy?: MemoryPolicyService,
  ) {}

  async batch(
    userId: string,
    options: { dryRun?: boolean; afterId?: string; limit?: number } = {},
  ): Promise<HindsightBackfillBatch> {
    const dryRun = options.dryRun ?? true;
    const user = await this.users.findById(userId);
    if (!user) throw new Error('Backfill owner does not exist.');
    if (!this.engine.namespace)
      throw new Error('Backfill requires a configured Hindsight namespace.');
    const shadow = this.engine.modeFor(userId) === 'shadow';
    const namespace = shadow
      ? this.engine.shadowNamespace()
      : this.engine.namespace;

    const bank = dryRun
      ? await this.ledger.findBank(userId, namespace)
      : await this.ledger.ensureBank(
          userId,
          namespace,
          this.engine.bankId(userId, shadow),
        );

    if (!dryRun && !bank)
      throw new Error('Backfill bank is retired or unavailable.');
    const limit = Math.max(1, Math.min(100, options.limit ?? 50));
    const rows = await this.memories.backfillPage(
      userId,
      options.afterId,
      limit,
    );

    const outcomes: HindsightBackfillBatch['outcomes'] = [];

    for (const memory of rows) {
      const retryCursor = outcomes.at(-1)?.legacyId ?? options.afterId ?? null;

      try {
        const sourceMessageIds = [
          ...new Set([
            ...memory.sourceMessageIds,
            ...(memory.source.messageId ? [memory.source.messageId] : []),
          ]),
        ];

        const suppressed = await this.ledger.suppressedMessageIds(
          userId,
          sourceMessageIds,
        );

        if (
          suppressed.length ||
          containsMemoryCredential(memory.content) ||
          !memory.content.trim() ||
          memory.content.length > 8000
        ) {
          outcomes.push({
            legacyId: memory.id,
            status: suppressed.length ? 'suppressed' : 'ineligible',
          });
          continue;
        }

        const existing = bank
          ? await this.ledger.findSource(userId, bank.id, `legacy:${memory.id}`)
          : null;

        if (
          existing &&
          (existing.source.state === 'deleted' ||
            existing.source.kind !== 'import')
        ) {
          outcomes.push({
            legacyId: memory.id,
            status:
              existing.source.state === 'deleted' ? 'withdrawn' : 'corrected',
          });
          continue;
        }

        if (
          existing?.source.legacyUpdatedAt?.getTime() ===
          memory.updatedAt.getTime()
        ) {
          outcomes.push({
            legacyId: memory.id,
            status: 'unchanged',
            sourceId: existing.source.id,
            generation: existing.source.generation,
          });
          continue;
        }

        const envelope = {
          sydiaSource: 1,
          requestedFact: memory.content,
          legacyId: memory.id,
          legacyUpdatedAt: memory.updatedAt.toISOString(),
          userEvidence: memory.content,
          userTimezone: user.timezone,
          provenance: {
            type: memory.source.type,
            messageIds: sourceMessageIds,
            documentId: memory.source.documentId,
          },
          categoryHint: memory.category,
          migratedPinned: memory.pinned,
          permissionQuotes: [] as string[],
        };

        if (dryRun) {
          outcomes.push({
            legacyId: memory.id,
            status: 'eligible',
          });
          continue;
        }

        const evidence = sourceMessageIds.length
          ? await this.conversations.findUserMemoryEvidence(
              userId,
              sourceMessageIds[0]!,
            )
          : null;

        if (this.policy) {
          if (evidence) {
            const review = await this.policy.approveEvidence(
              userId,
              evidence.content,
            );

            envelope.permissionQuotes = review.spans.flatMap(
              ({ permissionQuote }) =>
                permissionQuote ? [permissionQuote] : [],
            );
          }

          const accepted = await this.policy.approveFacts(
            userId,
            JSON.stringify(envelope),
            [
              {
                id: 'legacy',
                text: memory.content,
                type: 'world',
                documentId: null,
                sourceFactIds: [],
                metadata: {},
                occurredStart: null,
                mentionedAt: null,
              },
            ],
          );

          if (!accepted) {
            outcomes.push({ legacyId: memory.id, status: 'ineligible' });
            continue;
          }
        }

        const content = JSON.stringify(envelope);

        const result = await this.ledger.enqueue({
          userId,
          bankId: bank!.id,
          sourceKey: `legacy:${memory.id}`,
          kind: 'import',
          content,
          checksum: memoryChecksum(content),
          sourceMessageIds,
          conversationId: evidence?.conversationId ?? null,
          eventAt: evidence?.createdAt ?? memory.createdAt,
          legacySnapshot: { id: memory.id, updatedAt: memory.updatedAt },
          ...(existing
            ? { expectedGeneration: existing.source.generation }
            : {}),
        });

        outcomes.push({
          legacyId: memory.id,
          status: result.status,
          ...('snapshot' in result
            ? {
                sourceId: result.snapshot.source.id,
                generation: result.snapshot.source.generation,
              }
            : {}),
        });
        if (result.status === 'stale' || result.status === 'unavailable')
          return batchResult({
            dryRun,
            interrupted: true,
            nextCursor: retryCursor,
            outcomes,
          });
      } catch {
        // Preserve completed outcomes and do not advance past failed work.
        // Replaying the same row also recovers a lost enqueue acknowledgement.
        outcomes.push({ legacyId: memory.id, status: 'deferred' });

        return batchResult({
          dryRun,
          interrupted: true,
          nextCursor: retryCursor,
          outcomes,
        });
      }
    }

    return batchResult({
      dryRun,
      interrupted: false,
      nextCursor: rows.length === limit ? rows.at(-1)!.id : null,
      outcomes,
    });
  }
}
