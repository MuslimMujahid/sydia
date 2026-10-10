ALTER TABLE "calendar_watch_channel"
ADD COLUMN "cleanupRequestedAt" TIMESTAMP(3);

CREATE INDEX "calendar_watch_cleanup_pending_idx"
ON "calendar_watch_channel"("cleanupRequestedAt", "expiresAt");
