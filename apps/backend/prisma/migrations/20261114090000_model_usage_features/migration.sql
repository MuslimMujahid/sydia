-- AlterTable
ALTER TABLE "model_usage" ADD COLUMN     "cachedInputTokens" INTEGER,
ADD COLUMN     "feature" TEXT NOT NULL DEFAULT 'other',
ADD COLUMN     "featureCosts" JSONB;

-- CreateIndex
CREATE INDEX "model_usage_feature_createdAt_idx" ON "model_usage"("feature", "createdAt");

-- Backfill: the same rules as usageFeature() in src/shared/activity/usage-features.ts.
UPDATE "model_usage" SET "feature" = CASE
  WHEN "stage" LIKE 'decision.%' THEN 'overhead'
  WHEN "stage" LIKE 'conversation-summary%' THEN 'chat'
  WHEN "stage" LIKE 'media.%' THEN 'chat'
  WHEN "stage" LIKE 'memory%' OR "stage" LIKE 'hindsight%' THEN 'memory'
  WHEN "stage" LIKE 'note%' OR "stage" LIKE 'daily-note%' THEN 'notes'
  WHEN "stage" LIKE 'document%' THEN 'documents'
  WHEN "stage" LIKE 'briefing%' OR "stage" LIKE 'assistant.background%' THEN 'proactive'
  WHEN "job" = 'conversation-summaries' THEN 'chat'
  WHEN "job" = 'memory-dreams' THEN 'memory'
  WHEN "job" = 'documents' THEN 'documents'
  WHEN "job" IN ('note-organizations', 'daily-note-indexes') THEN 'notes'
  WHEN "job" IN ('briefings', 'follow-ups', 'secretary') THEN 'proactive'
  WHEN "job" = 'reminders' THEN 'reminders'
  WHEN "job" IN ('calendar-reminders', 'calendar-sync') THEN 'calendar'
  WHEN "stage" = 'embedding' THEN 'overhead'
  WHEN "kind" = 'message' THEN 'chat'
  ELSE 'other'
END;

-- Replies recorded before per-step tool data existed are split evenly across
-- the features of the tools their run completed (tool rules as
-- TOOL_FEATURE_RULES); replies without tools stay chat.
WITH run_features AS (
  SELECT DISTINCT t."assistantRunId" AS "runId", CASE
    WHEN t."name" ~ '^(update_plan|load_skill|get_current_datetime|get_work_context|respond_to_action)$' THEN 'overhead'
    WHEN t."name" ~ 'reminder' THEN 'reminders'
    WHEN t."name" ~ 'calendar' THEN 'calendar'
    WHEN t."name" ~ 'contact' THEN 'contacts'
    WHEN t."name" ~ 'memor' THEN 'memory'
    WHEN t."name" ~ '(task|categor)' THEN 'tasks'
    WHEN t."name" ~ '(document|attached_files|send_file)' THEN 'documents'
    WHEN t."name" ~ '(note|record|_rows?$|folder)' THEN 'notes'
    WHEN t."name" ~ 'secret' THEN 'other'
    ELSE 'chat'
  END AS "feature"
  FROM "tool_invocation" t
  WHERE t."status" = 'completed'
), counted AS (
  SELECT "runId", array_agg("feature") AS features FROM run_features GROUP BY "runId"
)
UPDATE "model_usage" u SET
  "feature" = CASE WHEN cardinality(c.features) = 1 THEN c.features[1] ELSE u."feature" END,
  "featureCosts" = CASE WHEN cardinality(c.features) > 1 THEN (
    SELECT jsonb_object_agg(f, COALESCE(u."costUsd", 0) / cardinality(c.features)) FROM unnest(c.features) f
  ) END
FROM counted c
WHERE u."runId" = c."runId" AND u."stage" = 'assistant.reply';
