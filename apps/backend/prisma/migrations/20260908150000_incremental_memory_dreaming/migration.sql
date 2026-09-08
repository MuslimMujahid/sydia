DROP INDEX IF EXISTS "memory_automatic_source_message_key";

ALTER TABLE "conversation"
ADD COLUMN "memoryDreamThroughMessageId" TEXT;

ALTER TABLE "memory"
ADD COLUMN "dreamRunId" TEXT,
ADD COLUMN "sourceKey" TEXT;
ALTER TABLE "memory"
ADD COLUMN "sourceMessageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "memory"
SET "sourceMessageIds" = ARRAY["sourceMessageId"]
WHERE "sourceMessageId" IS NOT NULL;

CREATE UNIQUE INDEX "memory_sourceKey_key" ON "memory"("sourceKey");

CREATE TABLE "memory_dream_run" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "throughMessageId" TEXT NOT NULL,
  "dreamerVersion" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "candidateCount" INTEGER NOT NULL DEFAULT 0,
  "mutationCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memory_dream_run_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "memory_dream_run_conversationId_throughMessageId_dreamerVersion_key"
ON "memory_dream_run"("conversationId", "throughMessageId", "dreamerVersion");
CREATE INDEX "memory_dream_run_userId_status_createdAt_idx"
ON "memory_dream_run"("userId", "status", "createdAt");

CREATE TABLE "memory_deletion_marker" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT,
  "sourceMessageId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memory_deletion_marker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "memory_deletion_marker_userId_sourceMessageId_key"
ON "memory_deletion_marker"("userId", "sourceMessageId");
CREATE INDEX "memory_deletion_marker_conversationId_idx"
ON "memory_deletion_marker"("conversationId");

ALTER TABLE "memory_dream_run"
ADD CONSTRAINT "memory_dream_run_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memory_dream_run"
ADD CONSTRAINT "memory_dream_run_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memory_deletion_marker"
ADD CONSTRAINT "memory_deletion_marker_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memory_deletion_marker"
ADD CONSTRAINT "memory_deletion_marker_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Archive was a retrieval-capacity mechanism. Restore archived rows as active;
-- consolidation and bounded retrieval now control corpus size.
UPDATE "memory" SET "status" = 'active' WHERE "status" = 'archived';
