# Acquisition and conversion funnel

How Sydia measures the path from a landing-page visitor to a paying user when
the landing page lives on `sydia.id` and the app lives on `app.sydia.id`.

## Principle

Each stage has one source of truth. Never infer a later stage from a pageview.

| Stage                       | Measured by                                                         | Why                                                             |
| :-------------------------- | :------------------------------------------------------------------ | :-------------------------------------------------------------- |
| Visitors, signup CTA clicks | Landing analytics (Umami/Plausible)                                 | Anonymous traffic is not in the product database                |
| Signups                     | `user` rows and the `account.created` audit event                   | Survives blockers, closed tabs, and email-verification drop-off |
| Checkout started            | `billing_order` rows (created by `POST /billing/checkouts`)         | The order is the intent record                                  |
| Paid                        | `billing_order.status = 'paid'` with `appliedAt` (webhook-verified) | Provider webhook, not a client event                            |
| Trial converted             | `billing_account.paidUntil` after `trialEndsAt`                     | Trial-to-paid is the revenue-relevant rate                      |

## 1. Landing page (`sydia.id`, repo `../sydia-web`)

The landing is the Astro site in the sibling `sydia-web` repository. Two pieces
live there:

**Traffic analytics.** `src/components/Acquisition.astro` renders Umami when
`PUBLIC_UMAMI_SCRIPT_URL` and `PUBLIC_UMAMI_WEBSITE_ID` are set, and restricts
collection with `PUBLIC_UMAMI_DOMAINS` (for example `sydia.id,www.sydia.id`) so
local previews do not pollute the count. Only the landing property counts
visitors — exclude `app.sydia.id` from it, or the same visit is counted twice.

**First-touch handoff.** `src/scripts/acquisition.ts` creates an opaque
`sydia_vid` cookie on the registrable domain (derived from `PUBLIC_APP_URL`, or
`PUBLIC_ATTRIBUTION_COOKIE_DOMAIN`), and decorates every app link with `vid`,
`lp` (landing path), and any `utm_*` parameters. Signup CTA clicks are sent to
Umami as `signup-cta` with the owning section id.

The URL parameters are the primary handoff; the shared cookie is the fallback
for visitors who reach the app directly after visiting the landing. If
production moves to another domain, set `PUBLIC_ATTRIBUTION_COOKIE_DOMAIN` in
the landing environment — the app needs no change.

## 2. App capture (`app.sydia.id`)

`apps/frontend/src/lib/attribution.ts` runs on every client load from the root
route:

1. Reads `vid`, `utm_*`, and `lp` from the URL, plus the `sydia_vid` cookie.
2. Merges into a first-party cookie (`sydia_attribution`, 90 days). A first
   touch wins: a later campaign never overwrites an existing record.
3. Sends the record once a session exists:
   - immediately after email signup (`sign-up.tsx`),
   - after email verification (`verify-email.tsx`),
   - on the first authenticated app load (`_app.tsx`), which covers Google
     signup.
4. Clears the cookie only after the backend confirms storage, and sets
   `sydia_attributed` so the persistent landing cookie does not re-send the
   same record on every load.

Sending is best-effort by design: a failure keeps the cookie and retries on the
next authenticated visit. Analytics must never block or break signup.

The backend stores it through `PUT /users/me/attribution`
(`RecordAttributionService` in `apps/backend/src/modules/users`) into
`user_attribution`. The repository uses `createMany(..., skipDuplicates: true)`
so the first record is immutable. Values are validated and length-capped by
`RecordAttributionDto`; no message or document content is involved.

## 3. Real-time metrics

OpenTelemetry counters feed the existing Prometheus/Grafana stack:

- `sydia.auth.events{event="account.created"}` — registrations.
- `sydia.billing.events{event="checkout_created"}` — checkout attempts.
- `sydia.billing.events{event="payment_applied"}` — successful payments.
- `sydia.billing.events{event="checkout_failed"}` — gateway or invoice failure.
- `sydia.billing.events{event="order_review"}` — ambiguous orders needing an operator.

## 4. Cohort reports

Apply `ops/observability/sql/funnel.sql` to the application database, then point
Grafana (or any SQL client) at these views:

- `analytics_signup_cohort` — weekly signups, attribution coverage, paid within
  30 days, and the conversion rate.
- `analytics_signups_by_source` — signups and paid rate per UTM source, always
  keeping `unattributed` visible.
- `analytics_checkout_funnel` — checkouts started, paid, failed, and in review.
- `analytics_trial_to_paid` — ended trials and how many became paid.

Visitor counts come from the landing analytics tool for the same week:
`signups / unique visitors` is the visit-to-signup rate, and
`paid_within_30_days / signups` is the signup-to-paid rate. Do not divide
today's visitors by today's signups — use weekly cohorts, because payment can
arrive days or weeks after registration.

## 5. Caveats

- **Unattributed is a real cohort.** Ad blockers, Safari's cross-site identifier
  limits, shared links, and direct visits all produce signups without a `vid`.
  Report the attributed rate next to the absolute rate rather than dropping the
  gap.
- **Email verification breaks naive session tracking.** The visitor id lives in
  a 90-day cookie, not in the session, so the verification round-trip does not
  lose it.
- **Consent.** Umami/Plausible are cookie-free; the `sydia_vid` cookie is
  first-party analytics state. If you add PostHog or GA4, gate it on consent for
  EU/UK visitors.
- **Bots.** Filter crawler traffic in the analytics tool; the product database
  has no equivalent noise.
- **`billing_order` includes retries.** `idempotencyKey` prevents duplicate
  orders per attempt but a user may still open several invoices in one term. Use
  the per-user views when the metric is conversion, not volume.
