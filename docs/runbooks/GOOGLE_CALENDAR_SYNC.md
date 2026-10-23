# Google Calendar sync operations runbook

> Behavior update: [uninterrupted editing specification](../GOOGLE_CALENDAR_SYNC_SPEC.md) supersedes the older read-only/copy and manual-conflict descriptions below. Settings uses the existing off/on toggle. Deploy all three 23 October calendar migrations before running the updated API/worker; they add edit clocks, deferred occurrence baselines, and transition inactive events while preserving source identity. Automatic decisions retain recovery history, accessible through the calendar toolbar. Restoring a saved version creates a local event and never writes it back to Google automatically.

Status: Draft; validate against staging before production use.

This runbook applies to the optional Google Calendar integration. It assumes
the HTTP backend and the combined background worker use the same PostgreSQL,
Redis, OAuth configuration, token-encryption key, and
`BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED` value.

For account setup, exact callback/webhook configuration, and manual provider
checks, use [the staging checklist](./GOOGLE_CALENDAR_STAGING_CHECKLIST.md).

## Shared controls

The calendar status endpoint reports `available`, `connectionStatus`,
`bindingState`, `lastSyncedAt`, `lastErrorCode`, and pending operation count to
the signed-in user. Use that status together with redacted backend logs and
Google Cloud quota data. Do not put user IDs, event content, guest addresses,
OAuth codes, access tokens, or refresh tokens into metric labels or tickets.

To suspend sync, set `BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED=false` on the HTTP
backend and every worker replica, then restart those processes. The Settings →
Integrations state reports Google Calendar as unavailable. Calendar worker
jobs stop before claiming work or calling Google; periodic recovery becomes a
no-op. Durable operations and binding checkpoints stay in PostgreSQL. Jobs
already sent to Google before the restart cannot be recalled. Explicit user
disconnect remains callable and attempts token revocation; remote watch
cleanup is skipped while sync is disabled. The integration and active binding
are fenced before any provider request. If token revocation fails, the endpoint
returns `connectionStatus: "disconnecting"` with `cleanupPending: true`, keeps
the encrypted credentials, and leaves sync suspended. The user can retry from
Integrations; a successful retry clears the credentials and completes the
disconnect.

To resume, correct the underlying issue, set the flag to `true` consistently
on the HTTP backend and all workers, and restart them. The 30-second recovery
scheduler re-enqueues due Postgres work. Check pending-operation counts,
binding freshness, and redacted logs as the backlog drains. Do not delete
outbox rows, reset retry counters, or change lease fields by hand.

When enabling, all of the following must be valid: Google client ID, client
secret, absolute HTTP(S) redirect URL, Redis, Postgres, token-encryption
configuration, webhook URL if push notifications are used, and quota/retry
limits. Missing OAuth settings and an invalid redirect URL fail backend
startup. Keep credentials in server-side secret storage.

## Legacy credential migration

The new runtime decrypts only authenticated `v1` ciphertext. Complete this
procedure before enabling calendar sync for a database that may contain older
plaintext token fields:

1. Back up the target database and build the release artifact that will contain
   the credential migration command. Do not roll out its strict-decryption
   runtime yet. The previous runtime can read `v1` ciphertext and leaves legacy
   plaintext fields readable, so the migration command can safely run while the
   previous application version is serving traffic.
2. Set `BACKEND_TOKEN_ENCRYPTION_KEY` on the migration process to the same
   server-side key configured for every runtime replica. If that variable is
   unset, the cipher uses `BACKEND_AUTH_SECRET`; do not rotate either value as
   part of this migration.
3. From `apps/backend`, build the candidate source and run a dry-run inventory
   against the target database while the previous runtime remains active:

   ```sh
   ./node_modules/.bin/nest build
   node dist/src/scripts/calendar-credential-migration.js
   ```

   The report includes counts only, never token values. Stop if
   `invalidVersionedCredentialFields` is nonzero; confirm the configured key
   before proceeding.

4. After reviewing the inventory, apply the conversion and inspect its
   post-apply verification:

   ```sh
   node dist/src/scripts/calendar-credential-migration.js --apply
   ```

   The command uses compare-and-set updates. If it stops after a row changes,
   keep sync disabled, rerun the dry-run, and apply again after resolving the
   reported condition. Do not restore plaintext values from a backup while the
   strict runtime is active.

5. Run the dry-run again. Both plaintext counts and
   `invalidVersionedCredentialFields` must be zero before deploying the strict
   runtime. The script exits with an error if verification fails.
6. Deploy the migration-capable release to all backend and worker replicas with
   `BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED=false`. Keep sync disabled while
   applying schema migrations and checking the deployment.
7. Enable sync consistently on the HTTP backend and every worker replica, then
   restart them. Reconnect-required integrations still need fresh Google
   consent; credential encryption alone does not verify a legacy account or
   calendar binding.

## Legacy event reconciliation

The migration marks unlinked Google events as
`reconnect_required` / `legacy_link_unverified`. During a pull into a verified
account and calendar binding, Sydia links an old row only when exactly one
candidate has that Google event ID and its complete normalized event snapshot
matches Google. The existing Sydia event ID and revision are preserved.

Changed or ambiguous candidates remain recovery-required and are not merged or
exported. Google is imported as a separate row, so users may temporarily see a
duplicate until they resolve the legacy copy. Each page checks at most 500
candidates; a larger candidate set fails the page transaction for operator
investigation instead of skipping reconciliation silently.

Run only one migration process at a time. Partial progress is safe to rerun,
but a concurrent credential refresh or connection update can cause a
compare-and-set failure. The script deliberately stops rather than overwriting
a credential row that changed during migration.

## Metrics export

Configure the backend and worker with `OTEL_METRICS_EXPORTER=otlp` and an OTLP
collector endpoint through `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` or
`OTEL_EXPORTER_OTLP_ENDPOINT`. Configure exporter authentication with the
standard OTLP headers variable when required. The OpenTelemetry SDK starts its
metrics reader only when a metrics exporter is explicitly configured; setting
`OTEL_METRICS_EXPORTER=none` disables metrics. Keep service/resource labels
consistent across HTTP and worker processes so dashboards can compare them.

The calendar instruments currently include:

- `sydia.calendar.google.requests` and `sydia.calendar.google.request.duration`
  with bounded `method`, `lane`, and `outcome` attributes.
- `sydia.calendar.google.admission.wait` by bounded request `lane`.
- `sydia.calendar.sync.operation.age` by operation `kind`, plus
  `sydia.calendar.sync.pull.freshness` by `mode` when a pull runs.
- `sydia.calendar.sync.jobs` and `sydia.calendar.sync.duration` by work `kind`
  and `outcome`; pull `pages` and `events` by `mode`.
- `sydia.calendar.sync.lease.losses` by lease `kind`, token refresh failures,
  token revocation failures, watch renewal outcomes, persisted conflicts,
  exhausted retries, and failed watch-stop attempts.
- Observable database gauges: `sydia.calendar.sync.operations.pending`,
  `sydia.calendar.sync.operations.processing`,
  `sydia.calendar.sync.operation.oldest.age`,
  `sydia.calendar.sync.bindings.active`,
  `sydia.calendar.sync.bindings.never_synced`,
  `sydia.calendar.sync.bindings.never_synced.oldest.age`,
  `sydia.calendar.sync.pull.oldest.age`,
  `sydia.calendar.sync.watch.expiring`,
  `sydia.calendar.sync.watch.cleanup.pending`, and
  `sydia.calendar.sync.watch.cleanup.oldest.age`.
- `sydia.calendar.sync.operational_snapshot.failures` counts aggregate-query
  failures. The collection error is also propagated to the OpenTelemetry SDK;
  missing database readings are never reported as zero.

All database gauges are collected from one aggregate query per metrics export.
Each backend or worker replica exports the same global database snapshot, so
dashboard queries must use `max` across process/instance labels for these
gauges; summing them multiplies the counts by the replica count. Keep service
and environment dimensions when aggregating. Request and failure counters
should be summed across replicas.
The watch-cleanup gauge counts rows awaiting confirmed stop or Google expiry;
its separate failure counter counts stop attempts that errored. Cleanup rows
remain notification-ineligible and the gauge drops after the recorded expiry.
`sydia.calendar.sync.token_revocation.failures` counts authorization revoke
errors. A pending disconnect retains encrypted credentials for a user retry;
it does not reactivate the binding or permit sync.
The metrics carry no account, calendar, binding, operation, event, or user
identifiers.

Import `ops/observability/grafana/dashboards/google-calendar-sync.json` into
Grafana and load
`ops/observability/prometheus/google-calendar-sync-rules.yml` into the
Prometheus rule files for the same deployment environment. The dashboard
expects standard Prometheus-exported names and selects its datasource at
import time. Scope that datasource to one deployment environment; the calendar
database gauges are exported by every backend/worker replica, so dashboard and
rule expressions use `max` across replicas. Request and failure counters use
`sum`.

Add the rules file to Prometheus `rule_files` and validate it before reload:

```sh
promtool check rules ops/observability/prometheus/google-calendar-sync-rules.yml
promtool test rules ops/observability/prometheus/google-calendar-sync-rules.test.yml
```

The rule tests cover all eight alerts with their threshold conditions satisfied
and with their pending-work/failure gates inactive. They verify local Prometheus
rule behavior; they do not replace a staging receiver-delivery check.

Configure the Prometheus/Alertmanager route and receiver separately, then
trigger one controlled staging alert and confirm delivery and recovery. The
rule file defines alert conditions; it does not configure notification
destinations.

The dashboard covers active bindings, pending/oldest outbound operations,
pull freshness, never-synced bindings, expiring watches, pending cleanup and
its age, Google API request rate, sync job outcomes, conflicts, retry-budget
exhaustion, token refresh and revocation errors, metric snapshot failures, and
retention removal rates. Candidate
staging alerts are included for an outbox older than five minutes for ten
minutes, a pull older than one hour while active bindings exist, an initial
import older than one hour, pending watch cleanup older than 24 hours, recent
snapshot failures, exhausted operation retry budgets, and token revocation
errors, and retention cleanup failures. The initial-import threshold is provisional: replace it with the
measured staging import window before paging on it. Tune all other thresholds
to the selected staging load profile before production use.

Prometheus exporters can translate dotted names to underscores and may append
unit suffixes such as `_milliseconds` to unit-bearing gauges; monotonic counters
use `_total`. The included dashboard and alert rules accept both the short
millisecond gauge names emitted by the current Node SDK exporter and the
unit-suffixed form used by standard OTel-to-Prometheus translation. Confirm the
actual exposition in staging before enabling alerts. See the [OpenTelemetry
Prometheus naming rules](https://opentelemetry.io/docs/specs/otel/metrics/sdk_exporters/prometheus/).
Keep `service.name` and `deployment.environment.name` resource attributes
available to the metrics backend for filtering and diagnosis.

## Local database and Redis contract checks

Use disposable Postgres with the `vector` extension and a separate disposable
Redis instance. Never point these contracts at the development or production
stores. The Postgres URL must name `sydia_calendar_sync_contract`; the Redis
URL must select database `15`. The live specs are skipped when their matching
contract URL is unset, so confirm Jest reports the live suite as passed rather
than skipped.

From `apps/backend`, set the contract URLs and apply the repository migrations
to the dedicated Postgres database:

```sh
export CALENDAR_SYNC_CONTRACT_URL='postgresql://user:password@localhost:5432/sydia_calendar_sync_contract'
export CALENDAR_SYNC_REDIS_CONTRACT_URL='redis://localhost:6379/15'
export BACKEND_DB_URL="$CALENDAR_SYNC_CONTRACT_URL"

./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma

node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --config ./jest.config.mjs --runInBand --runTestsByPath \
  src/database/repositories/prisma-calendar.live.spec.ts
```

Run the shared-admission contract against the disposable Redis instance:

```sh
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --config ./jest.config.mjs --runInBand --runTestsByPath \
  src/infra/calendar/google-calendar-request-limiter.live.spec.ts
```

The Postgres contract checks competing worker claims, atomic page rollback,
cursor persistence, and expired-lease recovery. With both contract URLs set,
the same Postgres spec also sends a durable outbox operation through the real
BullMQ queue: it simulates a failed first dispatch, a provider create followed
by a database failure, and lease recovery that reconciles the same remote event
without creating a duplicate. The Redis contract checks shared admission across
two limiter clients, reserved interactive capacity, and bounded fail-closed
behavior when Redis cannot be reached.

The Postgres contract also accepts the initial notification while its watch
channel is still registering, activates the channel after the simulated watch
response, and accepts only one of two concurrent deliveries of the same
message number. It rejects a wrong token, wrong resource ID, stale or malformed
message number, and notifications for a stopped channel. This exercises the
repository's durable dirty-revision update; it does not simulate delivery
across separate backend processes or prove missed-notification recovery.

The database-failure case injects an error at the binding dirty-revision write,
after the channel message number has advanced inside the same transaction. It
verifies that the message number and dirty revision both roll back. A service
unit test also verifies that a persistence error propagates before queue
dispatch, so a failed receipt is not treated as durably acknowledged.

The reconnect case changes the integration generation while an old watch is
active and again while a replacement is registering. The contract verifies the
old notification is rejected, the late registration cannot activate, and the
recovery query returns the active binding at its current generation.

The cleanup contract disconnects while a remote watch is active, verifies the
channel is no longer eligible to receive notifications, and confirms the
pending-cleanup snapshot remains visible until the provider channel expiry.

## Quota exhaustion or provider throttling

**Impact:** outbound edits and imports are delayed while Google returns a
rate-related `403` or `429`; Sydia keeps accepted work in its durable outbox.

1. Confirm the provider reason in redacted backend logs and inspect the actual
   Google Cloud project and user quota limits. Distinguish rate-related `403`
   responses from permission-related `403` responses.
2. Check recent imports, polling volume, retries, and worker concurrency. Do
   not increase concurrency to clear a quota backlog.
3. Set the project, user, and calendar QPM and burst values to conservative
   values below the verified limits. Preserve the outbound lane share so
   imports cannot take all available capacity. Restart all worker replicas
   with the same values.
4. If provider throttling remains severe, suspend sync using the shared
   controls while quota policy is reviewed.
5. Resume after the verified limits and settings agree. Confirm that pending
   work decreases and ordinary outbound edits are completing.

Do not reset exhausted operation attempts automatically. A terminal operation
requires the user-facing retry or reconnect action after the cause is fixed.

## Redis outage

**Impact:** queue delivery and shared Google request admission are unavailable.
Admission fails closed before provider calls; accepted mutations remain in
Postgres.

1. Restore Redis connectivity and verify queue clients and worker consumers
   reconnect.
2. Keep the calendar feature enabled unless the outage caused a separate
   provider incident. The recovery scheduler runs every 30 seconds and scans
   durable due work after Redis is healthy.
3. Check that pending outbox work is being enqueued and that the oldest due
   operation age is falling. Do not ask users to resubmit accepted edits.
4. If the queue remains unhealthy after Redis recovery, restart worker
   replicas using the standard deployment procedure and inspect queue
   connection errors.

## Token rejection or revoked Google consent

**Impact:** the affected account stops syncing; pending edits remain retained
and are not sent with an invalid credential.

1. Confirm a `401` or refresh rejection in redacted logs and verify that the
   integration reports `reconnect_required`.
2. Ask the account owner to reconnect Google Calendar from Settings →
   Integrations, completing consent in the intended Google account.
3. Confirm the returned Google email and selected writable calendar with the
   user before relying on the new binding.
4. Verify that status returns to connected, a pull completes, and retained
   operations resume. If the account cannot authorize, leave the binding
   paused and preserve the pending operations for user resolution.

Never ask a user to send OAuth tokens or authorization codes to support.

## Stuck operation or binding lease

**Impact:** one event operation or calendar pull may wait while its prior
worker claim remains fenced by a lease.

1. Use the redacted operation or binding identifier from logs to determine
   whether a worker is still processing it. Confirm the owning worker is
   healthy before intervening.
2. The lease duration is 90 seconds and recovery runs every 30 seconds. If the
   owner has stopped, allow the lease to expire and let recovery claim the
   work. A later claim advances the fencing epoch so stale workers cannot
   commit.
3. If the lease remains stuck beyond two recovery cycles, use the standard
   worker restart procedure after confirming no live worker owns the claim.
4. Verify that the lease clears, the row is claimed again, and status or
   pending-operation age advances.

Do not clear lease fields or decrement epochs directly in Postgres. The worker
process consumes other background queues too, so account for their normal
restart behavior.

## Failed or stalled import

**Impact:** the last committed mirror remains readable but may be stale; a
partial full import does not replace the current view.

1. Check `lastErrorCode`, binding state, last successful sync time, and the
   matching redacted log entry. Determine whether the failure is transient,
   permission-related, a rejected token, or an unsupported/malformed event.
2. Transient errors use bounded retries. For `reconnect_required`, use the
   token-rejection runbook. For a permission failure, ask the owner to restore
   access to the selected writable calendar or select another writable
   calendar in Integrations.
3. After correcting the cause, allow the due-binding recovery sweep to resume
   the import from its persisted page checkpoint. Permanent failures schedule
   a later retry; monitor status rather than editing `nextSyncAt` directly.
4. For an active binding that needs a fresh scoped snapshot, an administrator
   can call `POST /calendar/admin/users/{userId}/full-resync`. This creates a
   new import generation for only that user's active binding, preserves
   pending outbound operations and the current cached view, and returns `202`
   after the reset is durable. A `409` means a pull currently holds the lease;
   wait for it to finish or expire, then retry. Use the user ID from the
   existing admin user list; do not target a binding by editing database rows.
5. If malformed provider data keeps failing, keep the previous view marked
   stale, preserve pending edits, and escalate the redacted error code for a
   parser fix. Do not delete the mirror or pending work to force progress.

Use the scoped full-resync action only after correcting the cause of failure;
otherwise the new generation will fail the same way. Its concurrency and
checkpoint-preservation behavior still needs staging validation before broad
rollout.

## Incremental page continuation

Each incremental page request retains the original `syncToken` and adds the
persisted `pageToken`. Google requires the same query parameters throughout
that traversal; see the [provider synchronization guide](https://developers.google.com/workspace/calendar/api/guides/sync).
The repository keeps the original sync token while committing intermediate
pages and replaces it only when the final page commits. Full imports retain
a null sync token until their final page. Worker restarts resume from these
stored checkpoints. Cursor tokens must not be copied into logs or tickets.

Verify the request and full-import distinction from `apps/backend`:

```bash
bun run test --runInBand --runTestsByPath src/modules/calendar/calendar-sync.service.spec.ts src/infra/calendar/google-calendar.service.spec.ts
```

These local tests use synthetic provider responses. Staging must also prove
multi-page incremental synchronization with more than 250 changed events,
including worker restart between pages and final cursor advancement.

## Provider success followed by database completion failure

**Impact:** Google may have accepted a write while its Sydia event still shows
pending. The operation and its previous baseline remain durable if the database
completion transaction fails.

The worker logs the failed completion at ERROR with a redacted error code,
records a failed operation job,
and propagates the error. Restore database connectivity and permissions, then
allow the processing claim to expire and recovery to retry the same operation.
Do not create a replacement event or remove its operation record. Stable create
IDs prevent duplicate creates; repeated deletes accept an already-missing remote
event. Updates read the current Google resource and reconcile the requested
field groups against the saved operation baseline. If the requested values
already match, recovery confirms completion without another PATCH or guest
notification. Independent Google edits survive; incompatible edits to the same
field group remain conflicts. Time/date range and recurrence form one group;
attendee membership forms another. The private operation marker alone never
proves convergence after a later provider edit.

A PATCH uses the latest ETag and sends only the remaining requested groups. A
`412` triggers one fresh read: converged changes complete; incompatible changes
surface a conflict; independent changes that still need a write requeue with
`calendar_version_changed` under the existing retry budget. One claim sends at
most one PATCH. Completion saves the normalized provider baseline and imports
independent provider fields only when the local pending revision still matches.
Newer local edits and surfaced errors/conflicts survive.

A failed earlier operation blocks dependent later revisions. The event remains
visibly failed until a user retries the oldest outstanding operation; this keeps
its intent from being lost when later operations send only their own deltas.
Check sync status and the event's current revision before confirming delivery to
the user.

A confirmed delete updates its tombstone and common baseline and marks only the
matching pending cancellation revision synced. Confirmation of an older revision
preserves newer pending work and surfaced conflict/error states. The local
completion and provider-link update commit in one transaction. The existing
outbox-age alert covers work that remains stuck; the dashboard shows failed
operation jobs as well.

Run the focused update/reconciliation checks from `apps/backend`:

```sh
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --config ./jest.config.mjs --runInBand --runTestsByPath \
  src/modules/calendar/calendar-sync.service.spec.ts \
  src/modules/calendar/calendar-update-reconciliation.spec.ts \
  src/infra/calendar/google-calendar.service.spec.ts \
  src/database/repositories/prisma-calendar.repository.spec.ts
```

The isolated PostgreSQL command above also checks accepted-update completion
rollback/recovery, newer queued revisions, failed dependency retry, confirmed
link revisions, and both conflict-resolution choices. Google transport is a
synthetic boundary in these local contracts; the staging checklist separately
requires provider PATCH, invitation, and metadata checks.

## Inbound simultaneous edits

Inbound pages compare the last common baseline with the current local and Google
versions. Dates, timezone, all-day bounds, and recurrence form one time group.
If both sides change this group differently, the page saves a `time` conflict
and preserves the local schedule and the complete remote comparison. It never
combines a local start with a Google end or pairs local dates with a different
Google recurrence. Refreshing an open comparison uses the same grouping.

Independent title, description, location, attendee-membership, and status edits
can merge. Attendee and recurrence array order is insignificant; empty strings
for description/location equal cleared optional fields. Same-value edits
converge without an additional echo operation. A surviving local time change
carries the entire group into the merged event.

A pending local cancellation conflicts with a new Google edit and pauses its
queued delete until the user chooses a version. Matching local/Google
cancellations converge. Repeated cancellation pages retain the confirmed
revision while updating the provider tombstone and snapshot. An already-open
conflict still requires user resolution; receiving another page does not discard
that decision.

Run only these isolated PostgreSQL contracts after configuring the disposable
store described above:

```sh
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --config ./jest.config.mjs --runInBand --runTestsByPath \
  src/database/repositories/prisma-calendar.live.spec.ts \
  --testNamePattern 'inbound|pending local deletion|same-value cancellation'
```

## Events absent from a completed full resync

When a full resync finishes, a previously linked event that was not seen in
that import generation is reconciled as a minimal remote cancellation. This
uses the same inbound reconciliation path as an explicit Google cancellation.
Pending local cancellations converge without advancing their revision again;
local edits and open conflicts remain recoverable. An existing conflict gets
an updated deletion comparison rather than a second open record. The missing
event has no current provider ETag, so its comparison must not retain an old
ETag as if Google had confirmed it.

The final pass processes at most 100 absent links per job, reading one extra
link to detect continuation. Migration `20261010230000_calendar_import_finalization`
adds the durable final sync token and link cursor. Intermediate batches commit
with their event/conflict changes, release the binding lease, and stay due for
recovery. A resumed job reads no new Google page. The original captured dirty
revision survives all batches; the binding advances its sync token and
freshness only after finalization finishes. A 20-second transaction deadline
and the binding lease fence bound each commit. Apply the migration before
starting the updated backend and workers.

Run the targeted PostgreSQL regressions from `apps/backend`, with the isolated
contract URLs set as described above:

```bash
bun run test --runInBand --runTestsByPath src/database/repositories/prisma-calendar.live.spec.ts --testNamePattern 'full resync|full import finalization'
```

The tests cover matching cancellations, refresh of an existing conflict, and
preservation of a conflict whose local revision equals its synced baseline.
Staging must also exercise these cases through the scoped full-resync action.

## Worker request fenced before provider access

Each operation, pull page, and watch registration carries an in-process request
guard. After shared Redis admission, immediately before sending a Calendar API
request, the guard checks PostgreSQL for the active binding/account, connection
generation, claim owner/token and epoch, and remaining lease time. At least
20 seconds must remain to cover the 15-second HTTP timeout plus request overhead.
Token refresh additionally checks its integration credential lease before the
token endpoint request. Guards are closures in process memory, never Redis job
payloads or provider headers.

A rejected guard logs WARN with `calendar_request_fenced`, releases the admission
permit, and sends no provider request. Valid claims that are short of time defer
through their durable retry deadline without spending a provider attempt;
replaced/expired/disconnected claims cannot mutate current state. Recovery
claims the durable work again if its binding remains active. Investigate repeated
lease-loss metrics, slow database/admission requests, and worker pauses rather
than deleting the operation or resetting its attempt history.

This is a check before dispatch, not an atomic transaction with Google. A
request already sent can still finish after disconnect or lease replacement.
Local completion remains fenced and uncertain writes reconcile on recovery.
Stopping a newly registered channel whose activation was fenced is compensating
cleanup: it deliberately uses the known channel/resource identity even after
losing the registration claim. Stop failure retains cleanup-pending state until
provider expiry. Ordinary retirement of previous channels uses the active
renewal claim. Watch failure logs record safe error codes without raw provider
stack/message data.

The focused transport suite includes request denial after admission, permit
release, and refresh denial. The isolated PostgreSQL/Redis contracts cover
expired/replaced claims, epochs/generations, insufficient HTTP budget,
disconnect, credential-owner replacement, and disconnect between preflight
GET and PATCH through the real transport with synthetic HTTP responses.

## Invalid sync cursor

**Impact:** incremental synchronization pauses while Sydia rebuilds the
affected binding's remote mirror; the last committed view remains available
and may be marked stale.

Google's `410` response causes the worker to invalidate that binding's cursor
and enqueue a full import generation automatically. Pending outbound
operations are retained. Check that pages continue from the saved checkpoint
and that the final page commits a new sync token. If the rebuild fails, use the
failed-import runbook. Do not clear the cursor or delete events by hand.

## Watch renewal failure

**Impact:** push-triggered freshness may degrade, but periodic reconciliation
continues for active bindings.

1. Confirm the failing watch binding and provider reason in redacted logs.
2. Verify that `BACKEND_GOOGLE_WEBHOOK_URL` is publicly reachable HTTPS with
   no credentials, query, or fragment, and that the webhook receiver is
   healthy.
3. Correct the endpoint and restart workers. If push delivery is not currently
   available, set the webhook URL empty to stop creating/renewing watches;
   periodic polling remains active and must be sized for the connected
   calendar count.
4. Confirm a watch renewal succeeds when configured, or confirm periodic
   pulls advance `lastSyncedAt` when polling is the selected mode.

## Retention cleanup

Every enabled 30-second recovery pass removes at most
`BACKEND_GOOGLE_CALENDAR_RETENTION_BATCH_SIZE` rows from each of four tables
(default 100, allowed 1–1000): completed operations older than
`BACKEND_GOOGLE_CALENDAR_COMPLETED_OPERATION_RETENTION_DAYS` (default 30,
allowed 1–3650), expired OAuth requests, expired mutation receipts, and ordinary
tombstones older than
`BACKEND_GOOGLE_CALENDAR_TOMBSTONE_RETENTION_DAYS` (default 90, allowed 1–3650).
PostgreSQL time determines expiry. Indexed candidates and `SKIP LOCKED` allow
concurrent workers to process separate batches. One transaction makes all
four cleanup stages atomic.

An unexpired mutation receipt protects its referenced event's completed
operations and provider link. Tombstones are retained for recurring instances
and series, links with any conflict history, linked events that are not cancelled
and fully synced, and links referenced by any unfinished operation (including
paused or failed work). Remote-ID references are scoped to their binding.
Event snapshots and conflict history remain intact; resolved-conflict retention
still requires its own policy and implementation.

Tombstone cleanup acquires owner locks in the same order as mutations, skips
active owners and locked provider links, then rechecks dependencies in a fresh
database snapshot before deleting links. This prevents cleanup from losing a
newly committed write or conflict. Disabling sync also disables this sweep. Re-enabling resumes bounded cleanup of any backlog.

The dashboard reports removal rates by record kind. The
`SydiaCalendarRetentionCleanupFailing` alert fires after recent cleanup failures
persist for ten minutes. A failed cleanup transaction logs an error and propagates
to the recovery job; expired records remain for a later pass. Check database connectivity,
migration deployment, permissions, and PostgreSQL errors. Restore the failing
prerequisite and confirm successful retention jobs and declining expired-record
counts. Increase the batch size within its bounds only after checking recovery
latency and database load. Do not delete unfinished work to clear this alert.

To run only the PostgreSQL retention contracts after setting the disposable store
URLs above, use this command from `apps/backend`:

```sh
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --config ./jest.config.mjs --runInBand --runTestsByPath \
  src/database/repositories/prisma-calendar.live.spec.ts \
  --testNamePattern retention
```

## Account or calendar misbinding

**Impact:** events may be read from or written to an unintended Google account
or calendar. Treat a suspected cross-user binding as a security incident.

1. For suspected cross-user exposure, immediately disable sync on the HTTP
   backend and every worker, preserve redacted logs, and follow Sydia's
   incident-response process. Do not copy event details or credentials into
   the incident ticket.
2. Confirm the owner and intended Google account directly with the user.
   Check the displayed Google email and active calendar name/ID in the
   authenticated status flow; never infer ownership from an email alone.
3. For the wrong calendar under the correct account, have the user select the
   intended writable calendar in Integrations. The new binding has its own
   cursor and generation; old cached events remain read-only.
4. For the wrong Google account, have the user disconnect and reconnect while
   signed into the intended Google account. Confirm disconnect succeeds so
   the old binding is fenced and its token revoked. If revocation fails, keep
   that account's sync suspended and retry disconnect before reconnecting.
   The status remains `disconnecting` until revocation succeeds. Verify the new
   account and calendar before enabling sync again.
5. Re-enable only after the binding is verified. Confirm that pending work is
   associated with the intended active binding and that no old-generation
   operation is sent to the new calendar.

## Release gates

This runbook is a draft until staging demonstrates quota throttling, Redis
recovery, token rejection, worker termination during a lease, import
checkpoint recovery, cursor invalidation, watch fallback, and safe account or
calendar rebinding. Add dashboards and alerts for outbox age, provider calls,
throttle time, freshness, page progress, lease loss, refresh failures, watch
expiry, conflicts, and exhausted retries before broad rollout.
