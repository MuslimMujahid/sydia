CREATE TABLE "assistant_action" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "preparedBy" TEXT NOT NULL,
  "offerMessageId" TEXT,
  "behavior" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "targetRef" TEXT NOT NULL,
  "parameters" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "reason" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "deduplicationKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'prepared',
  "statusReason" TEXT,
  "usefulUntil" TIMESTAMP(3) NOT NULL,
  "snoozedUntil" TIMESTAMP(3),
  "acceptedMessageId" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "executionLeaseUntil" TIMESTAMP(3),
  "resultType" TEXT,
  "resultId" TEXT,
  "receiptKey" TEXT,
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assistant_action_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assistant_action_status_check" CHECK ("status" IN ('prepared', 'offered', 'snoozed', 'authorized', 'executing', 'completed', 'dismissed', 'expired', 'invalidated', 'failed')),
  CONSTRAINT "assistant_action_type_check" CHECK ("actionType" IN ('create_task', 'create_reminder', 'create_calendar_event', 'create_note'))
);
CREATE UNIQUE INDEX "assistant_action_userId_deduplicationKey_key" ON "assistant_action"("userId", "deduplicationKey");
CREATE INDEX "assistant_action_userId_conversationId_status_idx" ON "assistant_action"("userId", "conversationId", "status");
CREATE INDEX "assistant_action_userId_behavior_targetRef_idx" ON "assistant_action"("userId", "behavior", "targetRef");
CREATE INDEX "assistant_action_status_snoozedUntil_idx" ON "assistant_action"("status", "snoozedUntil");
ALTER TABLE "assistant_action" ADD CONSTRAINT "assistant_action_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "assistance_preference" (
  "userId" TEXT NOT NULL,
  "pausedAll" BOOLEAN NOT NULL DEFAULT false,
  "pausedUntil" TIMESTAMP(3),
  "pausedBehaviors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "quietStart" TEXT,
  "quietEnd" TEXT,
  "instructionMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assistance_preference_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "assistance_preference_quiet_check" CHECK (("quietStart" IS NULL OR "quietStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND ("quietEnd" IS NULL OR "quietEnd" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
);
ALTER TABLE "assistance_preference" ADD CONSTRAINT "assistance_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
