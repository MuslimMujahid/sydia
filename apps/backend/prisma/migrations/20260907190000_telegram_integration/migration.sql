CREATE TABLE "telegram_link_token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedByExternalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_link_token_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_profile" (
    "id" TEXT NOT NULL,
    "externalIdentityId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_profile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_inbound_message" (
    "id" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "senderExternalId" TEXT NOT NULL,
    "chatExternalId" TEXT NOT NULL,
    "externalIdentityId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_inbound_message_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_link_token_tokenHash_key" ON "telegram_link_token"("tokenHash");
CREATE INDEX "telegram_link_token_userId_expiresAt_idx" ON "telegram_link_token"("userId", "expiresAt");
CREATE INDEX "telegram_link_token_expiresAt_consumedAt_idx" ON "telegram_link_token"("expiresAt", "consumedAt");
CREATE UNIQUE INDEX "telegram_profile_externalIdentityId_key" ON "telegram_profile"("externalIdentityId");
CREATE UNIQUE INDEX "telegram_inbound_message_chatExternalId_providerMessageId_key" ON "telegram_inbound_message"("chatExternalId", "providerMessageId");
CREATE INDEX "telegram_inbound_message_senderExternalId_receivedAt_idx" ON "telegram_inbound_message"("senderExternalId", "receivedAt");
CREATE INDEX "telegram_inbound_message_externalIdentityId_receivedAt_idx" ON "telegram_inbound_message"("externalIdentityId", "receivedAt");

ALTER TABLE "telegram_link_token" ADD CONSTRAINT "telegram_link_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_profile" ADD CONSTRAINT "telegram_profile_externalIdentityId_fkey" FOREIGN KEY ("externalIdentityId") REFERENCES "external_identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_inbound_message" ADD CONSTRAINT "telegram_inbound_message_externalIdentityId_fkey" FOREIGN KEY ("externalIdentityId") REFERENCES "external_identity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
