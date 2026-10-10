-- Legacy Google event rows have no verified account/calendar binding yet.
-- Keep them visible for recovery, but prevent them from being treated as
-- ordinary local events or queued for automatic export.
UPDATE "calendar_event" AS event
SET
  "syncState" = 'reconnect_required',
  "syncErrorCode" = 'legacy_link_unverified'
WHERE event."provider" = 'google'
  AND event."providerEventId" IS NOT NULL
  AND event."syncState" = 'local'
  AND NOT EXISTS (
    SELECT 1
    FROM "calendar_event_link" AS event_link
    WHERE event_link."calendarEventId" = event."id"
  );
