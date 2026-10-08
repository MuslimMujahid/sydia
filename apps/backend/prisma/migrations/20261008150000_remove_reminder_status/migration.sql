-- Retire reminders already stopped under the old lifecycle before removing it.
-- Otherwise old cancelled or completed recurring reminders would look active again.
DELETE FROM "reminder" WHERE "status" <> 'scheduled';

DROP INDEX "reminder_userId_status_scheduledAt_idx";
ALTER TABLE "reminder"
  DROP COLUMN "status",
  DROP COLUMN "completedAt",
  DROP COLUMN "cancelledAt";
CREATE INDEX "reminder_userId_scheduledAt_idx" ON "reminder"("userId", "scheduledAt");
