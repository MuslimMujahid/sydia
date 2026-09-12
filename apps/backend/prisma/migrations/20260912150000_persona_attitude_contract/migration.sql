-- Rename personal_assistant -> professional, friend -> friendly, mentor -> professional, creative_partner -> playful.
CREATE TYPE "AssistantPersona_new" AS ENUM ('professional', 'friendly', 'cheerful', 'calm', 'playful');

ALTER TABLE "user"
  ALTER COLUMN "persona" DROP DEFAULT,
  ALTER COLUMN "persona" TYPE "AssistantPersona_new"
  USING (
    CASE "persona"::text
      WHEN 'personal_assistant' THEN 'professional'
      WHEN 'friend' THEN 'friendly'
      WHEN 'mentor' THEN 'professional'
      WHEN 'creative_partner' THEN 'playful'
      ELSE 'professional'
    END
  )::"AssistantPersona_new",
  ALTER COLUMN "persona" SET DEFAULT 'professional';

DROP TYPE "AssistantPersona";
ALTER TYPE "AssistantPersona_new" RENAME TO "AssistantPersona";
