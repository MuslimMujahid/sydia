-- AlterTable
ALTER TABLE "reminder" ADD COLUMN     "important" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "repeatIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "snoozedFromOccurrenceId" TEXT;

-- AlterTable
ALTER TABLE "reminder_occurrence" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "important" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSentAt" TIMESTAMP(3),
ADD COLUMN     "messagesSent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "message" ADD COLUMN     "metadata" JSONB;

-- Existing delivered occurrences sent exactly one message.
UPDATE "reminder_occurrence"
SET "messagesSent" = 1, "lastSentAt" = COALESCE("deliveredAt", "occurrenceAt")
WHERE "status" = 'delivered';

-- CreateIndex
CREATE INDEX "reminder_occurrence_status_lastSentAt_idx" ON "reminder_occurrence"("status", "lastSentAt");

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_snoozedFromOccurrenceId_fkey" FOREIGN KEY ("snoozedFromOccurrenceId") REFERENCES "reminder_occurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
