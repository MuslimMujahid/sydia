ALTER TABLE "user_preference"
  ADD COLUMN "weeklyBriefingEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "weeklyBriefingDay" INTEGER NOT NULL DEFAULT 1;

-- Keep users who opted out of briefings opted out at rollout.
UPDATE "user_preference" SET "weeklyBriefingEnabled" = "briefingEnabled";

-- ISO weekdays: Monday = 1, Sunday = 7.
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_weekly_briefing_day_check"
  CHECK ("weeklyBriefingDay" BETWEEN 1 AND 7);
