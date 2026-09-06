CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "automaticMemoryEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "dueAt" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceType" TEXT NOT NULL DEFAULT 'dashboard',
    "sourceMessageId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "recurrence" JSONB,
    "sourceType" TEXT NOT NULL DEFAULT 'dashboard',
    "sourceMessageId" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_occurrence" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "occurrenceAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "providerMessageId" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION,
    "sourceType" TEXT NOT NULL DEFAULT 'dashboard',
    "sourceMessageId" TEXT,
    "sourceDocumentId" TEXT,
    "extractorVersion" TEXT,
    "supersedesId" TEXT,
    "supersededById" TEXT,
    "embedding" vector(1536),
    "embeddingModel" TEXT,
    "embeddingVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_userId_status_dueAt_idx" ON "task"("userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "task_userId_updatedAt_idx" ON "task"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "reminder_userId_status_scheduledAt_idx" ON "reminder"("userId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "reminder_userId_updatedAt_idx" ON "reminder"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_occurrence_idempotencyKey_key" ON "reminder_occurrence"("idempotencyKey");

-- CreateIndex
CREATE INDEX "reminder_occurrence_status_occurrenceAt_idx" ON "reminder_occurrence"("status", "occurrenceAt");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_occurrence_reminderId_occurrenceAt_key" ON "reminder_occurrence"("reminderId", "occurrenceAt");

-- CreateIndex
CREATE INDEX "memory_userId_status_pinned_idx" ON "memory"("userId", "status", "pinned");

-- CreateIndex
CREATE INDEX "memory_userId_updatedAt_idx" ON "memory"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_occurrence" ADD CONSTRAINT "reminder_occurrence_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE INDEX "memory_embedding_hnsw_idx" ON "memory" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "memory_content_search_idx" ON "memory" USING gin (to_tsvector('simple', "content"));
-- AddForeignKey
ALTER TABLE "memory" ADD CONSTRAINT "memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
