CREATE TABLE "hindsight_rollback" (
  "bankId" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "boundaryChecksum" TEXT NOT NULL,
  "sourceCount" INTEGER NOT NULL,
  "factCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hindsight_rollback_counts" CHECK ("sourceCount" >= 0 AND "factCount" >= 0)
);
CREATE INDEX "hindsight_rollback_userId_idx" ON "hindsight_rollback"("userId");
