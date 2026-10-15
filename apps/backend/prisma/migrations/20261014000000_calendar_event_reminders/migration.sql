ALTER TABLE "calendar_event" ADD COLUMN "reminderMinutes" INTEGER;
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_reminder_minutes_check" CHECK ("reminderMinutes" IN (10, 15, 30, 60));
CREATE INDEX "calendar_event_reminder_users_idx" ON "calendar_event" ("userId") WHERE "reminderMinutes" IS NOT NULL;
