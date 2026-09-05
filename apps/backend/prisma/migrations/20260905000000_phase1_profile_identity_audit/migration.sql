-- Extend Better Auth's user row with application-owned profile preferences.
ALTER TABLE "user"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'id',
  ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;

-- Better Auth 1.7 identifies provider accounts by issuer + account ID.
-- Backfill existing rows before enforcing the required column for safe upgrades.
ALTER TABLE "account" ADD COLUMN "issuer" TEXT;
UPDATE "account" SET "issuer" = "providerId" WHERE "issuer" IS NULL;
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;
CREATE UNIQUE INDEX "account_issuer_accountId_key"
  ON "account"("issuer", "accountId");

-- Application-owned external identities stay separate from Better Auth's account table.
CREATE TABLE "external_identity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_identity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_identity_provider_externalId_key"
  ON "external_identity"("provider", "externalId");
CREATE INDEX "external_identity_userId_idx" ON "external_identity"("userId");

ALTER TABLE "external_identity"
  ADD CONSTRAINT "external_identity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Durable application audit records contain event names and safe structural metadata only.
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_event_userId_createdAt_idx"
  ON "audit_event"("userId", "createdAt");
CREATE INDEX "audit_event_eventType_createdAt_idx"
  ON "audit_event"("eventType", "createdAt");

ALTER TABLE "audit_event"
  ADD CONSTRAINT "audit_event_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
