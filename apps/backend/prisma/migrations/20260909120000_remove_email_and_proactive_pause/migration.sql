ALTER TABLE "user_preference" DROP COLUMN "emailNotificationsEnabled";
ALTER TABLE "user_preference" DROP COLUMN "proactivePaused";
ALTER TABLE "user_preference" ALTER COLUMN "briefingEnabled" SET DEFAULT true;
