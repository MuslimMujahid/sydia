-- Bound deletion-preview retention without scanning confirmed operations.
CREATE INDEX "file_deletion_operation_status_expiresAt_idx"
ON "file_deletion_operation"("status", "expiresAt");
