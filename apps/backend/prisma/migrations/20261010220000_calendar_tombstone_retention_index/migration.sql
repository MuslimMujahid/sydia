CREATE INDEX "calendar_event_link_retention_idx"
  ON "calendar_event_link" ("tombstoneAt", "id");
