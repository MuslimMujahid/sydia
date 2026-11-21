-- Event reminder due index (docs/REMINDER_DUE_INDEX_PLAN.md).
-- CreateTable
CREATE TABLE "event_reminder_change" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_reminder_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_reminder_schedule" (
    "userId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_reminder_schedule_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "event_reminder_change_userId_idx" ON "event_reminder_change"("userId");

-- CreateIndex
CREATE INDEX "event_reminder_schedule_dueAt_idx" ON "event_reminder_schedule"("dueAt");

-- AddForeignKey
ALTER TABLE "event_reminder_schedule" ADD CONSTRAINT "event_reminder_schedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Every change that can alter a user's event reminders marks that user, so
-- the worker re-schedules them on its next tick. Triggers (not application
-- hooks) make sure no write path, present or future, can skip the mark.
-- Statement-level triggers with transition tables insert one row per user
-- per statement, so a large sync batch stays cheap.

CREATE FUNCTION event_reminder_mark_calendar_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO event_reminder_change ("userId")
      SELECT DISTINCT "userId" FROM changed_new;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO event_reminder_change ("userId")
      SELECT "userId" FROM changed_new UNION SELECT "userId" FROM changed_old;
  ELSE
    INSERT INTO event_reminder_change ("userId")
      SELECT DISTINCT "userId" FROM changed_old;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER calendar_event_reminder_insert AFTER INSERT ON calendar_event
  REFERENCING NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION event_reminder_mark_calendar_event();
CREATE TRIGGER calendar_event_reminder_update AFTER UPDATE ON calendar_event
  REFERENCING OLD TABLE AS changed_old NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION event_reminder_mark_calendar_event();
CREATE TRIGGER calendar_event_reminder_delete AFTER DELETE ON calendar_event
  REFERENCING OLD TABLE AS changed_old
  FOR EACH STATEMENT EXECUTE FUNCTION event_reminder_mark_calendar_event();

-- Google links carry cancelled recurring instances (tombstones) and the
-- binding that groups a series; their owner is found through the binding.
CREATE FUNCTION event_reminder_mark_calendar_event_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO event_reminder_change ("userId")
      SELECT DISTINCT i."userId" FROM changed_new l
        JOIN calendar_binding b ON b.id = l."bindingId"
        JOIN calendar_integration i ON i.id = b."integrationId";
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO event_reminder_change ("userId")
      SELECT DISTINCT i."userId"
        FROM (SELECT "bindingId" FROM changed_new UNION SELECT "bindingId" FROM changed_old) l
        JOIN calendar_binding b ON b.id = l."bindingId"
        JOIN calendar_integration i ON i.id = b."integrationId";
  ELSE
    INSERT INTO event_reminder_change ("userId")
      SELECT DISTINCT i."userId" FROM changed_old l
        JOIN calendar_binding b ON b.id = l."bindingId"
        JOIN calendar_integration i ON i.id = b."integrationId";
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER calendar_event_link_reminder_insert AFTER INSERT ON calendar_event_link
  REFERENCING NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION event_reminder_mark_calendar_event_link();
CREATE TRIGGER calendar_event_link_reminder_update AFTER UPDATE ON calendar_event_link
  REFERENCING OLD TABLE AS changed_old NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION event_reminder_mark_calendar_event_link();
CREATE TRIGGER calendar_event_link_reminder_delete AFTER DELETE ON calendar_event_link
  REFERENCING OLD TABLE AS changed_old
  FOR EACH STATEMENT EXECUTE FUNCTION event_reminder_mark_calendar_event_link();

-- Deleting a binding cascades its links, and by then the link trigger can no
-- longer reach the owner through the binding; mark the owner here instead.
-- Binding and integration updates (sync cursors, tokens, state) do not change
-- what a calendar read returns, so only deletes mark the owner.
CREATE FUNCTION event_reminder_mark_calendar_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO event_reminder_change ("userId")
    SELECT i."userId" FROM calendar_integration i WHERE i.id = OLD."integrationId";
  RETURN NULL;
END $$;

CREATE TRIGGER calendar_binding_reminder_delete
  AFTER DELETE ON calendar_binding
  FOR EACH ROW EXECUTE FUNCTION event_reminder_mark_calendar_binding();

CREATE FUNCTION event_reminder_mark_calendar_integration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO event_reminder_change ("userId")
    VALUES (OLD."userId");
  RETURN NULL;
END $$;

CREATE TRIGGER calendar_integration_reminder_delete
  AFTER DELETE ON calendar_integration
  FOR EACH ROW EXECUTE FUNCTION event_reminder_mark_calendar_integration();

-- All-day reminders fire at midnight in the account timezone.
CREATE FUNCTION event_reminder_mark_user_timezone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO event_reminder_change ("userId") VALUES (NEW.id);
  RETURN NULL;
END $$;

CREATE TRIGGER user_timezone_reminder_change
  AFTER UPDATE OF timezone ON "user"
  FOR EACH ROW WHEN (OLD.timezone IS DISTINCT FROM NEW.timezone)
  EXECUTE FUNCTION event_reminder_mark_user_timezone();

-- Backfill: every user who can have an event reminder is scheduled on the
-- first tick after deploy.
INSERT INTO event_reminder_change ("userId")
  SELECT DISTINCT "userId" FROM calendar_event
  WHERE "reminderMinutes" IS NOT NULL AND status <> 'cancelled';
