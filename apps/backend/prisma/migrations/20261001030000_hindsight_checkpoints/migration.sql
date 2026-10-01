CREATE TABLE "hindsight_checkpoint" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "throughMessageId" TEXT,
  "throughCreatedAt" TIMESTAMP(3),
  "pendingMessageId" TEXT,
  "pendingCreatedAt" TIMESTAMP(3),
  "pendingSourceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hindsight_checkpoint_cursor_pair" CHECK (("throughMessageId" IS NULL) = ("throughCreatedAt" IS NULL)),
  CONSTRAINT "hindsight_checkpoint_pending_pair" CHECK (("pendingMessageId" IS NULL) = ("pendingCreatedAt" IS NULL))
);
CREATE UNIQUE INDEX "hindsight_checkpoint_namespace_conversationId_policyVersion_key" ON "hindsight_checkpoint"("namespace", "conversationId", "policyVersion");
CREATE INDEX "hindsight_checkpoint_userId_namespace_idx" ON "hindsight_checkpoint"("userId", "namespace");
