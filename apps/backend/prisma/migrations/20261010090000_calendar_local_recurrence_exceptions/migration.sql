ALTER TABLE "calendar_event"
  ADD COLUMN "recurringParentEventId" TEXT,
  ADD COLUMN "recurrenceExceptionKey" TEXT;

CREATE UNIQUE INDEX "calendar_event_recurringParentEventId_recurrenceExceptionKey_key"
  ON "calendar_event"("recurringParentEventId", "recurrenceExceptionKey");
CREATE INDEX "calendar_event_recurringParentEventId_originalStartAt_idx"
  ON "calendar_event"("recurringParentEventId", "originalStartAt");
CREATE INDEX "calendar_event_recurringParentEventId_originalStartDate_idx"
  ON "calendar_event"("recurringParentEventId", "originalStartDate");

ALTER TABLE "calendar_event"
  ADD CONSTRAINT "calendar_event_recurringParentEventId_fkey"
  FOREIGN KEY ("recurringParentEventId") REFERENCES "calendar_event"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
