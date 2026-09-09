ALTER TABLE "user_preference" DROP COLUMN "retentionDays";
ALTER TABLE "user" ALTER COLUMN "automaticMemoryEnabled" SET DEFAULT true;
