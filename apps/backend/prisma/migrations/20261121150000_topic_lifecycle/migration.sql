-- Active day of a topic's last status change, for the lifecycle sweep (docs/TOPIC_CONTEXT_SPEC.md, TOPIC-LIFE-01/02).
ALTER TABLE "topic" ADD COLUMN "statusAtActiveDay" INTEGER NOT NULL DEFAULT 0;
