ALTER TABLE "hindsight_source"
  ADD COLUMN "legacyMemoryId" TEXT,
  ADD COLUMN "legacyUpdatedAt" TIMESTAMP(3);
ALTER TABLE "hindsight_source" ADD CONSTRAINT "hindsight_source_legacy_guard_pair"
  CHECK (("legacyMemoryId" IS NULL) = ("legacyUpdatedAt" IS NULL));
CREATE INDEX "hindsight_source_legacyMemoryId_idx" ON "hindsight_source"("legacyMemoryId");
