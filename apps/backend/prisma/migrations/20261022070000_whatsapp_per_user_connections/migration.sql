-- CreateTable
CREATE TABLE "whatsapp_connection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assistantExternalId" TEXT,
    "ownerExternalId" TEXT,
    "ownerIdentityId" TEXT,
    "ownerVerifiedAt" TIMESTAMP(3),
    "setupPhase" TEXT NOT NULL DEFAULT 'pairing',
    "status" TEXT NOT NULL DEFAULT 'awaiting_pair',
    "reason" TEXT,
    "qrAttemptId" TEXT,
    "qrExpiresAt" TIMESTAMP(3),
    "ownerCodeHash" TEXT,
    "ownerCodeExpiresAt" TIMESTAMP(3),
    "outageId" TEXT,
    "disconnectedAt" TIMESTAMP(3),
    "reconnectAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextReconnectAt" TIMESTAMP(3),
    "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
    "cleanupNeeded" BOOLEAN NOT NULL DEFAULT false,
    "lastConnectedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_connection_inbound" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "senderExternalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "whatsapp_connection_inbound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connection_deviceId_key" ON "whatsapp_connection"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connection_ownerCodeHash_key" ON "whatsapp_connection"("ownerCodeHash");

-- CreateIndex
CREATE INDEX "whatsapp_connection_userId_active_idx" ON "whatsapp_connection"("userId", "active");

-- CreateIndex
CREATE INDEX "whatsapp_connection_active_status_nextReconnectAt_idx" ON "whatsapp_connection"("active", "status", "nextReconnectAt");

-- CreateIndex
CREATE INDEX "whatsapp_connection_inbound_connectionId_status_idx" ON "whatsapp_connection_inbound"("connectionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connection_inbound_connectionId_providerMessageId_key" ON "whatsapp_connection_inbound"("connectionId", "providerMessageId");

-- AddForeignKey
ALTER TABLE "whatsapp_connection" ADD CONSTRAINT "whatsapp_connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_connection_inbound" ADD CONSTRAINT "whatsapp_connection_inbound_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Revoked generations retain their identities as history, but cannot reserve active ownership.
CREATE UNIQUE INDEX "whatsapp_connection_active_user_key" ON "whatsapp_connection" ("userId") WHERE "active";
CREATE UNIQUE INDEX "whatsapp_connection_active_assistant_key" ON "whatsapp_connection" ("assistantExternalId") WHERE "active" AND "assistantExternalId" IS NOT NULL;
CREATE UNIQUE INDEX "whatsapp_connection_active_owner_key" ON "whatsapp_connection" ("ownerExternalId") WHERE "active" AND "ownerExternalId" IS NOT NULL;
ALTER TABLE "whatsapp_connection" ADD CONSTRAINT "whatsapp_distinct_accounts" CHECK ("assistantExternalId" IS NULL OR "ownerExternalId" IS NULL OR "assistantExternalId" <> "ownerExternalId");
