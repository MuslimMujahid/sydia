-- NOTE: "memory_embedding_hnsw_idx" and "memory_user_lifecycle_idx" are
-- created by hand-written migrations (20260906035418_phases_3_4 and
-- 20260908120000_memory_extraction_idempotency) and cannot be expressed in
-- schema.prisma (Prisma has no Hnsw index type). A generated `migrate dev`
-- diff proposes dropping them; that drop was removed here deliberately so
-- deployments keep the vector search and memory lifecycle indexes.

-- AlterTable
ALTER TABLE "channel_conversation" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "channel_turn" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "document" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "notification_delivery" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "user_preference" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "whatsapp_contact_state" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "whatsapp_gateway_state" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "whatsapp_traffic_daily" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- RenameIndex
ALTER INDEX "channel_conversation_provider_externalIdentityId_chatExternalId" RENAME TO "channel_conversation_provider_externalIdentityId_chatExtern_key";

-- RenameIndex
ALTER INDEX "channel_turn_channelConversationId_status_availableAt_createdAt" RENAME TO "channel_turn_channelConversationId_status_availableAt_creat_idx";

-- RenameIndex
ALTER INDEX "memory_dream_run_conversationId_throughMessageId_dreamerVersion" RENAME TO "memory_dream_run_conversationId_throughMessageId_dreamerVer_key";
