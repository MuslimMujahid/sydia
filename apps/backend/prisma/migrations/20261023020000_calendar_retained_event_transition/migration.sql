-- Existing inactive bindings become local without dropping historical links.
-- Preserve recurrence grouping and original identities for later relinking.
UPDATE calendar_event e SET provider = 'local', "syncState" = 'local', "syncErrorCode" = NULL
FROM calendar_event_link l JOIN calendar_binding b ON b.id = l."bindingId"
JOIN calendar_integration i ON i.id = b."integrationId"
WHERE e.id = l."calendarEventId"
  AND (i.status IN ('disconnected', 'disconnecting') OR i."activeBindingId" IS DISTINCT FROM b.id OR b.state = 'disconnected');

-- Queued creates have no provider link yet, but still belong to the old source.
UPDATE calendar_event e SET provider = 'local', "syncState" = 'local', "syncErrorCode" = NULL
FROM calendar_sync_operation o JOIN calendar_binding b ON b.id = o."bindingId"
JOIN calendar_integration i ON i.id = b."integrationId"
WHERE e.id = o."calendarEventId" AND e.provider = 'google'
  AND NOT EXISTS (SELECT 1 FROM calendar_event_link l WHERE l."calendarEventId" = e.id)
  AND (i.status IN ('disconnected', 'disconnecting') OR i."activeBindingId" IS DISTINCT FROM b.id OR b.state = 'disconnected');

UPDATE calendar_sync_operation o SET state = 'paused', "claimToken" = NULL, "claimedUntil" = NULL
FROM calendar_binding b JOIN calendar_integration i ON i.id = b."integrationId"
WHERE o."bindingId" = b.id AND o.state IN ('pending', 'processing')
  AND (i.status IN ('disconnected', 'disconnecting') OR i."activeBindingId" IS DISTINCT FROM b.id OR b.state = 'disconnected');

UPDATE calendar_event child SET
  "recurringParentEventId" = parent.id,
  "recurrenceExceptionKey" = COALESCE(to_char(child."originalStartDate", 'YYYY-MM-DD'), to_char(child."originalStartAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  "recurrenceOverrideFields" = ARRAY['title','description','location','attendees','reminderMinutes','time','status']
FROM calendar_event_link cl, calendar_event_link pl, calendar_event parent
WHERE child.provider = 'local' AND child."recurringParentEventId" IS NULL
  AND cl."calendarEventId" = child.id AND pl."bindingId" = cl."bindingId"
  AND pl."googleEventId" = child."recurringParentProviderEventId" AND parent.id = pl."calendarEventId"
  AND (child."originalStartDate" IS NOT NULL OR child."originalStartAt" IS NOT NULL);

-- Active legacy manual conflicts must be revisited even when Google sends no
-- incremental changes. A fresh import uses the preserved shared snapshots.
UPDATE calendar_binding b SET "syncToken" = NULL, "nextPageToken" = NULL,
  "pendingFullImportSyncToken" = NULL, "fullImportFinalizationCursor" = NULL,
  "nextSyncAt" = CURRENT_TIMESTAMP, "dirtyRevision" = "dirtyRevision" + 1
FROM calendar_integration i WHERE i."activeBindingId" = b.id AND i.status = 'connected'
  AND EXISTS (SELECT 1 FROM calendar_event_link l JOIN calendar_event e ON e.id = l."calendarEventId"
    WHERE l."bindingId" = b.id AND e."syncState" IN ('conflict', 'reconnect_required'));
