ALTER TABLE "calendar_watch_channel"
ADD COLUMN "connectionGeneration" INTEGER NOT NULL DEFAULT -1;

CREATE INDEX "calendar_watch_generation_due_idx"
ON "calendar_watch_channel"("bindingId", "connectionGeneration", "state", "expiresAt");
