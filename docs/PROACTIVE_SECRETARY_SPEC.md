# Proactive secretary specification

| Field                      | Value                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| Date                       | 24 October 2026                                                                               |
| Status                     | Product and acceptance contract; implementation in progress, verification recorded separately |
| Scope                      | Meeting preparation, commitment capture, work resumption, and smart scheduling                |
| Acceptance scenarios       | [Prompt-based scenarios](./PROACTIVE_SECRETARY_TEST_SCENARIOS.md)                             |
| Reproducible account setup | `apps/backend/test/secretary/seed.ts`                                                         |

## 1. Outcome

Sydia understands work the user has discussed or recorded, retrieves the relevant context, and proposes a useful next action without requiring the user to name a tool or ask for a suggestion. It uses current account data and explains the connection briefly.

Example: a review meeting is tomorrow, an associated pricing task remains open, and notes record a question about a discount. Sydia offers to prepare a review note or reserve time to finish pricing. It does not say the discount is approved or the task is complete.

Success means fewer forgotten commitments and less effort reconstructing context or finding time. More messages or more accepted suggestions alone do not establish success.

### Built-in behavior and conversational interaction

All four secretary behaviors are part of Sydia's default behavior for every eligible account. Users do not enable a secretary mode, opt in to a separate feature, or configure categories before receiving useful suggestions. A new account can receive a relevant suggestion as soon as it has sufficient context.

This is a fixed product behavior, not a configurable secretary feature. Ship the same initiative and conversational confirmation contract across Web, Telegram, and WhatsApp. Users can give instructions in conversation, but no new controls are added to activate, configure, or approve this behavior.

The built-in behavior includes detecting scheduling conflicts, checking relevant constraints, and suggesting suitable times. Sydia retrieves permitted context and provides advice without asking the user to approve each lookup or suggestion. Confirmation is tied to a concrete action that changes saved data, not to the secretary behavior itself.

Suggestions appear as ordinary messages in existing conversations. Clarification, acceptance, rejection, snoozing, and changes to how Sydia helps are expressed in conversation. Do not introduce secretary settings, switches, a proposal inbox, approval forms, accept/decline buttons, or native messaging action buttons. Internal proposal records and policy decisions support reliable conversation; they are not a new user-facing management surface.

For example: Sydia says, “Review Acme besok pukul 14.00, tetapi harga belum final. Ada waktu 09.45–10.45 sebelum tenggat 13.00. Mau saya blok waktu itu?” The user replies, “Ya, blok waktu itu.” Sydia rechecks the slot, saves exactly that block, and confirms the actual result in the same conversation. Showing the suggestion itself does not authorize saving anything.

## 2. Existing foundations and changes required

The following are existing integration points, not claims that the proposed behaviors already work:

| Existing foundation                                                                   | Proposed use or change                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContextBuilderService`                                                               | Reuse bounded context assembly. Replace the blanket prohibition on unsolicited suggestions with an explicit, scoped suggestion policy. Preserve current-request precedence and protection against following instructions in retrieved content. |
| Conversation history and summaries                                                    | Supply user-authored evidence and continuity across chats. An assistant's earlier guess is not user evidence.                                                                                                                                  |
| `MemoryAccessService` and the configured memory engine                                | Retrieve admitted preferences and facts through the active engine. Do not read legacy memory rows as a substitute for Hindsight recall.                                                                                                        |
| Custom/daily notes                                                                    | Retrieve decisions, preparation material, and unresolved questions. Preserve canonical identity, revision checks, rich text, and note links.                                                                                                   |
| Tasks and reminders                                                                   | Recheck unfinished work and existing notification commitments before proposing duplicates. A reminder does not itself reserve calendar time.                                                                                                   |
| `CalendarReadService` and existing calendar mutations                                 | Read supported occurrences and create or update calendar events after authorization. Retain existing local-save and synchronization semantics.                                                                                                 |
| `ProactiveSchedulerService`, briefings, follow-ups, queues, and `NotificationService` | Reuse durable execution and delivery, billing eligibility, preferences, channel identities, and idempotency. Add proposal policy and lifecycle rather than a parallel outbound pipeline.                                                       |

[Memory boundaries](./MEMORY_SYSTEM.md), [calendar sync behavior](./GOOGLE_CALENDAR_SYNC_SPEC.md), and [chat preview isolation](./CHAT_PREVIEWS.md) remain applicable. Schedule lookup and availability use the events currently stored in Sydia's calendar, including synchronized events already present there. Google Calendar connection status is irrelevant to this scope; this feature does not inspect all external calendars.

## 3. First-release scope

The release includes contextual suggestions during conversations, secretary suggestions in already enabled briefings, and timely background outreach for meeting preparation or a newly detected conflict. These behaviors require no separate secretary activation. Background messages use existing conversations and the account's existing authorized notification channels, subject to relevance, quiet hours, and attention limits. A disabled or unlinked channel is not an alternative delivery route; built-in behavior does not grant access or notification permission.

The first release proposes actions. It does not automatically create tasks, edit notes, move events, or set reminders based only on inference. Accepting an unambiguous proposal authorizes exactly that action. Existing explicit requests continue to use the normal authorized tool flow.

Standing permissions, automatic rescheduling, booking attendees, external messaging, email, travel routing, series-wide recurrence edits, cross-provider multi-calendar aggregation, and optimization of the entire week are outside the first release. Existing explicit calendar capabilities are not removed by this boundary.

## 4. Evidence and ongoing work

### SEC-01: Maintain account-scoped work context

Maintain derived records describing an ongoing effort without requiring users to create projects first. A record contains:

- Stable identity and authenticated owner.
- Goal/topic, people or organization identities when resolved, and related source references.
- Latest supported state, decisions, unresolved questions, commitments, dependencies, and possible next steps.
- Evidence time, source revision/generation, and derivation time as separate values.
- Whether each claim is explicit or inferred; unresolved ambiguity stays visible internally.
- State: active, waiting, completed, abandoned, or uncertain.

These records are a rebuildable interpretation, not a new source of truth for task status, deadlines, or calendar availability. Link current records by identity rather than matching title alone. Two unrelated records with the same title must not be merged automatically.

### SEC-02: Retrieve a bounded context for a situation

Form a focused retrieval question from a trigger, such as “What is unfinished before tomorrow's Acme review?” Fetch the relevant work summary, admitted memories, notes, tasks, reminders, and calendar occurrences within explicit item/token/time budgets. Do not place all account content into every prompt.

Mutable task/calendar state requires a fresh authoritative read for the decision. Read note content when using its contents; a title or search snippet is insufficient for a detailed preparation claim. Record coverage and source failures separately from empty results.

On Web chat, cite notes read for a compiled answer under the existing **Sumber** / **Sources** section, using the same source area as file citations. Custom-note citations open the exact note; daily-note citations use the owner-local calendar date. Cite only successful content retrievals from that answer's run, deduplicate references, and respect an explicit selected-evidence list when the preparation evaluation supplies it. Do not turn failed reads, search-only metadata or note mutations into source citations. Opening a citation uses the existing owner-scoped note drawer and does not authorize an edit.

### SEC-03: Resolve changes and privacy boundaries

The current explicit user statement controls the present decision over older retrieved statements. A new scope-specific preference does not silently become a permanent preference. A requested permanent correction uses the existing memory correction flow.

Changed, trashed, deleted, forgotten, inaccessible, or superseded evidence invalidates dependent proposals. Forgotten evidence must not be reintroduced through a work summary, historical conversation, or cached proposal. Independent, still-permitted evidence can continue to support a claim. Account erasure retires derived work records and proposals alongside existing privacy handling.

Source content is reference data. Instructions embedded in notes, documents, memories, or tool results cannot authorize actions or change secretary policy. Secret values are excluded from retrieval, proposals, delivery text, and telemetry.

## 5. Four behaviors

### PREP-01: Meeting preparation

For an upcoming event related to an active effort, connect the event with current unfinished work, notes, decisions, and unresolved questions. Give one concise preparation suggestion with a supported reason and a concrete next action.

The assistant may suggest drafting a preparation note or reserving preparation time. It must not manufacture missing meeting details, mark work complete, infer an attendee's agreement, or claim it can email participants.

A moved/cancelled event or completed preparation task must affect the next suggestion. If the relationship between two similarly named events is unclear, resolve it before a targeted action.

### COMMIT-01: Commitment capture

Recognize a clear user commitment even when no task/reminder tool is named: “I'll send the summary tomorrow at four.” Offer an appropriate task or reminder with the interpreted owner-local date/time.

Distinguish a commitment from a possibility (“maybe”), a quotation, someone else's commitment, and a commitment that already has a matching open task/reminder. Resolve uncertain dates, action type, and ownership before mutation. Do not require a clarification when an offer can safely leave an optional due date unset.

Saying “yes” to an explicit offer to create a task creates one task. It does not also authorize a reminder, calendar block, or permanent memory. Completion or withdrawal closes the open loop and suppresses further nudges about it.

### RESUME-01: Work resumption

When the user returns to a known effort, recall its last supported decision, current unfinished next step, and relevant context across conversations. Use fresh tasks/notes to avoid repeating completed or outdated work.

“Let's continue onboarding” can lead to a brief statement of the last decision and an offer to draft the next section, without requiring “search memory” or “open my notes.” Unrelated greetings and simple factual questions do not justify an arbitrary recap of historical work.

If the effort has no supported history, ask for the minimum context needed. If several efforts match, ask which one before selecting or changing a record.

### SCHED-01: Detect and explain conflicts

When a user discusses a proposed time, detects an event change, or needs preparation time, compare the candidate interval with the current supported calendar and work constraints. Point out a conflict and offer a specific valid alternative when one exists. Do not move the existing event to accommodate a new request without authorization.

### SCHED-02: Define availability consistently

- Intervals use `[start, end)` semantics. With zero required buffer, an event ending at 15:00 permits a new event starting at 15:00.
- Confirmed and tentative occurrences block time in v1; cancelled occurrences do not. Do not invent attendance/transparency metadata absent from the supported event model.
- Expand supported recurrence and its exceptions in the requested window. An exception replaces its original occurrence; cancellations remove that occurrence.
- An all-day event blocks its owner-local date range; its end date is exclusive.
- A task due time is a deadline, not an occupied duration. An accepted work block is a calendar event associated with the task. Scheduling the block does not change the task's deadline or completion state.
- A reminder is a notification, not a busy interval.
- Use account timezone for relative dates and display. Preserve provider instants and existing recurrence timezone semantics. Clarify an ambiguous local instant during a daylight-saving transition before saving.
- Availability is calculated from current Sydia calendar events for the requested period, regardless of whether Google Calendar is connected. Do not append connection, synchronization, or external-coverage disclaimers, request a connection, or check integration status for ordinary schedule lookup or planning. Mention an integration only when the user explicitly asks about that integration. Never claim to have inspected calendars outside Sydia. A failed Sydia calendar read remains a visible failure, not an empty calendar.

### SCHED-03: Hard constraints and preferences

Hard constraints are existing busy intervals, an explicitly required buffer, requested duration, deadline, current user-specified window, and user-declared unavailable periods. Working hours are a hard boundary unless the user explicitly allows an exception. Do not infer working hours solely from an empty calendar.

Soft preferences include mornings for focus work and avoiding fragmented days. Prefer a valid slot satisfying these, then the earliest remaining valid slot. Break ties by earlier start, then stable proposal identity. Explain an unmet material preference briefly. Never relax a hard constraint silently.

Travel time is used only when the user supplied its duration or it is already represented in a calendar block; v1 does not calculate routes. Missing duration must be clarified or explicitly proposed as an assumption before acceptance; it must not become an invisible 30/60-minute default.

### SCHED-04: Offer and accept concrete slots

Offer one recommended interval and at most two alternatives, each with local date, start/end, duration, and the relevant reason. If no slot fits, state which constraint prevents scheduling and ask which constraint the user wants to adjust. Splitting work or moving it beyond a deadline requires explicit agreement.

On acceptance, re-read the affected task/event, source revisions, permissions, deadline, and availability. A newly occupied slot produces a revised offer; “yes” to the old slot is not approval of the new one. Use existing mutation receipts/idempotency to prevent duplicate calendar events on retries. Serialize competing Sydia scheduling writes for the owner/window or use an equivalent conflict check at commit. A remote provider may change independently; preserve conditional-write/reconciliation behavior and surface detected conflicts rather than promise global atomic booking.

Saving locally and syncing remotely are separate outcomes. Confirm the durable local save; only claim Google synchronization when confirmed. A paused connection still allows an explicitly accepted save to Sydia calendar under the existing calendar contract. Confirm the saved event without unsolicited connection or synchronization commentary.

## 6. Triggers, attention, and preferences

### POLICY-01: Separate candidate generation from permission to surface

Triggers include a meaningful conversation segment, saved note/task/event changes, an approaching event/deadline, and scheduled reviews. Coalesce repeated changes to the same effort. Assistant-authored proposals and no-op updates must not trigger a self-sustaining suggestion loop.

Each candidate carries evidence, relevance to the current goal, actionability, urgency, timing, and previous user decisions during evaluation. Candidate generation does not itself require a persisted proposal. Hard policy gates run outside the model: owner access, source validity, conversational instructions, existing channel permissions, quiet hours, billing eligibility, expiry, deduplication, snooze, and delivery budget. A model confidence score cannot override them. There is no user-facing secretary feature gate or opt-in prerequisite.

Possible outcomes are `surface_in_chat`, `include_in_briefing`, `notify_now`, `defer`, or `suppress`, with a recorded reason. No useful evidence or no useful action means no suggestion.

### POLICY-02: Built-in v1 policy

These are built-in release policy values. Each evaluation diagnostic identifies the applied policy version and any relevant overrides; recording that diagnostic follows OBS-01 and never gates the response. Internal operational configuration is not a user-facing secretary settings panel. Supported personal changes are expressed in conversation and persisted through the existing preference/memory mechanisms with their privacy rules.

| Policy                          | Built-in default                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contextual suggestions          | Built in; at most one useful suggestion per assistant turn, without activation                                                                         |
| Secretary items in briefings    | Included when relevant in already enabled briefings; at most three; no separate secretary switch                                                       |
| Immediate secretary outreach    | Built in for timely preparation or conflicts through an existing authorized conversation/channel; no separate secretary opt-in                         |
| Immediate outreach budget       | At most two secretary notifications per owner-local day across destinations; existing requested reminders remain under their own policy                |
| Quiet hours                     | 21:00–08:00 in the account timezone; an explicit conversational preference or existing account notification policy takes precedence                    |
| Routine background sweep        | Every five minutes; source-event processing target within two minutes after the change is available                                                    |
| Meeting preparation window      | From 24 hours to 30 minutes before the event, while the relevant work remains unfinished                                                               |
| Proposal expiry                 | Earliest of 24 hours after creation, an invalidating source change, or the action's last useful time; a schedule offer expires no later than its start |
| Default background retry budget | Three attempts total, with 1-minute and 5-minute retry delays; then a visible failed outcome                                                           |

Acceptance scenarios can use an injected clock in a future harness. A user's prompt claiming a different date/time never changes the system clock. Background timing targets do not require tests to sleep; observe outcomes with a deadline.

### POLICY-03: Conversational preferences and shared decisions

Automatic memory remains independent of the built-in secretary behavior. Disabling automatic memory prevents automatic ingestion, not explicit memory operations or use of other permitted context. No new secretary setting is added to the existing memory or notification settings.

Honor ordinary requests such as “Jangan tawarkan persiapan rapat lagi,” “Tunda saran ini sampai besok pukul 09.00,” or “Jangan beri saran proaktif dulu.” Persist the requested scope and acknowledge it in conversation. When scope or time is unclear and affects the outcome, ask one focused question in the conversation. An explicit later request can resume suggestions. Respecting such an instruction is a remembered user preference, not a prerequisite for activating the feature. Explicit assistance continues to work while unsolicited suggestions are suppressed.

Support “not now,” a concrete snooze time, dismissal for the current proposal, and category-level opt-out. A dismissal without snooze suppresses the same action on the same target until a material supporting fact changes. Repeated sweeps and wording changes are not material changes. Snoozed/quiet-hours candidates are revalidated before later delivery; expired candidates are dropped. This also applies when a notification was queued before quiet hours began: keep it pending in the existing delivery queue until the first permitted owner-local minute. A policy delay is not an obsolete outcome or a failed provider attempt, consumes no retry attempt, and survives worker restart. At wake, revalidate expiry, sources, conversational decisions, destination ownership and delivery eligibility before sending; receipt replay must not send again. Briefings and read-only conflict alerts obey the same send-time quiet-hours gate. Each newly requested revisit gets its own delivery identity while retaining the same proposal and action identity. Retries of that revisit reuse its delivery identity; queued deliveries from a replaced revisit remain obsolete even after the new revisit becomes due.

Proposal decisions are owner-scoped and shared across channels. If a proposal was already shown, avoid sending it again elsewhere merely because the user switched channels. Default delivery uses one eligible existing conversation/channel according to the account's existing routing and permissions. If that choice is ambiguous, ask in conversation; do not invent a new inbox or send to every channel. An explicit conversational request for multiple already authorized destinations permits one delivery per requested destination, with one shared acceptance state and one outreach-budget charge. Selecting a destination never authorizes the proposed task/event/note mutation.

## 7. Proposal and execution lifecycle

### ACT-01: Minimal durable action proposals

Keep `SecretaryProposal` as durable state for a concrete inferred action that would create or change saved data after conversational acceptance. Create it before showing that actionable offer, so acceptance resolves to the exact action the user saw. A persistence failure prevents that offer; it must not produce an acceptance question with no recoverable action behind it.

Do not create a proposal for ordinary advice, a factual summary, a preparation answer, a draft supplied only in chat, an availability lookup, or a rejected candidate. A later explicit request to save a chat draft uses the existing authorized tool flow. A background suggestion or requested revisit that has no saved-data action uses existing notification scheduling/deduplication metadata rather than a full action proposal. These messages still obey relevance, suppression, quiet-hours, and attention policy.

The proposal stores only what is needed to resolve consent and safely execute or recover the action:

- Authenticated owner, stable proposal/action identity, behavior kind, and semantic deduplication key.
- Target references, supporting source identities/revisions, and material assumptions needed for revalidation.
- The exact offered action and parameters, including a complete draft/title/destination when offering to save a note. Keep a concise reason for the offer, not a duplicate work-context or diagnostic history.
- Conversation/message references identifying where the offer was actually shown, creation and useful-until times, and current action state with transition reason.
- Conversational acceptance, dismissal, or snooze and their relevant timestamps, plus execution claim/lease and resulting mutation receipt needed for idempotent recovery.

Use explicit action states: `pending`, `offered`, `snoozed`, `accepted`, `executing`, `completed`, `dismissed`, `expired`, `invalidated`, and `failed`. `pending` means a concrete action is prepared but not yet shown; it is not a record of every evaluated idea. `accepted` is not proof of successful execution. Preserve terminal identity/receipts long enough for existing replay and privacy rules; do not delete them merely because an evaluation log expires.

Keep delivery lifecycle in the existing notification/queue/delivery records. Destination, delivery/revisit identity, queue status, send attempts, retry times, delivery lease, provider receipt, and failure belong there. Link them to the proposal/action when applicable rather than maintaining a second send state machine in `SecretaryProposal`. Deferral is a delivery decision, not an extra action state. Derive an action's actual offer visibility from persisted chat messages or confirmed delivery receipts; queued work alone cannot mark it offered. Outreach accounting uses the existing durable delivery/budget mechanism, not evaluation rows. Queue admission is a provisional reservation. Recheck the owner-local day and quota atomically with the send claim: a job first delivered after midnight must not retain yesterday's unused quota. The first confirmed delivery fixes one charge for that outreach identity across explicitly requested destinations and receipt replay. Unresolved earlier sends conservatively hold capacity until their outcome is known, preventing a new day from admitting extra sends while old ones are still in flight. If today is full, keep the existing job pending until the next local day without a provider attempt; normal quiet-hours, source and expiry checks still apply on wake. Definitively retired unsent notifications do not occupy new outreach capacity.

Derive semantic deduplication from owner, behavior, action, target, occurrence/window, and material evidence version. Include channel only at the delivery level. Worker restarts and retries reuse identities. A new wording or regenerated summary does not create a new proposal. Proposal persistence, consent transitions, execution claims, mutation receipts, and required delivery state remain awaited where correctness requires them; OBS-01 applies only to diagnostic evaluations.

For preparation, evaluate the current message and verified sources before rendering an action offer. Distinguish an ordinary meeting mention, a direct preparation question, and an unrelated request. A saved-note offer must contain a complete draft, title, and destination in its persisted proposal; the conversational acceptance question must come from that proposal. Concurrent evaluations share owner-scoped deduplication so different wording cannot produce two actionable offers for the same meeting. Derived work context remains rebuildable under SEC-01; this simplification does not turn proposals or evaluations into authoritative work facts.

### ACT-02: Resolve acceptance precisely

Resolve a quoted/referenced proposal before acting. “Yes” is sufficient when exactly one current offer is unambiguous in that conversation. If two offers are unresolved, ask which one. Do not interpret acceptance of an old/invalid proposal as blanket permission for replacement parameters.

Use the user's conversational reply as the confirmation itself. For example, after a concrete scheduling offer, “Ya, jadwalkan itu” authorizes that offered interval; do not request a second confirmation or redirect to an approval control. A clear original request such as “Buat pengingat besok pukul 16.00 untuk kirim ringkasan” already authorizes that action under the existing tool contract. Ask a follow-up only when required details or the intended action remain ambiguous, or when revalidation changes the proposed action.

All user confirmations occur through messages in the existing conversation. Never require a click, settings change, approval form, or visit to another page. A screenshot of an acceptance button or a direct call to a proposal-response endpoint does not establish conversational acceptance. Displaying a plan, reading a note, or drafting text in chat needs no additional approval unless the user requested a protected operation; durable changes inferred from context require acceptance of the specific offered action.

| Situation                                                            | Conversational behavior                                                                         |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Relevant context can support advice or a draft                       | Retrieve it within existing permissions and answer directly.                                    |
| Sydia infers a useful task, reminder, saved note, or calendar change | Offer the concrete action and wait for the user's reply before saving.                          |
| The user clearly accepts one current offer                           | Revalidate and execute that action; report the saved result without another confirmation round. |
| The user directly requests a fully specified action                  | Use the existing authorized tool flow; do not introduce an extra secretary approval step.       |
| The reply is ambiguous or the proposed parameters must change        | Ask one focused question or present the revised offer in the conversation.                      |
| The user declines, postpones, or corrects the offer                  | Respect that reply and its scope; do not redirect to controls.                                  |

Execute through existing domain services/tools, including current ownership, revision, and error checks. Saving an inferred preparation note requires acceptance of the offered save action and destination; drafting its text in chat does not. A clear request to save the note already supplies authorization. Partial failure must report the actual completed and failed actions without a false overall success.

After an accepted action fails to save, an explicit conversational retry such as “Coba lagi” retries that same accepted action under its original identity. Preserve its proposal and receipt, revalidate the current context, and report the actual result. Do not turn recovery into another offer for the unchanged action. A retry phrase without prior acceptance cannot supply initial consent. Before acknowledging an earlier save, recheck that its owned result is still available. A trashed/deleted note, cancelled event, or removed task/reminder is not an available result, even if its proposal was completed. A known retired result must not be recreated or restored under the original acceptance; a different save or restoration requires a new explicit request. Preserve the historical receipt independently of current availability. Recovery context carries bounded, conversation-scoped receipt metadata, not an old action payload or copies of removed source content. Completed/recovered acknowledgement returns the verified result reference without replaying an old private draft. Missing evidence of a save is distinct from a known retired result; recovery must not infer permission to recreate a deleted item from that absence.

## 8. Failure contract

### FAIL-01: Missing data and failed access are different

An empty successful search can justify “I don't have that context.” A failed search cannot. Record typed outcomes and actionable WARN/ERROR logs for retrieval, model, queue, mutation, and delivery failures. Never silently substitute an empty calendar, stale memory, or completed status.

| Failure                              | Required product behavior                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Required calendar availability fails | No conflict-free claim or unqualified booking offer; explain the limitation for a direct request. Background candidate fails/defer-retries without sending speculative advice. |
| Optional memory source fails         | A conversation can use independently verified sources, identifying a material limitation when it affects the answer. Do not claim a learned preference was checked.            |
| Required note missing or trashed     | Omit its contents, invalidate dependent claims, and ask for needed context only if it blocks the action.                                                                       |
| Proposal generation fails            | Normal authorized chat can still finish; record secretary generation failure. Do not fabricate a generic suggestion to fill the space.                                         |
| Queue/delivery fails                 | Persist a retryable/failed state; queue acceptance is not delivery. Revalidate usefulness before retry and obey the bounded retry budget.                                      |
| Accepted mutation fails              | Report failure and retain recoverable proposal context. Do not claim the task/event/note exists. A retry uses the original action identity.                                    |

Optional-source degraded mode lasts for one evaluation only; the next evaluation rechecks availability. Background failures are operator-visible without repeatedly notifying the user of an unchanged technical outage. Production telemetry records references/outcomes/timings, not full private context or secrets.

### OBS-01: Retain evaluations without delaying assistance

Keep `SecretaryEvaluation` for operator diagnostics and quality analysis, including suppressed, deferred, failed, and no-action outcomes that need no proposal. A row records a stable evaluation ID, authenticated owner, optional proposal ID, trigger, decision, safe reason/error codes, occurrence time, policy version, and bounded correlation/timing metadata. The occurrence time is when the decision happened, distinct from insertion time. Do not copy private note bodies, memory contents, conversation text, or action payloads into evaluations.

Evaluation history is diagnostic, not operational state. Consent resolution, cross-channel suppression, deduplication, outreach budgets, snooze timing, execution recovery, delivery, and user success messages must work correctly when evaluation storage is delayed, unavailable, or missing. Do not query evaluation history to reconstruct any of these decisions. Retain evaluations for 30 days by default, with bounded background cleanup and existing account erasure/privacy rules.

Use one managed asynchronous evaluation writer shared by chat, briefing, and background paths. The caller hands off a small event to a bounded local buffer and continues; it does not await a `SecretaryEvaluation` insert, a database transaction, a Redis enqueue acknowledgement, writer retries, or a drain in response/stream completion, action execution, or delivery acknowledgement. Do not replace an awaited write with an unmanaged promise: the writer owns rejections, batching, timeouts, retries, shutdown, and health reporting. Flush outside request/action transactions through the existing persistence boundary. No new evaluation table, dedicated delivery pipeline, or durable outbox is required.

Initial operational defaults are named and tunable: flush at most one second after admission or at 100 events, at most 100 rows per batch, at most 1,000 pending events including retries, and a five-second timeout per batch write. Use stable evaluation IDs for idempotent inserts when a write outcome is uncertain. Retry a failed batch at most twice after the initial attempt, after one and five seconds. Bound concurrency so a slow writer cannot consume the request database pool; later batches cannot bypass the pending-event cap.

On insert/timeout failure, buffer saturation, or retry exhaustion, emit an actionable WARN/ERROR through the ordinary logger independently of evaluation storage, and update writer health plus pending/oldest-age/retry/drop counters. Aggregate repeated outage logs to avoid a log storm while preserving counters and a recovery signal. The explicitly named degraded mode is `evaluation_logging_degraded`: diagnostic completeness is reduced while verified responses and actions continue. Its bounds are the pending-event cap, write timeout, and retry budget. On saturation reject the new diagnostic event without blocking the caller; on exhaustion discard that batch with its loss count. Neither case permits a silent catch, an unbounded backlog, or repeated user-facing outage notices.

This is best-effort asynchronous diagnostics, not a guaranteed audit ledger. A process crash can lose unflushed events; a graceful shutdown attempts a drain for at most five seconds and reports any remainder. Do not claim complete evaluation history or roll back/repeat a successful action to compensate for missing diagnostics. Required proposal, consent, mutation, and delivery state remains durable independently. Account erasure cancels buffered/retrying events for that account and prevents late inserts from resurrecting erased diagnostics; cleanup also removes persisted evaluations under the existing privacy contract.

## 9. Verification and rollout

1. Seed dedicated accounts and record source identities, exact dates, current task states, and independently calculated valid scheduling intervals.
2. Check memory admission and note search readiness. A queued write or SQL row alone is not proof that the active retrieval path can read a fact.
3. Run the linked prompt scenarios, including no-suggestion and changed-state cases. Classify direct requests separately from proactive behavior.
4. Review candidate-only background runs before enabling actual outreach. A dry run cannot pass a delivered-notification case.
5. Pilot the built-in behavior with internal rollout controls, then expand timely background outreach after delivery validation. Internal rollout controls must not become user-facing secretary switches or activation steps. Review conversational corrections/dismissals and repeated failure examples before expanding scope.

Keep run evidence: account/run ID, clock/timezone, source snapshots/revisions, prompts, assistant responses, persisted mutations, proposal outcomes, and delivery receipts. Exact prose is not the oracle; supported facts, correct time intervals, consent boundaries, and actual saved outcomes are.

### Requirement coverage

| Contract                                          | Scenarios                                                 |
| ------------------------------------------------- | --------------------------------------------------------- |
| SEC-01–03: evidence, identity, freshness, privacy | PREP-01–04, RESUME-01–03, TRUST-01–04                     |
| PREP-01: meeting preparation                      | PREP-01–04, BG-01                                         |
| COMMIT-01: commitment capture                     | COMMIT-01–05                                              |
| RESUME-01: work resumption                        | RESUME-01–03                                              |
| SCHED-01–04: scheduling                           | SCHED-01–18                                               |
| POLICY-01–03: initiative and attention            | TRUST-04, POLICY-01–06, BG-01–04                          |
| ACT-01–02: acceptance and persistence             | COMMIT-02, SCHED-08–10, POLICY-03, POLICY-06, STATE-01–02 |
| FAIL-01: observable failure                       | FAILURE-01–03, BG-04, OBS-01–03                           |
| OBS-01: asynchronous evaluation diagnostics       | OBS-01–03                                                 |

## 10. Implementation work packages

| Package                    | Deliverable                                                                               | Targeted verification when implemented  |
| -------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------- |
| Evidence and work context  | Owner-scoped derived records, invalidation, bounded retrieval                             | PREP-01–04, RESUME-01–03, TRUST-01–04   |
| Proposal engine            | Concrete-action proposals only; consent, freshness, receipts, and semantic deduplication  | COMMIT-01–05, POLICY-01–06, STATE-01–02 |
| Scheduling                 | Supported-occurrence availability, constraints, ranked slots, acceptance recheck          | SCHED-01–18                             |
| Background integration     | Debounced triggers, briefings, built-in outreach on authorized channels, bounded recovery | BG-01–04, FAILURE-01–03                 |
| Evaluation diagnostics     | Retained evaluation rows via bounded asynchronous writer; independent failure visibility  | OBS-01–03                               |
| Conversational interaction | Default-on behavior, message-only acceptance and remembered conversational preferences    | POLICY-04–06, COMMIT-02, SCHED-08–10    |

Each implementation change must add discriminating automated coverage for its own changed behavior. Prompt acceptance is complementary and does not replace deterministic interval, ownership, lifecycle, and idempotency tests. No new production endpoint, schema, prompt, or scheduling policy is introduced by these specification files or the account seed script.
