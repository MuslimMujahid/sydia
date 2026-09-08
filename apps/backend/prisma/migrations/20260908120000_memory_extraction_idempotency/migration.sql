-- Automatic extraction is idempotent per source message without restricting manual tools.
WITH duplicate_sources AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "sourceMessageId"
           ORDER BY "createdAt" DESC, id DESC
         ) AS duplicate_rank
  FROM "memory"
  WHERE "sourceType" = 'automatic' AND "sourceMessageId" IS NOT NULL
)
UPDATE "memory"
SET "sourceMessageId" = NULL
FROM duplicate_sources
WHERE "memory".id = duplicate_sources.id
  AND duplicate_sources.duplicate_rank > 1;

CREATE UNIQUE INDEX "memory_automatic_source_message_key"
ON "memory"("sourceMessageId")
WHERE "sourceType" = 'automatic' AND "sourceMessageId" IS NOT NULL;

ALTER TABLE "memory"
ADD COLUMN "lastRetrievedAt" TIMESTAMP(3),
ADD COLUMN "retrievalCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "memory_user_lifecycle_idx"
ON "memory"("userId", "status", "pinned", "lastRetrievedAt", "updatedAt");
