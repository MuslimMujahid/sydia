CREATE TABLE "note_editor_presence" (
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "ref" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("userId", "ref", "sessionId")
);
CREATE INDEX "note_editor_presence_userId_ref_expiresAt_idx"
ON "note_editor_presence"("userId", "ref", "expiresAt");
