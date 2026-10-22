# Account registration design handoff

Status: Updated 19 October 2026. Penpot contains 48 boards after removing both Calendar onboarding screens from desktop and mobile. Calendar connection and calendar selection are initiated only from Settings → Integrations.

Source: [Account registration auth spec](./ACCOUNT_REGISTRATION_AUTH_SPEC.md). The spec remains a draft; these designs do not approve its open decisions or implement authentication behavior.

Implementation follow-up: [local implementation and rollout report](./ACCOUNT_REGISTRATION_IMPLEMENTATION.md). The historical design review below remains scoped to its stated exports. During implementation, live Penpot text properties specified **Inter Tight**; auth/profile now use that scoped font, correcting the generic Inter label below. The report records browser captures, measured geometry, tests, contrast findings, and remaining provider/live-design verification.

## Visual direction

Preserve Sydia's existing Aurora Haze system: Inter typography, warm ivory `#FBF8F5`, ink `#171419`, muted text `#6B6470`, and the existing Aurora primary-action fill. The boards reuse existing Penpot input and brand assets. Errors include actionable text rather than relying on color alone.

Login and registration use two desktop columns: the product demonstration on the left and a 448 px form on the right. Remaining authentication steps use centered single columns. Settings follows the existing dashboard shell and SettingsNav rather than an authentication-page shell. Mobile auth uses a 342 px form inside a 390 px viewport. Long forms scroll rather than shrinking touch targets. Signup retains name, email, password, and confirmation password alongside Google sign-in.

Settings revision complete: all four combined “Akun & integrasi” boards now show linked/unlinked Google states of the existing `/settings/profile` page. They preserve name, email, timezone, language, and the existing save action, with an added “Cara masuk” section. The existing desktop settings rail and mobile tabs remain: Profil, Asisten, Notifikasi, Integrasi. Google Calendar stays in `/settings/integrations`; no new settings route or combined replacement page is required. Existing board IDs are preserved. Email change, password recovery, and Google linking actions connect to their corresponding prototype boards.

Layout revision complete: login and registration retain the split panel. The other 14 authentication boards use centered 448 px forms. The two settings states use the existing dashboard and settings layout. Earlier centered-auth structure checks found no empty desktop boards, detected text overlap, or board overflow. The settings revision separately confirmed all four boards completed, no content outside board bounds, and white Aurora save-button labels. Fresh desktop and mobile unlinked-Google settings exports were visually inspected; this review does not cover every authentication board.

This work extends the existing visual system; it does not replace the product's visual direction.

Rainbow/Aurora button labels use white (`#FFFFFF`), as requested. The saved signup exports and their review predate this label-color correction; current Penpot boards are authoritative for this detail.

The desktop and mobile “Google · Tautkan secara eksplisit” boards omit the Calendar explanation, icon, and divider. Their connect and defer actions move up to follow the sign-in explanation directly.

## Existing UI inspection

Inspected the local signup page using agent-browser at `http://127.0.0.1:3000/sign-up`. Its accessibility snapshot confirmed name, email, password, confirmation password, Create account, and Sign in controls. At 1440 × 960, computed rectangles reported the form at x≈791 with width 448 px; typography was Inter and the background was ivory.

The browser's screenshot command timed out. No screenshot of the running application is claimed as captured or reviewed. The exported images below are Penpot designs.

## Penpot deliverables and navigation

Open the verified [Sydia Penpot server](https://penpot.muslimmujahid.com) and locate file **Sydia**. The IDs below identify the file and pages without assuming a workspace/project URL.

- File ID: `4a7e6716-c5b5-8080-8008-c936c7a3dabc`.
- Desktop page: **Sydia · Account registration · Desktop**, ID `ad1dce6f-66f5-805e-8008-cfb5851c1782`.
- Mobile page: **Sydia · Account registration · Mobile**, ID `ad1dce6f-66f5-805e-8008-cfb586dbd717`.

| Location     | Boards | Arrangement                                                                                                                                                                           |
| ------------ | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop page |     30 | 18 main journey boards at 1440 px wide: authentication boards are 960 px tall and the two settings boards are 1100 px tall. Twelve shared recovery boards at 390 × 844 sit at y≥6020. |
| Mobile page  |     18 | Main journey counterparts at 390 px wide; most are 844 px tall, signup is 1060 px, and both settings states are 1500 px. Rows use a 1640 px pitch.                                    |
| Total        |     48 | Calendar onboarding screens and their flow entry points were removed.                                                                                                                 |

The [board inventory](../.impeccable/review/account-registration/penpot-inventory.json) records the remaining board keys, IDs, dimensions, positions, and prototype controls. The profile boards identify `/settings/integrations` as the existing Calendar destination through handoff metadata. Calendar authorization uses the existing integration flow and external Google consent.

### Agreed flow coverage

Main journey keys below exist on both pages. Recovery keys refer to the shared boards on the Desktop page.

| Agreed flow or state                                            | Board keys                                                                             | Design handoff notes                                                                                                                                                                                                |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email/password registration and verification gate               | `signup` → `verify` → `verify-ready`                                                   | Empty and completed six-digit OTP states; confirmation password retained. Continue existing personalization after verification, without a Calendar offer. Settings is an illustrative signed-in prototype endpoint. |
| Returning pending and existing unverified users                 | `signin`, `legacy`, `verify`                                                           | Illustrates resuming verification while preserving account continuity.                                                                                                                                              |
| Google registration/sign-in                                     | `signup`, `signin`, `google-unverified`, `google-cancelled`                            | Identity sign-in is separate from Calendar authorization; unacceptable/unverified email has a verification recovery state.                                                                                          |
| Matching Google email and explicit linking                      | `google-collision` → `link-google`, `settings`, `settings-unconnected`                 | Illustrates authentication with the existing method before explicit linking; no automatic merge by email.                                                                                                           |
| Email correction with current password                          | `change-email` → `verify-email` → `email-updated`                                      | Replacement email is verified before the illustrated completion.                                                                                                                                                    |
| Email correction with an already linked Google identity         | `change-email-google` → `change-email-after-google` → `verify-email` → `email-updated` | Separate fresh-identity confirmation path.                                                                                                                                                                          |
| Password recovery                                               | `forgot` → `reset-verify` → `reset-password` → `reset-done` → `signin`                 | Illustrates requesting a code, entering it, setting a password, and returning to sign-in.                                                                                                                           |
| Optional Calendar authorization and account selection           | Existing `/settings/integrations`; profile boards reference this route                 | Settings → Integrations is the sole entry point. Google supplies consent UI; use the existing settings flow for calendar selection. Calendar identity may differ from sign-in identity.                             |
| Incorrect, expired, or invalidated OTP                          | `wrong-code`, `expired-code`, `attempt-limit`                                          | Retry/new-code recovery states, including invalidation after five incorrect attempts.                                                                                                                               |
| Delivery failure and throttling                                 | `delivery-failed`, `send-limit`                                                        | Actionable retry/wait states; server limits remain implementation work.                                                                                                                                             |
| Replacement email collision                                     | `email-conflict`                                                                       | Correct the address without merging accounts.                                                                                                                                                                       |
| Cancelled or unsuccessful Calendar authorization                | `calendar-denied`, `calendar-failed`                                                   | Retry or continue without Calendar to `settings-unconnected`.                                                                                                                                                       |
| Failed ownership confirmation or unavailable automated recovery | `identity-rejected`, `recovery-unavailable`                                            | Retry/use an existing recovery method, or return to sign-in; no invented support recovery promise.                                                                                                                  |

Google consent screens are external handoffs rather than Sydia-designed provider screens. Example identities are illustrative. Prototype return paths demonstrate navigation; they do not simulate provider authentication, session state, code consumption, or data persistence.

Existing personalization/onboarding is preserved but is not redrawn in this set. Calendar must not be offered during registration or onboarding. Direct prototype transitions to settings are illustrative endpoints, not approval to skip existing personalization or change onboarding completion rules.

## Review evidence and scope

- Exported and visually inspected the [desktop signup](../.impeccable/review/account-registration/desktop.png) and [mobile signup](../.impeccable/review/account-registration/mobile.png) designs. Also visually inspected mobile completed OTP and the shared wrong-code state.
- A fresh finish review of the two signup exports returned **ship**, with no material issues. That verdict applies only to those static screenshots.
- Earlier geometry checks found zero board-boundary violations and no mobile text-overlap findings before the four Calendar boards were removed.
- Corrected expired-code heading clearance; all 12 shared recovery headings have at least 31.5 px clearance to following content.
- Removed Calendar onboarding boards, their flow entry points, and incoming links. Signup/verification prototype endpoints point to signed-in settings. Profile boards reference the existing integrations route. Mobile rows now use a 1640 px pitch; a fresh check found zero intersecting mobile boards. This is prototype structure verification, not an end-to-end authentication test.

These checks do not establish full visual review of every board, implemented accessibility, responsive browser behavior, working OTP delivery, backend authorization, or real Google OAuth/Calendar behavior. The Penpot watchdog was restarted during this revision; it reports intermittent connection timeouts and cannot guarantee that the browser will keep the plugin active.

## Implementation guidance and open work

Implement OTP entry as one accessible six-digit code input even if visually segmented. Support paste, numeric input, and browser one-time-code autofill. Announce errors and cooldown updates without shifting focus unexpectedly. Ten-minute expiry, sixty-second resend cooldown, invalidation after five incorrect attempts, and all sending/guessing limits must be server authoritative.

Enforce verification in the backend as well as routes. Email correction requires fresh authentication through a current password or already linked Google identity; retain the old email until replacement verification succeeds. Preserve the Sydia user ID, data, onboarding progress, and independent Calendar connection. Password recovery must revoke existing sessions and return to sign-in, as required by the source spec.

Google-only password setup and Google unlinking remain unresolved. The designs do not authorize those policies. Other open spec decisions, including delivery setup, post-verification session behavior, abandoned signup cleanup, quotas, and support recovery boundaries, still require resolution before implementation is considered ready.

Implementation must be validated separately with keyboard/screen-reader and responsive testing, actual email/OTP lifecycle tests, backend verification gates, migration checks, and real Google identity/Calendar flows. No application behavior was implemented or validated by this design handoff.
