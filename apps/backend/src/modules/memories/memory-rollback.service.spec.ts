import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { MemoryRollbackBoundary } from '../../database/entities';
import type {
  IHindsightRepository,
  IUserRepository,
} from '../../database/interfaces';
import type { EmbeddingsService } from '../../infra/embeddings';
import type { MemoryArchiveService } from './memory-archive.service';
import { MemoryRollbackService } from './memory-rollback.service';
import { MemoryEngineService } from './memory-engine.service';

const boundary: MemoryRollbackBoundary = {
  legacy: [],
  conversations: [],
  sources: [
    {
      id: 'source',
      sourceKey: 'explicit:one',
      kind: 'explicit',
      generation: 1,
      state: 'active',
      checksum: 'checksum',
      eventAt: '2026-09-30T00:00:00Z',
      sourceMessageIds: [],
      legacyMemoryId: null,
      legacyUpdatedAt: null,
      deliveries: [
        {
          id: 'delivery',
          generation: 1,
          state: 'admitted',
          checksum: 'checksum',
          factIds: ['fact'],
        },
      ],
    },
  ],
};

const record = {
  bankId: 'bank',
  userId: 'owner',
  namespace: 'contract',
  boundaryChecksum: 'hash',
  sourceCount: 1,
  factCount: 1,
  createdAt: new Date('2026-09-30T00:00:00Z'),
};

function setup(ingestionEnabled = false) {
  const ledger = {
    rollbackRecord: jest
      .fn<IHindsightRepository['rollbackRecord']>()
      .mockResolvedValue(null),
    rollbackBoundary: jest
      .fn<IHindsightRepository['rollbackBoundary']>()
      .mockResolvedValue(boundary),
    reconcileRollback: jest
      .fn<IHindsightRepository['reconcileRollback']>()
      .mockResolvedValue({ status: 'written', record }),
  };

  const users = {
    findById: jest.fn<IUserRepository['findById']>().mockResolvedValue({
      id: 'owner',
      name: 'Synthetic',
      email: 'owner@example.invalid',
      emailVerified: false,
      image: null,
      role: 'user',
      timezone: 'Asia/Makassar',
      locale: 'id',
      onboardingCompleted: true,
      automaticMemoryEnabled: true,
      persona: 'friendly',
      preferredAddress: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };

  const archive = {
    export: jest.fn<MemoryArchiveService['export']>().mockResolvedValue({
      version: 1,
      sources: [
        {
          sourceId: 'source',
          namespace: 'contract',
          kind: 'explicit',
          generation: 1,
          state: 'active',
          deliveryState: 'admitted',
          sourceMessageIds: [],
          eventAt: boundary.sources[0]!.eventAt,
          input: 'source evidence stays private',
          facts: [
            {
              id: 'fact',
              text: 'The user prefers Indonesian.',
              occurredAt: null,
            },
          ],
        },
      ],
    }),
  };

  const embeddings = {
    embedMany: jest
      .fn<EmbeddingsService['embedMany']>()
      .mockResolvedValue([[1, ...Array<number>(1535).fill(0)]]),
    modelName: () => 'synthetic-vector',
    version: 'v1',
  };

  const engine = new MemoryEngineService(
    new ConfigService({
      BACKEND_MEMORY_ENGINE: 'hindsight',
      BACKEND_HINDSIGHT_NAMESPACE: 'contract',
      BACKEND_HINDSIGHT_INGESTION_ENABLED: ingestionEnabled,
    }),
  );

  const service = new MemoryRollbackService(
    ledger as unknown as IHindsightRepository,
    users as unknown as IUserRepository,
    archive as unknown as MemoryArchiveService,
    embeddings as unknown as EmbeddingsService,
    engine,
  );

  return { service, ledger, users, archive, embeddings, engine };
}

describe('MemoryRollbackService', () => {
  test('dry run verifies the scoped archive without embedding calls, writes, or source text in its report', async () => {
    const { service, ledger, archive, embeddings, engine } = setup();
    const report = await service.reconcile('owner');
    expect(report).toMatchObject({
      status: 'ready',
      dryRun: true,
      sourceCount: 1,
      factCount: 1,
    });
    expect(archive.export).toHaveBeenCalledWith('owner', {
      bankId: engine.bankId('owner'),
    });
    expect(embeddings.embedMany).not.toHaveBeenCalled();
    expect(ledger.reconcileRollback).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain('Indonesian');
    expect(JSON.stringify(report)).not.toContain('evidence');
  });

  test('executes only with a complete embedding set and rechecked ledger boundary', async () => {
    const { service, ledger } = setup();
    expect((await service.reconcile('owner', { dryRun: false })).status).toBe(
      'written',
    );
    expect(ledger.reconcileRollback).toHaveBeenCalledWith(
      expect.objectContaining({
        boundary,
        facts: [
          expect.objectContaining({
            sourceId: 'source',
            remoteFactId: 'fact',
            embedding: expect.arrayContaining([1]),
          }),
        ],
      }),
    );
    ledger.reconcileRollback.mockResolvedValue({ status: 'stale' });
    await expect(
      service.reconcile('owner', { dryRun: false }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  test('missing embeddings or a provider failure cannot commit partial recovered facts', async () => {
    const { service, ledger, embeddings } = setup();
    embeddings.embedMany.mockResolvedValueOnce([null]);
    await expect(
      service.reconcile('owner', { dryRun: false }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    embeddings.embedMany.mockRejectedValueOnce(
      new Error('Private provider payload'),
    );
    await expect(
      service.reconcile('owner', { dryRun: false }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(ledger.reconcileRollback).not.toHaveBeenCalled();
  });

  test('rerun returns the audit without reopening remote storage or overwriting later legacy changes', async () => {
    const { service, ledger, archive, embeddings } = setup();
    ledger.rollbackRecord.mockResolvedValue(record);
    expect((await service.reconcile('owner', { dryRun: false })).status).toBe(
      'unchanged',
    );
    expect(archive.export).not.toHaveBeenCalled();
    expect(embeddings.embedMany).not.toHaveBeenCalled();
    expect(ledger.reconcileRollback).not.toHaveBeenCalled();
  });

  test('requires disabled ingestion and a drained owner-bound bank', async () => {
    const enabled = setup(true);
    await expect(enabled.service.reconcile('owner')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(enabled.ledger.rollbackBoundary).not.toHaveBeenCalled();
    const pending = setup();
    pending.ledger.rollbackBoundary.mockResolvedValue(null);
    await expect(pending.service.reconcile('owner')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(pending.archive.export).not.toHaveBeenCalled();
  });

  test('incomplete or mismatched archive candidates are rejected even in dry run', async () => {
    const { service, archive, ledger } = setup();
    archive.export.mockResolvedValueOnce({ version: 1, sources: [] });
    await expect(service.reconcile('owner')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    const result = await archive.export('owner');
    result.sources[0]!.facts[0]!.id = 'foreign';
    archive.export.mockResolvedValue(result);
    await expect(service.reconcile('owner')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(ledger.reconcileRollback).not.toHaveBeenCalled();
  });
});
