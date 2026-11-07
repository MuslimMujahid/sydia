# Admin dashboard metrics

`/admin` shows the operational dashboard; `/admin/users` manages accounts. Both require an authenticated administrator. Payment review and audit-log screens and navigation are excluded.

- **Active users:** distinct users with a user message, explicitly recorded successful content write, or file upload in the rolling last 30 days. The inclusive lower boundary is `now - 30 days`; the upper boundary is exclusive. Login, session refresh, profile timestamps, and assistant-only/background changes do not count. Access permission is separately labeled **Diizinkan**.
- **Berlangganan:** users with currently valid verified paid Plus coverage in the configured Mayar environment. Trials and gifts alone do not count. Payment-applied receipts preserve the paid expiry so later gifts cannot revive expired paid coverage.
- **Trial → Plus:** first verified payment since trial start, among accounts whose trial ends in the selected period. This cohort prevents renewals or gifts from becoming conversions. Payments after trial expiry still count; the cohort can mature as users pay later. The comparison uses the previous cohort as observed at that previous period's end.
- **Revenue:** verified payments in the configured environment. Sandbox and production payments are kept separate.
- **Assistant success:** completed / (completed + failed) runs created in the rolling last 24 hours. Queued/running runs are excluded. Missing denominator displays an em dash.
- **Period selection:** 7/30/90 Jakarta calendar days including today so far. Comparisons shift the window by the same number of days, to the same time of day. Activity stays at 30 days and reliability at 24 hours.
- **Feature adoption:** users with recorded direct feature activity in the last 30 days / active users. Historical web writes without existing events cannot be reconstructed. New annotations record successful writes for notes, contacts, calendar and document/file management. Chat-driven adoption is added from completed tool invocations linked to a recent user message.

Aggregation runs in one PostgreSQL statement for a consistent snapshot, cached in each API process for 120 seconds per period. Concurrent requests share one pending aggregation. Failed requests reject, do not cache zeros, and show an error. A failed background refresh leaves the last result visible with a warning. The browser refetches every 120 seconds while open. Admin actions invalidate that process's cache; other processes converge within the TTL.

The index migration `20261107090000_admin_dashboard_indexes` is applied through the normal `bun run db:migrate:deploy` deployment. It adds time/user indexes and an expression index for immutable payment receipt lookup. It does not change existing data. Existing paid orders missing payment-applied receipts fail the aggregation visibly and must be repaired from verified payment evidence rather than estimated from account access expiry.

CSV export paginates all matches in batches of 100, protects formula cells, and fails visibly if export cannot complete. It is capped at 50,000 matches; narrow filters for larger exports. It is a live export rather than a database snapshot, so concurrent changes can affect its results.

## Verification

From `apps/backend`:

```sh
bun run test -- --runInBand --testPathPatterns='admin-dashboard.service|user-activity|prisma-admin.repository|admin.service'
```

SQL contracts require `ADMIN_CONTRACT_DB_URL` pointing to a dedicated local database named `sydia_admin_contract`, with migrations applied. They clear that database's users, payments and audit events. Always acquire the shared test lock for migration/database checks:

```sh
../../scripts/test-lock.sh bun run test -- --runInBand --testPathPatterns=admin-dashboard.live
```

From `apps/frontend`:

```sh
bun run test:e2e -- --config playwright.entities.config.ts admin-dashboard.spec.ts admin-users.spec.ts --workers=1
```
