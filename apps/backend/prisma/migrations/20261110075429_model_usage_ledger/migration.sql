-- CreateTable
CREATE TABLE "model_usage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "job" TEXT,
    "stage" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(18,8),
    "costMissing" BOOLEAN NOT NULL DEFAULT false,
    "conversationId" TEXT,
    "runId" TEXT,

    CONSTRAINT "model_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_usage_snapshot" (
    "source" TEXT NOT NULL,
    "totalUsd" DECIMAL(18,8) NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_usage_snapshot_pkey" PRIMARY KEY ("source")
);

-- CreateIndex
CREATE INDEX "model_usage_createdAt_idx" ON "model_usage"("createdAt");

-- CreateIndex
CREATE INDEX "model_usage_userId_createdAt_idx" ON "model_usage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "model_usage_kind_createdAt_idx" ON "model_usage"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "model_usage" ADD CONSTRAINT "model_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: before the ledger, only main reply generations recorded a cost.
-- Each finished run becomes one message row; a run without a reported cost is
-- marked so the dashboard can show that its total is incomplete.
INSERT INTO "model_usage" (
    "id", "createdAt", "userId", "kind", "stage", "provider", "model", "attempt",
    "status", "inputTokens", "outputTokens", "costUsd", "costMissing",
    "conversationId", "runId"
)
SELECT
    'backfill_' || r."id", r."createdAt", c."userId", 'message', 'assistant.reply',
    r."provider", r."model", 1,
    CASE WHEN r."status" = 'completed' THEN 'ok' ELSE 'failed' END,
    r."inputTokens", r."outputTokens", r."costUsd", r."costUsd" IS NULL,
    r."conversationId", r."id"
FROM "assistant_run" r
JOIN "conversation" c ON c."id" = r."conversationId"
WHERE r."status" IN ('completed', 'failed');
