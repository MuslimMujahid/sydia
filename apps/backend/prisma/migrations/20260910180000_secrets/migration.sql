-- CreateTable
CREATE TABLE "secret" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRevealedAt" TIMESTAMP(3),
    "revealCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "secret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secret_reveal_token" (
    "id" TEXT NOT NULL,
    "secretId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secret_reveal_token_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "secret_userId_updatedAt_idx" ON "secret"("userId", "updatedAt");
CREATE UNIQUE INDEX "secret_reveal_token_tokenHash_key" ON "secret_reveal_token"("tokenHash");
CREATE INDEX "secret_reveal_token_secretId_expiresAt_idx" ON "secret_reveal_token"("secretId", "expiresAt");
CREATE INDEX "secret_reveal_token_userId_expiresAt_idx" ON "secret_reveal_token"("userId", "expiresAt");
CREATE INDEX "secret_reveal_token_expiresAt_consumedAt_idx" ON "secret_reveal_token"("expiresAt", "consumedAt");

ALTER TABLE "secret" ADD CONSTRAINT "secret_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "secret_reveal_token" ADD CONSTRAINT "secret_reveal_token_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "secret"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "secret_reveal_token" ADD CONSTRAINT "secret_reveal_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
