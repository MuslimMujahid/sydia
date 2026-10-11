# Google Calendar sync for local development

Use this procedure for the local frontend at `http://localhost:3000` and
backend at `http://localhost:5000`. Both directions of sync work without a
public tunnel: leave `BACKEND_GOOGLE_WEBHOOK_URL` empty to use periodic pulls.
The worker checks recovery every 30 seconds and schedules ordinary pulls
approximately every five minutes. Outbound changes are queued immediately.
Opening or reloading the Calendar page also requests an incremental pull.
The page reloads its events after the worker completes. Reloads share pending
work and reuse a sync completed within the last 30 seconds. Provider retry
backoff remains in effect. A queue dispatch failure is reported as deferred;
the persisted request is recovered by the worker. The page stops observing
after about a minute and displays an error if the pull has not completed.

## Google Cloud setup

1. Select the development project (for this workspace, `sydia-dev`) and enable
   **Google Calendar API** in **APIs & Services → Library**.
2. Configure **Google Auth Platform** with app name `Sydia Local`, the account
   owner's support/contact email, and an **External** audience. Keep publishing
   status **Testing** for local development.
3. In **Audience → Test users**, add the Google account that will connect.
4. In **Data Access**, declare the scopes requested by Sydia:
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email` (OAuth shorthand: `email`)
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
5. Create an OAuth client of type **Web application**, named `Sydia Local Web`.
   Register this exact **Authorized redirect URI**:
   `http://localhost:5000/calendar/google/callback`.
   Sydia exchanges authorization codes on the backend; JavaScript origins are
   unnecessary for this flow. Do not use the frontend URL as the callback.
6. Store the client ID and secret in the ignored root `.env`, never in a
   `VITE_*` variable or committed source.

Google's [consent setup](https://developers.google.com/workspace/guides/configure-oauth-consent)
and [web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server)
cover this configuration. External apps in Testing receive refresh tokens
that expire after seven days when requesting Calendar scopes; reconnect from
Integrations when required. See [Google's token expiration documentation](https://developers.google.com/identity/protocols/oauth2#expiration).

## Local configuration and startup

The root `.env` is shared by `apps/backend/.env` and `apps/frontend/.env`
symlinks. Preserve the existing database, Redis, and authentication secrets.
Calendar tokens use `BACKEND_TOKEN_ENCRYPTION_KEY`, or the existing
`BACKEND_AUTH_SECRET` when no dedicated key is configured. Do not rotate the
active encryption key during setup.

```dotenv
BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED=false
BACKEND_GOOGLE_CLIENT_ID=<web-client-id>
BACKEND_GOOGLE_CLIENT_SECRET=<web-client-secret>
BACKEND_GOOGLE_REDIRECT_URI=http://localhost:5000/calendar/google/callback
BACKEND_GOOGLE_WEBHOOK_URL=
BACKEND_GOOGLE_CALENDAR_QUOTA_PROJECT_KEY=sydia-dev
```

From the repository root, with Postgres and Redis running:

```sh
bun --cwd apps/backend run db:migrate:deploy
bun --cwd apps/backend run build
cd apps/backend
node dist/src/scripts/calendar-credential-migration.js
cd ../..
```

The credential inventory must show zero plaintext and invalid credential
fields. If it does not, follow the
[credential migration runbook](./GOOGLE_CALENDAR_SYNC.md#legacy-credential-migration)
before enabling sync. Never reset the database to resolve migration errors.

After configuring credentials and passing the inventory, set
`BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED=true` and start from the repository root:

```sh
NODE_ENV=development bun run dev
```

This starts the frontend, HTTP backend, and combined worker. Restart all three
after changing `.env`; editing an environment file does not update a running
Nest process. Keep the worker running for imports, outbound changes, retries,
and periodic polling.

## Connect and verify

1. Open `http://localhost:3000/settings/integrations` in the intended Chrome
   profile. Sign in to Sydia normally and finish onboarding if required.
2. Select **Connect Google Calendar**, choose the account added as a test user,
   and personally review/complete Google's sign-in and consent screens.
3. Confirm that Integrations shows the account, an active writable calendar,
   and a successful initial sync. Prefer a dedicated test calendar for smoke
   events. Existing Sydia-only events stay local until explicitly exported.
4. Create one synthetic event in Sydia without attendees; wait until its state
   is synced and confirm it appears once in Google Calendar.
5. Edit its title in Google Calendar. Reload Sydia's Calendar page and wait for
   the sync indicator to finish, then confirm the title has updated. If the
   previous sync completed less than 30 seconds ago, wait for the cooldown and
   reload again. A page left open still receives ordinary five-minute pulls.
6. Check backend and worker logs if sync stays pending. A running frontend by
   itself cannot process the calendar queue.

For broader provider checks, use the
[staging checklist](./GOOGLE_CALENDAR_STAGING_CHECKLIST.md). `/chats` creates
isolated users without Google credentials and cannot verify owner sync.

## Workspace verification — 12 October 2026

The `sydia-dev` local Web client connected successfully through Chrome's
`x Captcha` profile. Initial import completed with two active Google events;
both event IDs and ETags matched the imported records. The binding was active,
with a saved sync token, encrypted access/refresh tokens, no unfinished import,
no pending writes, and no open conflicts or sync errors.

The next automatic poll completed at 00:06 WITA and scheduled another pull
five minutes later. The worker's recovery schedule ran every 30 seconds, with
no failed calendar jobs. Backend build, migration status, and the 12 targeted
OAuth/provider unit tests passed. Creating or editing a live Google event was
not exercised during this setup; the outbound smoke check above remains to be
performed separately.

The page-refresh implementation was also verified through a real Chrome
reload. A pull completed immediately, and rapid reloads shared one sync
revision. Its targeted checks passed: 63 backend tests, nine refresh observer
tests, and 18 desktop/mobile browser tests (run with one worker), plus type and
lint checks. Run the same checks from the repository root:

```sh
cd apps/backend
bun run test --runInBand src/database/repositories/prisma-calendar.poll.spec.ts src/database/repositories/prisma-calendar.repository.spec.ts src/modules/calendar/calendar-sync.service.spec.ts
cd ../frontend
bun test src/lib/services/api/calendar/calendar-refresh.test.ts
bun run test:e2e --config playwright.entities.config.ts calendar-sync.spec.ts --workers=1
cd ../..
bun run check-types
```

## Troubleshooting

- **Unavailable integration:** ensure both OAuth values are nonempty, the flag
  is true, and the HTTP backend and worker were restarted.
- **`redirect_uri_mismatch`:** register exactly
  `http://localhost:5000/calendar/google/callback` in the same Web client used
  by `.env`. `localhost` and `127.0.0.1` are different redirect values.
- **Access denied in Testing:** add the connecting account under Test users.
- **Reconnect required after a week:** Testing token expiration is expected;
  reconnect through Integrations.
- **Pending changes or stale imports:** check the worker, Postgres, and Redis.
  Retain pending operations; use the app's retry/resync controls.
- **No push notifications:** an empty webhook URL intentionally uses polling.
  For push, expose the backend through a controlled public HTTPS endpoint and
  follow [Google's push requirements](https://developers.google.com/workspace/calendar/api/guides/push).
