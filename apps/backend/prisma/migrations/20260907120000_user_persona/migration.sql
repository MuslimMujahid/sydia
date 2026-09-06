CREATE TYPE "AssistantPersona" AS ENUM ('professional', 'casual', 'supportive', 'firm', 'motivator');
ALTER TABLE "user" ADD COLUMN "persona" "AssistantPersona" NOT NULL DEFAULT 'supportive';
