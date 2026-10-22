# Account registration, email verification, and Google sign-in

Date: 19 October 2026

Status: Agreed feature scope with implementation in progress. The decisions below record the product interview; engineering defaults are identified separately. Local verification does not establish release readiness for Google OAuth. See the [implementation and rollout runbook](./ACCOUNT_REGISTRATION_IMPLEMENTATION.md) for evidence and remaining gates.

## Intended outcome

People can register with email and password after proving ownership of their email address, or register and sign in through Google. Calendar access remains a separate, optional authorization. Existing users retain their accounts and data when adopting the new login methods.

## Agreed decisions

| Area                                             | Agreed behavior                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email/password signup                            | Keep the existing name/email/password form, then show an email OTP step.                                                                                                                                                                          |
| Access before verification                       | Account remains pending. No onboarding or product access until verification succeeds.                                                                                                                                                             |
| Returning pending users                          | The next successful authentication resumes verification.                                                                                                                                                                                          |
| Google signup                                    | Skip Sydia's email OTP when Google supplies an acceptable verified email identity. Otherwise require email verification.                                                                                                                          |
| Calendar authorization                           | Optional and initiated from Settings → Integrations. Do not offer Calendar connection during registration or onboarding.                                                                                                                          |
| Google sign-in permissions                       | Request identity permissions; do not request Calendar access during registration or login.                                                                                                                                                        |
| Existing account with matching Google email      | Require authentication with the existing login method before explicitly linking Google. Email matching alone must never link accounts.                                                                                                            |
| Account continuity                               | Linked login methods use the same Sydia user ID, data, onboarding progress, and Calendar integration.                                                                                                                                             |
| Calendar account selection                       | May differ from the Google sign-in account. Show the sign-in and Calendar accounts separately.                                                                                                                                                    |
| Existing settings pages                          | Add sign-in method controls to the existing `/settings/profile` page. Keep Calendar management in the existing `/settings/integrations` page. Preserve the dashboard shell and settings navigation; do not introduce a replacement settings page. |
| OTP format and lifetime                          | Six digits; expires after ten minutes.                                                                                                                                                                                                            |
| OTP resend                                       | Available after sixty seconds; a new code invalidates the previous code.                                                                                                                                                                          |
| Incorrect codes                                  | Five incorrect attempts invalidate the code. A new code must be requested; server-side sending and guessing limits also apply.                                                                                                                    |
| Existing unverified users                        | Require verification on the next visit after rollout, including users with existing sessions. Preserve their data and integration records.                                                                                                        |
| Incorrect or inaccessible registered email       | Offer Change email from the verification screen. Require the current password or an already linked Google login; verify the replacement email before committing the change.                                                                       |
| Replacement email collision                      | Reject an address already belonging to another account. Do not merge automatically.                                                                                                                                                               |
| Forgotten password                               | Include email OTP password recovery for email/password accounts. Set a new password, revoke existing sessions, then require sign-in again.                                                                                                        |
| No accessible inbox and no usable existing login | Automated recovery is unavailable. A support recovery policy, if any, remains undecided.                                                                                                                                                          |

## Repository baseline before this enhancement

The baseline below records repository observations, not production deployment verification.

- `apps/backend/src/infra/auth/auth.ts` configures Better Auth and the Prisma adapter, email/password login, the admin plugin, account creation provisioning, and identity lifecycle audit hooks. It does not currently configure Google social login or required email verification.
- Better Auth owns the identity user, session, account, and verification tables. Keep identity operations inside its supported APIs and hooks rather than writing identity tables from feature services.
- `apps/frontend/src/routes/sign-up.tsx` and `sign-in.tsx` provide the existing auth screens. The auth API/query layer currently assumes successful signup can reconcile an authenticated session and load the current user. A pending signup requires a different result and routing path.
- `apps/frontend/src/lib/auth.ts` uses session and onboarding state for route protection. Verification must become an additional server-enforced condition; a frontend redirect alone is insufficient.
- `apps/backend/src/modules/calendar/calendar-oauth.service.ts` already runs a separate authenticated Calendar authorization flow with one-time OAuth state, browser/session binding, scope checks, and encrypted Calendar credential storage through the existing repository.
- The Calendar callback returns to Settings. Keep Calendar connection and calendar selection in Settings → Integrations, separate from registration and onboarding.
- Calendar disconnect and account deletion currently revoke Google credentials. This behavior needs review alongside Google login.
- Backend package configuration declares Better Auth `^1.7.2`. Verify the resolved installed version and its actual endpoint behavior before implementation; current online docs are a reference rather than proof of installed behavior.
- The demo seed deliberately creates an unverified demo user. Update development fixtures deliberately for the new verification gate; never exempt demo email addresses in production logic.

## Implementation requirements

These constraints derive from the agreed decisions. Validate them against the installed libraries and deployed environment; see the runbook for current coverage.

### Identity and authorization boundaries

1. Retain Better Auth for password auth, Google identity, verification, recovery, and explicit account linking. Prefer its email OTP plugin where its behavior satisfies the required flows.
2. Public signup, resend, recovery, and OAuth endpoints must not create unrestricted access for an unverified user. Any authenticated verification context must be limited to the specific recovery/verification operations it authorizes.
3. Enforce verification at protected backend entrypoints, including admin and channel linking. Explicitly enumerate public infrastructure callbacks and the narrow verification/recovery endpoints that remain reachable.
4. Already verified users and linked provider identities remain associated by stable identity IDs. Do not reassign an account or merge data because an email string matches.
5. Use Google's stable subject identifier for the Google identity, with server-side issuer, audience, signature, expiry, and flow validation through supported libraries. Treat provider email verification as an explicit policy check.
6. A failed, cancelled, or incomplete Calendar authorization must not undo signup, remove a Google login link, or change the chosen Sydia user.

### Google authorization isolation

Google documents that token revocation invalidates the user's authorizations across clients in the same Google Cloud project. Different client IDs alone therefore do not guarantee that Calendar revocation leaves login authorization untouched.

Deployment design: use separate Google Cloud projects and OAuth credentials for Sydia identity and Google Calendar, with their own redirect URIs and consent configuration. Google login requests identity scopes only; Calendar retains its existing authorization and token lifecycle. Set the identity provider's incremental-grant behavior explicitly so it cannot unexpectedly inherit Calendar permissions. Verify disconnect, account switching, late callback cleanup, and deletion with real Google accounts before release.

Reference: [Google token revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke) and [Better Auth Google provider options](https://better-auth.com/docs/authentication/google).

### OTP and delivery

- Bind a challenge to its purpose, target email, relevant account, and a particular verification/recovery attempt. Registration verification, email replacement, and password recovery codes are not interchangeable.
- Use cryptographically generated codes and protected storage; never log codes, passwords, provider tokens, or recovery credentials.
- Verification and consumption must be atomic. Expired, invalidated, and consumed codes cannot succeed, including concurrent submissions.
- Enforce cooldowns, expiry, and cumulative attempt limits on the server. Resend must not reset all abuse budgets. Initial configurable engineering defaults are five sends/hour, ten sends/day, and twenty guesses/hour per target email, shared across purposes.
- Do not show delivery success when the provider rejects the message. A delivery failure must leave a recoverable pending state, with actionable feedback and operator diagnostics.
- Do not allow a submitted signup form, an OTP intended only to verify email, or a stale authenticated browser to activate a password that the mailbox owner did not choose or prove knowledge of. Validate pending-signup takeover resistance against the installed Better Auth behavior.
- Do not store plaintext signup passwords in browser persistence, URLs, logs, or pending registration records. A returning user can authenticate again.

### Email correction and account recovery

- An existing session alone is insufficient to change the registered address; require fresh proof through the current password or an already linked Google login.
- Keep the old account email until the new address's code succeeds. If the replacement conflicts at completion time, preserve the account and report the conflict.
- Bind correction to the authenticated account and the specific proposed replacement. Editing the address starts a new challenge and invalidates the previous correction attempt.
- Preserve the Sydia user ID, historical data, onboarding state, and independent Calendar account. Changing the Sydia email does not move Google identities or Calendar connections.
- Password reset must be single use, revoke existing sessions, and return to sign-in. Recovery of an unverified pending signup must not leave an older, unproven password usable.

## User journeys and state contract

### Email/password signup and returning users

1. Collect name, email, password, and matching password confirmation. Validate email syntax and password constraints before submission. Syntax validation cannot prove that an inbox exists or is accessible.
2. Create an unverified account and a restricted authenticated session. Show **Periksa email Anda** with the submitted address and send a code. Do not load protected product data.
3. Accept one accessible six-digit input with paste, numeric keyboard, and one-time-code autofill. Show a server-authoritative resend countdown and a Change email action.
4. A successful code verifies the account and retains the current session. Resume the existing onboarding or existing signed-in destination according to role and saved onboarding state. Never insert a Calendar offer.
5. Returning pending users authenticate with their existing method and resume verification. Existing unverified accounts and sessions use the same gate without data migration or account recreation. Fresh ownership proof expires after ten minutes; a stale pending browser must sign in again.

Account states are `pending verification` and `verified`. Screen states additionally include sending, code entry, submitting, wrong code, expired/consumed code, attempt limit, send limit, delivery failure, and fresh authentication required. A failed delivery never changes an account to verified.

### Invalid or inaccessible email

- A malformed address is rejected in the form. An undeliverable but syntactically valid address remains unverified; delivery rejection shows retry feedback. Provider acceptance alone does not prove delivery or ownership.
- **Email salah? Ubah email** requires the current password, or a fresh sign-in with an already linked Google identity. A browser session alone is insufficient.
- Send a distinct-purpose code to the replacement address. Keep the original email until that code succeeds. An occupied replacement address is rejected, including a collision discovered at completion.
- Preserve the user ID, all product data, onboarding state, and independent Calendar integration. An unavailable inbox plus no usable existing login has no automated recovery path.

### Google registration, sign-in, and linking

1. **Lanjutkan dengan Google** requests `openid email profile`, uses account selection, and handles cancellation or provider failure with a retry/sign-in screen.
2. Validate Google's token server-side, including signature, audience, issuer, expiry, stable subject, and applicable OAuth flow binding. Identify a linked Google account by its stable subject, never by email alone.
3. Skip the mailbox challenge only for an acceptable Google-hosted verified address: a verified Gmail address or a verified address with Google's hosted-domain claim. Other Google identities require Sydia email OTP even when Google reports `email_verified=true`; third-party mailbox ownership can change. [Google identity verification policy](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
4. If a matching Sydia email belongs to an account without that Google identity, require the existing login method and explicit linking. Never silently merge. Linking requires fresh proof, the same account email under the initial linking policy, and a successful Google round trip.
5. Add **Cara masuk** to the existing Profile settings. Display the linked Google email separately from the Sydia email and the Calendar email. If identity metadata cannot be read, show that it is unavailable rather than substituting another account's email.

Google-only password setup and unlinking are outside the initial release. Do not expose controls or callable shortcuts for those unresolved policies.

### Password recovery

1. Collect an email on **Lupa kata sandi?**. Request an email OTP for an existing password account. Google-only accounts are directed to their linked Google login.
2. Consume the recovery code once and issue a separate, short-lived recovery credential to the submitting browser. Keep it only in memory, never URLs or browser persistence.
3. Collect and confirm the replacement password. Consume the recovery credential once, reject it if the account email has changed, verify the mailbox, replace the password, and revoke previous sessions.
4. Show success and return to sign-in. Recovery of an unverified signup must replace its previous password before product access becomes possible.

### Calendar

Registration does not connect Google Calendar automatically, including Google registration. Calendar is a separate optional authorization from **Settings → Integrations** using its existing scopes, calendar selection, credentials, and sync lifecycle. A different Google account may be chosen. Return connected, denied, failed, or offline-consent-required outcomes to `/settings/integrations` with actionable feedback. Cancellation must not alter the Sydia account or Google sign-in link.

## Acceptance criteria

| Scenario                                 | Required result                                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| New password signup                      | OTP screen; onboarding and protected backend APIs deny access until verification.                                          |
| Existing unverified session              | Same account resumes verification; historical data remains intact.                                                         |
| Legacy linked chat channel               | Incoming and recovered queued product turns require verified email before assistant processing.                            |
| Wrong, expired, or consumed code         | Actionable failure; no verification or account mutation.                                                                   |
| Fifth wrong code                         | Challenge invalidated immediately; correct old code cannot succeed.                                                        |
| Resend                                   | Enforce sixty seconds on server; rotate code without clearing aggregate budgets.                                           |
| Concurrent correct submissions           | At most one succeeds. Wrong attempts cannot restore a superseded challenge.                                                |
| Invalid address or delivery rejection    | Account stays pending; correct email or retry without losing account data.                                                 |
| Replacement email                        | Fresh ownership confirmation and new-email code required; old email retained until completion.                             |
| Recovery replay or changed account email | Reject credential; no password change.                                                                                     |
| Successful recovery                      | Old password and old sessions cannot access the account; new password signs in normally.                                   |
| Verified Google identity                 | Same linked user returns; new identity follows existing onboarding.                                                        |
| Unacceptable Google email                | Sydia verification required.                                                                                               |
| Matching email, unlinked identity        | No implicit linking or new duplicate identity; offer existing-method authentication and explicit linking.                  |
| Identity-only OAuth                      | No Calendar scopes or automatic Calendar connection.                                                                       |
| Calendar disconnect                      | Existing Google login remains usable when projects are isolated.                                                           |
| Keyboard and responsive UI               | Usable labels, focus, errors, paste/autofill, scrolling, and mobile touch targets; no credential leakage before hydration. |

## Engineering defaults and remaining product decisions

Continue the interview one question at a time, with a recommendation for each decision.

1. Optional password setup and Google unlinking for users who initially register through Google.
2. Production email delivery uses the Resend HTTPS API with a send-only key and verified sender domain (`no-reply@sydia.id`). Monitor delivery and bounce events in Resend. Automated browser tests capture Resend requests locally with a fake key.
3. Retaining the restricted session after verification is the implemented engineering default; pending sessions cannot access product APIs.
4. Abandoned signup cleanup policy. Initial implementation retains pending accounts and never deletes historical unverified accounts automatically.
5. Tuning cumulative quotas and defining any support recovery policy. Initial limits above are configurable; no manual recovery promise is exposed.

Resolve the remaining product/operational policies before release. The runbook records endpoint contracts, configuration, rollout steps, test results, and unresolved external verification; implemented defaults are not additional interview approvals.

## Documentation references

- [Existing Calendar sync scope and lifecycle](./GOOGLE_CALENDAR_SYNC_PLAN.md)
- [Better Auth Email OTP](https://better-auth.com/docs/plugins/email-otp)
- [Better Auth Google provider](https://better-auth.com/docs/authentication/google)
- [Better Auth account linking and unlinking](https://better-auth.com/docs/concepts/users-accounts)
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Google authorization and incremental scopes](https://developers.google.com/identity/protocols/oauth2)
- [Google OAuth revocation behavior](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)
