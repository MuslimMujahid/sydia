-- Re-attributes replies recorded before per-step tool data existed, matching
-- allocateStepCosts() in src/shared/activity/usage-features.ts: housekeeping
-- (overhead) tools do not take a share of a reply. Each legacy reply is split
-- evenly across the distinct real features of the tools its run completed, and
-- is chat when there are none. Replies recorded since the feature columns were
-- added carry exact per-step splits and are left alone.
WITH legacy AS (
  SELECT u."id", u."runId"
  FROM "model_usage" u
  WHERE u."stage" = 'assistant.reply'
    AND u."runId" IS NOT NULL
    AND u."createdAt" < (
      SELECT m."finished_at" FROM "_prisma_migrations" m
      WHERE m."migration_name" = '20261114090000_model_usage_features'
    )
), run_features AS (
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
    AND t."assistantRunId" IN (SELECT "runId" FROM legacy)
), real_features AS (
  SELECT "runId", array_agg("feature" ORDER BY "feature") AS features
  FROM run_features
  WHERE "feature" <> 'overhead'
  GROUP BY "runId"
)
UPDATE "model_usage" u SET
  "feature" = CASE
    WHEN cardinality(r.features) = 1 THEN r.features[1]
    ELSE 'chat'
  END,
  "featureCosts" = CASE WHEN cardinality(r.features) > 1 THEN (
    SELECT jsonb_object_agg(f, COALESCE(u."costUsd", 0) / cardinality(r.features))
    FROM unnest(r.features) f
  ) END
FROM legacy l
  LEFT JOIN real_features r ON r."runId" = l."runId"
WHERE u."id" = l."id";
