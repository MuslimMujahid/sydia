ALTER TABLE "calendar_binding"
ADD COLUMN "pendingFullImportSyncToken" TEXT,
ADD COLUMN "fullImportFinalizationCursor" TEXT;

CREATE INDEX "calendar_event_link_finalization_idx"
ON "calendar_event_link" ("bindingId", "id")
WHERE "calendarEventId" IS NOT NULL AND "tombstoneAt" IS NULL;
