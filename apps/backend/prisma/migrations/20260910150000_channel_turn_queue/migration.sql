CREATE TABLE "channel_turn" (
  "id" TEXT NOT NULL,
  "channelConversationId" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "message" JSONB NOT NULL,
  "batchKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingStartedAt" TIMESTAMP(3),
  "leaseUntil" TIMESTAMP(3),
  "cancellationRequestedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "channel_turn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_turn_channelConversationId_providerMessageId_key"
  ON "channel_turn"("channelConversationId", "providerMessageId");
CREATE INDEX "channel_turn_channelConversationId_status_availableAt_createdAt_idx"
  ON "channel_turn"("channelConversationId", "status", "availableAt", "createdAt");
CREATE INDEX "channel_turn_status_leaseUntil_idx"
  ON "channel_turn"("status", "leaseUntil");

ALTER TABLE "channel_turn"
  ADD CONSTRAINT "channel_turn_channelConversationId_fkey"
  FOREIGN KEY ("channelConversationId") REFERENCES "channel_conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
