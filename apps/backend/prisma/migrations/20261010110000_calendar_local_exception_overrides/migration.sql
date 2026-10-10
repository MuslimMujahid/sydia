ALTER TABLE "calendar_event"
  ADD COLUMN "recurrenceOverrideFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "calendar_event" AS exception
SET "recurrenceOverrideFields" = ARRAY['time']::TEXT[]
FROM "calendar_event" AS series
WHERE exception."recurringParentEventId" = series."id"
  AND (
    (
      exception."originalStartAt" IS NOT NULL
      AND series."startAt" IS NOT NULL
      AND series."endAt" IS NOT NULL
      AND (
        exception."startAt" IS DISTINCT FROM exception."originalStartAt"
        OR exception."endAt" IS DISTINCT FROM
          exception."originalStartAt" + (series."endAt" - series."startAt")
        OR exception."allDayStartDate" IS NOT NULL
        OR exception."allDayEndDate" IS NOT NULL
      )
    )
    OR (
      exception."originalStartDate" IS NOT NULL
      AND series."allDayStartDate" IS NOT NULL
      AND series."allDayEndDate" IS NOT NULL
      AND (
        exception."allDayStartDate" IS DISTINCT FROM exception."originalStartDate"
        OR exception."allDayEndDate" IS DISTINCT FROM
          exception."originalStartDate" + (series."allDayEndDate" - series."allDayStartDate")
        OR exception."startAt" IS NOT NULL
        OR exception."endAt" IS NOT NULL
      )
    )
  );
