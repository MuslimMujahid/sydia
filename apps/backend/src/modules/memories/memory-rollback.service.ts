import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  HINDSIGHT_REPOSITORY,
  USER_REPOSITORY,
  type IHindsightRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { EmbeddingsService } from '../../infra/embeddings';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { MemoryArchiveService } from './memory-archive.service';
import { MemoryEngineService } from './memory-engine.service';
import type { MemoryRollback } from '../../database/entities';

export type MemoryRollbackReport = {
  status: 'ready' | 'written' | 'unchanged';
  dryRun: boolean;
  bankId: string;
  namespace: string;
  sourceCount: number;
  factCount: number;
  boundaryChecksum: string;
};

function unavailable(): ApiException {
  return new ApiException({
    code: ErrorCodes.SERVICE_UNAVAILABLE,
    message:
      'Memory rollback could not be verified. Stop memory writes, drain pending delivery, and retry with working memory and embedding services.',
    status: HttpStatus.SERVICE_UNAVAILABLE,
  });
}

function reportRecord(
  record: MemoryRollback,
  status: 'written' | 'unchanged',
  dryRun: boolean,
): MemoryRollbackReport {
  return {
    status,
    dryRun,
    bankId: record.bankId,
    namespace: record.namespace,
    sourceCount: record.sourceCount,
    factCount: record.factCount,
    boundaryChecksum: record.boundaryChecksum,
  };
}

/** Verified export and atomic reconciliation; no persistent second fact engine. */
@Injectable()
export class MemoryRollbackService {
  constructor(
    @Inject(HINDSIGHT_REPOSITORY) private readonly ledger: IHindsightRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly archive: MemoryArchiveService,
    private readonly embeddings: EmbeddingsService,
    private readonly engine: MemoryEngineService,
  ) {}

  async reconcile(
    userId: string,
    options: { dryRun?: boolean } = {},
  ): Promise<MemoryRollbackReport> {
    const dryRun = options.dryRun ?? true;
    if (!this.engine.namespace || !(await this.users.findById(userId)))
      throw unavailable();
    const bankId = this.engine.bankId(userId);
    const existing = await this.ledger.rollbackRecord(userId, bankId);
    if (existing) return reportRecord(existing, 'unchanged', dryRun);
    if (
      this.engine.modeFor(userId) !== 'hindsight' ||
      this.engine.ingestionEnabled
    )
      throw unavailable();

    try {
      const boundary = await this.ledger.rollbackBoundary(userId, bankId);
      if (!boundary) throw unavailable();
      const archive = await this.archive.export(userId, { bankId });
      if (archive.sources.length !== boundary.sources.length)
        throw unavailable();
      const facts = archive.sources.flatMap((source) => {
        const expected = boundary.sources.find(
          ({ id }) => id === source.sourceId,
        );

        if (!expected || expected.generation !== source.generation)
          throw unavailable();

        return source.facts.map((fact) => ({
          sourceId: source.sourceId,
          remoteFactId: fact.id,
          text: fact.text,
          occurredAt: fact.occurredAt,
        }));
      });

      const expectedIds = new Set(
        boundary.sources.flatMap((source) => {
          const latest = source.deliveries.find(
            ({ generation }) => generation === source.generation,
          );

          return source.state === 'active' && latest?.state === 'admitted'
            ? latest.factIds.map((id) => `${source.id}:${id}`)
            : [];
        }),
      );

      if (
        facts.length !== expectedIds.size ||
        facts.some(
          ({ sourceId, remoteFactId }) =>
            !expectedIds.delete(`${sourceId}:${remoteFactId}`),
        )
      )
        throw unavailable();

      const report: MemoryRollbackReport = {
        status: 'ready',
        dryRun,
        bankId,
        namespace: this.engine.namespace,
        sourceCount: boundary.sources.length,
        factCount: facts.length,
        boundaryChecksum: createHash('sha256')
          .update(JSON.stringify(boundary))
          .digest('hex'),
      };

      if (dryRun) return report;
      const vectors = await this.embeddings.embedMany(
        facts.map(({ text }) => text),
      );

      if (
        vectors.length !== facts.length ||
        vectors.some(
          (vector) =>
            !vector ||
            vector.length !== 1536 ||
            vector.some((value) => !Number.isFinite(value)),
        )
      )
        throw unavailable();
      const result = await this.ledger.reconcileRollback({
        userId,
        bankId,
        namespace: this.engine.namespace,
        boundary,
        facts: facts.map((fact, index) => ({
          ...fact,
          embedding: vectors[index]!,
        })),
        embeddingModel: this.embeddings.modelName(),
        embeddingVersion: this.embeddings.version,
      });

      if (!('record' in result)) throw unavailable();

      return reportRecord(result.record, result.status, dryRun);
    } catch {
      throw unavailable();
    }
  }
}
