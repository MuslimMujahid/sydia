-- Add durable account/calendar bindings, inbound sync cursors, outbound operations,
-- and OAuth/webhook state. Existing event records remain available during migration.

ALTER TABLE "calendar_integration"
  ADD COLUMN "googleSubject" TEXT,
  ADD COLUMN "googleEmail" TEXT,
  ADD COLUMN "connectionGeneration" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "credentialGeneration" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "credentialLeaseOwner" TEXT,
  ADD COLUMN "credentialLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "activeBindingId" TEXT;

ALTER TABLE "calendar_event"
  ALTER COLUMN "startAt" DROP NOT NULL,
  ALTER COLUMN "endAt" DROP NOT NULL,
  ALTER COLUMN "timezone" DROP NOT NULL,
  ADD COLUMN "allDayStartDate" DATE,
  ADD COLUMN "allDayEndDate" DATE,
  ADD COLUMN "recurrence" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "recurringParentProviderEventId" TEXT,
  ADD COLUMN "originalStartAt" TIMESTAMP(3),
  ADD COLUMN "originalStartDate" DATE,
  ADD COLUMN "syncState" TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
  ADD COLUMN "syncErrorCode" TEXT;

DROP INDEX "calendar_event_userId_provider_providerEventId_key";

ALTER TABLE "calendar_event"
  ADD CONSTRAINT "calendar_event_time_shape_check"
  CHECK (
    (
      "startAt" IS NOT NULL AND "endAt" IS NOT NULL
      AND "allDayStartDate" IS NULL AND "allDayEndDate" IS NULL
      AND "endAt" > "startAt"
    )
    OR
    (
      "startAt" IS NULL AND "endAt" IS NULL
      AND "allDayStartDate" IS NOT NULL AND "allDayEndDate" IS NOT NULL
      AND "allDayEndDate" > "allDayStartDate"
    )
  );

CREATE TABLE "calendar_binding" (
  "id" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "googleSubject" TEXT NOT NULL,
  "calendarId" TEXT NOT NULL,
  "calendarName" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'initializing',
  "queryVersion" TEXT NOT NULL DEFAULT 'events-default-v1',
  "syncToken" TEXT,
  "nextPageToken" TEXT,
  "dirtyRevision" INTEGER NOT NULL DEFAULT 1,
  "syncedRevision" INTEGER NOT NULL DEFAULT 0,
  "pullTargetRevision" INTEGER NOT NULL DEFAULT 0,
  "fullImportGeneration" INTEGER NOT NULL DEFAULT 0,
  "lastSyncedAt" TIMESTAMP(3),
  "nextSyncAt" TIMESTAMP(3),
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "leaseEpoch" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_binding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calendar_event_link" (
  "id" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "calendarEventId" TEXT,
  "googleEventId" TEXT NOT NULL,
  "recurringParentProviderEventId" TEXT,
  "originalStartAt" TIMESTAMP(3),
  "originalStartDate" DATE,
  "etag" TEXT,
  "remoteSnapshot" JSONB,
  "commonSnapshot" JSONB,
  "syncedRevision" INTEGER,
  "lastSeenFullImportGeneration" INTEGER,
  "tombstoneAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_event_link_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calendar_sync_operation" (
  "id" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "calendarEventId" TEXT,
  "operationKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "connectionGeneration" INTEGER NOT NULL,
  "eventRevision" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "baseSnapshot" JSONB,
  "stableGoogleEventId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "firstAttemptAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedUntil" TIMESTAMP(3),
  "claimToken" TEXT,
  "claimEpoch" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_sync_operation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calendar_sync_conflict" (
  "id" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "eventLinkId" TEXT NOT NULL,
  "localRevision" INTEGER NOT NULL,
  "baseSnapshot" JSONB,
  "localSnapshot" JSONB,
  "remoteSnapshot" JSONB,
  "conflictingFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "state" TEXT NOT NULL DEFAULT 'open',
  "resolution" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_sync_conflict_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calendar_watch_channel" (
  "id" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "resourceId" TEXT,
  "resourceUri" TEXT,
  "state" TEXT NOT NULL DEFAULT 'registering',
  "expiresAt" TIMESTAMP(3),
  "lastMessageNumber" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stoppedAt" TIMESTAMP(3),
  CONSTRAINT "calendar_watch_channel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calendar_oauth_request" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "browserNonceHash" TEXT NOT NULL,
  "idTokenNonceHash" TEXT NOT NULL,
  "returnTo" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_oauth_request_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calendar_mutation_receipt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "resultEventId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_mutation_receipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calendar_integration_activeBindingId_key"
  ON "calendar_integration"("activeBindingId");
CREATE INDEX "calendar_event_userId_allDayStartDate_status_idx"
  ON "calendar_event"("userId", "allDayStartDate", "status");
CREATE INDEX "calendar_event_userId_syncState_updatedAt_idx"
  ON "calendar_event"("userId", "syncState", "updatedAt");
CREATE INDEX "calendar_binding_integrationId_state_idx"
  ON "calendar_binding"("integrationId", "state");
CREATE UNIQUE INDEX "calendar_binding_one_active_per_integration_key"
  ON "calendar_binding"("integrationId") WHERE "state" = 'active';
CREATE INDEX "calendar_binding_state_nextSyncAt_idx"
  ON "calendar_binding"("state", "nextSyncAt");
CREATE INDEX "calendar_binding_leaseExpiresAt_idx"
  ON "calendar_binding"("leaseExpiresAt");
CREATE UNIQUE INDEX "calendar_event_link_calendarEventId_key"
  ON "calendar_event_link"("calendarEventId");
CREATE UNIQUE INDEX "calendar_event_link_bindingId_googleEventId_key"
  ON "calendar_event_link"("bindingId", "googleEventId");
CREATE INDEX "calendar_event_link_bindingId_tombstoneAt_idx"
  ON "calendar_event_link"("bindingId", "tombstoneAt");
CREATE INDEX "calendar_event_link_parent_original_at_idx"
  ON "calendar_event_link"("bindingId", "recurringParentProviderEventId", "originalStartAt");
CREATE INDEX "calendar_event_link_parent_original_date_idx"
  ON "calendar_event_link"("bindingId", "recurringParentProviderEventId", "originalStartDate");
CREATE UNIQUE INDEX "calendar_sync_operation_operationKey_key"
  ON "calendar_sync_operation"("operationKey");
CREATE INDEX "calendar_sync_operation_state_nextAttemptAt_idx"
  ON "calendar_sync_operation"("state", "nextAttemptAt");
CREATE INDEX "calendar_sync_operation_bindingId_state_createdAt_idx"
  ON "calendar_sync_operation"("bindingId", "state", "createdAt");
CREATE INDEX "calendar_sync_operation_calendarEventId_eventRevision_idx"
  ON "calendar_sync_operation"("calendarEventId", "eventRevision");
CREATE INDEX "calendar_sync_conflict_bindingId_state_createdAt_idx"
  ON "calendar_sync_conflict"("bindingId", "state", "createdAt");
CREATE INDEX "calendar_sync_conflict_eventLinkId_state_idx"
  ON "calendar_sync_conflict"("eventLinkId", "state");
CREATE UNIQUE INDEX "calendar_watch_channel_channelId_key"
  ON "calendar_watch_channel"("channelId");
CREATE INDEX "calendar_watch_channel_bindingId_state_expiresAt_idx"
  ON "calendar_watch_channel"("bindingId", "state", "expiresAt");
CREATE INDEX "calendar_watch_channel_state_expiresAt_idx"
  ON "calendar_watch_channel"("state", "expiresAt");
CREATE UNIQUE INDEX "calendar_oauth_request_stateHash_key"
  ON "calendar_oauth_request"("stateHash");
CREATE INDEX "calendar_oauth_request_userId_expiresAt_idx"
  ON "calendar_oauth_request"("userId", "expiresAt");
CREATE INDEX "calendar_oauth_request_expiresAt_consumedAt_idx"
  ON "calendar_oauth_request"("expiresAt", "consumedAt");
CREATE UNIQUE INDEX "calendar_mutation_receipt_userId_requestKey_key"
  ON "calendar_mutation_receipt"("userId", "requestKey");
CREATE INDEX "calendar_mutation_receipt_expiresAt_idx"
  ON "calendar_mutation_receipt"("expiresAt");

ALTER TABLE "calendar_binding"
  ADD CONSTRAINT "calendar_binding_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "calendar_integration"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_integration"
  ADD CONSTRAINT "calendar_integration_activeBindingId_fkey"
  FOREIGN KEY ("activeBindingId") REFERENCES "calendar_binding"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calendar_event_link"
  ADD CONSTRAINT "calendar_event_link_bindingId_fkey"
  FOREIGN KEY ("bindingId") REFERENCES "calendar_binding"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_event_link"
  ADD CONSTRAINT "calendar_event_link_calendarEventId_fkey"
  FOREIGN KEY ("calendarEventId") REFERENCES "calendar_event"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calendar_sync_operation"
  ADD CONSTRAINT "calendar_sync_operation_bindingId_fkey"
  FOREIGN KEY ("bindingId") REFERENCES "calendar_binding"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_sync_operation"
  ADD CONSTRAINT "calendar_sync_operation_calendarEventId_fkey"
  FOREIGN KEY ("calendarEventId") REFERENCES "calendar_event"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calendar_sync_conflict"
  ADD CONSTRAINT "calendar_sync_conflict_bindingId_fkey"
  FOREIGN KEY ("bindingId") REFERENCES "calendar_binding"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_sync_conflict"
  ADD CONSTRAINT "calendar_sync_conflict_eventLinkId_fkey"
  FOREIGN KEY ("eventLinkId") REFERENCES "calendar_event_link"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_watch_channel"
  ADD CONSTRAINT "calendar_watch_channel_bindingId_fkey"
  FOREIGN KEY ("bindingId") REFERENCES "calendar_binding"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_oauth_request"
  ADD CONSTRAINT "calendar_oauth_request_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_mutation_receipt"
  ADD CONSTRAINT "calendar_mutation_receipt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Old integrations do not have verified Google account identity or a concrete
-- calendar binding. Preserve their encrypted credentials and events, but require
-- reconnection before the new worker may read or write through them.
UPDATE "calendar_integration"
SET "status" = 'reconnect_required'
WHERE "status" = 'connected';
