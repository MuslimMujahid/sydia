-- CreateTable
CREATE TABLE "whatsapp_delivery_binding" (
    "deliveryId" TEXT NOT NULL,
    "connectionId" TEXT,
    "generation" INTEGER,
    "outageId" TEXT,
    "missedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "payload" JSONB,
    "summarizedAt" TIMESTAMP(3),

    CONSTRAINT "whatsapp_delivery_binding_pkey" PRIMARY KEY ("deliveryId")
);

-- CreateTable
CREATE TABLE "whatsapp_consent" (
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_consent_pkey" PRIMARY KEY ("userId","kind")
);

-- CreateIndex
CREATE INDEX "whatsapp_delivery_binding_connectionId_outageId_summarizedA_idx" ON "whatsapp_delivery_binding"("connectionId", "outageId", "summarizedAt");

-- AddForeignKey
ALTER TABLE "whatsapp_delivery_binding" ADD CONSTRAINT "whatsapp_delivery_binding_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "notification_delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_consent" ADD CONSTRAINT "whatsapp_consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Direct cutover retires legacy authority without deleting product history.
UPDATE "whatsapp_gateway_state" SET "sendingPaused" = true, "recoveryReason" = 'Shared-number integration replaced; connect a personal assistant account.';
UPDATE "whatsapp_link_code" SET "consumedAt" = CURRENT_TIMESTAMP WHERE "consumedAt" IS NULL;
UPDATE "notification_delivery" SET "status" = 'skipped_migration', "policyOutcome" = 'legacy_connection_retired' WHERE "channel" = 'whatsapp' AND "status" IN ('pending', 'failed', 'attempting');
UPDATE "channel_turn" AS t SET "status" = 'cancelled', "cancellationRequestedAt" = CURRENT_TIMESTAMP, "errorMessage" = 'Legacy WhatsApp connection retired.' FROM "channel_conversation" AS c WHERE t."channelConversationId" = c."id" AND c."provider" = 'whatsapp' AND t."status" IN ('queued', 'processing');
