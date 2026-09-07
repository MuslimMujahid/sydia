ALTER TABLE "user"
ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user',
ADD COLUMN "banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "banReason" TEXT,
ADD COLUMN "banExpires" TIMESTAMP(3);

ALTER TABLE "session"
ADD COLUMN "impersonatedBy" TEXT;

ALTER TABLE "assistant_run"
ADD COLUMN "costUsd" DECIMAL(18, 8);

CREATE INDEX "user_role_idx" ON "user"("role");
CREATE INDEX "user_banned_idx" ON "user"("banned");
CREATE INDEX "session_userId_expiresAt_idx" ON "session"("userId", "expiresAt");
CREATE INDEX "assistant_run_model_idx" ON "assistant_run"("model");
