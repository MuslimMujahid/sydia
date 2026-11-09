CREATE TABLE "assistant_plan_revision" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "steps" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_plan_revision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assistant_plan_revision_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assistant_plan_revision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "assistant_run"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "assistant_plan_revision_idempotencyKey_key" ON "assistant_plan_revision"("idempotencyKey");
CREATE UNIQUE INDEX "assistant_plan_revision_conversationId_revision_key" ON "assistant_plan_revision"("conversationId", "revision");
