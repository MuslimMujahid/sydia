CREATE TABLE "secret_vault_unlock" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secret_vault_unlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "secret_vault_unlock_sessionId_key" ON "secret_vault_unlock"("sessionId");
CREATE INDEX "secret_vault_unlock_userId_expiresAt_idx" ON "secret_vault_unlock"("userId", "expiresAt");

ALTER TABLE "secret_vault_unlock" ADD CONSTRAINT "secret_vault_unlock_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "secret_vault_unlock" ADD CONSTRAINT "secret_vault_unlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
