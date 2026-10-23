-- Unknown legacy edit times intentionally remain NULL. Database updatedAt can
-- reflect sync bookkeeping and must not be used as evidence of a user edit.
ALTER TABLE "calendar_event" ADD COLUMN "localEditedAt" TIMESTAMP(3);
ALTER TABLE "calendar_event_link" ADD COLUMN "remoteEditedAt" TIMESTAMP(3);
