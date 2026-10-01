-- CreateTable
CREATE TABLE "hindsight_bank" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'active',
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "erasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hindsight_bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hindsight_source" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL DEFAULT 'active',
    "checksum" TEXT NOT NULL,
    "sourceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conversationId" TEXT,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hindsight_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hindsight_delivery" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "documentId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "content" TEXT,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "dispatchStartedAt" TIMESTAMP(3),
    "retainedAt" TIMESTAMP(3),
    "admittedAt" TIMESTAMP(3),
    "erasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hindsight_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hindsight_reference" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "remoteFactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hindsight_reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hindsight_suppression" (
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hindsight_suppression_pkey" PRIMARY KEY ("userId","messageId")
);

-- CreateIndex
CREATE INDEX "hindsight_bank_state_nextAttemptAt_leaseUntil_idx" ON "hindsight_bank"("state", "nextAttemptAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "hindsight_bank_userId_namespace_key" ON "hindsight_bank"("userId", "namespace");

-- CreateIndex
CREATE INDEX "hindsight_source_bankId_state_idx" ON "hindsight_source"("bankId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "hindsight_source_bankId_sourceKey_key" ON "hindsight_source"("bankId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "hindsight_delivery_documentId_key" ON "hindsight_delivery"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "hindsight_delivery_operationId_key" ON "hindsight_delivery"("operationId");

-- CreateIndex
CREATE INDEX "hindsight_delivery_state_updatedAt_idx" ON "hindsight_delivery"("state", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "hindsight_delivery_sourceId_generation_key" ON "hindsight_delivery"("sourceId", "generation");

-- CreateIndex
CREATE INDEX "hindsight_reference_remoteFactId_idx" ON "hindsight_reference"("remoteFactId");

-- CreateIndex
CREATE UNIQUE INDEX "hindsight_reference_deliveryId_remoteFactId_key" ON "hindsight_reference"("deliveryId", "remoteFactId");

-- AddForeignKey
ALTER TABLE "hindsight_source" ADD CONSTRAINT "hindsight_source_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "hindsight_bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hindsight_delivery" ADD CONSTRAINT "hindsight_delivery_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "hindsight_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hindsight_reference" ADD CONSTRAINT "hindsight_reference_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "hindsight_delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Coordination state is finite even when written outside the application.
ALTER TABLE "hindsight_bank"
  ADD CONSTRAINT "hindsight_bank_state_check" CHECK (state IN ('active', 'erasing', 'erased')),
  ADD CONSTRAINT "hindsight_bank_lease_check" CHECK (("leaseToken" IS NULL) = ("leaseUntil" IS NULL)),
  ADD CONSTRAINT "hindsight_bank_attempts_check" CHECK (attempts >= 0);
ALTER TABLE "hindsight_source"
  ADD CONSTRAINT "hindsight_source_state_check" CHECK (state IN ('active', 'deleted')),
  ADD CONSTRAINT "hindsight_source_kind_check" CHECK (kind IN ('explicit', 'automatic', 'import')),
  ADD CONSTRAINT "hindsight_source_generation_check" CHECK (generation > 0),
  ALTER COLUMN "sourceMessageIds" SET NOT NULL;
ALTER TABLE "hindsight_delivery"
  ADD CONSTRAINT "hindsight_delivery_state_check" CHECK (state IN ('pending', 'submitted', 'retained', 'admitted', 'erase_pending', 'erased', 'failed')),
  ADD CONSTRAINT "hindsight_delivery_generation_check" CHECK (generation > 0),
  ADD CONSTRAINT "hindsight_delivery_admission_check" CHECK (state <> 'admitted' OR ("retainedAt" IS NOT NULL AND "admittedAt" IS NOT NULL));

-- Preserve forgetting guarantees when the legacy extractor is retired.
INSERT INTO "hindsight_suppression" ("userId", "messageId", "createdAt")
SELECT "userId", "sourceMessageId", "createdAt" FROM "memory_deletion_marker"
ON CONFLICT DO NOTHING;
