CREATE TABLE "document_artifact_cleanup" (
    "storageKey" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "cleanupRequestedAt" TIMESTAMP(3),
    "cleanupClaimedAt" TIMESTAMP(3),
    "uploadLeaseExpiresAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_artifact_cleanup_pkey" PRIMARY KEY ("storageKey")
);

CREATE INDEX "document_artifact_cleanup_ownerId_idx"
ON "document_artifact_cleanup"("ownerId");

CREATE INDEX "document_artifact_cleanup_cleanupRequestedAt_createdAt_idx"
ON "document_artifact_cleanup"("cleanupRequestedAt", "createdAt");

CREATE INDEX "document_artifact_cleanup_cleanupClaimedAt_uploadLeaseExpiresAt_createdAt_idx"
ON "document_artifact_cleanup"("cleanupClaimedAt", "uploadLeaseExpiresAt", "createdAt");

CREATE INDEX "document_artifact_cleanup_lastAttemptAt_createdAt_idx"
ON "document_artifact_cleanup"("lastAttemptAt", "createdAt");
