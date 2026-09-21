-- pgvector backs the daily note retrieval index. It is already enabled by
-- 20260906035418_phases_3_4; the guard keeps this migration runnable against a
-- database restored without that history.
CREATE EXTENSION IF NOT EXISTS vector;

-- NOTE: "memory_embedding_hnsw_idx" and "memory_user_lifecycle_idx" are
-- created by hand-written migrations (20260906035418_phases_3_4 and
-- 20260908120000_memory_extraction_idempotency) and cannot be expressed in
-- schema.prisma (Prisma has no Hnsw index type). A generated `migrate dev`
-- diff proposes dropping them; that drop was removed here deliberately so
-- deployments keep the vector search and memory lifecycle indexes.

-- CreateTable
CREATE TABLE "daily_note" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT NOT NULL DEFAULT 'dashboard',
    "sourceMessageId" TEXT,
    "indexPending" BOOLEAN NOT NULL DEFAULT true,
    "indexSignature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_note_chunk" (
    "id" TEXT NOT NULL,
    "dailyNoteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "embeddingModel" TEXT,
    "embeddingVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_note_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_note_userId_date_idx" ON "daily_note"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_note_userId_date_key" ON "daily_note"("userId", "date");

-- CreateIndex
CREATE INDEX "daily_note_chunk_userId_date_idx" ON "daily_note_chunk"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_note_chunk_dailyNoteId_chunkIndex_key" ON "daily_note_chunk"("dailyNoteId", "chunkIndex");

-- CreateIndex
-- Hand-written: Prisma cannot express an HNSW index. Daily note retrieval
-- orders by cosine distance inside the owner's date window, so this index is
-- what keeps "what did I write last week" off a sequential scan.
CREATE INDEX "daily_note_chunk_embedding_hnsw_idx" ON "daily_note_chunk" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "daily_note" ADD CONSTRAINT "daily_note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_note_chunk" ADD CONSTRAINT "daily_note_chunk_dailyNoteId_fkey" FOREIGN KEY ("dailyNoteId") REFERENCES "daily_note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
