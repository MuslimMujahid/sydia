-- Retain existing tasks and deadlines while moving active work back to inbox.
UPDATE "task"
SET "status" = 'inbox', "completedAt" = NULL
WHERE "status" = 'doing';

ALTER TABLE "task" DROP CONSTRAINT "task_status_check";
ALTER TABLE "task"
ADD CONSTRAINT "task_status_check"
CHECK ("status" IN ('inbox', 'done', 'cancelled'));
