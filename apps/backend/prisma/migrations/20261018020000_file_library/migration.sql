-- AlterTable
ALTER TABLE "document" ADD COLUMN     "deletingOperationId" TEXT,
ADD COLUMN     "folderId" TEXT,
ADD COLUMN     "organizationRevision" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "file_folder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "deletingOperationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_deletion_operation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preview',
    "idempotencyKey" TEXT,
    "selection" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_deletion_operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_deletion_item" (
    "operationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "revision" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL,
    "storageKey" TEXT,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "file_deletion_item_pkey" PRIMARY KEY ("operationId","kind","itemId")
);

-- CreateIndex
CREATE INDEX "file_folder_userId_parentId_idx" ON "file_folder"("userId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "file_folder_userId_id_key" ON "file_folder"("userId", "id");

-- CreateIndex
CREATE INDEX "file_deletion_operation_userId_status_createdAt_idx" ON "file_deletion_operation"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "file_deletion_operation_status_leaseUntil_idx" ON "file_deletion_operation"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "file_deletion_operation_userId_idempotencyKey_key" ON "file_deletion_operation"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "file_deletion_item_operationId_state_kind_depth_idx" ON "file_deletion_item"("operationId", "state", "kind", "depth");

-- CreateIndex
CREATE INDEX "document_userId_folderId_idx" ON "document"("userId", "folderId");

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_userId_folderId_fkey" FOREIGN KEY ("userId", "folderId") REFERENCES "file_folder"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_folder" ADD CONSTRAINT "file_folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_folder" ADD CONSTRAINT "file_folder_userId_parentId_fkey" FOREIGN KEY ("userId", "parentId") REFERENCES "file_folder"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_deletion_operation" ADD CONSTRAINT "file_deletion_operation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_deletion_item" ADD CONSTRAINT "file_deletion_item_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "file_deletion_operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NULL roots participate in sibling uniqueness. The normalized key is produced
-- using NFC + locale-independent lowercasing at the application boundary.
CREATE UNIQUE INDEX file_folder_sibling_name_key
  ON file_folder ("userId", COALESCE("parentId", ''), "normalizedName");
ALTER TABLE file_folder ADD CONSTRAINT file_folder_name_check
  CHECK (char_length(name) BETWEEN 1 AND 255 AND name NOT IN ('.', '..') AND name !~ '[[:cntrl:]/\\]');
ALTER TABLE file_folder ADD CONSTRAINT file_folder_parent_check CHECK ("parentId" IS NULL OR "parentId" <> id);

-- Protect structural writes made by existing document consumers as well as
-- library endpoints. Processing-only writes do not acquire structural locks.
CREATE FUNCTION file_library_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id text; lock_id text; cursor_id text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('files:' || NEW."userId", 0));
  IF TG_TABLE_NAME = 'file_folder' THEN
    parent_id := NEW."parentId";
    IF TG_OP = 'UPDATE' AND OLD."deletingOperationId" IS NOT NULL
      AND (NEW.name IS DISTINCT FROM OLD.name OR NEW."parentId" IS DISTINCT FROM OLD."parentId") THEN
      RAISE EXCEPTION 'file_library_operation_in_progress' USING ERRCODE = '55000';
    END IF;
    cursor_id := parent_id;
    WHILE cursor_id IS NOT NULL LOOP
      IF cursor_id = NEW.id THEN RAISE EXCEPTION 'file_library_cycle' USING ERRCODE = '23514'; END IF;
      SELECT "parentId" INTO cursor_id FROM file_folder WHERE id = cursor_id AND "userId" = NEW."userId";
    END LOOP;
  ELSE
    parent_id := NEW."folderId";
    IF TG_OP = 'UPDATE' AND OLD."deletingOperationId" IS NOT NULL
      AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description OR NEW."folderId" IS DISTINCT FROM OLD."folderId") THEN
      RAISE EXCEPTION 'file_library_operation_in_progress' USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.title IS DISTINCT FROM OLD.title THEN
      NEW."organizationRevision" := OLD."organizationRevision" + 1;
    END IF;
  END IF;
  IF parent_id IS NOT NULL THEN
    SELECT "deletingOperationId" INTO lock_id FROM file_folder WHERE id = parent_id AND "userId" = NEW."userId";
    IF NOT FOUND THEN RAISE EXCEPTION 'file_library_parent_unavailable' USING ERRCODE = '23503'; END IF;
    IF lock_id IS NOT NULL THEN RAISE EXCEPTION 'file_library_operation_in_progress' USING ERRCODE = '55000'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER file_folder_guard BEFORE INSERT OR UPDATE OF name, "parentId" ON file_folder
  FOR EACH ROW EXECUTE FUNCTION file_library_guard();
CREATE TRIGGER document_folder_guard BEFORE INSERT OR UPDATE OF title, description, "folderId" ON document
  FOR EACH ROW EXECUTE FUNCTION file_library_guard();
