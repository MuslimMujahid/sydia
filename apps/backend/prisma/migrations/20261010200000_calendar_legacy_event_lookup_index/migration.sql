-- Keep page-level legacy event reconciliation bounded as user calendars grow.
CREATE INDEX CONCURRENTLY "calendar_event_legacy_lookup_idx"
  ON "calendar_event"("userId", "provider", "providerEventId");
