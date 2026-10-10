ALTER TABLE "calendar_sync_operation"
  ADD COLUMN "retryBudgetAttempts" INTEGER NOT NULL DEFAULT 0;

UPDATE "calendar_sync_operation"
SET "retryBudgetAttempts" = "attempts";
