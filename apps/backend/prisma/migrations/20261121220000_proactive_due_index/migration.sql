-- Briefing and task follow-up due index (docs/REMINDER_DUE_INDEX_PLAN.md).
-- CreateTable
CREATE TABLE "proactive_schedule_change" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proactive_schedule_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proactive_schedule" (
    "userId" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proactive_schedule_pkey" PRIMARY KEY ("userId","lane")
);

-- CreateIndex
CREATE INDEX "proactive_schedule_change_lane_userId_idx" ON "proactive_schedule_change"("lane", "userId");

-- CreateIndex
CREATE INDEX "proactive_schedule_lane_dueAt_idx" ON "proactive_schedule"("lane", "dueAt");

-- AddForeignKey
ALTER TABLE "proactive_schedule" ADD CONSTRAINT "proactive_schedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Every change that can move a user's briefing or task follow-up marks the
-- user in the affected lane, so the worker re-schedules them on its next
-- tick. Triggers (not application hooks) make sure no write path can skip it.

-- New accounts, timezone changes and bans affect both lanes.
CREATE FUNCTION proactive_mark_user() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO proactive_schedule_change ("userId", lane)
    VALUES (NEW.id, 'briefing'), (NEW.id, 'follow_up');
  RETURN NULL;
END $$;

CREATE TRIGGER user_proactive_insert AFTER INSERT ON "user"
  FOR EACH ROW EXECUTE FUNCTION proactive_mark_user();
CREATE TRIGGER user_proactive_update AFTER UPDATE OF timezone, banned ON "user"
  FOR EACH ROW
  WHEN (OLD.timezone IS DISTINCT FROM NEW.timezone OR OLD.banned IS DISTINCT FROM NEW.banned)
  EXECUTE FUNCTION proactive_mark_user();

-- Notification preferences (briefing time and days, follow-up interval,
-- channel switches) affect both lanes.
CREATE FUNCTION proactive_mark_preference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO proactive_schedule_change ("userId", lane)
    VALUES (COALESCE(NEW."userId", OLD."userId"), 'briefing'),
           (COALESCE(NEW."userId", OLD."userId"), 'follow_up');
  RETURN NULL;
END $$;

CREATE TRIGGER user_preference_proactive_change
  AFTER INSERT OR UPDATE OR DELETE ON user_preference
  FOR EACH ROW EXECUTE FUNCTION proactive_mark_preference();

-- A conversational pause or resume affects task follow-ups.
CREATE FUNCTION proactive_mark_follow_up_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO proactive_schedule_change ("userId", lane)
    VALUES (COALESCE(NEW."userId", OLD."userId"), 'follow_up');
  RETURN NULL;
END $$;

CREATE TRIGGER assistance_preference_proactive_change
  AFTER INSERT OR UPDATE OR DELETE ON assistance_preference
  FOR EACH ROW EXECUTE FUNCTION proactive_mark_follow_up_row();

-- Tasks decide when a follow-up has something to say. Statement-level with
-- transition tables, so a batch write marks each user once.
CREATE FUNCTION proactive_mark_tasks() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO proactive_schedule_change ("userId", lane)
      SELECT DISTINCT "userId", 'follow_up' FROM changed_new;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO proactive_schedule_change ("userId", lane)
      SELECT "userId", 'follow_up' FROM changed_new
      UNION SELECT "userId", 'follow_up' FROM changed_old;
  ELSE
    INSERT INTO proactive_schedule_change ("userId", lane)
      SELECT DISTINCT "userId", 'follow_up' FROM changed_old;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER task_proactive_insert AFTER INSERT ON task
  REFERENCING NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION proactive_mark_tasks();
CREATE TRIGGER task_proactive_update AFTER UPDATE ON task
  REFERENCING OLD TABLE AS changed_old NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION proactive_mark_tasks();
CREATE TRIGGER task_proactive_delete AFTER DELETE ON task
  REFERENCING OLD TABLE AS changed_old
  FOR EACH STATEMENT EXECUTE FUNCTION proactive_mark_tasks();

-- A message from the user resets the follow-up back-off.
CREATE FUNCTION proactive_mark_user_messages() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO proactive_schedule_change ("userId", lane)
    SELECT DISTINCT "userId", 'follow_up' FROM changed_new WHERE role = 'user';
  RETURN NULL;
END $$;

CREATE TRIGGER message_proactive_insert AFTER INSERT ON message
  REFERENCING NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION proactive_mark_user_messages();

-- Backfill: every account is scheduled on the first tick after deploy.
INSERT INTO proactive_schedule_change ("userId", lane)
  SELECT id, lane FROM "user" CROSS JOIN (VALUES ('briefing'), ('follow_up')) AS lanes(lane);
