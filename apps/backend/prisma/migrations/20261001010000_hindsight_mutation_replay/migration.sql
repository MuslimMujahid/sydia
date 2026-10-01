ALTER TABLE "hindsight_delivery"
  ADD COLUMN "requestKey" TEXT,
  ADD COLUMN "requestFingerprint" TEXT,
  ADD COLUMN "checksum" TEXT NOT NULL DEFAULT '';

-- Existing current generations have authoritative checksums in their source.
UPDATE "hindsight_delivery" AS d SET checksum = s.checksum
FROM "hindsight_source" AS s
WHERE d."sourceId" = s.id AND d.generation = s.generation;

CREATE UNIQUE INDEX "hindsight_delivery_sourceId_requestKey_key"
  ON "hindsight_delivery" ("sourceId", "requestKey");
CREATE INDEX "hindsight_delivery_requestKey_idx" ON "hindsight_delivery" ("requestKey");
