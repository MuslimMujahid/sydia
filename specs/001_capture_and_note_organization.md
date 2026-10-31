# Reliable capture and background note organization

Status: implementation specification. This document defines required behavior;
implementation and acceptance results are tracked separately.

## Decisions at a glance

- **Preserve now.** A reported record such as an expense must survive in original
  evidence and recoverable note work, even when the user does not say "catat".
  Memory admission is a separate decision and cannot replace durable capture.
- **Choose a useful home.** Honor explicit destinations. Otherwise reuse a
  suitable dedicated note when established, with the daily note as a practical
  default while the destination is unresolved.
- **Organize later when useful.** Consider new conversation evidence and changed
  daily notes after inactivity, then recover missed or deferred work periodically.
  Memory can help discover context, but exact records need original evidence.
- **Protect the user's editor.** Every assistant mutation waits while the target
  note is open in any registered editor, tab, or device. Resume against the latest
  document after protection ends.
- **Recover without duplication.** Keep pending work and confirmed write receipts
  durably, independently of memory checkpoints and queue delivery.
- **Evaluate before activation.** Review proposed destinations and resulting
  documents before enabling automatic background writes.

## Purpose

Sydia must preserve information the user expects to maintain as records, then
organize it into useful notes without requiring the user to choose the right
destination during every conversation. Memory alone must not be the only copy of
such records. Automatic writes must wait while the user has the target note open.

The product outcome is **preserve now, organize when useful**. These are
capabilities, not a mandatory sequence for each message:

1. Recognize recording intent and preserve the user's evidence immediately.
2. Write captures to a suitable home, using the daily note as the default when
   no better destination is established.
3. After inactivity, organize suitable material into existing or new dedicated notes.
4. Recover missed or deferred work periodically.
5. Independently retain eligible personal context through the existing memory pipeline.

### Example: an expense reported in conversation

For "pengeluaran saya hari ini Rp55.000", Sydia recognizes a reported daily
expense total even without an explicit recording command. It preserves the source
and pending work durably. It can capture the dated total directly in a clearly
suitable expense note, or use the daily note as the default while organization
is unresolved. If the chosen destination is open, the capture remains pending.

After inactivity, any remaining organization reuses an appropriate expense
tracker or creates one when necessary. The resulting entry preserves Rp55.000 as
a total for the source's local day. If a daily capture was made, it stays in
place, with a link to the tracker when that link can be written safely. Memory
admission neither substitutes for this workflow nor determines whether it runs.

If the expense tracker is open, its update waits; Sydia does not create a second
tracker to bypass protection. Once protection ends, recovery reads the current
document and applies the pending change once.

## Agreed scope

- Implicit record-like statements as well as explicit requests to record information.
- Daily notes, custom notes, and relevant original conversation evidence.
- Existing note destinations, recurring tracking notes, and standalone topic notes.
- Background organization after inactivity and periodic recovery.
- Protection of open daily and custom notes across the Notes page, chat drawer,
  tabs, and devices.
- Durable pending work, source references, correction handling, and repeatable jobs.
- Evaluation before automatic writes are enabled.

Excluded from this release: a dedicated expense-management product, new external
integrations, automatic deletion of original captures, and a bulk historical
backfill. This specification does not change existing task, reminder, calendar,
credential, or sensitive-memory admission contracts. A successful note write does
not grant consent for otherwise ineligible memory retention.

## Existing foundations

These references describe repository behavior inspected during planning, rather
than proof that a deployed worker is currently running:

| Foundation                                                                                                                                                                                      | Existing behavior                                                                                                                                                                             | Integration implication                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Memory dream scheduler](../apps/backend/src/modules/memories/memory-dream-scheduler.service.ts)                                                                                                | Defaults to a 15-minute delay and replaces pending dream jobs as a conversation continues; scheduling is gated by automatic-memory settings.                                                  | Reuse the scheduling pattern, with independent note-organization eligibility.        |
| [Worker](../apps/backend/src/worker.ts)                                                                                                                                                         | Registers memory dream recovery every 24 hours and Hindsight ingestion recovery every minute.                                                                                                 | The existing daily recovery is interval-based, not a fixed local nighttime schedule. |
| [Memory dream service](../apps/backend/src/modules/memories/memory-dream.service.ts)                                                                                                            | Extracts and consolidates durable facts from conversations. Normal eligibility defaults to four user messages or roughly 800 tokens; short-segment recovery still requires two user messages. | These thresholds must not discard a single useful note capture.                      |
| [Hindsight ingestion](../apps/backend/src/modules/memories/hindsight-ingestion.service.ts)                                                                                                      | Reviews conversation evidence for memory admission, with its own checkpoints.                                                                                                                 | Memory completion does not mean note organization is complete.                       |
| [Daily-note tools](../apps/backend/src/modules/conversations/services/daily-note-tools.ts) and [custom-note tools](../apps/backend/src/modules/conversations/services/notes-workspace-tools.ts) | Read and write notes, preserving documents and checking versions.                                                                                                                             | Reuse the existing note services and rich-text contracts.                            |
| [Active note validation](../apps/backend/src/modules/conversations/services/active-note.service.ts) and [chat notes](../apps/frontend/src/components/chat/chat-notes.tsx)                       | Validate note references and maintain the selected note in the chat interface.                                                                                                                | Chat context is not live, server-enforced editor presence.                           |

## Decision policy

### Memory and notes serve separate needs

Decide whether information needs a maintained record separately from whether it
qualifies as personal memory. Memory supports future conversational context;
notes provide user-visible records that the user can inspect, edit, and organize.
One message can warrant both, either, or neither. A successful memory write must
never be reported as a successful note write.

For example, "pengeluaran saya hari ini Rp55.000" needs durable record handling
even without "catat". A lasting preference may qualify for memory without needing
a note. Periodic scanning is a recovery and organization mechanism; it must not
make transient memory the only place a reported expense survives until then.

### Agent skills and execution boundaries

Use Sydia's existing skill catalog, `load_skill`, and tool-driven agent loop for
note capture and organization. Add note guidance to that architecture rather than
maintaining a separate fixed extraction/destination/merge/review LLM pipeline.
Procedural advice belongs in the skill; the agent chooses which steps are useful,
their order, and when to stop based on the actual request and retrieved evidence.

- In conversation, let the main agent recognize recording intent and load the
  relevant skill. Do not require a separate pre-response capture classifier or
  automatically execute a note-specific recipe before the main agent can act.
  Preserve eligible source evidence durably so a missed capture can be recovered.
- Give the agent tools to search, inspect note content and paths, create, edit,
  link, and ask questions. It may search repeatedly, inspect multiple candidates,
  revise a tentative destination, or combine changes when the request warrants it.
  Do not limit it to one precomputed search followed by one destination choice.
- Inactivity and periodic recovery trigger a bounded agent run with relevant new
  evidence, prior action receipts, source timestamps, timezone, and pending work.
  Reuse the existing skill-loading and tool-execution architecture. These triggers
  determine when to consider work, not a mandatory plan for the agent to follow.
- Keep note authorization scoped to this specification. Background note work must
  not unlock unrelated task, reminder, messaging, memory, or calendar mutations.
  Preserve proposal-only evaluation before automatic organization activation.
- Persist executions, pending changes, dependencies that actually exist, and
  confirmed results independently of a provider call or transient queue job.
  Internal stages may describe bookkeeping, but must not require every item to
  traverse `source -> capture -> review -> organize -> link`. Resume unfinished
  work without replaying successful writes; reread and replan when evidence or
  revisions change. Do not force a review or linking action when neither is useful.
- Keep ownership, live-editor exclusion, revision/source checks, valid documents,
  atomic receipts, and idempotency in the tool execution layer. Skill instructions
  cannot replace these checks, and agent discretion cannot bypass them.
- Bound run time, tool calls, and retries with observable failure/deferral. A run
  ending early leaves durable unfinished work; it does not claim a successful save.

This architecture supersedes code-prescribed note-processing workflows. The
routing examples below describe desired outcomes and useful guidance, rather
than fixed phases or semantic prerequisites imposed on the agent.

### Things to avoid: semantic classifications as hard gates

This clarification was agreed on 2026-10-31. The LLM should interpret the user's
intent from the message, relevant conversation, and current documents, then
propose grounded changes. Structured output is useful for executing changes;
semantic labels are not proof that those changes preserve the user's meaning.

- Do not require `entry | total | correction | replacement | reference` as a
  prerequisite for editing, or restrict permitted edits according to such a
  label. Preserve the distinctions in meaning through grounded proposals and
  behavior tests. A request may combine additions, corrections, and other edits.
- Do not require `journal | tracking | topic` to determine eligibility, or make
  a journal label categorically prevent useful organization. Evaluate whether
  organizing the actual material serves a clear purpose.
- Do not treat an early extracted destination or an `explicitOnly` flag as an
  irrevocable interpretation. Honor the user's actual destination request;
  allow fresh evidence and clarification to correct a mistaken interpretation.
  Replanning does not authorize silently redirecting work or replaying a write.
- Do not impose a daily-note detour when a suitable direct destination is
  established. The daily note remains a useful default, not an unconditional
  route for every unspecified record.
- Do not turn reuse preferences, root placement defaults, or duplicate-title
  heuristics into substitutes for contextual destination reasoning. Read paths
  and relevant content, reuse when appropriate, and ask only when the intended
  destination remains materially ambiguous. Never invent folder hierarchies.
- Do not restrict the model to append-only or single-text-fragment edits when
  the request needs a valid change to rich-text structure. Support grounded
  restructuring while preserving unrelated content, marks, and link identities.
- Do not accumulate narrow semantic rules solely to make individual failing
  examples pass. Evaluate outcomes across varied and mixed-intent requests.

Keep deterministic enforcement of concrete invariants: owner isolation, editor
presence, source validity, current document revisions, valid document structure,
atomic completion receipts, and idempotency. These controls remain mandatory
regardless of the LLM's interpretation. This section supersedes rigid routing or
classification interpretations of the guidance below; it does not remove durable
capture, source preservation, or open-note protection.

### Decide whether there is anything to capture

An explicit destination takes priority. Without one, evaluate the current message
in conversation context. A concrete report of a transaction, measurement, total,
or progress entry can express recording intent without the word "catat".

Do not capture every first-person statement. Questions, examples, quotations,
hypotheticals, and ordinary conversation do not automatically become records.
Preserve negation and uncertainty; do not turn an estimate into a confirmed value.
Ask only when ambiguity materially affects the meaning or destination of a record.

Evaluate distinct items in a mixed message separately. A message may contain a
record and a personal preference; the two can have different destinations.

### Choose a home

| Information purpose                                                     | Initial handling                                                                                    | Organization outcome                                                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Explicit daily-note destination                                         | Capture in the named day, subject to open-note protection.                                          | Honor that destination; do not silently redirect it.                       |
| Explicit custom-note or folder destination                              | Resolve and write directly when unambiguous and available.                                          | Reuse the specified destination.                                           |
| Unspecified record-like capture                                         | Preserve immediately; use a suitable direct destination when established, otherwise the daily note. | Group with related records in a tracking note when useful.                 |
| Dated experience, observation, or reflection shared as a journal update | Capture in the daily note.                                                                          | Leave there unless there is a clear independent purpose for organizing it. |
| Standalone plan, procedure, or reference material                       | Capture when recording intent is established.                                                       | Find or create a suitable topic note.                                      |
| Lasting personal preference or background fact                          | Existing memory eligibility rules apply.                                                            | Do not manufacture a note solely because a memory is useful.               |
| Question or hypothetical without recording intent                       | Answer normally.                                                                                    | No new record.                                                             |

Length, the presence of a date, and words such as "catat" are signals rather than
complete routing rules. A single useful entry may justify a tracking note.

For unspecified captures, default the capture day to the owner's local day at the
source message time. Honor a different day explicitly requested by the user.
Preserve dates within the information separately from the capture date. A delayed
job must not reinterpret "hari ini" using its execution date.

### Preserve the meaning of the requested change

Understand additions, aggregate totals, corrections, and replacements in context
without requiring a fixed operation classification:

- "Pengeluaran saya hari ini Rp55.000" describes a daily total; preserve that meaning.
- "Tambah pengeluaran makan Rp20.000" describes an additional expense.
- "Sebenarnya Rp65.000" may correct the previous amount when context resolves it.
- "Berapa pengeluaran saya hari ini?" requests retrieval and creates no new entry.

Do not count a daily total as an additional transaction or add it to itemized
expenses. Preserve user-provided amounts, currency, units, names, and dates.
Do not invent a description or category to fill an empty field. If a correction
cannot be matched confidently, leave it unresolved rather than modifying a guess.

## Immediate capture and pending work

The source user message is durable evidence. Before acknowledging a capture as
accepted for later writing, persist enough pending-work state to recover it after
a worker or application restart. A queue entry alone is not the sole record of
unfinished work.

- For an available daily-note destination, read the latest document and merge the
  capture using the existing version checks.
- For an available explicit custom-note destination, follow the existing direct
  editing flow and revision checks.
- If a destination is open, leave the write pending and retain its source evidence.
- If a write fails, retain recoverable work and report the failure when it affects
  the current request. Never report a successful note write without confirmation.
- Distinguish "received for later writing" from "saved in your daily note" in the
  user's language. Keep routine queue and worker details internal.

Explicit destinations are not bypassed by writing to another note when blocked.
Manual editor saves remain available to the user. All assistant-initiated note
writes, including requested captures, are subject to open-note protection; this
release introduces no implicit exception for an assistant edit to an open note.

## Background organization

### Inputs and scheduling

Run note organization after conversation inactivity, using the existing 15-minute
default scheduling pattern. Include changed daily notes as recoverable work so
dashboard edits are considered even when no new chat message arrives. Periodic
recovery uses the existing 24-hour interval pattern and revisits deferred work.

Use incremental work boundaries rather than repeatedly scanning the entire
history. Inputs are relevant new user messages, changed daily-note content, and
the existing notes needed to resolve destinations. Memory may supply context and
help discover related material; verify exact record details against original
evidence. Assistant text, retrieved notes, and tool output are not new user
instructions.

If a memory suggests a missing record but its original evidence cannot be
recovered, do not reconstruct exact amounts, dates, or transactions from a vague
summary. Keep the uncertainty visible and seek clarification when needed rather
than silently promoting the summary into a confirmed record.

Maintain note-organization progress independently of memory checkpoints,
automatic-memory enablement, retention filters, and message/token thresholds.
Do not weaken existing memory rules to make a record eligible for organization.

### Resolve and apply

The skill should guide the agent to identify useful material, investigate
candidate destinations by meaning and path, and read the documents needed to
make a grounded choice. Search and inspection can be repeated as needed.
Reuse an appropriate note when it serves the request; create one when a separate
home is justified. Identical titles in different folders remain distinct, and
material ambiguities require clarification. Placement should use the user's
request and existing workspace context without inventing a folder hierarchy.

Edits must retain unrelated content, existing formatting, and internal note-link
identities. The execution layer enforces open-note protection and the exact
document version at commit time, and persists the applied source-to-destination
relationship with completion state. These commit requirements apply to every
write regardless of the agent's chosen sequence of actions.

Keep original daily captures. Add links to organized records when appropriate;
adding a link is itself a protected write. If the destination update succeeds but
the source-link update is blocked, retry only the missing link operation.

Organization stays quiet during normal success and routine deferral. Surface a
question when a material ambiguity prevents safe progress. Do not repeatedly ask
the same unresolved question on each scan.

## Open-note protection

### Presence contract

Register an authenticated, owner-scoped presence lease before presenting a note
as ready to edit. The identity includes the daily/custom note reference and a
distinct editor session. An empty daily-note date is also a valid protected target.

- Cover both the Notes workspace and chat drawer using one shared presence contract.
- Renew presence while the note stays open, including when its editor lacks focus.
- Protect the note while any tab or device has an active lease. Closing one editor
  releases only that editor's lease.
- On close, navigation, or note switch, flush pending saves before releasing the
  old lease. A failed save keeps the editor and its protection active.
- Expire abandoned leases after a bounded period to recover from browser crashes.

Lease renewal and expiry intervals are implementation details to settle during
implementation. They must account for browser background throttling and avoid
leaving a note blocked indefinitely after disconnection.

### Write arbitration

The backend must serialize editor-presence acquisition and assistant mutations
for the same note. A prompt instruction or a check at job start is insufficient.

- If an editor already holds presence, the assistant mutation is deferred.
- If an assistant mutation commits first, an opening editor acquires presence and
  loads the resulting current document before editing becomes available.
- If a note opens during model planning, the eventual assistant write is deferred.
- Recheck the document revision as well as presence. A revision mismatch requires
  a fresh read and a newly resolved edit, never a blind stale retry.
- If presence cannot be established or verified, automatic writes wait and the
  system records a diagnosable failure; it must not assume the note is closed.

Presence leases bound the guarantee to editors with a live server registration.
A disconnected editor whose lease expires must reacquire presence and reconcile
the server version before resuming automatic saves. Preserve its local draft and
surface a conflict if reconciliation cannot safely retain the user's changes.
Do not claim an offline browser can hold a permanent server lock.

Reading an open note is permitted. Content edits, link additions, renames, moves,
and deletion by the assistant must wait. Do not create an alternate note to evade
protection. Deferred changes resume only after the last lease releases or expires,
using a fresh document read.

## Durable processing and recovery contracts

The exact schema and queue names are deferred, but the implementation must represent:

- Owner, source identity, source type, original timestamp, and relevant timezone.
- A stable capture/item identity within a source, plus the source version for
  editable daily-note evidence.
- The intended destination, proposed change, unresolved questions, and processing state.
- Independent completion for capture, destination organization, and source linking.
- Applied destination references and a source-to-result relationship for deduplication.
- Attempt/failure information and eligibility for later retry.

Track editable-source versions without treating every edited document as entirely
new material. An unrelated change must not duplicate records already incorporated.
Revalidate changed evidence before applying an old plan.

Writing and recording completion must be atomic or have an equivalent durable
idempotency guarantee. Recovery from a crash after the write must discover that
result and finish bookkeeping without adding the same record twice. Separate
source messages describing distinct identical-valued transactions must remain
distinct; equal text or amount alone is not a valid duplicate key.

Deferred work is not completed work. Presence release, revision conflicts, worker
restarts, and model/provider failures must leave it recoverable. Do not fall back
to memory-only storage or silently discard an operation. Log failures without
unnecessarily exposing private note text or financial values.

Honor existing owner isolation and deletion/Trash behavior. Never resurrect a
trashed destination or recreate a user-deleted record merely because its source
is encountered again. Source removal and explicit rejection must invalidate
unapplied proposals based on that evidence.

## Ordered implementation phases

1. **Policy and evaluation fixtures.** Align system instructions, note tools,
   tool-selection guidance, and memory boundaries. Establish expected outcomes for
   the examples and edge cases below before tuning model behavior.
2. **Durable work and editor presence.** Add independent processing state,
   authenticated presence interfaces, shared frontend integration, write
   arbitration, and recovery. Protect existing assistant note writes before any
   automatic organization is enabled.
3. **Skill and conversation integration.** Add note guidance and protected tools
   to the existing skill-driven agent. Handle implicit intent, explicit
   destinations, durable deferral, and accurate acknowledgments without a fixed
   pre-response note pipeline.
4. **Background agent runs and recovery.** Supply incremental evidence to bounded
   skill-driven runs triggered by inactivity and periodic recovery. Persist actual
   pending actions and receipts rather than requiring a fixed sequence of stages.
5. **Evaluation and activation.** Run organization in proposal-only mode, review
   decisions and resulting proposed documents, then enable writes after the
   acceptance criteria pass. Proposal-only mode must not mutate product notes or
   advance the applied-work checkpoint.

Each phase must obey the applicable backend/frontend/database/infrastructure
AGENTS.md guides when implementation begins. Reuse existing service boundaries,
repository contracts, rich-text representations, errors, and version checks.

## Acceptance criteria

### Agent architecture

- Conversation note work uses the existing agent skill/tool loop; a separate
  capture-intent/extraction pipeline is not a required precondition for responding.
- The note skill is discoverable and loads its guidance/tools through the existing
  catalog. Tests exercise actual skill loading and protected note-tool execution.
- The agent can inspect several candidates, search again, then edit or create as
  appropriate; execution does not prescribe one search or a fixed tool order.
- Idle and periodic triggers use the same agent capabilities with scoped evidence
  and authority, and can perform useful work or decide no change is needed.
- Direct writes, daily captures, multi-note changes, clarification, and no-op
  decisions do not require a `source/capture/review/organize/link` recipe. Prior
  successful writes remain deduplicated when a run resumes or revises its plan.
- Proposal mode, bounded runs, durable recovery, and all write protections hold
  through the real agent/tool path, including restarts and tool failures.

### Behavior and organization

| Scenario                                                          | Observable outcome                                                                                                                                          |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Pengeluaran saya hari ini Rp55.000" without "catat"              | Accepted as a record; captured immediately or durably deferred if the day is open; organization finds or creates Pengeluaran and preserves the dated total. |
| Same statement with "catat"                                       | Same record semantics and final destination policy.                                                                                                         |
| A single useful capture in a short conversation                   | Remains eligible without reaching memory thresholds.                                                                                                        |
| "Tambah pengeluaran makan Rp20.000"                               | Adds a transaction; does not reinterpret an earlier daily total as another expense.                                                                         |
| A resolvable "sebenarnya Rp65.000" correction                     | Corrects the corresponding record rather than appending an unrelated expense.                                                                               |
| A correction with multiple plausible targets                      | No guessed mutation; work waits for clarification.                                                                                                          |
| Expense question, hypothetical, negation, or quoted example       | No fabricated confirmed expense.                                                                                                                            |
| A lasting preference in a message that also reports an expense    | Expense follows the record workflow; preference independently follows memory admission rules.                                                               |
| Explicit daily, custom-note, or folder destination                | Destination is honored, with existing path ambiguity handling.                                                                                              |
| Existing suitable tracking note                                   | Reused without creating another equivalent note.                                                                                                            |
| Two distinct equal-valued transactions                            | Both retained with their own source identities.                                                                                                             |
| Delayed processing crosses midnight                               | Original local day and stated record date remain correct.                                                                                                   |
| Manual daily-note edit without a new chat message                 | Changed material becomes eligible for organization.                                                                                                         |
| Automatic memory disabled or memory admission rejects the expense | Note work remains eligible; memory consent rules remain unchanged.                                                                                          |

### Presence, recovery, and integrity

- A mixed request can add material and correct existing material in one grounded
  plan without being forced into one operation category.
- Journal-like material with an independent organizational purpose remains
  eligible without changing a mandatory purpose label.
- A suitable direct destination can receive an unspecified capture without an
  intermediate daily-note write; otherwise the daily-note default still works.
- A clarification can revise an earlier destination interpretation without losing
  pending work, duplicating an applied write, or bypassing open-note protection.
- A requested rich-text restructuring preserves unrelated content and link
  identities without being reduced to append-only edits.
- An open daily or custom note receives no assistant mutation, including link writes.
- Protection works in the Notes page, chat drawer, two tabs, and two devices.
- Closing one of two open editors does not release the other editor's protection.
- A note opened after planning but before commit prevents that write.
- Concurrent opening and writing resolve in a serialized order with no stale editor load.
- Closing with unsaved changes does not release protection before a successful flush.
- Browser crash recovery expires abandoned presence; reconnect preserves drafts and
  checks the current revision before saving.
- A presence-service failure defers automatic writes and produces a diagnosable error.
- A blocked target does not cause an alternate destination to be created.
- Repeated scans, overlapping workers, and a crash after commit produce one applied
  record for the same source item and operation.
- A destination already updated is not updated twice when its source-link write is retried.
- Source changes invalidate stale proposals without duplicating unchanged records.
- Retries preserve rich-text formatting, unrelated content, and note-link identities.
- Trash/deletion and ownership boundaries remain respected during recovery.
- Jobs distinguish deferred, failed, rejected, and successfully applied work; no
  success acknowledgment precedes a successful note write.

Use deterministic integration tests for write arbitration, idempotency, recovery,
and ownership. Use model evaluations for recording intent, destination selection,
and record semantics; a prompt substring assertion is not evidence of those
behaviors. Exercise user-facing capture acknowledgments through the development
[/chats preview workflow](../docs/CHAT_PREVIEWS.md) for Web chat, Telegram, and
WhatsApp. Validate presence with real browser tabs as well as service-level tests.

## Deferred implementation details

- Concrete persistence schema, migrations, internal endpoint names, and queue names.
- Presence heartbeat/expiry intervals and bounded retry/backoff budgets.
- Exact evaluation dataset size and model-specific tuning; all mandatory scenarios
  above must pass, and model quality must be assessed beyond one wording per case.
- Operational controls for proposal-only evaluation and enabling organization writes.

These details may be chosen during implementation within the contracts above.
Changes to user-visible routing, automatic-write scope, source preservation, or
open-note protection require revisiting this specification.
