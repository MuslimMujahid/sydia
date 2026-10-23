# Mayar billing operations

Sydia has one prepaid product: Rp59,000 / 30 days, currently Rp29,000 for both
purchases and renewals. Each account gets one seven-day trial. There are no
message quotas or product rate limits. Original uploaded assets share 10 GB per
account and a 100 MB per-file maximum, measured in decimal bytes.

## Deploy and activate

1. Deploy the additive migration with `bun run --cwd apps/backend db:migrate:deploy`
   and regenerate the client with `bun run --cwd apps/backend db:generate`.
2. Choose one fixed UTC `BACKEND_BILLING_ROLLOUT_AT`, and retain it on every future
   deployment. Existing users' trials start at this instant; later signups start
   at signup. Trials are never extended by restarting, logging in, or rerunning rollout. A rollout instant
   in the future is safe: until it passes, accounts keep their existing access.
3. Build the backend, then run `bun run --cwd apps/backend billing:ops rollout`.
   This initializes real existing users and excludes development chat previews.
   Lazy initialization covers subsequent signups using their original signup time.
4. Validate sandbox first. Create the Membership & SaaS product and its monthly tier in
   the matching Mayar dashboard, then set `MAYAR_MEMBERSHIP_PRODUCT_ID` and
   `MAYAR_MEMBERSHIP_TIER_ID`. Set `MAYAR_ENVIRONMENT=sandbox`, the environment's API
   key and webhook token, and `MAYAR_MERCHANT_ID`. The merchant identifier must match
   **invoice.userId / transaction.user.id**, not the Mayar account ID. The sandbox smoke check below logs
   it as `merchantId`.
5. Set `BACKEND_BILLING_ENFORCEMENT_ENABLED=true`. Enable checkout only after invoice
   and callback validation with `BACKEND_BILLING_CHECKOUT_ENABLED=true`. Both flags
   default to false so deployment does not unexpectedly cut off existing accounts.
6. Register the HTTPS backend URL `/webhooks/billing/mayar` in the matching Mayar
   dashboard. Registration replaces the account's single registered URL: check the
   current destination before replacing it. Do not register automatically at startup.
7. Run the backend **and worker**. Worker billing recovery runs every 30 seconds.
   Provider status checks retry on five-minute deadlines within the shared API budget.
8. For production, use a verified merchant account and production-specific credentials,
   an HTTPS `BACKEND_AUTH_URL`, and `MAYAR_ENVIRONMENT=production`. Never infer the
   environment from the checkout URL; Mayar can use the same shop domain in both modes.

Keep `MAYAR_API_KEY` and `MAYAR_WEBHOOK_TOKEN` server-only. Never log headers, raw
callback bodies, or customer contact data. Callback authentication uses a static
token rather than a body signature, so durable transaction idempotency is essential.

## Verify

- `MAYAR_ENVIRONMENT=sandbox bun run --cwd apps/backend billing:sandbox-smoke`
  creates a synthetic unpaid invoice expiring in 15 minutes, then verifies its
  identifiers, merchant, amount, and transaction linkage. It makes no payment and
  never registers a callback URL. Its customer uses a reserved test email and phone.
- Complete a sandbox payment through the enabled billing page and confirm the real
  `payment.received` event. A Mayar `testing` event is deliberately ignored and is
  not proof of a paid callback. This step needs a supported sandbox payment flow.
- Confirm one receipt and exactly 30 days of paid access, then replay the callback
  and refresh repeatedly. The expiry must not change again.
- Sign up a new account. Once `BACKEND_BILLING_ROLLOUT_AT` is set, onboarding gains a
  fourth "Pilih cara memulai" step: pay now through Mayar or continue on the free trial.
  Onboarding cannot finish for an account whose access already expired until it pays.
  The step is skipped until enforcement is enabled (and when the
  status request fails), so check the browser console if it does not appear.
- Subscribe from `/checkout` (reached from Settings → Langganan, the account menu, or the expiry
  banner): the order summary, then a full-screen "Menyiapkan pembayaran Anda" scene while the
  invoice is created, then the Mayar link in a new tab. The checkout tab verifies the invoice
  every 10 seconds while visible and whenever it regains focus, so access appears as soon as
  Mayar reports the payment, without waiting for the webhook or the five-minute worker retry.
- Verify an expired account can read, download, delete, export, and pay, but cannot
  send AI messages, upload, or change product data. Notification workers record
  `skipped_inactive` and do not send missed notifications in a batch on renewal.
- Development `/chats` uses isolated preview accounts; the authenticated owner's
  access is checked first. To test expiry use a development account with an expired
  trial, then inspect Web, Telegram, and WhatsApp response formats side by side.

Run automated contracts against a dedicated local `sydia_billing_contract` database:

```sh
# Supply BILLING_CONTRACT_DB_URL for this dedicated database; never the app database.
# Run Node directly so Bun does not automatically import developer .env credentials.
cd apps/backend
NODE_ENV=test node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./jest.config.mjs --runInBand --testPathPatterns='billing|mayar'
cd ../..
bun run --cwd apps/frontend test:e2e --config=playwright.entities.config.ts billing.spec.ts
bun run check-types
bun run lint
bun run build
```

The PostgreSQL contract suite truncates only its explicitly guarded dedicated local
database. Ordinary unit tests do not contact Mayar. Browser tests use synthetic API
fixtures and cover desktop/mobile, Indonesian/English, checkout, review, and expiry.

## Resolve failed or ambiguous orders

Use the built `billing:ops` command with the same deployment configuration:

```sh
bun run --cwd apps/backend billing:ops reviews
bun run --cwd apps/backend billing:ops recover
bun run --cwd apps/backend billing:ops backfill-methods
bun run --cwd apps/backend billing:ops link-invoice ORDER_ID INVOICE_ID TRANSACTION_ID ADMIN_USER_ID
bun run --cwd apps/backend billing:ops close-unpaid ORDER_ID ADMIN_USER_ID "Dashboard evidence confirming no payment"
```

After a create timeout, check Mayar's invoice dashboard for the local order reference
in `extraData`. Do not issue another invoice blindly. For a paid invoice, verify the
reference and customer against the order's owner, then link its identifiers. The
command requires an existing admin actor, checks authoritative amount/merchant/status,
and records an audit entry before applying access idempotently.

Close an ambiguous order only after confirming in Mayar that it was not paid and
cannot still be paid. Document the dashboard evidence without personal contact data.
This releases the single unresolved-order restriction so the customer can try again.

Refunds are handled by support in the Mayar dashboard. This release does not expose
a refund endpoint or automatically revoke access based on undocumented refund events.

## Monitor and roll back

- OpenTelemetry counter `sydia.billing.events`, attribute `event`, tracks
  `payment_applied`, `checkout_failed`, `verification_mismatch`, `recovery_failed`,
  `access_denied`, `storage_full`, and `order_review`. Configure the existing metrics
  exporter before relying on exported counters. Structured Nest logs remain available.
- Alert on any verification mismatch or order review; investigate recovery errors
  lasting five minutes and pending orders older than 15 minutes. Check worker health,
  Redis, merchant/environment configuration, then Mayar delivery history. Orders still
  unresolved after 24 hours enter review; creation ambiguity enters review immediately.
- Compare aggregate `AssistantRun.costUsd` and verified `BillingPayment.amount`
  over matching periods to evaluate pooled usage costs. Keep currencies separate and
  account for Mayar fees; webhook net amounts are not reliable settlement revenue.
- Set `BACKEND_BILLING_PRICE_IDR=59000` to end the promotion for new invoices.
  Existing invoices retain their snapshotted amount. Renewals use the displayed price.
- To stop new purchases, set only `BACKEND_BILLING_CHECKOUT_ENABLED=false`. Keep
  payment recovery, credentials, and the callback running so existing payments settle.
  Enforcement can be disabled separately during an incident; this does not delete
  billing history, trial anchors, or paid expiry.
- Abandoned upload reservations remain conservative until the existing durable
  artifact cleanup finishes. Recovery releases reservations for committed assets or
  old cleaned-up uploads. Deleting original assets makes capacity available again.
