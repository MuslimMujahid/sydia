import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type {
  DocumentArtifactCleanup,
  IDocumentArtifactCleanupRepository,
} from '../interfaces';

const UPLOAD_LEASE_MS = 5 * 60_000;
const CLEANUP_CLAIM_LEASE_MS = 5 * 60_000;

@Injectable()
export class PrismaDocumentArtifactCleanupRepository implements IDocumentArtifactCleanupRepository {
  constructor(private readonly prisma: PrismaService) {}

  async trackUpload(ownerId: string, storageKey: string): Promise<void> {
    await this.prisma.documentArtifactCleanup.upsert({
      where: { storageKey },
      create: {
        ownerId,
        storageKey,
        uploadLeaseExpiresAt: new Date(Date.now() + UPLOAD_LEASE_MS),
      },
      update: {
        ownerId,
        uploadLeaseExpiresAt: new Date(Date.now() + UPLOAD_LEASE_MS),
      },
    });
  }

  async renewUpload(storageKey: string, leaseExpiresAt: Date): Promise<void> {
    await this.prisma.documentArtifactCleanup.updateMany({
      where: { storageKey, cleanupClaimedAt: null },
      data: { uploadLeaseExpiresAt: leaseExpiresAt },
    });
  }

  async requestCleanup(ownerId: string, storageKey: string): Promise<void> {
    await this.prisma.documentArtifactCleanup.upsert({
      where: { storageKey },
      create: { ownerId, storageKey, cleanupRequestedAt: new Date() },
      update: { cleanupRequestedAt: new Date() },
    });
  }

  async activateUpload(storageKey: string): Promise<void> {
    await this.prisma.documentArtifactCleanup.deleteMany({
      where: { storageKey, cleanupRequestedAt: null },
    });
  }

  async claimOrphaned(
    limit: number,
    expiredBefore: Date,
    claimedAt: Date,
  ): Promise<DocumentArtifactCleanup[]> {
    const staleClaimBefore = new Date(
      claimedAt.getTime() - CLEANUP_CLAIM_LEASE_MS,
    );

    return this.prisma.$queryRaw<DocumentArtifactCleanup[]>(Prisma.sql`
      WITH candidates AS (
        SELECT cleanup."storageKey"
        FROM "document_artifact_cleanup" AS cleanup
        LEFT JOIN "file_asset" AS asset
          ON asset."storageKey" = cleanup."storageKey"
        WHERE asset."id" IS NULL
          AND (
            cleanup."cleanupClaimedAt" IS NULL
            OR cleanup."cleanupClaimedAt" <= ${staleClaimBefore}
          )
          AND (
            cleanup."uploadLeaseExpiresAt" IS NULL
            OR cleanup."uploadLeaseExpiresAt" <= ${expiredBefore}
          )
          AND (
            cleanup."cleanupRequestedAt" IS NOT NULL
            OR cleanup."uploadLeaseExpiresAt" <= ${expiredBefore}
          )
        ORDER BY cleanup."lastAttemptAt" ASC NULLS FIRST, cleanup."createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE OF cleanup SKIP LOCKED
      )
      UPDATE "document_artifact_cleanup" AS cleanup
      SET "cleanupRequestedAt" = COALESCE(cleanup."cleanupRequestedAt", ${claimedAt}),
          "cleanupClaimedAt" = ${claimedAt},
          "uploadLeaseExpiresAt" = NULL,
          "lastAttemptAt" = ${claimedAt}
      FROM candidates
      WHERE cleanup."storageKey" = candidates."storageKey"
      RETURNING cleanup."ownerId", cleanup."storageKey"
    `);
  }

  async recordAttempt(storageKey: string, attemptedAt: Date): Promise<void> {
    await this.prisma.documentArtifactCleanup.updateMany({
      where: { storageKey },
      data: { lastAttemptAt: attemptedAt, cleanupClaimedAt: null },
    });
  }

  async remove(storageKey: string): Promise<void> {
    await this.prisma.documentArtifactCleanup.deleteMany({
      where: { storageKey },
    });
  }
}
