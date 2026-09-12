ALTER TABLE "user_preference"
ADD COLUMN "telegramNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "notification_delivery" ADD COLUMN "channel" TEXT;
UPDATE "notification_delivery" SET "channel" = 'whatsapp';
ALTER TABLE "notification_delivery" ALTER COLUMN "channel" SET NOT NULL;

DROP INDEX "notification_delivery_idempotencyKey_key";
CREATE UNIQUE INDEX "notification_delivery_userId_idempotencyKey_channel_key"
ON "notification_delivery"("userId", "idempotencyKey", "channel");
