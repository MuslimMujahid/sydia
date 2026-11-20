-- "Not about this topic" for the rest of one conversation episode (docs/TOPIC_CONTEXT_SPEC.md, TOPIC-DISC-01).

-- CreateTable
CREATE TABLE "topic_suppression" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_suppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topic_suppression_conversationId_createdAt_idx" ON "topic_suppression"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "topic_suppression" ADD CONSTRAINT "topic_suppression_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_suppression" ADD CONSTRAINT "topic_suppression_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
