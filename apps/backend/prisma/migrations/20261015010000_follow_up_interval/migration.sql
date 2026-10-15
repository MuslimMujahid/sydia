ALTER TABLE "user_preference" ADD COLUMN "followUpIntervalMinutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_follow_up_interval_check" CHECK ("followUpIntervalMinutes" IN (30, 60, 120, 180));
