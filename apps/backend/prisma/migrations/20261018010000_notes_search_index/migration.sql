ALTER TABLE "workspace_item" ADD COLUMN "indexPending" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "workspace_item" ADD COLUMN "indexSignature" TEXT;
CREATE TABLE "workspace_note_chunk" (
  "id" TEXT PRIMARY KEY,
  "workspaceItemId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" vector(1536),
  "embeddingModel" TEXT NOT NULL,
  "embeddingVersion" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  CONSTRAINT "workspace_note_chunk_userId_workspaceItemId_fkey" FOREIGN KEY ("userId", "workspaceItemId") REFERENCES "workspace_item"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "workspace_note_chunk_workspaceItemId_chunkIndex_key" ON "workspace_note_chunk"("workspaceItemId", "chunkIndex");
CREATE INDEX "workspace_note_chunk_userId_idx" ON "workspace_note_chunk"("userId");
