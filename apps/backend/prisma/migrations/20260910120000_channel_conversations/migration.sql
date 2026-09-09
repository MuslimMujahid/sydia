CREATE TABLE "channel_conversation" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalIdentityId" TEXT NOT NULL,
  "chatExternalId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "lastInboundAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "channel_conversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_conversation_conversationId_key"
  ON "channel_conversation"("conversationId");
CREATE UNIQUE INDEX "channel_conversation_provider_externalIdentityId_chatExternalId_key"
  ON "channel_conversation"("provider", "externalIdentityId", "chatExternalId");
CREATE INDEX "channel_conversation_provider_lastInboundAt_idx"
  ON "channel_conversation"("provider", "lastInboundAt");

ALTER TABLE "channel_conversation"
  ADD CONSTRAINT "channel_conversation_externalIdentityId_fkey"
  FOREIGN KEY ("externalIdentityId") REFERENCES "external_identity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channel_conversation"
  ADD CONSTRAINT "channel_conversation_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
