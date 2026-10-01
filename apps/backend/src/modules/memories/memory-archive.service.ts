import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  HINDSIGHT_REPOSITORY,
  type IHindsightRepository,
} from '../../database/interfaces';
import type { MemorySourceSnapshot } from '../../database/entities';
import {
  HINDSIGHT_GATEWAY,
  type HindsightFact,
  type HindsightGateway,
} from '../../infra/hindsight';
import { ApiException, ErrorCodes } from '../../shared/errors';

export type HindsightMemoryArchive = {
  version: 1;
  sources: Array<{
    sourceId: string;
    namespace: string;
    kind: string;
    generation: number;
    state: string;
    deliveryState: string | null;
    sourceMessageIds: string[];
    eventAt: string;
    /** Review-approved source envelope for active intents; never forgotten content. */
    input: string | null;
    facts: Array<{ id: string; text: string; occurredAt: string | null }>;
  }>;
};

/** Portable current facts and replay inputs; this is not a persistent second corpus. */
@Injectable()
export class MemoryArchiveService {
  constructor(
    @Inject(HINDSIGHT_REPOSITORY) private readonly ledger: IHindsightRepository,
    @Inject(HINDSIGHT_GATEWAY) private readonly gateway: HindsightGateway,
  ) {}

  async export(
    userId: string,
    options?: { bankId: string },
  ): Promise<HindsightMemoryArchive> {
    const archive: HindsightMemoryArchive = { version: 1, sources: [] };
    let afterId: string | undefined;

    try {
      while (true) {
        const page = await this.ledger.ownerSourcePage(userId, afterId, 100);

        for (const snapshot of page) {
          if (options && snapshot.bank.id !== options.bankId) continue;
          const source = snapshot.source;
          const delivery = snapshot.deliveries.find(
            ({ generation }) => generation === source.generation,
          );

          const suppressed = await this.ledger.suppressedMessageIds(
            userId,
            source.sourceMessageIds,
          );

          const active =
            snapshot.bank.state === 'active' &&
            source.state === 'active' &&
            !suppressed.length;

          const current =
            active &&
            delivery &&
            ['pending', 'submitted', 'retained', 'admitted'].includes(
              delivery.state,
            );

          const facts =
            current && delivery.state === 'admitted'
              ? await this.currentFacts(userId, snapshot)
              : [];

          if (current && delivery.state !== 'admitted') {
            const fresh = await this.ledger.snapshot(userId, source.id);
            const latest = fresh?.deliveries.find(
              ({ generation }) => generation === fresh.source.generation,
            );

            if (
              fresh?.bank.state !== 'active' ||
              fresh.source.state !== 'active' ||
              fresh.source.generation !== source.generation ||
              latest?.id !== delivery.id ||
              latest.state !== delivery.state ||
              latest.checksum !== delivery.checksum ||
              (
                await this.ledger.suppressedMessageIds(
                  userId,
                  source.sourceMessageIds,
                )
              ).length
            )
              throw new Error('Memory export intent changed');
          }

          archive.sources.push({
            sourceId: source.id,
            namespace: snapshot.bank.namespace,
            kind: source.kind,
            generation: source.generation,
            state: active ? source.state : 'withdrawn',
            deliveryState: delivery?.state ?? null,
            sourceMessageIds: source.sourceMessageIds,
            eventAt: source.eventAt.toISOString(),
            input: current ? delivery.content : null,
            facts: facts.map(({ id, text, occurredStart, mentionedAt }) => ({
              id,
              text,
              occurredAt: occurredStart ?? mentionedAt,
            })),
          });
        }

        if (page.length < 100) break;
        afterId = page.at(-1)!.source.id;
      }

      return archive;
    } catch {
      // A portable export must never silently omit remote facts or include stale ones.
      throw new ApiException({
        code: ErrorCodes.SERVICE_UNAVAILABLE,
        message:
          'Memory export could not be verified. Retry after pending changes finish or memory storage recovers.',
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    }
  }

  private async currentFacts(
    userId: string,
    snapshot: MemorySourceSnapshot,
  ): Promise<HindsightFact[]> {
    const delivery = snapshot.deliveries.find(
      ({ generation }) => generation === snapshot.source.generation,
    )!;

    const facts: HindsightFact[] = [];
    let total: number | undefined;

    do {
      const page = await this.gateway.listFacts(
        snapshot.bank.id,
        delivery.documentId,
        facts.length,
      );

      if (
        page.total > 200 ||
        (total !== undefined && total !== page.total) ||
        (page.total > facts.length && !page.items.length)
      )
        throw new Error('Memory export pagination changed');
      total = page.total;
      facts.push(...page.items);
      if (
        facts.length > total ||
        new Set(facts.map(({ id }) => id)).size !== facts.length
      )
        throw new Error('Memory export pagination is inconsistent');
    } while (facts.length < total);

    const references = await this.ledger.referencesForDocuments(
      userId,
      snapshot.bank.id,
      [delivery.documentId],
    );

    const current = await this.ledger.snapshot(userId, snapshot.source.id);
    const latest = current?.deliveries.find(
      ({ generation }) => generation === current.source.generation,
    );

    if (
      current?.bank.state !== 'active' ||
      current.source.state !== 'active' ||
      current.source.generation !== snapshot.source.generation ||
      latest?.id !== delivery.id ||
      latest.state !== 'admitted' ||
      references.length !== facts.length ||
      (
        await this.ledger.suppressedMessageIds(
          userId,
          snapshot.source.sourceMessageIds,
        )
      ).length
    )
      throw new Error('Memory export source changed');
    const ids = new Set(
      references.map(({ reference }) => reference.remoteFactId),
    );

    if (
      facts.some(
        ({ id, type, documentId, metadata }) =>
          !ids.has(id) ||
          type !== 'world' ||
          documentId !== delivery.documentId ||
          metadata.sourceId !== snapshot.source.id ||
          metadata.generation !== String(delivery.generation) ||
          metadata.checksum !== delivery.checksum,
      )
    )
      throw new Error('Memory export evidence changed');

    return facts;
  }
}
