-- Acquisition, signup, checkout, and payment funnel views.
--
-- Applied by `prisma migrate deploy` with the rest of the schema. Change a view
-- with a new migration: `CREATE OR REPLACE VIEW` handles additive changes,
-- while renaming or reordering columns needs `DROP VIEW` first.
--
-- All cohorts use the Asia/Jakarta calendar week a user signed up in.
-- Visitors are not stored here: read them from the landing analytics tool and
-- divide attributed signups by that tool's unique visitors for the same week.

-- First successful payment per user, regardless of how many renewals follow.
CREATE OR REPLACE VIEW analytics_first_payment AS
SELECT
  o."userId",
  min(o."appliedAt") AS first_paid_at,
  min(o."environment") AS first_environment
FROM billing_order o
WHERE o."status" = 'paid'
  AND o."userId" IS NOT NULL
  AND o."appliedAt" IS NOT NULL
GROUP BY o."userId";

-- Signup cohorts with attribution coverage and 30-day payment conversion.
CREATE OR REPLACE VIEW analytics_signup_cohort AS
SELECT
  date_trunc('week', u."createdAt" AT TIME ZONE 'Asia/Jakarta')::date AS cohort_week,
  count(*) AS signups,
  count(*) FILTER (WHERE a."visitorId" IS NOT NULL) AS attributed_signups,
  count(*) FILTER (WHERE a."visitorId" IS NULL) AS unattributed_signups,
  count(*) FILTER (WHERE a."utmSource" IS NOT NULL) AS campaign_signups,
  count(p."userId") AS paid_anytime,
  count(p."userId") FILTER (
    WHERE p.first_paid_at <= u."createdAt" + interval '30 days'
  ) AS paid_within_30_days,
  round(
    100.0 * count(p."userId") FILTER (
      WHERE p.first_paid_at <= u."createdAt" + interval '30 days'
    ) / nullif(count(*), 0),
    1
  ) AS paid_30d_rate_pct
FROM "user" u
LEFT JOIN user_attribution a ON a."userId" = u.id
LEFT JOIN analytics_first_payment p ON p."userId" = u.id
GROUP BY 1
ORDER BY 1 DESC;

-- Signups by acquisition source; `unattributed` must stay visible, not hidden.
CREATE OR REPLACE VIEW analytics_signups_by_source AS
SELECT
  coalesce(a."utmSource", 'unattributed') AS source,
  coalesce(a."utmMedium", 'unknown') AS medium,
  coalesce(a."utmCampaign", 'unknown') AS campaign,
  date_trunc('week', u."createdAt" AT TIME ZONE 'Asia/Jakarta')::date AS cohort_week,
  count(*) AS signups,
  count(p."userId") AS paid,
  round(100.0 * count(p."userId") / nullif(count(*), 0), 1) AS paid_rate_pct
FROM "user" u
LEFT JOIN user_attribution a ON a."userId" = u.id
LEFT JOIN analytics_first_payment p ON p."userId" = u.id
GROUP BY 1, 2, 3, 4
ORDER BY 4 DESC, 5 DESC;

-- Checkout attempts and payment outcomes per week.
CREATE OR REPLACE VIEW analytics_checkout_funnel AS
SELECT
  date_trunc('week', o."createdAt" AT TIME ZONE 'Asia/Jakarta')::date AS week,
  count(*) AS checkouts_started,
  count(*) FILTER (WHERE o."status" = 'paid') AS orders_paid,
  count(*) FILTER (WHERE o."status" = 'review') AS orders_in_review,
  count(*) FILTER (WHERE o."status" IN ('failed', 'expired')) AS orders_failed,
  round(
    100.0 * count(*) FILTER (WHERE o."status" = 'paid') / nullif(count(*), 0),
    1
  ) AS checkout_to_paid_pct
FROM billing_order o
GROUP BY 1
ORDER BY 1 DESC;

-- Trial cohorts that have already ended, and how many converted to paid.
CREATE OR REPLACE VIEW analytics_trial_to_paid AS
SELECT
  date_trunc('week', b."trialStartsAt" AT TIME ZONE 'Asia/Jakarta')::date AS trial_week,
  count(*) AS trials,
  count(*) FILTER (WHERE b."paidUntil" IS NOT NULL) AS converted,
  round(
    100.0 * count(*) FILTER (WHERE b."paidUntil" IS NOT NULL) / nullif(count(*), 0),
    1
  ) AS conversion_pct
FROM billing_account b
WHERE b."trialEndsAt" < now()
GROUP BY 1
ORDER BY 1 DESC;
