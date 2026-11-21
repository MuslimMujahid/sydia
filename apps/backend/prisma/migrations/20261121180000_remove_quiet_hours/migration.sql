-- Quiet hours are no longer a Sydia rule; drop the saved per-user windows.
ALTER TABLE "assistance_preference" DROP CONSTRAINT "assistance_preference_quiet_check";
ALTER TABLE "assistance_preference" DROP COLUMN "quietStart",
DROP COLUMN "quietEnd";
