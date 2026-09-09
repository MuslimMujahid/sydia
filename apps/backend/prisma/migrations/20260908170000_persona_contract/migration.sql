-- Replace the legacy persona values with the canonical persona contract.
CREATE TYPE "AssistantPersona_new" AS ENUM ('personal_assistant', 'friend', 'mentor', 'creative_partner');

ALTER TABLE "user"
  ALTER COLUMN "persona" DROP DEFAULT,
  ALTER COLUMN "persona" TYPE "AssistantPersona_new"
  USING (
    CASE "persona"::text
      WHEN 'professional' THEN 'personal_assistant'
      WHEN 'casual' THEN 'friend'
      WHEN 'supportive' THEN 'friend'
      WHEN 'firm' THEN 'mentor'
      WHEN 'motivator' THEN 'mentor'
      ELSE 'personal_assistant'
    END
  )::"AssistantPersona_new",
  ALTER COLUMN "persona" SET DEFAULT 'personal_assistant';

DROP TYPE "AssistantPersona";
ALTER TYPE "AssistantPersona_new" RENAME TO "AssistantPersona";

ALTER TABLE "user_preference"
  DROP COLUMN "assistantVerbosity",
  DROP COLUMN "assistantStyle";
