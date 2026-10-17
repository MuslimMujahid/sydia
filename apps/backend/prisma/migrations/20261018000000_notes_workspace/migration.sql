CREATE TABLE "workspace_item" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('note', 'folder')),
  "title" TEXT NOT NULL CHECK (length(trim("title")) BETWEEN 1 AND 240),
  "parentId" TEXT,
  "content" JSONB NOT NULL,
  "text" TEXT NOT NULL DEFAULT '',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "trashedAt" TIMESTAMP(3),
  "trashBatchId" TEXT,
  "sourceType" TEXT NOT NULL DEFAULT 'dashboard',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_item_owner_id_key" UNIQUE ("userId", "id"),
  CONSTRAINT "workspace_item_parent_owner_fkey" FOREIGN KEY ("userId", "parentId") REFERENCES "workspace_item"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "workspace_item_userId_trashedAt_parentId_idx" ON "workspace_item"("userId", "trashedAt", "parentId");
CREATE INDEX "workspace_item_userId_trashBatchId_idx" ON "workspace_item"("userId", "trashBatchId");
-- Only live siblings participate in uniqueness; root is a real namespace too.
CREATE UNIQUE INDEX "workspace_item_active_sibling_key"
  ON "workspace_item"("userId", COALESCE("parentId", ''), "kind", lower("title"))
  WHERE "trashedAt" IS NULL;
