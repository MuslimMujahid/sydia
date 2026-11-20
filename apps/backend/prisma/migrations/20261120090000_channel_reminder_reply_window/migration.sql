-- A delivered reminder opens a reply window without counting as user activity.
ALTER TABLE "channel_conversation" ADD COLUMN "lastReminderAt" TIMESTAMP(3);
