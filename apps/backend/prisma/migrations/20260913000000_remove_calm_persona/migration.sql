-- Retire the "calm" persona; existing users fall back to the neutral default.
CREATE TYPE "AssistantPersona_new" AS ENUM ('professional', 'friendly', 'cheerful', 'playful');

ALTER TABLE "user"
  ALTER COLUMN "persona" DROP DEFAULT,
  ALTER COLUMN "persona" TYPE "AssistantPersona_new"
  USING (
    CASE "persona"::text
      WHEN 'calm' THEN 'professional'
      ELSE "persona"::text
    END
  )::"AssistantPersona_new",
  ALTER COLUMN "persona" SET DEFAULT 'professional';

DROP TYPE "AssistantPersona";
ALTER TYPE "AssistantPersona_new" RENAME TO "AssistantPersona";
