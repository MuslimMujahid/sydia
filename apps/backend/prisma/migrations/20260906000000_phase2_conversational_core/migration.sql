-- Phase 2 conversational history, bounded summaries, assistant runs, and tool audit.
CREATE TABLE "conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "title" TEXT,
    "rollingSummary" TEXT,
    "summaryThroughMessageId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "content" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_summary" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "throughMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_summary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assistant_run" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "inputMessageId" TEXT NOT NULL,
    "assistantMessageId" TEXT,
    "retryOfRunId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "errorMessage" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tool_invocation" (
    "id" TEXT NOT NULL,
    "assistantRunId" TEXT NOT NULL,
    "toolCallId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "arguments" JSONB NOT NULL,
    "result" JSONB,
    "errorMessage" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tool_invocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conversation_userId_lastMessageAt_idx" ON "conversation"("userId", "lastMessageAt");
CREATE UNIQUE INDEX "message_conversationId_providerMessageId_key" ON "message"("conversationId", "providerMessageId");
CREATE UNIQUE INDEX "message_userId_idempotencyKey_key" ON "message"("userId", "idempotencyKey");
CREATE INDEX "message_conversationId_createdAt_idx" ON "message"("conversationId", "createdAt");
CREATE INDEX "conversation_summary_conversationId_createdAt_idx" ON "conversation_summary"("conversationId", "createdAt");
CREATE INDEX "assistant_run_conversationId_createdAt_idx" ON "assistant_run"("conversationId", "createdAt");
CREATE INDEX "assistant_run_inputMessageId_createdAt_idx" ON "assistant_run"("inputMessageId", "createdAt");
CREATE UNIQUE INDEX "tool_invocation_idempotencyKey_key" ON "tool_invocation"("idempotencyKey");
CREATE UNIQUE INDEX "tool_invocation_assistantRunId_toolCallId_key" ON "tool_invocation"("assistantRunId", "toolCallId");
CREATE INDEX "tool_invocation_assistantRunId_createdAt_idx" ON "tool_invocation"("assistantRunId", "createdAt");

ALTER TABLE "conversation" ADD CONSTRAINT "conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message" ADD CONSTRAINT "message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "assistant_run_idempotencyKey_key" ON "assistant_run"("idempotencyKey");
ALTER TABLE "message" ADD CONSTRAINT "message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_summary" ADD CONSTRAINT "conversation_summary_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistant_run" ADD CONSTRAINT "assistant_run_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistant_run" ADD CONSTRAINT "assistant_run_inputMessageId_fkey" FOREIGN KEY ("inputMessageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tool_invocation" ADD CONSTRAINT "tool_invocation_assistantRunId_fkey" FOREIGN KEY ("assistantRunId") REFERENCES "assistant_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
