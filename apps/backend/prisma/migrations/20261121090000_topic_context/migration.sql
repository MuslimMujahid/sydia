-- Implicit topics per user (docs/TOPIC_CONTEXT_SPEC.md, phase 1).

-- CreateTable
CREATE TABLE "topic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "dismissedReason" TEXT,
    "salience" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "salienceAtActiveDay" INTEGER NOT NULL DEFAULT 0,
    "gateCutoffOffset" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gateOffsetAtActiveDay" INTEGER NOT NULL DEFAULT 0,
    "episodeCount" INTEGER NOT NULL DEFAULT 1,
    "lastEpisodeKey" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_claim" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "explicit" BOOLEAN NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_link" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "topic_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_event" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "episodeKey" TEXT NOT NULL,
    "conversationId" TEXT,
    "activeDay" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_conversation_state" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "processedThroughAt" TIMESTAMP(3),
    "episodeKey" TEXT NOT NULL,
    "episodeStartedAt" TIMESTAMP(3) NOT NULL,
    "lastUserMessageAt" TIMESTAMP(3) NOT NULL,
    "currentTopicId" TEXT,
    "noneStreak" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_conversation_state_pkey" PRIMARY KEY ("conversationId")
);

-- CreateTable
CREATE TABLE "topic_user_state" (
    "userId" TEXT NOT NULL,
    "activeDays" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDay" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_user_state_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "topic_recognition_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "candidates" JSONB NOT NULL,
    "choice" TEXT,
    "confidence" DOUBLE PRECISION,
    "accepted" BOOLEAN NOT NULL,
    "assignedTopicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_recognition_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topic_userId_status_idx" ON "topic"("userId", "status");

-- CreateIndex
CREATE INDEX "topic_claim_topicId_kind_createdAt_idx" ON "topic_claim"("topicId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "topic_claim_messageId_idx" ON "topic_claim"("messageId");

-- CreateIndex
CREATE INDEX "topic_link_itemType_itemId_idx" ON "topic_link"("itemType", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "topic_link_topicId_itemType_itemId_key" ON "topic_link"("topicId", "itemType", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "topic_event_topicId_episodeKey_kind_key" ON "topic_event"("topicId", "episodeKey", "kind");

-- CreateIndex
CREATE INDEX "topic_conversation_state_userId_idx" ON "topic_conversation_state"("userId");

-- CreateIndex
CREATE INDEX "topic_recognition_log_userId_createdAt_idx" ON "topic_recognition_log"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "topic_recognition_log_messageId_key" ON "topic_recognition_log"("messageId");

-- AddForeignKey
ALTER TABLE "topic" ADD CONSTRAINT "topic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_claim" ADD CONSTRAINT "topic_claim_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_claim" ADD CONSTRAINT "topic_claim_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_link" ADD CONSTRAINT "topic_link_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_event" ADD CONSTRAINT "topic_event_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_event" ADD CONSTRAINT "topic_event_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_conversation_state" ADD CONSTRAINT "topic_conversation_state_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_user_state" ADD CONSTRAINT "topic_user_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_recognition_log" ADD CONSTRAINT "topic_recognition_log_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_recognition_log" ADD CONSTRAINT "topic_recognition_log_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
