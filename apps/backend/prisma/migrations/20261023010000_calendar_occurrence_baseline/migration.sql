-- Preserve the shared occurrence values while its provider identity is resolved
-- later by the worker. This permits local editing without a live Google call.
ALTER TABLE "calendar_event" ADD COLUMN "occurrenceBaseline" JSONB;
