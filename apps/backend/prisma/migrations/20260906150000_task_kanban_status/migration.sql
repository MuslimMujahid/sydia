UPDATE "task"
SET "status" = CASE
    WHEN "status" = 'completed' THEN 'done'
    ELSE 'inbox'
END
WHERE "status" IN ('open', 'completed');

ALTER TABLE "task" ALTER COLUMN "status" SET DEFAULT 'inbox';

ALTER TABLE "task"
ADD CONSTRAINT "task_status_check"
CHECK ("status" IN ('inbox', 'doing', 'done', 'cancelled'));
