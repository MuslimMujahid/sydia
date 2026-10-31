CREATE TABLE "note_work" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
 "key" TEXT NOT NULL, "sourceKind" TEXT NOT NULL, "sourceRef" TEXT NOT NULL,
 "sourceVersion" TEXT NOT NULL, "sourceAt" TIMESTAMP(3) NOT NULL,
 "timezone" TEXT NOT NULL, "sourceContent" TEXT NOT NULL, "destinationRef" TEXT,
 "stage" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "payload" JSONB NOT NULL,
 "result" JSONB, "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastErrorCode" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "note_work_userId_key_key" ON "note_work"("userId", "key");
CREATE INDEX "note_work_status_nextAttemptAt_idx" ON "note_work"("status", "nextAttemptAt");
CREATE INDEX "note_work_userId_sourceKind_sourceRef_idx" ON "note_work"("userId", "sourceKind", "sourceRef");
