-- First-touch acquisition data for the landing -> signup -> payment funnel.
CREATE TABLE "user_attribution" (
    "userId" TEXT NOT NULL,
    "visitorId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "referrer" TEXT,
    "landingPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_attribution_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "user_attribution_visitorId_idx" ON "user_attribution"("visitorId");
CREATE INDEX "user_attribution_createdAt_idx" ON "user_attribution"("createdAt");

ALTER TABLE "user_attribution" ADD CONSTRAINT "user_attribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
