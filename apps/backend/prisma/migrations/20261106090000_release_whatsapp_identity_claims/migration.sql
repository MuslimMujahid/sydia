ALTER TABLE "external_identity" ADD COLUMN "releasedAt" TIMESTAMP(3);

-- Historical WhatsApp identities must not reserve numbers after disconnect,
-- replacement, or the shared-number cutover. Keep their IDs and user ownership.
UPDATE "external_identity" AS identity
SET "releasedAt" = CURRENT_TIMESTAMP
WHERE identity."provider" = 'whatsapp'
  AND NOT EXISTS (
    SELECT 1 FROM "whatsapp_connection" AS connection
    WHERE connection."active"
      AND connection."ownerIdentityId" = identity."id"
  );

DROP INDEX "external_identity_provider_externalId_key";
CREATE INDEX "external_identity_provider_externalId_idx"
  ON "external_identity" ("provider", "externalId");
CREATE UNIQUE INDEX "external_identity_active_provider_externalId_key"
  ON "external_identity" ("provider", "externalId")
  WHERE "releasedAt" IS NULL;
