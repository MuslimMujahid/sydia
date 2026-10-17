-- Persist the automatic retry budget across process restarts.
ALTER TABLE file_deletion_operation ADD COLUMN "workerFailures" INTEGER NOT NULL DEFAULT 0;
