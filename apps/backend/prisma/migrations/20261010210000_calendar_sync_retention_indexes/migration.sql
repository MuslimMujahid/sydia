CREATE INDEX "calendar_sync_operation_retention_idx"
  ON "calendar_sync_operation" ("state", "updatedAt", "id");
CREATE INDEX "calendar_mutation_receipt_result_expiry_idx"
  ON "calendar_mutation_receipt" ("resultEventId", "expiresAt");
