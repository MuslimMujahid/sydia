CREATE TABLE "whatsapp_gateway_state" (
  "id" TEXT NOT NULL DEFAULT 'default', "status" TEXT NOT NULL DEFAULT 'disconnected', "registrationReady" BOOLEAN NOT NULL DEFAULT false, "profileReady" BOOLEAN NOT NULL DEFAULT false, "sendingPaused" BOOLEAN NOT NULL DEFAULT false, "enforcementCode" TEXT, "enforcementReason" TEXT, "recoveryReason" TEXT, "lastConnectedAt" TIMESTAMP(3), "lastEventAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "whatsapp_gateway_state_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "whatsapp_link_code" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "codeHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "consumedByExternalId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "whatsapp_link_code_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_link_code_codeHash_key" ON "whatsapp_link_code"("codeHash");
CREATE INDEX "whatsapp_link_code_userId_expiresAt_idx" ON "whatsapp_link_code"("userId", "expiresAt");
CREATE INDEX "whatsapp_link_code_expiresAt_consumedAt_idx" ON "whatsapp_link_code"("expiresAt", "consumedAt");
ALTER TABLE "whatsapp_link_code" ADD CONSTRAINT "whatsapp_link_code_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_contact_state" (
  "id" TEXT NOT NULL, "externalIdentityId" TEXT NOT NULL, "firstInboundAt" TIMESTAMP(3), "firstResponseAt" TIMESTAMP(3), "optedOutAt" TIMESTAMP(3), "lastInboundAt" TIMESTAMP(3), "lastProactiveSentAt" TIMESTAMP(3), "lastProactiveReplyAt" TIMESTAMP(3), "unansweredProactiveCount" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "whatsapp_contact_state_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_contact_state_externalIdentityId_key" ON "whatsapp_contact_state"("externalIdentityId");
CREATE INDEX "whatsapp_contact_state_optedOutAt_lastProactiveReplyAt_idx" ON "whatsapp_contact_state"("optedOutAt", "lastProactiveReplyAt");
ALTER TABLE "whatsapp_contact_state" ADD CONSTRAINT "whatsapp_contact_state_externalIdentityId_fkey" FOREIGN KEY ("externalIdentityId") REFERENCES "external_identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_inbound_message" (
  "id" TEXT NOT NULL, "provider" TEXT NOT NULL, "providerMessageId" TEXT NOT NULL, "senderExternalId" TEXT NOT NULL, "externalIdentityId" TEXT, "receivedAt" TIMESTAMP(3) NOT NULL, "processedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "whatsapp_inbound_message_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_inbound_message_provider_providerMessageId_key" ON "whatsapp_inbound_message"("provider", "providerMessageId");
CREATE INDEX "whatsapp_inbound_message_senderExternalId_receivedAt_idx" ON "whatsapp_inbound_message"("senderExternalId", "receivedAt");
CREATE INDEX "whatsapp_inbound_message_externalIdentityId_receivedAt_idx" ON "whatsapp_inbound_message"("externalIdentityId", "receivedAt");
ALTER TABLE "whatsapp_inbound_message" ADD CONSTRAINT "whatsapp_inbound_message_externalIdentityId_fkey" FOREIGN KEY ("externalIdentityId") REFERENCES "external_identity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "notification_delivery" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL, "content" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "proactive" BOOLEAN NOT NULL DEFAULT false, "sourceId" TEXT, "providerMessageId" TEXT, "status" TEXT NOT NULL DEFAULT 'pending', "policyOutcome" TEXT, "attemptedAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3), "failedAt" TIMESTAMP(3), "lastError" TEXT, "reminderOccurrenceId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "notification_delivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_delivery_idempotencyKey_key" ON "notification_delivery"("idempotencyKey");
CREATE INDEX "notification_delivery_userId_createdAt_idx" ON "notification_delivery"("userId", "createdAt");
CREATE INDEX "notification_delivery_status_createdAt_idx" ON "notification_delivery"("status", "createdAt");
CREATE INDEX "notification_delivery_proactive_createdAt_idx" ON "notification_delivery"("proactive", "createdAt");
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_reminderOccurrenceId_fkey" FOREIGN KEY ("reminderOccurrenceId") REFERENCES "reminder_occurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "notification_delivery_attempt" (
  "id" TEXT NOT NULL, "deliveryId" TEXT NOT NULL, "attemptNumber" INTEGER NOT NULL, "providerMessageId" TEXT, "status" TEXT NOT NULL, "errorMessage" TEXT, "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deliveredAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "notification_delivery_attempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_delivery_attempt_deliveryId_attemptNumber_key" ON "notification_delivery_attempt"("deliveryId", "attemptNumber");
CREATE INDEX "notification_delivery_attempt_status_attemptedAt_idx" ON "notification_delivery_attempt"("status", "attemptedAt");
ALTER TABLE "notification_delivery_attempt" ADD CONSTRAINT "notification_delivery_attempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "notification_delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_traffic_daily" (
  "id" TEXT NOT NULL, "day" DATE NOT NULL, "inboundCount" INTEGER NOT NULL DEFAULT 0, "outboundCount" INTEGER NOT NULL DEFAULT 0, "proactiveCount" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "whatsapp_traffic_daily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_traffic_daily_day_key" ON "whatsapp_traffic_daily"("day");
CREATE TABLE "whatsapp_outbound_reservation" (
  "id" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "proactive" BOOLEAN NOT NULL DEFAULT false,
  "reservedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_outbound_reservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "whatsapp_outbound_reservation_reservedAt_idx" ON "whatsapp_outbound_reservation"("reservedAt");
CREATE INDEX "whatsapp_outbound_reservation_day_proactive_idx" ON "whatsapp_outbound_reservation"("day", "proactive");

CREATE TABLE "user_preference" (
  "userId" TEXT NOT NULL, "assistantVerbosity" TEXT NOT NULL DEFAULT 'balanced', "assistantStyle" TEXT NOT NULL DEFAULT 'supportive', "briefingEnabled" BOOLEAN NOT NULL DEFAULT false, "briefingTime" TEXT, "webNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true, "whatsappNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true, "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false, "proactivePaused" BOOLEAN NOT NULL DEFAULT false, "retentionDays" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "user_preference_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
