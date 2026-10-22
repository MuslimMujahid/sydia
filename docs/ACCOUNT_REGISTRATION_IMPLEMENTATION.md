# Registration implementation and rollout

Updated: 19 October 2026. Implementation is local and uncommitted. This report supplements the [product spec](./ACCOUNT_REGISTRATION_AUTH_SPEC.md) and [design handoff](./ACCOUNT_REGISTRATION_DESIGN_HANDOFF.md); it does not approve their unresolved product policies or claim production readiness.

## Implemented boundaries

- Better Auth owns account, session, verification, provider linking, and password persistence. Supported endpoints/internal adapters perform identity operations. No identity schema migration is required by this change.
- Password registration creates a restricted pending session. Frontend route guards and the global backend verification guard block onboarding and product APIs until email ownership is proved. Protected admin and channel-link endpoints use the same backend gate.
- Existing Telegram/WhatsApp identities retain their links, but incoming product messages and recovered queued turns stop before assistant/media processing while email remains unverified. The channel response directs the owner to verify in the app. Transport failures retain the existing channel failure diagnostics.
- Google identity uses identity scopes only, explicit linking, a separate Cloud project, and server-side Google ID-token validation. Acceptable Google-hosted verified email can bypass OTP; third-party Google email still requires a mailbox challenge. Google sign-in and Calendar identities remain separate.
- Profile settings retain name, email, timezone, language, and save behavior. The added sign-in section links to email change, password recovery, Google linking, and the existing integrations page. No Google unlink or Google-only password-setup policy is exposed.
- Recovery replaces the password, marks the mailbox verified, revokes sessions, and returns to sign-in. Browser recovery credentials stay in memory.
- All auth forms remain disabled before hydration and use POST semantics, preventing native pre-hydration GET submission of passwords.
- Existing Inter and JetBrains Mono fonts are served locally with their original Unicode subsets and bundled licenses. A pending Google Fonts stylesheet previously blocked hydration and left signup disabled; the new outage regression reproduced that failure before the local-font change. Auth/Profile continue to use their scoped Inter Tight face.
- Known OTP expiry, attempt-limit, throttling, and delivery failures use the designed explanations. Wrong current passwords, occupied replacement addresses, and unavailable password recovery have dedicated recovery screens. Unverified Google users see the designed mailbox-verification explanation before requesting a code.
- Pasted OTPs are normalized before the browser applies the input length limit, preserving all six digits when a copied code contains spaces. A native clipboard-paste regression reproduced the truncation before the fix.

## Endpoint contracts

Auth endpoints below are under `/api/auth`. Better Auth responses are used directly; normal Nest product endpoints retain the existing response envelope.

| Method and path                          | Contract                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `POST /sign-up/email`                    | Name/email/password; pending session, never unrestricted product access.                                              |
| `POST /sign-in/email`                    | Existing credentials; verified users resume existing routing, pending users resume verification.                      |
| `GET /get-session`                       | Auth/session state remains available during verification.                                                             |
| `POST /sign-out`                         | Ends the current session and clears frontend auth state.                                                              |
| `POST /email-otp/send-verification-otp`  | Current session email and `type: email-verification`; sending quotas and session-bound challenge.                     |
| `POST /email-otp/verify-email`           | Current session email and OTP; requires recent proof and challenge/session match; single use.                         |
| `GET /registration/methods`              | Password/Google presence, linked Google email metadata or explicit unavailable value, and current fresh-proof status. |
| `POST /registration/confirm-password`    | Current password; stores a ten-minute, session-bound ownership proof.                                                 |
| `POST /registration/google/confirm`      | Already linked Google only; begins session/browser-bound authorization with PKCE and nonce.                           |
| `GET /registration/google/callback`      | Consumes state and verifies the same linked Google subject; returns to email correction with success/failure status.  |
| `POST /email-otp/request-email-change`   | Replacement email plus current password, or fresh linked-Google proof; old email remains unchanged.                   |
| `POST /email-otp/change-email`           | Bound replacement email and OTP; applies the change only after ownership verification.                                |
| `POST /email-otp/request-password-reset` | Email for an existing password account; purpose-specific OTP and shared sending quotas.                               |
| `POST /recovery/verify-code`             | Email and recovery OTP; returns a single-use opaque credential with ten-minute lifetime.                              |
| `POST /recovery/reset-password`          | Recovery credential and new password; checks account/email binding and revokes sessions.                              |
| `POST /sign-in/social`                   | Google only; server controls identity scopes.                                                                         |
| `POST /link-social`                      | Fresh authenticated proof, explicit Google linking, no implicit email-based merge.                                    |
| `GET /callback/google`                   | Better Auth's state/code flow plus server-validated Google identity.                                                  |

Alternative built-in link verification, OTP sign-in/check/reset, password setup, generic email change, and unlink shortcuts are disabled where they could bypass these journeys. Pending sessions are limited to the explicitly enumerated auth and recovery operations.

Error contracts include `INVALID_OTP`, `OTP_EXPIRED`, `TOO_MANY_ATTEMPTS`, `AUTH_RATE_LIMITED` with `retryAfter`, `AUTH_DELIVERY_FAILED`, `AUTH_PROTECTION_UNAVAILABLE`, `FRESH_AUTH_REQUIRED`, `CHALLENGE_MISMATCH`, `IDENTITY_REJECTED`, `EMAIL_ALREADY_IN_USE`, `RECOVERY_UNAVAILABLE`, and `RECOVERY_EXPIRED`. The frontend shows an appropriate recovery action; failures do not become success messages.

## OTP storage and abuse controls

Codes are six digits and expire in 600 seconds. Better Auth stores keyed hashes in its verification records. Redis stores a matching keyed-hash challenge gate, short-lived ownership proofs, OAuth state, and cumulative counters. Redis keys use keyed hashes rather than email strings.

The Redis Lua gate checks/increments attempts or consumes a correct code atomically across backend replicas. Wrong guesses never reach the OTP plugin's consume/recreate retry path: that library path can otherwise restore a superseded record during a concurrent resend. A resend replaces both the plugin record and the authoritative gate. Five wrong attempts invalidate the challenge immediately. A correct code passes the gate once, then Better Auth performs the bound identity operation. If the second operation fails, the user must request a new code; no code is restored for retry.

Current-password confirmation for email correction also consumes the current mailbox's guessing budget before password comparison. Trying different replacement addresses cannot evade this limit.

Initial engineering defaults, per normalized target email and shared across purposes:

| Control                 | Default     | Setting                           |
| ----------------------- | ----------- | --------------------------------- |
| Resend cooldown         | 60 seconds  | Fixed product rule                |
| Sends/hour              | 5           | `BACKEND_AUTH_SENDS_PER_HOUR`     |
| Sends/day               | 10          | `BACKEND_AUTH_SENDS_PER_DAY`      |
| Guesses/hour            | 20          | `BACKEND_AUTH_GUESSES_PER_HOUR`   |
| Wrong guesses/challenge | 5           | Fixed product rule                |
| Recent ownership proof  | 600 seconds | Fixed initial engineering default |

Redis connection/command failures fail closed with safe operator diagnostics. Configure `BACKEND_REDIS_URL`; authentication must not continue without protection storage. SMTP failures also surface explicitly. Passwords, OTPs, OAuth tokens, cookies, and recovery credentials must never be logged.

## Local and production configuration

1. Install dependencies with Bun. Keep the existing database/Redis services running. The development compose file adds Mailpit on loopback SMTP `1025` and inbox UI `8025`.
2. Set `BACKEND_SMTP_URL` and `BACKEND_MAIL_FROM`. Local values are shown in `.env.example`. Production requires a real SMTP service, verified sender/domain, delivery monitoring, and provider ownership; choosing that provider remains an operational decision. Mailpit acceptance is not proof of external inbox delivery.
3. Keep `BACKEND_AUTH_SECRET`, `BACKEND_AUTH_URL`, `FRONTEND_URL`, Redis configuration, and existing encryption configuration consistent across backend replicas. Use `localhost` consistently in local browser tests; `127.0.0.1` is a different trusted origin.
4. Configure `BACKEND_GOOGLE_IDENTITY_CLIENT_ID` and `BACKEND_GOOGLE_IDENTITY_CLIENT_SECRET` server-side. Never place secrets in a `VITE_*` setting or chat. Both must be supplied together. The backend rejects an apparent identity/Calendar project-ID collision.
5. Register both identity redirect URIs in the **identity** Cloud project: `${BACKEND_AUTH_URL}/api/auth/callback/google` and `${BACKEND_AUTH_URL}/api/auth/registration/google/callback`. Keep the existing Calendar redirect URI in its **separate Calendar** Cloud project. Configure consent/test users and production consent requirements for each deployment.
6. Google login requests `openid email profile`, uses `include_granted_scopes=false`, online access, and account selection. Calendar retains its existing authorization and refresh-token lifecycle. Different client IDs within one Cloud project are insufficient isolation: [Google documents project-wide revocation effects](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke).

Google identity credentials are now configured in the ignored local `.env`, shared with the backend through its existing symlink. The identity client belongs to `sydia-identity-dev`, separately from the Calendar client in `sydia-dev`. The existing Nest watcher restarted and seed password login succeeded afterward. A real local social-sign-in request returns Google’s authorization endpoint with identity-only scopes, account selection, online access, PKCE, and the expected callback. The configured `includeGrantedScopes: false` option is omitted from the generated URL by the provider library. The owner completed real Google sign-in as `xcaptcha15@gmail.com` on 20 October (Asia/Makassar). Backend inspection confirms a verified account linked only to Google, completed onboarding, and no Calendar integration; the live Profile screen displays the same email. This establishes a real identity round trip and confirms that registration does not automatically connect Calendar. Real repeat login and account switching have also succeeded. For the same Google account, Calendar was connected, disconnected with its stored tokens cleared, and Sydia was signed out; a fresh Google identity login then created a new session for the unchanged verified Sydia user while Calendar remained disconnected. The evidence table below records these local checks; Real Calendar cancellation and reconnection have also passed. Deletion/late-callback review remains a separate gate.

## Rollout and recovery

- Back up existing data and deploy the backend verification gate and frontend flows together. There is no bulk deletion or verification backfill. Never set all historical users to verified to avoid rollout friction.
- Existing unverified sessions encounter verification on their next protected request/visit. Their user IDs, data, onboarding state, and integration records are retained. Existing OTPs without the new Redis challenge gate must be resent.
- The development seed now creates the demo identity as verified for normal UI work. To test a legacy unverified account, use a dedicated fixture; there is no demo-address exemption in production logic. The local seed account was also exercised through real OTP verification without recreating its saved data.
- Do not automatically delete abandoned pending accounts. Retention/cleanup and any support-assisted recovery remain unresolved product policies.
- A Calendar callback now returns to `/settings/integrations`, including OAuth requests that saved the previous `/settings?tab=integrations` URL. Denied, failed, and offline-consent-required outcomes explain retry/continuation in that existing page.
- Existing account deletion revokes Calendar access and removes local identity records through the existing account cascade. Remote Google **identity** grant cleanup remains a release review item; do not claim the existing Calendar revocation also revokes the separate identity grant.
- Rollback must retain the verification gate or disable registration until a compatible flow is restored. Rolling back to an unrestricted unverified login path would weaken the agreed ownership requirement.

## Validation and remaining gates

The implementation review covers desktop `1440×960` auth, `1440×1100` profile, mobile `390×844` auth, `390×1060` signup, and `390×1500` profile. Live Penpot typography was **Inter Tight**, despite the earlier handoff's generic Inter label; the implementation self-hosts that font scoped to auth/profile. Existing product typography and dashboard navigation remain intact.

Saved [browser captures](../.impeccable/review/account-registration/implementation/) cover signup, sign-in, verification, recovery entry, and profile. Measured form widths are 448 px desktop and 342 px mobile. Key centered screen heading positions match the live Penpot measurements. The mobile profile cards were measured at y=148/h=586 and y=762/h=416. The existing desktop shell places the cards eight pixels to the right of the schematic design; its navigation/layout is preserved.

The Google email-correction screens and linked-Google Profile state were also compared with live Penpot on desktop and mobile. Those captures ending in `.fixture.png` use a controlled local `registration/methods` response while retaining the real seed session. They establish presentation only, not Google authentication. The confirmed email-correction screen omits the extra account card and uses the design's confirmation message. Its input is at y=261 mobile / 407 desktop, and submission at y=408.5 / 554.5, matching the respective design positions within one pixel. Mobile Profile's Google connection status aligns with the card's text column. Axe found zero violations in the linked sign-in-methods region (desktop).

Additional captures cover shared recovery states, returning pending accounts, replacement verification, and successful email correction. The email-correction completion was exercised in agent-browser with a real delivered code on an isolated fixture account; its primary action is at y=438.5 mobile / 596.5 desktop, within one pixel of Penpot. The seed account was not changed. Recovery presentation tests use real pending sessions and control only the failure response being reviewed where a deterministic boundary is necessary. Wrong current passwords and occupied replacement emails are rejected by the real backend, and the tests confirm that the old mailbox is retained. The Google introduction controls provider-method metadata; its code is delivered by the real local backend after the user continues. These captures do not establish a real Google consent round trip.

Current automated evidence and final commands are recorded below as checks finish. Do not interpret screenshot review as proof that all 48 boards or provider-dependent states have been validated.

- Backend targeted auth, Calendar OAuth, and channel verification tests: **87 passed**. The email-correction password-budget regression failed against the previous implementation and passed after the limit was added. Direct endpoint tests also confirm that expired reset credentials and credentials issued before an email change cannot replace the password; the original password remains usable. Fresh linked-Google confirmation succeeds for the initiating browser and rejects a missing browser cookie, a different Google subject, a mismatched nonce, replay after completion, a different account's session, and a second session of the same account. Those tests replace only Google's remote token exchange/verification boundary; they do not establish a real Google consent round trip.
- Registration and recovery browser suites: **22 passed** against the local services. This includes the original ten journeys, nine recovery/legacy presentation cases, the Google Fonts outage regression, native clipboard paste of a spaced verification code, and keyboard skip navigation. The paste regression reproduced browser `maxLength` truncation before normalization; handling clipboard text before native insertion preserves all six digits. Earlier failures identified backend rebuild overlap, premature checks during SMTP delivery, a provider fixture clicked before hydration, and the real blocking font stylesheet; their causes were resolved rather than disabling assertions. Initial/retry code delivery waits for its actual HTTP response within a 45-second deadline before checking cooldown. Server cooldown assertions are unchanged. New recovery-screen regressions failed before their corresponding implementation changes.
- Calendar browser fixture suite: **78 passed** across desktop and mobile during this implementation.
- Backend and frontend TypeScript checks: passed during implementation; final checks repeated after the last edits.
- Browser tests use the real local backend, PostgreSQL, Redis, and Mailpit for registration/recovery; Calendar UI tests control the remote provider/API boundary. Recovery waits up to twenty seconds for the bounded SMTP operation rather than assuming completion within the default five-second UI assertion.
- Automated axe WCAG A/AA review of verification found zero violations. Sign-in/profile found zero violations; the profile card now has a named region after an audit finding. Axe could not determine contrast behind the Aurora button pseudo-element. Manual screenshot samples near the white sign-in label measured approximately **2.4–2.6:1**, below the 4.5:1 normal-text threshold. The owner reviewed the darker treatment and requested restoration of the original Aurora fill because the darker button appeared disabled. The original white 30% wash and white labels are restored; contrast remains unresolved for accessibility sign-off. Penpot was not modified by the darkening experiment.
- Seed-user keyboard review of Google linking at `390×844` confirmed visible focus through the current-password input, password toggle, confirm action, and defer link, with no horizontal overflow. The review found that `focus:not-sr-only` reset the shared skip link's positioning and padding, clipping or shrinking it. Its native-keyboard regression failed before the fix and passed afterward. The corrected skip link stays at x=8/y=8 with a 48 px height and moves focus to `#main-content` on Enter. [Keyboard measurements](../.impeccable/review/account-registration/implementation/link-google-keyboard-review.json) and the [focused mobile capture](../.impeccable/review/account-registration/implementation/link-google-skip-focus-mobile.png) document this limited review; human screen-reader review remains outstanding. Axe on the linking screen reported zero WCAG A/AA violations and one incomplete Aurora contrast check.
- The document-upload HTTP smoke fixture was adapted to verify newly created accounts; syntax was checked. The complete document-parser smoke was not run for this change.

Run from `apps/backend`:

```bash
bun run check-types
bun run test --runInBand src/infra/auth src/modules/calendar/calendar-oauth.service.spec.ts src/modules/messaging/messaging-handler.service.spec.ts
```

Run from `apps/frontend` with the local services already running:

```bash
bun run check-types
PLAYWRIGHT_BASE_URL=http://localhost:3000 PLAYWRIGHT_BACKEND_URL=http://localhost:5000 bun run test:e2e e2e/account-registration.spec.ts e2e/account-registration-errors.spec.ts --workers=1
bun run test:e2e --config playwright.entities.config.ts e2e/calendar-sync.spec.ts --workers=1
```

Set `AUTH_VISUAL_DIR` to an absolute local directory when running the registration suites to retain desktop/mobile captures. Google-dependent presentation fixtures remain distinct from evidence of real provider consent. The suites also check the shared recovery heading position and mobile overflow against the live Penpot measurements.

Before release:

1. Identity OAuth configuration is complete locally: **Sydia Identity Local Web** in `sydia-identity-dev`, consent app **Sydia Development**, External testing audience, and owner-approved support/developer contact `xcaptcha15@gmail.com`. The downloaded credentials matched both callback URIs and were saved only to the ignored environment. Real sign-in succeeded; the [persisted baseline](../.impeccable/review/account-registration/implementation/google-real-sign-in-baseline.json) records the verified Google-only account with onboarding complete and Calendar absent. Real repeat login and Google account switching have also succeeded. Dedicated fresh linked-Google confirmation has also passed. Further live identity rejection/cancellation, existing-email collision, and explicit-linking tests were stopped at the owner's request; their controlled automated coverage does not establish a real provider round trip. Verify a linked user's ID/data/Calendar account remain unchanged after Sydia email correction.
2. Different-account Calendar connection and disconnect/re-login have passed, followed by same-account Calendar revocation and fresh identity re-login across the separate Cloud projects. See the real-provider evidence table below. The owner-approved `muslimmujahid1712@gmail.com` was added to the Calendar testing audience after Google initially rejected it with 403; three testers are now listed. The seed account's existing `xcaptcha15@gmail.com` Calendar grant was preserved. The owner cancelled a real Calendar consent attempt; Sydia returned to `/settings/integrations?googleCalendar=denied` with the intended cancellation message, the same active Sydia session, unchanged verified user, and disconnected/token-free Calendar state. The owner then approved a fresh retry. Reconnection restored the same Calendar integration ID and primary calendar, with access and refresh credentials present, while preserving the Sydia user ID and Google identity. Finish manual calendar switching. Review late callbacks and account deletion across both projects, including identity-grant cleanup.
3. Confirm external SMTP delivery, bounce handling, operational monitoring, and the production sender. Review quotas and retention with the owner.
4. Complete live Penpot comparison of remaining provider/error/linked settings states and keyboard/screen-reader review. Penpot reconnected on 19 October; the restarted watchdog confirmed healthy plugin round trips. The Google collision screen now places recovery and the linking explanation before submission as designed. Its email remains editable because the provider error redirect does not supply a trusted selected address; the design's example identity must not be invented in the application. The Aurora contrast limitation above remains recorded following the owner's request to restore the original fill.

### Real Google verification evidence

These local checks were observed on 20 October 2026 (Asia/Makassar). Evidence files contain account/status metadata and session creation times, without tokens or cookies.

| Check                              | Observed result                                                                                                                                                                      | Evidence                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google signup                      | Verified Google-only account, completed onboarding, Calendar absent                                                                                                                  | [Identity baseline](../.impeccable/review/account-registration/implementation/google-real-sign-in-baseline.json)                                                                                                                    |
| Different Calendar account         | Login `xcaptcha15@gmail.com`; Calendar `muslimmujahid1712@gmail.com`; unchanged Sydia user                                                                                           | [Connected state](../.impeccable/review/account-registration/implementation/google-calendar-connected.json)                                                                                                                         |
| Different-account disconnect/login | Calendar tokens cleared; zero active Sydia sessions after sign-out; new Google login session for the same user                                                                       | [Before login](../.impeccable/review/account-registration/implementation/google-post-disconnect-signout.json), [after login](../.impeccable/review/account-registration/implementation/google-post-disconnect-login.json)           |
| Google account switching           | `muslimmujahid1712@gmail.com` has its own verified Google-only Sydia account, onboarding complete, initially no Calendar                                                             | [Second account baseline](../.impeccable/review/account-registration/implementation/google-same-account-baseline.json)                                                                                                              |
| Same-account Calendar connection   | Login and Calendar both use `muslimmujahid1712@gmail.com`                                                                                                                            | [Connected state](../.impeccable/review/account-registration/implementation/google-same-account-connected.json)                                                                                                                     |
| Same-account revocation/login      | Calendar tokens cleared; zero active Sydia sessions after sign-out; fresh Google identity login creates a new session for the unchanged verified user, Calendar remains disconnected | [Before login](../.impeccable/review/account-registration/implementation/google-same-account-signout.json), [after login](../.impeccable/review/account-registration/implementation/google-same-account-post-revocation-login.json) |
| Calendar cancellation              | Real consent cancellation returns to Integrations with `googleCalendar=denied` and the intended message; same Sydia account/session, Calendar disconnected with no tokens            | [Persisted cancellation state](../.impeccable/review/account-registration/implementation/google-calendar-real-cancellation.json)                                                                                                    |
| Calendar reconnect                 | Retrying consent restores the same integration ID and primary calendar with access/refresh credentials present; same Sydia user and Google identity                                  | [Reconnected state](../.impeccable/review/account-registration/implementation/google-calendar-real-reconnect.json)                                                                                                                  |
| Fresh linked-Google confirmation   | Dedicated real callback renews the existing session's Google ownership proof; Sydia email/user ID and connected Calendar remain unchanged                                            | [Confirmation evidence](../.impeccable/review/account-registration/implementation/google-real-fresh-confirmation.json)                                                                                                              |

The owner completed Google authentication and permission prompts manually; Computer Use handled the Sydia controls and inspected rendered results. These checks do not establish the remaining collision/linking, calendar-switching, deletion, or production-consent gates.

For the dedicated fresh linked-Google confirmation check, recent sign-in initially satisfied the ten-minute proof window. Only the isolated test session's short-lived Redis confirmation record was explicitly expired as test setup; the Sydia session, Google identity, and Calendar credentials were preserved. Reloading `/change-email` then showed **Konfirmasi akun Anda** with the actual linked Google email. Its confirm action reached Google's **Sydia Development** chooser. The owner confirmed the same linked account, and the real callback returned to `/change-email?confirmation=complete` with **Masukkan email baru**. [Backend evidence](../.impeccable/review/account-registration/implementation/google-real-fresh-confirmation.json) confirms a renewed session-bound `google` proof with 563 seconds remaining, the original session creation time, unchanged verified Sydia email/user ID, and the same connected Calendar integration. No replacement email was submitted.

### Owner-requested wrap-up

On 20 October 2026 (Asia/Makassar), the owner requested no further testing after the real Google and Calendar checks above. Development work is handed back without claiming production release readiness. Existing-email collision and explicit linking retain controlled automated coverage; additional real-provider cases, manual calendar switching, deletion/late-callback review, external SMTP operations, and the previously recorded accessibility sign-off remain release follow-ups. No additional Google test account was requested or created after that decision.

### Local identity OAuth client setup

In the Google Auth Platform **Clients** page for `sydia-identity-dev` (x Captcha account), prepare:

- Application type: **Web application**.
- Name: **Sydia Identity Local Web**.
- Authorized JavaScript origin: `http://localhost:3000`.
- Authorized redirect URI: `http://localhost:5000/api/auth/callback/google`.
- Additional authorized redirect URI: `http://localhost:5000/api/auth/registration/google/callback`.

Keep the new client in the identity project; the existing Calendar client remains in `sydia-dev`. Save the resulting client ID and secret only in the local backend environment as `BACKEND_GOOGLE_IDENTITY_CLIENT_ID` and `BACKEND_GOOGLE_IDENTITY_CLIENT_SECRET`; do not paste the secret into chat or commit it. The development backend must restart with those values before real OAuth testing. The client was created with owner approval, and the downloaded credentials were validated and saved locally. Their values are excluded from this document and chat.

These are release gates, not evidence of completed provider or production testing.
