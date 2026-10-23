# Per-user WhatsApp assistant accounts

Date: 22 October 2026

Status: Product scope agreed through interview. Implementation progress and verification are tracked in [WHATSAPP_IMPLEMENTATION.md](./WHATSAPP_IMPLEMENTATION.md). Engineering requirements and defaults below make the agreed behavior implementable; they are not additional product features.

This document supersedes the shared-number WhatsApp model and conflicting WhatsApp delivery restrictions in the original PRD, architecture document, and roadmap.

## Outcome and scope

Each Sydia user supplies a dedicated WhatsApp assistant account and chats with it from their everyday WhatsApp account. Sydia hosts the existing GoWA integration and manages a separate connection for each user.

Fix the connection model and the agreed delivery restrictions. Reuse existing settings, schedules, assistant behavior, and supported media. Add no notification configuration controls, configurable quiet hours, provider credentials for users to manage, or new notification-management pages. Connection setup, verification, status, replacement, and disconnect actions belong in the existing integration surface.

## Agreed product decisions

| Area                           | Required behavior                                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account model                  | A separate, user-controlled assistant number; the owner talks to it from their everyday account.                                                                            |
| Audience                       | Only the verified owner. Ignore other contacts and all groups without replying to them.                                                                                     |
| Provider                       | Use GoWA QR login for assistant-account pairing. Do not move to the official Business Platform in this change.                                                              |
| Setup                          | Scan Sydia's QR from the assistant account, then send a one-time verification message to it from the owner's everyday account.                                              |
| Activation                     | Both pairing and owner verification must succeed before normal assistant requests or reminders are enabled.                                                                 |
| Cardinality                    | At most one active assistant number and one verified owner number per Sydia user.                                                                                           |
| Replacement                    | Verify replacement numbers and preserve Sydia data.                                                                                                                         |
| Ordinary replies               | Send as soon as ready, in order through a separate queue per assistant.                                                                                                     |
| Removed reply restrictions     | Remove the one-message-per-minute limit, 30-per-hour cap, and artificial pre-reply/typing delays.                                                                           |
| Reminder eligibility           | Requested reminders continue regardless of conversation volume or replies to previous reminders.                                                                            |
| Additional proactive messages  | Require explicit opt-in through existing settings; pairing alone does not enable check-ins, suggestions, or briefings.                                                      |
| Removed proactive restrictions | Remove the proactive/inbound ratio, latest-proactive reply requirement, and unanswered-message cutoff for requested reminders and opted-in check-ins/briefings.             |
| Quiet hours                    | Remove the fixed 22:00–08:00 WhatsApp gate entirely. Existing scheduler timing determines delivery, including overnight.                                                    |
| Notification controls          | Dashboard settings only. No reserved STOP/START commands, hard-coded opt-out interception, canned command instructions, or natural-language changes to channel preferences. |
| Disconnection recovery         | One catch-up summary of missed reminders after reconnection, then normal future delivery. Do not replay each missed reminder.                                               |
| Rollout                        | Direct replacement. Existing users reconnect with their own assistant number; no temporary shared-number mode.                                                              |
| Configuration scope            | No additional configuration controls or notification-settings redesign.                                                                                                     |

The assistant does not connect to the owner's everyday account, read its conversations with other people, act for other contacts, or participate in groups.

## Repository baseline

These are checkout observations, not production verification.

| Surface          | Current implementation and impact                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GoWA client      | `apps/backend/src/infra/whatsapp/whatsapp.client.ts` already sends `X-Device-Id` when a device ID is supplied. Reuse this capability.                                                          |
| Gateway          | `whatsapp.gateway.ts` holds one client, device identity, lifecycle, and snapshot. The repository stores gateway state under `id: 'default'`. These must become connection-scoped.              |
| Webhooks         | `whatsapp.types.ts` permits a top-level `device_id`, but the gateway normalizes the payload without carrying the receiving connection through processing.                                      |
| Identity routing | `modules/whatsapp/whatsapp.service.ts` finds the user by sender identity and has one outbound queue. Sender identity must no longer select an assistant independently of the receiving device. |
| Pairing API      | `POST /whatsapp/companion/pair-code` is admin-only. Users currently create a code for linking their sender identity to the shared account.                                                     |
| Deduplication    | `WhatsAppInboundMessage` is unique on provider/message ID. Multi-account receipt and message processing need connection scope.                                                                 |
| Policies         | `whatsapp.policy.ts` contains shared-number ceilings, engagement checks, artificial delays, quiet hours, and opt-out command matching.                                                         |
| Preferences      | Existing preferences include WhatsApp notifications, briefing enablement/time, and follow-up interval. Several default to enabled; a default is not evidence of explicit opt-in.               |
| UI               | `apps/frontend/src/components/settings/whatsapp-page.tsx` separates admin pairing from user linking and shows shared-operator recovery and STOP copy. Adapt this existing surface.             |
| Runtime          | The GoWA build helper defaults to v9.3.0. Verify the installed binary and device-scoped payloads; a configured build tag alone is not runtime evidence.                                        |

## Connection setup and lifecycle

### Setup

1. An authenticated, email-verified Sydia user opens the existing WhatsApp integration surface.
2. They turn on the WhatsApp connection switch. Sydia creates a server-owned connection/device association and displays its login QR inline in the existing Layanan panel. Do not require upfront phone-number entry or offer phone-number pairing codes.
3. On the dedicated assistant account's phone, the user opens WhatsApp → Perangkat tertaut → Tautkan perangkat and scans the QR displayed by Sydia. Only provider-confirmed login proves control of the assistant account. Read the paired assistant number from the provider's confirmed identity rather than a typed number.
4. Once paired, Sydia displays a one-time owner-verification message addressed to that assistant number. The user sends it from their everyday account.
5. Sydia verifies the challenge on that exact receiving connection and links the sender as its sole owner. Verification proves control of the everyday account.
6. Show the connection as ready only when the provider session is connected and both account proofs are valid.

The verification message is the only setup exception to ignoring unlinked senders. Do not submit pairing or verification secrets to the assistant, store them as conversation content, or ingest them into memory.

### Verification and identity requirements

- Reuse the current ten-minute owner-code lifetime as an engineering default. Store its hash; make consumption atomic and single-use. Issuing a replacement invalidates the previous code.
- Bind the challenge to the authenticated user, receiving connection, and connection generation. Wrong-device, expired, consumed, or superseded challenges cannot link an account.
- Keep QR validity provider-controlled. Use the provider's QR duration when available; do not reuse the ten-minute owner-message lifetime. An expired or superseded QR is visibly invalid and cannot complete setup. Offer a user-triggered QR refresh; do not start unbounded login/refresh loops.
- QR login replaces the phone-number pairing-code flow. The separate owner-verification message remains required. On a phone-sized screen, explain that the QR must be displayed on another screen for the assistant account's phone to scan; do not imply that the same phone can scan its own display or add a pairing-code fallback.
- QR images and login attempts are connection/generation scoped and accessible only to the authenticated owner through Sydia. Proxy the QR asset through the authenticated backend with no-store caching; validate provider asset origin/path and size rather than exposing a GoWA URL or credentials to the browser. Discard the QR on expiry, cancellation, confirmed login, replacement, or revocation.
- Normalize phone numbers and WhatsApp identities server-side. Preserve legitimate provider identity aliases using verified mappings; do not guess that unrelated identifiers or phone suffixes identify the same owner.
- Enforce one active assistant per user, globally unique active assistant-account ownership, and the existing owner-identity uniqueness contract. A collision produces an actionable conflict; never merge accounts or transfer ownership automatically.
- The assistant number must differ from its owner's everyday number.
- Apply existing authenticated-request and abuse-protection patterns to pairing and challenge generation. Do not add user-adjustable retry or verification settings.

### Replacement and disconnect

Starting replacement invalidates the old connection's authority before the replacement becomes active. There is never a period with two active assistant connections. Keep Sydia records and notification preferences; require fresh proof for the replacement connection.

Increment a connection generation on replacement or revocation. In-flight work must recheck it before media processing and before sending. Work tied to a revoked generation must not send through either the old account or a newly connected account.

Disconnect revokes local routing and sending immediately, invalidates pending challenges, and logs out/removes the associated GoWA device. If provider cleanup fails, keep the local connection revoked, record cleanup failure, and retry within a bounded cleanup job. Do not display cleanup as complete until it is complete. Account deletion follows the same credential/session cleanup while using existing data-deletion rules.

Keep provider sessions and credentials in protected server-side storage. Require the existing webhook secret outside development; a missing production secret is a configuration failure, not permission to use the development fallback. These requirements reuse existing infrastructure configuration.

Intentional disconnect or replacement is distinct from a transport outage. It does not create an obligation to replay old WhatsApp deliveries.

### Status and APIs

Expose the current user's assistant number, verified owner number, setup phase, transport state, and actionable recovery reason. Retain the existing transport states where useful; pairing complete but owner unverified is a distinct setup phase, not a ready connection.

Adapt the existing endpoints and response contracts rather than adding a parallel API:

| Endpoint                      | Required change                                                                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /whatsapp/status`        | Return only the authenticated user's connection and verification status; never the shared global snapshot or another user's state.                                                                                                            |
| `POST /whatsapp/companion/qr` | Replace the admin-only pair-code operation with authenticated, connection-scoped QR login. Derive ownership from the session. Return an authenticated QR asset reference, login-attempt identity, and provider validity; no GoWA credentials. |
| `POST /whatsapp/link-code`    | Issue a challenge only for that user's paired connection; bind it to the current generation.                                                                                                                                                  |
| `DELETE /whatsapp/link`       | Revoke that user's connection and owner link and initiate provider cleanup idempotently.                                                                                                                                                      |
| `POST /whatsapp/webhook`      | Retain provider signature verification and route every event by its receiving device before owner resolution.                                                                                                                                 |

Retire `POST /whatsapp/companion/pair-code`; do not preserve a hidden pairing-code fallback. Extend the existing GoWA client contract with QR login, using device-scoped `GET /app/login` and its `qr_link`/`qr_duration` response. Confirm the connected account through device-scoped status before enabling owner verification. Authentication collisions must be detected after scan and before activation; never displace an existing owner.

Remove shared-number pairing from the admin flow. Do not replace it with a new administration product. Reuse existing API error envelopes and frontend service/query conventions.

## Routing, persistence, and send isolation

These are engineering requirements for the agreed account model.

1. Authenticate each webhook with the existing raw-body signature mechanism.
2. Resolve its required provider `device_id` to a known active connection before reading it as a product request. Missing or unknown device IDs must not fall back to a default device or sender-based user lookup.
3. Ignore self-generated messages, groups, and non-owner messages before assistant processing, memory ingestion, or media downloads. A pending, valid owner challenge uses the dedicated verification path.
4. Resolve the Sydia user from that connection and verify that the sender is its owner. A sender linked to user B must not invoke B's context through user A's assistant.
5. Carry connection ID and generation through normalized messages, persisted channel turns, media/file operations, receipts, and send operations. Recovery after a process restart must retain this context.
6. Use one registered WhatsApp channel adapter that resolves the appropriate connection per operation. Do not overwrite the shared adapter registry with per-user closures.
7. Serialize sends per assistant using the existing queue infrastructure and a cross-process ownership/claim mechanism. An in-memory promise queue or one global filesystem lock is insufficient across API and worker processes.
8. Scope inbound/receipt deduplication and provider message lookups to the connection and provider message ID. Keep user-scoped notification idempotency and occurrence identity.
9. Match read markers, presence, file downloads/uploads, text sends, and receipts to the same receiving/sending device. Never use the provider's single-device default.
10. Recheck connection generation and owner authorization at delivery time. Claim delivery durably before attempting a side effect.

The current GoWA runner enables automatic media downloads. Disable that existing behavior for this integration so unauthorized contacts cannot cause pre-authorization downloads; verify on-demand downloads for authorized owner media against the deployed provider. Do not silently restore automatic downloads if that verification fails.

Persist a connection record with user, provider device, assistant identity, owner identity, generation, setup/transport state, and relevant timestamps. Scope gateway state and verification challenges to it. Adapt existing repository contracts and Prisma migrations; preserve historical identities and conversation references. Traffic counters may remain observational but must not enforce removed gates.

A restriction on one account pauses that account only. Shared GoWA infrastructure can still have a service-wide outage; per-account isolation is not a promise of independent hosting.

## Delivery behavior and policy review

### Replies and supported features

Send a completed response without the old fixed minute gap, hourly ceiling, randomized initial sleep, or reply-length typing sleep. Preserve existing shared assistant batching, ordering, cancellation, and domain behavior; this is not a conversation-engine rewrite. Presence may reflect actual processing and must not block successful text delivery if presence alone fails; surface that degraded condition in logs.

Keep existing text, image, document, voice-note, and file-send support. Do not add new media types. Preserve current media size limits and parsing behavior, and carry connection context through each boundary.

Remove the canned STOP instructions and opt-out command layer. A message is not a notification-preference mutation merely because it contains a matching word. Existing general conversation commands such as canceling an active run are outside this notification-command change.

The owner already knows which assistant they paired. Replace the shared first-contact wrapper with a concise connection confirmation after verification; do not prepend a repeated identity/opt-out banner to the first normal answer. Do not add first-message URL bans, compulsory phrasing variation, account-age timers, or profile-completeness gates based solely on the old policy comments. Actual provider/account restrictions remain effective.

### Notifications

Apply the existing WhatsApp notification preference consistently to notification delivery, including reminders, briefings, check-ins, and recovery summaries. Disabling it suppresses WhatsApp notifications without canceling reminder definitions or changing other channels. Owner-initiated conversations remain available.

Use existing settings actions to express additional proactive opt-in. Explicitly enabling/saving the relevant existing notification settings counts; pairing, reading default-enabled values, or saving unrelated preferences does not. Preserve evidence of a deliberate selection internally where necessary. If no existing setting can express an additional category's opt-in, keep that category inactive on WhatsApp rather than introducing a new configuration control.

Do not change the shared scheduler, recurrence rules, global preferences, or other-channel delivery to implement the WhatsApp fix. Preserve existing selected schedules and frequencies. Remove WhatsApp's traffic-ratio, acknowledgment, unanswered-message, and quiet-hours eligibility checks.

An intentional settings pause is not a transport failure. Resume future eligible notifications when enabled; do not manufacture a catch-up burst for the intentionally disabled period. Recheck preferences when a queued notification is actually sent.

### What is retained

Owner verification, tenant isolation, existing account-access checks, notification preferences, durable delivery claims, idempotency, observable failures, bounded retries, and actual provider restrictions remain required. They protect correctness and user intent rather than restore the removed engagement gates.

### External requirements versus Sydia choices

GoWA's maintainer says the client imposes no sending quota and cannot confirm a safe numerical threshold. The old one-per-minute, 30-per-hour, and 10% values are Sydia choices, not verified GoWA mandates. Removing them is not evidence of unlimited safe volume. [GoWA maintainer explanation](https://github.com/aldinokemal/go-whatsapp-web-multidevice/discussions/667).

GoWA identifies itself as unofficial. WhatsApp's terms restrict impermissible automated use; per-user numbers and owner-only messaging do not establish authorization for this access method. Retaining GoWA is the agreed provider choice, with this limitation documented. [GoWA documentation](https://github.com/aldinokemal/go-whatsapp-web-multidevice), [WhatsApp Terms of Service](https://www.whatsapp.com/legal/terms-of-service).

The official Business Platform's 24-hour window and approved-template rules are specific to that product. Do not implement those mechanics as requirements of the GoWA adapter or claim GoWA avoids WhatsApp's general terms. [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/).

Research checked on 22 October 2026. The Business Solution Terms URL redirected to a Facebook login page; its current AI-specific text was not verified. This spec makes no assertion that the official platform is an eligible alternative for Sydia.

## Disconnection, retries, and missed reminders

### Failure classification

| Condition                           | Required result                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Temporary transport failure         | Mark the affected connection disconnected, record pending/missed delivery, and use bounded reconnect attempts.                          |
| Logged-out or invalidated session   | Require owner pairing again; do not initiate repeated login attempts.                                                                   |
| Explicit provider restriction       | Pause the affected account and show its provider reason. Do not retry sends or pairing to bypass it.                                    |
| Invalid signature or unknown device | Reject processing and record the reason; no fallback routing.                                                                           |
| Media/assistant processing failure  | Record the failure and expose the existing appropriate user-facing failure response when the connection can send.                       |
| Uncertain send acknowledgment       | Record an unknown outcome. Reconcile against matching receipts/provider evidence; do not blindly retry and claim exactly-once delivery. |

Keep failures logged at WARN/ERROR with connection-scoped identifiers and visible connection/recovery status. Do not log QR payloads, owner-verification codes, credentials, or message bodies unnecessarily. A failed operation cannot be marked processed/delivered merely because its error was caught.

Engineering default: at most three transient reconnect attempts per disconnection episode, after 5, 30, and 120 seconds. After exhaustion, retain a visible needs-attention state; polling must not reset the budget indefinitely. An explicit reconnect action can start a fresh bounded attempt series. These are internal constants, not new settings. Reuse existing provider polling and queue retry infrastructure, and distinguish authentication failures from actual account-enforcement signals rather than treating every generic 401 as a ban.

Provider-cleanup jobs likewise stop after three failed attempts and retain an observable cleanup-needed state. A queue retry must not create a new unbounded cleanup job. Retry a failed send only when the provider outcome establishes that it was not accepted; timeouts with uncertain acceptance use the unknown-outcome path instead.

### One catch-up summary

Record reminder occurrences that became due during a verified connection's transport outage while WhatsApp notifications were enabled. After the same authorized connection recovers:

1. Claim one recovery-summary delivery for the outage using a durable idempotency key.
2. Recheck connection generation, owner authorization, notification preferences, and source validity. Exclude canceled, deleted, superseded, or already confirmed deliveries.
3. Send one localized summary that labels the reminders as missed and includes their originally scheduled times. Do not execute reminder contents or imply on-time delivery.
4. Mark the covered occurrences as summarized, retaining their original missed-delivery evidence, and resume future normal deliveries.

Engineering default: show at most ten reminder entries and cap summary content at 3,000 characters, including a count of any omitted entries. Use a deterministic summary of stored reminder records; no new AI generation feature or delivery-history page is required.

Collapse repeated disconnect/reconnect signals for the same recovery episode so they cannot create duplicate summaries. If the summary's provider acknowledgment is ambiguous, preserve the unknown state and reconcile it rather than enqueueing it again.

A disabled notification preference suppresses the recovery summary. Old check-ins/briefings are not replayed as reminders. Intentional disconnect, account replacement, pre-verification setup, and legacy migration do not create automatic historical catch-up messages.

## Direct replacement and rollout

Replace the shared-number integration in one cutover. Do not introduce a phased rollout, a selectable legacy mode, or a new configuration toggle. Existing users must pair and verify their own assistant account before WhatsApp resumes for them; their Sydia data and reminder schedules remain intact.

1. Prepare the connection-scoped schema, repositories, runtime, API, and frontend together. Keep normal data and existing reminder schedules intact.
2. At cutover, stop shared-number intake and sending. Retire the shared device and invalidate old global linking challenges. Do not run a legacy fallback.
3. Preserve existing user, notes, tasks, files, reminders, memories, conversation history, and historical identity references. An old identity link is historical evidence, not authorization for a new assistant connection.
4. Retire queued work tied to the shared device with a recorded migration outcome. Do not redirect an old reply or historical queued notification to a new device.
5. Existing users see the ordinary per-user setup flow and connect/verify their own assistant accounts. No new notification feature is enabled by migration.
6. Future reminders use the user's current verified connection and existing preferences. Other channels continue through their existing integrations.
7. Remove shared admin-pairing actions and shared-operator instructions, STOP copy, obsolete contact eligibility state in public responses, and assumptions that `BACKEND_WHATSAPP_GOWA_DEVICE_ID` selects every user's account. Reuse existing service URL, webhook, and infrastructure configuration; do not add user configuration knobs.
8. Verify the deployed GoWA version, authenticated device-scoped sends, webhook device IDs, and provider logout/device cleanup with dedicated test accounts before release.

The original PRD and architecture remain useful background but are superseded on these WhatsApp decisions. Do not rewrite unrelated requirements as part of implementation.

## Acceptance criteria and verification

Behavior changes must ship with discriminating regression tests. Reproduce the existing global-routing/rate-gate failures against the old behavior before demonstrating the corrected behavior; retain unrelated assistant and channel contracts.

| Scenario                                                 | Required evidence                                                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Two users pair different assistant numbers               | Both become ready independently; status and pairing actions cannot access the other connection.                                   |
| Expired, superseded, or wrong-connection QR              | No activation; expired QR is removed, refresh stays scoped, provider confirmation is required.                                    |
| QR fetch failure or canceled login                       | Actionable inline state; no stale QR or pairing-code fallback.                                                                    |
| Mobile QR setup                                          | Clear second-screen instruction; other integration rows remain visible.                                                           |
| Paired but owner unverified                              | No assistant processing or reminders; only the valid scoped verification path can activate it.                                    |
| Expired, replayed, superseded, or wrong-device challenge | No linking or account mutation. Concurrent consumption succeeds at most once.                                                     |
| Owner of B messages assistant A                          | No reply, assistant run, media download, memory ingestion, or routing to B.                                                       |
| Group mention or self-generated message                  | Ignored even when the owner is a participant.                                                                                     |
| Same provider message ID on two devices                  | Each legitimate connection processes its own event once; duplicate delivery on one connection does not duplicate work.            |
| Reply and file send after worker restart                 | Persisted connection/generation selects the correct device; no default-device fallback.                                           |
| Multiple replies inside one minute or more than 30/hour  | Correct ordered delivery without the removed policy failures; another account is not serialized behind them.                      |
| Long reply                                               | No artificial pre-reply or typing wait; existing shared batching remains intact.                                                  |
| Recurring reminders without replies or inbound chat      | Later occurrences remain eligible; no ratio, acknowledgment, or unanswered-message block.                                         |
| Notification due overnight                               | Existing scheduler timing is honored; no WhatsApp quiet-hours gate.                                                               |
| Default-enabled preferences after pairing                | No additional proactive opt-in inferred merely from defaults or pairing.                                                          |
| Explicit existing-setting opt-in                         | The eligible feature uses its existing schedule/frequency, regardless of chat volume.                                             |
| Notification preference disabled                         | No WhatsApp notifications or summaries; ordinary conversation and other enabled channels still work.                              |
| STOP/START or equivalent message text                    | No reserved notification command or preference mutation; no canned command instruction appears.                                   |
| Text, image, document, voice, and outbound file          | Existing behavior works through the correct connection; size/error handling remains observable.                                   |
| One account restricted or logged out                     | Its sends stop with an actionable status; unrelated connected users continue.                                                     |
| Reconnect budget exhausted                               | No endless retry loop or healthy status; bounded attempts and reason are observable.                                              |
| Several reminders missed during outage                   | Exactly one claimed summary lists bounded missed items; future reminders resume; individual historical messages are not replayed. |
| Repeated recovery signals or ambiguous acknowledgment    | No blind duplicate summary; unknown delivery outcome remains visible.                                                             |
| Replacement while a reply is queued                      | Old-generation work cannot send through either account; data is preserved and replacement requires verification.                  |
| Provider logout fails during disconnect                  | Local authorization remains revoked; cleanup failure stays observable and bounded.                                                |
| Direct cutover with queued legacy work                   | Shared device and legacy jobs cannot send; users reconnect; product data and future schedules remain intact.                      |

Targeted implementation checks, from `apps/backend`:

```bash
bun run test --runInBand --testPathPatterns='whatsapp|notification.service|user-preferences.service|messaging-handler.service'
bun run check-types
```

Include real PostgreSQL uniqueness/claim/migration contracts and Redis/multiple-worker isolation checks using the repository's existing integration-test patterns. Stub external GoWA boundaries deterministically; use dedicated accounts for the separate real-provider smoke. Record the exact integration-test commands with the implementation.

From `apps/frontend`:

```bash
bun run check-types
bun test src/components/chat/whatsapp-format.test.ts
bun run test:e2e --grep WhatsApp
```

The implementation must add/adapt the WhatsApp browser scenarios so the final command selects real setup, verification, status, disconnect/replacement, and failure tests. Use the development-only `/chats` page to compare Web, Telegram, and WhatsApp rendering as documented in [CHAT_PREVIEWS.md](./CHAT_PREVIEWS.md). It does not prove provider pairing, webhook routing, or actual reminder delivery.

This specification change itself requires Markdown formatting and consistency checks only. It does not claim application tests, live GoWA pairing, migration, or rollout have been performed.

## Implementation sequence

1. Connection persistence, uniqueness, generation fencing, and migration contracts.
2. Per-device GoWA runtime/webhook routing and durable per-assistant send isolation.
3. Authenticated setup/status/revoke APIs and the existing integration UI.
4. Policy removal, existing-setting consent/preferences, and bounded recovery summaries.
5. Regression checks, real-provider smoke, and direct cutover with legacy work retired.

No further product configuration is part of this spec.

QR login reference: [GoWA v9.3.0 OpenAPI](https://github.com/aldinokemal/go-whatsapp-web-multidevice/blob/v9.3.0/docs/openapi.yaml), checked 22 October 2026. QR login replaces assistant pairing only; this document still specifies the separate owner-verification message.
