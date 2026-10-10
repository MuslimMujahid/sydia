# Google Calendar staging preparation and smoke checks

Before starting the updated backend and workers, apply migration
`20261010230000_calendar_import_finalization` (and all earlier migrations).
It adds the durable checkpoint used by batched full-import finalization.

Status: Prepared; real Google checks have not been run. The account owner will
perform Google authorization and the provider smoke checks. Local test results
are recorded in [the implementation plan](../GOOGLE_CALENDAR_SYNC_PLAN.md).

## Prepare Google

1. Use a dedicated Google account and a separate Cloud project for these tests.
   Enable the Google Calendar API in that project.
2. Configure the OAuth consent screen. For an External app in Testing, add the
   dedicated account to **Audience → Test users**. Configure these scopes in
   **Data Access**:
   - `openid`
   - `email`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
3. Create an OAuth client of type **Web application**. Add the backend callback
   to **Authorized redirect URIs**, matching `BACKEND_GOOGLE_REDIRECT_URI`
   exactly, including its path. Sydia exchanges codes on the backend; put the
   client secret in server-side secret storage.
4. Prepare the primary calendar and a second calendar owned by the test account.
   Name the second calendar `Sydia sync test B`. Give the calendars distinct
   event titles so imported events and inactive cached copies are recognizable.
5. Add synthetic events: one timed event, one multi-day all-day event, a weekly
   recurring series, one moved occurrence, and one cancelled occurrence. Set
   the account's calendar timezone deliberately; include a series in an IANA
   zone with a daylight-saving transition if checking DST behavior.

See Google's [OAuth consent setup](https://developers.google.com/workspace/guides/configure-oauth-consent),
[Web application credential setup](https://developers.google.com/workspace/calendar/api/quickstart/js#authorize_credentials_for_a_web_application),
and [calendar recurrence representation](https://developers.google.com/workspace/calendar/api/concepts/events-calendars#recurring_events).

## Prepare Sydia

Use a staging deployment with its own PostgreSQL and Redis. The HTTP backend
and the background worker must share the same configuration and encryption
key. Keep sync disabled while deploying migrations and completing the legacy
credential gate in [the operations runbook](./GOOGLE_CALENDAR_SYNC.md).

| Setting                                | Value to prepare                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `BACKEND_GOOGLE_CLIENT_ID`             | The Web application OAuth client ID                                                   |
| `BACKEND_GOOGLE_CLIENT_SECRET`         | Its client secret, stored on the server                                               |
| `BACKEND_GOOGLE_REDIRECT_URI`          | `https://<backend-host>/calendar/google/callback`, registered exactly in Google Cloud |
| `BACKEND_GOOGLE_WEBHOOK_URL`           | `https://<backend-host>/calendar/google/webhook`, publicly reachable with valid TLS   |
| `BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED` | `true` on the HTTP backend and every worker, after deployment checks                  |
| `BACKEND_TOKEN_ENCRYPTION_KEY`         | The same stable secret on every runtime replica and migration process                 |
| `BACKEND_DB_URL` / `BACKEND_REDIS_URL` | The staging stores shared by the backend and worker                                   |
| Google quota settings                  | Budgets checked against the dedicated Cloud project's actual limits                   |

Configure the existing frontend URL, authentication/CORS settings, and model
credentials for this deployment. Sign in to Sydia normally and finish
onboarding before using **Settings → Integrations → Google Calendar**.
Google consent is a separate connection step. Grant all requested scopes.

A stable public HTTPS URL is needed for background push delivery. A controlled
HTTPS tunnel can expose a local backend during development; configure the
callback/webhook URLs to use that hostname. Google's [push notification
requirements](https://developers.google.com/workspace/calendar/api/guides/push)
apply. Keep the tunnel and worker running throughout the checks.

For `/chats`, run the frontend and backend in development mode, with
`NODE_ENV=development` on the backend. This page is unavailable in production.
Preview sessions intentionally create separate sandbox users with no Google
credentials. They verify local-only calendar responses across Web, Telegram,
and WhatsApp; they cannot prove Google delivery for the signed-in owner's
integration. Test actual provider responses in normal chat as the connected
owner. To check real Telegram/WhatsApp delivery, link the dedicated owner's
messaging accounts in the staging deployment as well.

## Run the smoke checks

Use unique titles such as `GC smoke timed 01`. Record the Sydia save time,
observed provider time, event identity, and outcome for each check. Keep tokens,
OAuth codes, guest addresses, and event contents out of operational logs and
screenshots intended for sharing. A few successful edits demonstrate smoke
behavior, not a measured p95 service objective.

| Check                    | Expected result                                                                                                                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect                  | Existing Sydia login continues working. Integrations displays the verified Google account, selected concrete calendar, and successful initial pull.                                                                                                                                           |
| Import                   | Synthetic timed/all-day/recurring events appear with correct dates. The moved occurrence appears once; the cancelled occurrence is absent.                                                                                                                                                    |
| Google → Sydia           | Change a title in Google with the Sydia frontend closed. Reopen Sydia after the background pull; see the new title and updated freshness.                                                                                                                                                     |
| Incremental pagination   | In an operator-controlled test calendar, change more than 250 events after initial sync. Restart the worker between pages. All changes arrive once, the checkpoint resumes, and the final sync token advances. Keep cursor values out of shared evidence.                                     |
| Sydia → Google           | Create and edit an event in Sydia. The initial response says saved/pending; Google later contains one matching event. A refresh reports synced only after confirmation.                                                                                                                       |
| All-day                  | Create a multi-day all-day event. Both calendars show the same inclusive displayed days; the stored/API end is exclusive.                                                                                                                                                                     |
| Recurrence scope         | Move one occurrence, then edit the entire series. The intended occurrence/series changes in Google and Sydia; no extra series or duplicate occurrence appears.                                                                                                                                |
| Cancellation             | Cancel an occurrence from Google and another from Sydia; each disappears in both views. Then cancel a complete series.                                                                                                                                                                        |
| Local destination/export | Create a local event while connected. It stays off Google until explicitly exported. Repeating an accepted export produces one Google event.                                                                                                                                                  |
| Conflict                 | Pause the staging worker, edit the same title in Sydia and Google, then resume. Both versions survive in the conflict comparison. Resolve once with each option on separate events; both views converge.                                                                                      |
| Coupled time conflict    | Pause the worker, move the start time in Sydia and change the end time or recurrence in Google, then resume. Sydia keeps its full schedule and offers both versions for resolution. It must not combine the two schedules.                                                                    |
| Full-resync deletion     | In a dedicated test calendar, delete a remotely conflicted event in Google, then request a scoped full resync. Its existing comparison changes to deletion, the local edit survives, and no second open conflict appears. On another event, matching local and Google cancellations converge. |
| Independent edits        | Pause the worker, change the title in Sydia and the location in Google, then resume. Both changes converge, and unedited guests/RSVPs/conference details remain in Google.                                                                                                                    |
| Accepted-update recovery | On an operator-controlled test deployment, inject a completion failure after Google accepts an edit, then restore completion and allow claim expiry/recovery. The edit converges without another PATCH or repeat guest notification; a later edit to the same field surfaces a conflict.      |
| Calendar switch          | Select test calendar B. New edits go to B. Cached calendar A events stay visible/read-only. Switch back and verify original identities and pending work resume in A.                                                                                                                          |
| Consent revocation       | Remove Sydia's Google consent. Sync becomes visibly reconnect-required and pending edits survive. Reconnect through Integrations and verify recovery.                                                                                                                                         |
| Disconnect/copy          | Disconnect from Sydia. Google events remain in Google; cached Sydia events are read-only. Copy one to Sydia and edit the independent local copy.                                                                                                                                              |
| Watch renewal            | Keep staging running through its renewal margin. The operator confirms a replacement channel, continued notification receipt, and cleanup/expiry of the old channel.                                                                                                                          |
| Assistant                | In normal connected-owner chat, create/edit/cancel events and confirm truthful pending/synced/conflict/reconnect wording against the actual Google result.                                                                                                                                    |
| `/chats`                 | Send an all-day/local event request through the shared composer. Web/Telegram/WhatsApp agree on dates and local-only delivery. Use **Raw response** and **New session** to inspect/reset isolated previews.                                                                                   |

The operator should separately validate Redis interruption/recovery, suspended
sync and rollback, alert delivery, quota errors, multi-replica fairness, and
load profiles from the implementation plan. These checks are still release
gates and are not implied by passing the table above.

## Record results

Copy this block for each run and retain a redacted report:

```text
Deployment/build:
Run time and timezone:
Backend/worker replica count:
Calendar timezone(s):
Checks passed:
Checks failed or not run:
Observed outbound/pull delays:
Duplicate or missing events:
Conflict/reconnect/retry outcomes:
Watch registration/renewal/cleanup evidence:
Cross-channel wording evidence:
Relevant redacted error codes:
```
