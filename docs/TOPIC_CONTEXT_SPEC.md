# Topic context specification

| Field        | Value                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Date         | 21 November 2026                                                                                                               |
| Status       | Phases 1–3 implemented; see sections 18–20                                                                                     |
| Scope        | Implicit topics per user, across channels: formation, recognition, related active items, disconnecting, ranking and retirement |
| Prerequisite | Channel conversations end after 4 idle hours; reminders do not count as activity (`09e7d35`, done)                             |
| Related      | [Proactive secretary](./PROACTIVE_SECRETARY_SPEC.md) SEC-01–03, [Memory system](./MEMORY_SYSTEM.md)                            |

## 1. Outcome

Sydia knows which ongoing efforts the user has, such as a child's study tour, a kitchen renovation or a house move. When a message relates to one of them, Sydia brings in that topic's active items (reminders, tasks, events, notes) and its last known state, and uses them in the decision or answer. This works in a brand-new conversation, on any channel, without the user naming the topic or opening anything.

Example on WhatsApp: "Anak study tour Selasa depan, bisa bikin janji dokter gigi Selasa sore?" Sydia recognizes the study-tour topic, sees the trip event on Tuesday 07:00–17:00 and the unpaid-fee reminder on Friday, points out the clash, and suggests Wednesday. Today this only happens if the model happens to call `get_work_context` with a matching word.

Success means fewer duplicated reminders, fewer missed conflicts and less restating of context. More mentions of stored items are not success; an unrelated item brought into a reply is a failure.

### Principles

- **Fully implicit.** No topic UI, no projects to create, no settings beyond the existing memory toggle (TOPIC-PRIV-01). Corrections happen in conversation.
- **Per user, across channels.** One topic store serves Web, Telegram and WhatsApp.
- **An interpretation, not a source of truth.** Topics are rebuildable. Task status, reminder times, calendar data and note content are always read fresh from their own stores. Durable personal facts stay in Hindsight.
- **Reference data, never instructions.** Topic state and linked items cannot authorize actions or change policy, as with every other reference block.
- **The user's current words win** over stored topic state.
- **Never block a turn.** Any topic failure degrades to a turn without topic context.

## 2. Existing foundations and gaps

| Existing piece                                                             | Where                                                        | Gap this spec closes                                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `get_work_context` (notes, tasks, events, reminders, statements, memories) | `apps/backend/src/modules/secretary/work-context.service.ts` | Runs only when the model calls it; matching is substring on titles (`topicTerms`), so synonyms and ID/EN pairs are missed. |
| Open note per message (`activeNoteRef`) and selected sources               | `context-builder.service.ts`                                 | Web only, one message only, chosen by hand.                                                                                |
| Rolling summary (`currentObjective`, `relevantEntities`)                   | `conversation-summarizer.service.ts`                         | Free text in one conversation; not usable for retrieval.                                                                   |
| Recent other conversations (3 latest, 4 messages each)                     | `findRecentContexts`                                         | Ordered by recency, not relevance; reminder IDs are dropped.                                                               |
| Turn gate (Jev, `noul` and `choice` questions)                             | `turn-decision.service.ts`                                   | Has no topic question.                                                                                                     |
| SEC-01 work-context records                                                | [PROACTIVE_SECRETARY_SPEC.md](./PROACTIVE_SECRETARY_SPEC.md) | Specified, never built. Topics implement SEC-01.                                                                           |

## 3. Data

### TOPIC-DATA-01: Topic

Owner-scoped. Fields:

- `label` and `aliases` (including Indonesian and English forms, e.g. "study tour", "karyawisata").
- `embedding` of label, aliases and state, refreshed when they change.
- `state`: last decision, next step, open questions. Each claim keeps its evidence (message IDs or item references) and whether it was explicit or inferred. Bounded to about 600 characters.
- `status`: `candidate`, `active`, `dormant`, `dismissed` (see TOPIC-LIFE-01).
- `salience`, `salienceAtActiveDay` (TOPIC-RANK-02), `lastActiveAt`, `createdAt`.
- `gateCutoffOffset`: raised by disconnects, decays back (TOPIC-RANK-04).

### TOPIC-DATA-02: TopicLink

Topic to item: note (`custom:` or `daily:` ref), reminder, task, calendar event, record table or row, document, contact, conversation. Each link records its origin (`touched` by a tool this turn, `user_stated`, or `inferred`), confidence, `createdAt` and `removedAt`. A removed link is kept as a suppression so formation never adds it back.

### TOPIC-DATA-03: TopicEvent

Append-only log of salience events (TOPIC-RANK-01) and disconnects, with episode identity. Salience can be rebuilt and weights retuned from it.

### TOPIC-DATA-04: TopicSuppression

What the user disconnected (TOPIC-DISC-01): scope, topic, conversation or item, `createdAt`, and for episode scope the episode identity.

### TOPIC-DATA-05: Active-day clock

Per user: count of distinct local days with at least one user message, and the last such day. Reminder deliveries and Sydia's own messages do not advance it.

## 4. Formation (background)

### TOPIC-FORM-01: When it runs

After a turn completes, as a background job debounced per conversation (about 2 minutes), so a burst of messages is processed once. It never runs on the reply path. It skips content that `containsDecisionCredential` flags.

### TOPIC-FORM-02: Inputs

- **Exact links:** item IDs from this turn's tool invocations (created, updated, read at the user's request). These need no model.
- **User messages** since the last processed message, plus the rolling summary's `currentObjective` and `relevantEntities` when present.
- **The topic recognized for the turn**, if any (TOPIC-RECOG).

### TOPIC-FORM-03: Assign, create or skip

An extraction call proposes: assign to an existing topic, start a new one (label, aliases), or none; plus state updates with evidence, and which existing state statements the new messages complete, answer or replace (those are removed). Deterministic rules then apply:

- **Assign** links the touched items, updates state and records a salience event.
- **Create** a `candidate` topic. It becomes `active` only when it has at least one linked active item (pending reminder, open task, upcoming event), or the same subject appears in a second episode. A one-off question never becomes a topic. Unconfirmed candidates expire after 30 days.
- **Merge conservatively.** Same or similar labels alone never merge two topics (the son's birthday and the mother's birthday stay separate unless their people or items match). When unsure, keep them apart.
- **Inferred links** need a confidence cutoff and are never added against a suppression.

## 5. Recognition (every message)

### TOPIC-RECOG-01: Candidates

Assembled in parallel with history building:

1. **Similarity:** embed the latest user message plus the previous user message; score against `active` and `dormant` topics. Users have dozens of topics, so score in memory; no vector index is needed.
2. **Explicit anchors:** topics linked to the open note, selected note or document sources, or the reminder a quoted reply refers to (`replyTo.reminder`).
3. **Episode stickiness:** the topic recognized earlier in the current episode.
4. **Dismissed topics** are candidates only on a strong explicit match: the label or an alias named in the message, with similarity above a high cutoff.

Rank with TOPIC-RANK-03 and keep the top 3. Candidates under a suppression for this episode are removed.

### TOPIC-RECOG-02: Gate question

Add one `choice` question to the existing turn-decision call: which of these topics, if any, is the latest message about? Choices are the candidate topic IDs (criteria: label and a one-line state) and `none`. Accept a topic only when confidence reaches the base cutoff plus the topic's `gateCutoffOffset`. At most 2 topics per turn.

Feature mode `topics` follows the existing `off | shadow | reject-only | enabled` pattern in the decision settings.

### TOPIC-RECOG-03: Latency and failure

Candidate embedding has its own deadline. If it misses the deadline, or the gate fails, the turn continues with no topic and logs `topic_recognition_degraded`. Recognition must not add a model call to the reply path beyond the existing gate call.

## 6. Context and behavior

### TOPIC-CTX-01: Topic block

When a topic is accepted, add one volatile reference block after history, beside recalled memory, inside the optional context budget (about 500 tokens for up to 2 topics). It holds:

- topic ID and label;
- state: last decision, next step, open questions;
- active linked items, **read fresh**, ordered by TOPIC-RANK-05: type, ID, title, time, status. No note bodies: Sydia reads a note before making claims about its content (SEC-02).
- coverage: a source that failed to load is reported as unknown, not as empty.

### TOPIC-CTX-02: Guidance to the model

- Use the items in the decision: avoid duplicates ("you already have a reminder for that"), catch conflicts, and point out missing steps.
- Mention the connection briefly only when it changes the answer, e.g. "This sounds like the kitchen renovation, and the contractor comes Thursday."
- If two topics both fit and the difference matters, ask which one.
- Never list items unprompted, and never recap a topic in reply to an unrelated message.
- The user's current statements override stored state. Do not claim stored records were updated unless a tool did it.

### TOPIC-CTX-03: Existing tools and skills

- `get_work_context` accepts an optional `topicId`: linked items first, keyword search as fallback.
- The `work-resumption` skill reads topic state instead of reconstructing it.
- The awaiting-reminders block and the recent-conversations block are unchanged in the first release. Measure whether the topic block can shrink the recent-conversations block later.

## 7. Disconnecting

### TOPIC-DISC-01: The `disconnect_topic` tool

Deterministic effects per scope. The tool must be offered on every turn that has a topic block, regardless of tool routing.

| User says                                    | Scope               | Effect                                                                                                                                                                                |
| -------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Ini bukan soal Proyek A", "bukan itu"       | `episode` (default) | The topic is not brought up again in this episode. Lifted if the user brings the topic back themselves. Takes back that episode's salience credit and applies the disconnect penalty. |
| "Pengingat itu nggak ada hubungannya"        | `item`              | Removes that link and records a suppression so formation never re-adds it.                                                                                                            |
| "Proyek A sudah selesai"                     | `topic_complete`    | Status `dismissed` (reason: completed). Revived only by explicit naming.                                                                                                              |
| "Jangan ingat itu lagi", "lupakan topik itu" | `topic_forget`      | Hard-deletes the topic, its state, links and events.                                                                                                                                  |

A plain "bukan itu" is episode scope. A permanent effect (`item`, `topic_*`) requires the user to name the item or topic.

### TOPIC-DISC-02: Splitting (phase 3)

"Itu beda, ulang tahun ibu bukan anak" moves the named items into a separate topic.

### TOPIC-DISC-03: Learning from disconnects

Every disconnect is logged with the candidate scores and gate confidence that led to it, as false-relevance evidence for calibration.

## 8. Ranking

### TOPIC-RANK-01: What counts as brought up

Salience measures the user's interest, not Sydia's. Each topic earns at most one event per episode.

| Event                                                                                                      | Weight                                    |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| User message assigned to this topic (by formation in phase 1; by the gate at or above cutoff from phase 2) | 1.0                                       |
| User returns to it after a gap, or names it explicitly                                                     | 1.5                                       |
| User edits or completes a linked item in the app                                                           | 0.5                                       |
| Sydia mentions it; a reminder is delivered                                                                 | 0                                         |
| User disconnects it for an episode                                                                         | −1.0, and the episode's credit is removed |

Sydia's own mentions must never count; otherwise a wrong link strengthens itself.

### TOPIC-RANK-02: Decay

`S = Σ wᵢ · 2^(−ageᵢ / H)`, with age measured in **the user's active days** (TOPIC-DATA-05) and half-life `H` = 14 active days. Store `salience` and `salienceAtActiveDay`; on each event `S ← S · 2^(−Δ/H) + w`; apply decay lazily at read time. A user who stops using Sydia for weeks does not come back to find every topic dismissed.

### TOPIC-RANK-03: Candidate score

```
filter:  similarity ≥ floor  OR  explicit anchor
score  = similarity
       + α · log(1 + S)            frequency prior: breaks ties, never overrides
       + β · urgency               nearest pending linked item
       + γ · stickiness            recognized earlier in this episode
       − δ · recentDisconnects     decaying penalty
```

`urgency = 1 / (1 + days until the nearest pending linked reminder, event or due task)`, within 30 days, else 0. Similarity stays the main term: a frequently discussed topic must not capture a message that clearly fits a rarer one.

### TOPIC-RANK-04: Per-topic cutoff

Each episode disconnect raises that topic's `gateCutoffOffset` (for example by 0.1, capped), decaying back with the same active-day clock. A topic that keeps being linked wrongly gets harder to link.

### TOPIC-RANK-05: Items inside the block

Order: active before inactive, nearer dates first, `user_stated` and `touched` links before `inferred`, most recently touched first.

## 9. Lifecycle

### TOPIC-LIFE-01: States

| State       | Enters when                                                           | Behavior                                                                                |
| ----------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `candidate` | Formation proposes a new topic                                        | Not recognized. Becomes `active` per TOPIC-FORM-03 or expires after 30 days.            |
| `active`    | Confirmed, or any user event                                          | Normal candidate.                                                                       |
| `dormant`   | `S` below 0.3 and no pending linked item, after the grace period      | Candidate with a higher similarity floor.                                               |
| `dismissed` | Dormant for 60 active days, or `topic_complete`                       | Not a candidate except on strong explicit match (TOPIC-RECOG-01), which reactivates it. |
| (deleted)   | `dismissed` with no activity for 365 calendar days, or `topic_forget` | Topic, state, links and events hard-deleted.                                            |

### TOPIC-LIFE-02: Stability rules

- **Pending items anchor.** A topic with a pending linked reminder, upcoming event or due open task never moves down.
- **Hysteresis.** Returning from `dormant` to `active` needs `S` of at least 1.0, higher than the dormant threshold.
- **Grace period.** New topics start at `S` = 1.0 and cannot go dormant for 7 active days.
- **Cap.** At most 50 `active` topics per user; above that, the lowest-salience topics without pending items become `dormant`.
- **Recurring topics** (school terms, taxes, yearly birthdays) come back from `dismissed` by alias match; a linked recurring reminder or event keeps them anchored.

A daily sweep applies transitions and deletions; ranking itself needs no sweep.

## 10. Episodes

### TOPIC-EPISODE-01: Definition

An episode ends at whichever comes first:

- a new conversation: Telegram/WhatsApp rotation after `BACKEND_CHANNEL_CONVERSATION_IDLE_MS` (4 hours) without a user message, `/new`, `/reset`, or a new web chat;
- on Web, which does not rotate, a gap of the same idle period between user messages;
- the gate accepting a different topic, or `none` for two consecutive user messages.

Reminder deliveries and Sydia's messages never extend an episode.

Episodes scope salience credit (TOPIC-RANK-01), stickiness (TOPIC-RANK-03) and `episode` disconnects (TOPIC-DISC-01). A new conversation drops stickiness, so an old topic gets no head start; if the user brings it up again, that is a "returns after a gap" event.

## 11. Privacy

### TOPIC-PRIV-01: Memory toggle

Topic tracking follows `User.automaticMemoryEnabled`. When it is off: no formation, no recognition, no topic block. Existing topics are kept but unused until it is turned back on, the user asks to forget them, or the account is erased.

### TOPIC-PRIV-02: Inspection in conversation

Implicit does not mean unreachable. "Kenapa kamu kaitkan ini dengan Proyek A?" gets a truthful answer from the block. In phase 3 a read tool answers "topik apa saja yang kamu ingat?".

### TOPIC-PRIV-03: Export, erasure and deletion

- `GET /users/me/export` includes topics: label, aliases, state, status, links (by reference) and timestamps.
- Account erasure deletes all topic data.
- Deleting a conversation removes its links and events; topic state with evidence from it is rebuilt without it.
- A masked or forgotten message invalidates state claims that cite it; the claim is rebuilt from remaining evidence or dropped (SEC-03).

### TOPIC-PRIV-04: Secrets

Credential-bearing content is excluded from formation, recognition input, topic state and telemetry. Secret vault items are never linked.

## 12. Failure and observability

### TOPIC-OBS-01: Never block a turn

Formation failures are retried by the job. Recognition or block-assembly failures log a structured event (`topic_recognition_degraded`, `topic_context_degraded`) with a remediation hint, like `optional_assistance_degraded`, and the turn proceeds without topic context.

### TOPIC-OBS-02: Per-turn record

Log candidate IDs, similarity, salience, urgency, final scores, gate choice and confidence, whether the block was injected, and the feature mode. Add the accepted topic IDs to the Langfuse turn metadata. Do not log message text or topic state.

## 13. Configuration

All values are provisional and calibrated in shadow mode.

| Setting                                                     | Default                                               |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| Feature mode `topics` (decision settings)                   | `off`                                                 |
| Half-life `H`                                               | 14 active days                                        |
| Similarity floor (active / dormant / dismissed)             | 0.2 / 0.3 / 0.7 (lowered 21 Nov 2026, see section 18) |
| α, β, γ, δ                                                  | 0.05, 0.1, 0.1, 0.1                                   |
| Gate base cutoff; disconnect step; cap                      | 0.7 (calibrated 21 Nov 2026); +0.1; +0.3              |
| Dormant threshold; reactivation threshold                   | 0.3; 1.0                                              |
| Grace period; dismiss after dormant; delete after dismissed | 7 active days; 60 active days; 365 calendar days      |
| Active topic cap                                            | 50                                                    |
| Topic block budget; topics per turn                         | 500 tokens; 2                                         |
| Formation debounce                                          | 2 minutes                                             |

## 14. Rollout

| Phase    | Deliverable                                                                                                                           | Exit criteria                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 (done) | Channel conversations end after 4 idle hours; reminders are not activity (`09e7d35`)                                                  | —                                                                                                                                                                                                                        |
| 1 Shadow | Schema, formation, recognition with `topics` = `shadow` (logged, never injected), active-day clock, memory toggle, export and erasure | On an owner-labeled sample: gate precision ≥ 0.9, correct topic in top 3 ≥ 0.85, and no topic created from a one-off question. Met on 21 Nov 2026 with a labeled calibration set instead of a shadow period (section 18) |
| 2 Enable | Topic block, `disconnect_topic` (all four scopes), `get_work_context` `topicId`, `work-resumption` update                             | Prompt eval TOPIC-E01–E14 pass on held-out phrasings; disconnect rate per 100 recognitions tracked in production                                                                                                         |
| 3 Refine | Lifecycle sweep and deletion, split, list tool, state rebuild on deletion, topic-aware proactive suggestions                          | Share of dismissed topics later revived stays low                                                                                                                                                                        |

Privacy items (TOPIC-PRIV-01, -03, -04) ship in phase 1 because phase 1 already stores topic data.

## 15. Verification

Prompt-eval and integration scenarios. Check outcomes (tools called, items referenced, saved records), never exact wording, and keep held-out phrasings that the guidance does not quote ([ASSISTANT_TUNING.md](./ASSISTANT_TUNING.md), open work item 17).

| ID        | Scenario                                                                           | Pass                                                                   |
| --------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| TOPIC-E01 | New conversation names an existing topic by a synonym (karyawisata / study tour)   | Topic recognized; related item used                                    |
| TOPIC-E02 | Topic formed on Web, mentioned later on Telegram                                   | Recognized across channels                                             |
| TOPIC-E03 | Proposed time conflicts with a linked event                                        | Conflict pointed out, alternative offered                              |
| TOPIC-E04 | Request duplicates a linked pending reminder                                       | Existing reminder mentioned; no duplicate created without confirmation |
| TOPIC-E05 | Unrelated message ("makasih", weather question) while a topic exists               | No block, no recap                                                     |
| TOPIC-E06 | Two similar topics (mother's vs son's birthday)                                    | Correct one chosen, or Sydia asks                                      |
| TOPIC-E07 | "Bukan itu" after a wrong link                                                     | `episode` disconnect; not relinked in the episode                      |
| TOPIC-E08 | Same topic brought up by the user in a later episode after E07                     | Recognized again                                                       |
| TOPIC-E09 | "Pengingat itu nggak ada hubungannya"                                              | Link removed and not re-added by formation                             |
| TOPIC-E10 | "Proyek A sudah selesai", then a vague related message                             | Not recognized; explicit naming revives it                             |
| TOPIC-E11 | "Lupakan topik itu"                                                                | Topic and links deleted; absent from export                            |
| TOPIC-E12 | One-off factual question                                                           | No topic created                                                       |
| TOPIC-E13 | Memory toggle off                                                                  | No formation, recognition or block                                     |
| TOPIC-E14 | Linked item changed since the topic was last updated (task completed, event moved) | Block shows current state; no stale claim                              |

Unit and integration coverage: salience update and lazy decay on the active-day clock, one event per episode, disconnect credit removal, cutoff offset decay, lifecycle transitions with hysteresis, grace period and anchors, the cap, suppression preventing relinking, and episode boundaries including reminder deliveries.

## 16. Owner decisions

| Date        | Decision                                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 20 Nov 2026 | "Currently working on" means several ongoing efforts recognized from any new conversation, not only the current conversation's topic.                                                                                                                  |
| 20 Nov 2026 | Topics work across channels, are fully implicit (no UI) and need no user-created projects.                                                                                                                                                             |
| 20 Nov 2026 | Sydia must disconnect a topic when the user says it is unrelated.                                                                                                                                                                                      |
| 20 Nov 2026 | Frequently raised topics rank higher; topics never raised again are retired.                                                                                                                                                                           |
| 20 Nov 2026 | Reminder deliveries are not activity; channel conversations end after 4 idle hours (implemented in `09e7d35`).                                                                                                                                         |
| 21 Nov 2026 | Topic tracking follows `automaticMemoryEnabled`.                                                                                                                                                                                                       |
| 21 Nov 2026 | A plain "bukan itu" disconnects for the episode; permanent only when the item or topic is named.                                                                                                                                                       |
| 21 Nov 2026 | Sydia states the connection briefly when it changes the answer, and asks only when two topics both fit.                                                                                                                                                |
| 21 Nov 2026 | Decay uses the user's active days.                                                                                                                                                                                                                     |
| 21 Nov 2026 | Dismissed topics are kept for revival and deleted after one year without activity.                                                                                                                                                                     |
| 21 Nov 2026 | At most 50 active topics per user.                                                                                                                                                                                                                     |
| 21 Nov 2026 | Sydia may start conversations on WhatsApp or Telegram on its own (for topic-aware and other proactive help); designing that outreach is deferred.                                                                                                      |
| 21 Nov 2026 | With a topic attached, Sydia raises a pending step only when the request concerns it; no "btw" reminders of other steps.                                                                                                                               |
| 21 Nov 2026 | Forgetting, completing, splitting or disconnecting a topic changes only the topic. Reminders, tasks, notes and events are edited, renamed or deleted only when the user asks for that change itself; "forget everything about it" does not cover them. |

## 17. Out of scope

- Any topic UI, list, chip or settings page.
- User-created projects or folders as topics.
- Topics shared between users.
- Changing saved data from topic inference alone; actions still need a request or an accepted offer (ACT-01–02).
- Cross-channel reminder replies (answering a Telegram reminder in Web chat); revisit only if logs show it happens.

## 18. Phase 1 implementation notes

Phase 1 runs with `BACKEND_TOPIC_RECOGNITION_MODE=shadow`: topics are formed and recognition is logged, and nothing reaches a prompt.

- **Code:** `apps/backend/src/modules/topics` (formation, recognition, scheduler, settings, scoring), `PrismaTopicRepository`, migration `20261121090000_topic_context`. The job queue is `topic-formations` (worker concurrency 1, so two passes never race on a conversation's cursor), enqueued after each persisted reply and debounced per conversation.
- **Recognition runs in the background job, not on the reply path.** In shadow mode nothing uses its answer during the turn, so it adds no reply latency. Phase 2 moves the same call into the turn gate. It uses its own decision request (`stage: topic`, background lane) for now.
- **Salience events come from formation's assignment.** The formation model sees the whole exchange, so it decides which topic a message belongs to; the gate's choice is logged beside it (`topic_recognition_log.assignedTopicId`) for comparison.
- **Not yet computed:** urgency (needs fresh item reads, phase 2), disconnect penalties and suppressions (phase 2 tool), `item_edit` events from edits in the app, candidate expiry, the dormant/dismissed sweep and the active-topic cap (phase 3).
- **Candidate promotion** uses "links a reminder, task or calendar event" as its pending-item test; item states are not read.
- **Provider schema adherence:** the configured chat model does not enforce the JSON schema strictly; it omitted `action` and claim `kind` until the prompt listed every field. The parser also infers a missing action from `topicId`/`label` and drops claims without a valid kind.

Verification run on 21 November 2026:

- Unit: 43 topic tests (`src/modules/topics`) and the export allow-list test.
- PostgreSQL contract (`TOPIC_CONTRACT_ENABLED=true`, `prisma-topic.live.spec.ts`): active-day counting under concurrency, link suppression, event uniqueness, claim pruning, claim removal on masking and deletion, formation input, export and account erasure.
- Formation prompt against the configured model (`TOPIC_EXTRACTION_LIVE=true`, `test/topics/topic-extraction.live.spec.ts`): 6 scenarios (new effort with its item, synonym, thanks, one-off fact, similar names, unrelated errand) passed 18/18 over three runs.
- One end-to-end pass with the real model and gateway: a study-tour message created an active topic linked to its reminder; six hours later "Karyawisata ... bawa bekal apa?" scored similarity 0.46 (floor 0.35), the gate chose the topic at 0.92, and formation assigned the same topic. Synonym similarity sits close to the floor, which the shadow calibration should check.
- Live run through the running app (21 November 2026): two new accounts, 11 messages in separate chats via the conversation API, formed by the dev worker.
  - Correct: a new effort created an active topic linked to its reminder; "makasih" and a capital-city question formed nothing; a mother's and a son's birthday stayed separate topics, and a later "kue ultah Raka" went to the son's; a cross-language synonym, a progress update and a travel question went to the study tour; a haircut question went nowhere; a message with a password left no trace; the memory-off account formed nothing and its cursor moved on.
  - Gate: 7 of 7 decisions it was asked to make were right (4 topic choices at 0.96–0.97, 3 "none" at 1.00).
  - Missed recall: the first synonym message ("Karyawisata … bekal") scored similarity 0.32, below the 0.35 floor, while unrelated family messages scored 0.31–0.38 against the same topic. Similarity cannot separate them; the gate can. Floors were lowered to 0.2 (active) and 0.3 (dormant), and every message now logs its top five topics with `offered` true or false, so near misses are visible. After the topic learned "Karyawisata" as an alias, the same kind of message scored 0.56.
  - Claims are now resolved: formation sees each topic's state under short refs (`s1`, `s2`, …) and returns the ones the new messages complete, answer or replace, which are removed before the replacement is recorded. Only the chosen topic's own refs are accepted. Live prompt check: 8 scenarios, 23 of 23 decisions correct over three runs (one run lost a scenario to the provider returning no output, which the job retries).

### Recognition calibration (21 November 2026)

The owner chose a labeled calibration set over a shadow period. `test/topics/topic-recognition-calibration.live.spec.ts` holds one household account with eight topics (two birthdays, two school efforts, one child with both a birthday and braces, a trip, a renovation, a tax payment) and 34 owner-approved messages: 22 that belong to a topic, including English phrasings and context-dependent follow-ups, and 12 that belong to none, including hard negatives that name a family member or share a theme. It runs the production recognition service with real embeddings and the real decision gateway.

| Metric (34 messages × 2 runs)         | Cutoff 0.6 | Cutoff 0.7 (adopted) |
| ------------------------------------- | ---------- | -------------------- |
| Gate precision                        | 0.97       | 1.00                 |
| Correct topic among the three offered | 1.00       | 1.00                 |
| Gate recall                           | 0.86       | 0.86                 |
| Wrong topic chosen                    | 0          | 0                    |
| "None" message accepted as a topic    | 1          | 0                    |

Correct choices scored 0.85–1.00. The only wrong choice ("Kulkas di dapur bunyi aneh" → kitchen renovation) scored 0.56–0.60. The misses are messages that only imply their topic ("Bandung … perlu bawa jaket?", "Dekorasi balon buat hari Minggu", "Tukangnya minta DP"), at 0.36–0.53; missing one leaves the turn as it is today. Similarity separates nothing on its own: hard negatives reached 0.49 while some real matches sat at 0.41–0.44, which confirms the low floors and the gate as the precision check. Keep these messages out of prompts and skill text so the set stays held out.

## 19. Phase 2 implementation notes

Turned on per user with `BACKEND_TOPIC_RECOGNITION_MODE=enabled`, which (like other decision features) applies only to users in `BACKEND_DECISION_COHORT` and needs `BACKEND_DECISION_CALIBRATION_VERSION`. Users outside the cohort stay in shadow behavior.

- **Recognition on the turn** (`TopicContextService`): runs beside the turn decision as its own interactive gate request rather than as a question inside it, so its embedding call never delays the turn decision. It gives up after the interactive decision timeout plus 1.5 s (a fixed 2.5 s cut off 2 of 13 live turns while the gate was still answering) and the turn continues without a topic. It excludes topics suppressed in the current episode, uses episode stickiness from the formation state, and adds urgency from fresh item reads and the decayed disconnect penalty. The result is logged to `topic_recognition_log`, and formation reuses it instead of asking the gate again.
- **Topic block:** topic id, label, aliases, state (decisions, next steps, open questions) and up to six linked items read fresh, owner-local times, TOPIC-RANK-05 order, at most 500 tokens, placed with the other reference blocks after history. A turn with a block keeps every tool, as open notes and awaiting reminders already do. The usage guidance travels in the block, so the stable system prompt and its cache are unchanged.
- **`disconnect_topic`** in its own tool group (`topics`), which the gate does not route. Scopes as in TOPIC-DISC-01; episode disconnects take back the episode's credit, apply the −1 penalty and raise the topic's gate cutoff by 0.1 (cap 0.3).
- **Completion is also detected by formation.** Live, the chat model twice acknowledged "study tour sudah selesai" ("topiknya sudah tuntas") without calling `topic_complete`, so the extraction now reports `completed` when the user says the whole effort is over and formation closes the topic. The tool scope remains for explicit requests.
- **Formation skips messages that led to a `disconnect_topic` call.** Found live: after "lupakan semua soal pesta Raka" deleted the son's party topic, formation reread the message, attached it to the remaining "Raka" topic (a nephew's birthday) and closed that one.
- **Claims use calendar dates.** Formation now sees each message's owner-local send date; "Minggu depan" sent on Saturday 21 November is stored as Sunday 29 November 2026 instead of a relative phrase that drifts.
- **Extraction runs at medium reasoning effort with 2,000 output tokens.** With the deployment's default high effort, DeepSeek V4.1 Flash spent the 800-token limit reasoning and returned no output on about one in seven calls; low effort dropped user dates from claims.
- **Not built yet:** lifting an episode suppression when the user brings the topic back; the topic list tool, split and the lifecycle sweep, candidate expiry and topic cap (phase 3).
- **Scope note on TOPIC-E03:** a conflict is caught when the message is about the topic (its items are in the block). A plan that only collides with a topic, and whose date exists only as a claim rather than a calendar event, is not recognized as that topic and is not checked by `check_availability`. Live, "berenang hari Minggu tanggal 29" was not linked to Raka's party on the 29th.

### Live verification (21 November 2026)

A temporary API with topics enabled only for a QA parent account, against the dev database, with the dev worker forming topics.

| Scenario                                                                                                          | Result                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate reminder request for a linked item (TOPIC-E04)                                                          | Recognized at 0.98; no duplicate created; the existing reminder was named and the paid fee from the topic state mentioned                                        |
| Unrelated message (TOPIC-E05)                                                                                     | No topic (1.00); no recap                                                                                                                                        |
| Same-name confusion, then "bukan, ini Raka keponakanku" (TOPIC-E07)                                               | Recognized at 0.94 and used the topic state; `disconnect_topic` (episode) suppressed it, penalty and cutoff applied; the follow-up in the same chat had no topic |
| One item that does not belong (TOPIC-E09)                                                                         | `disconnect_topic` (item) removed the link (the assistant also renamed the reminder unasked — general assistant behavior)                                        |
| "Study tour … sudah selesai" (TOPIC-E10)                                                                          | Recognized at 0.86–0.96; closed by formation as completed; a later vague mention was not linked (0.54)                                                           |
| "Lupakan semua soal pesta Raka" (TOPIC-E11)                                                                       | `disconnect_topic` (topic_forget) deleted the topic                                                                                                              |
| Ambiguous or merely related messages (flood in Bandung, a family trip to Bandung, a fee that might be the trip's) | Not linked: the gate stayed under 0.7 (0.38–0.67); corrections created new topics ("Acara keluarga ke Bandung", "Iuran arisan RT")                               |

Formation prompt check after these changes: 10 scenarios, 30 of 30 over three runs. Recognition calibration unchanged: precision 1.00, correct topic in the top three 1.00.

## 20. Phase 3 implementation notes

- **Lifecycle sweep** (`TopicLifecycleService`, daily at 03:30 on the `topic-formations` queue): unconfirmed candidates are deleted after 30 days; an active topic goes dormant when its decayed salience falls below 0.3, no reminder, task or event of it is pending, and 7 active days have passed since its last status change; a dormant topic is dismissed (reason `inactive`) after 60 active days without a pending item; a dismissed topic untouched for 365 calendar days is deleted; over 50 active topics, the weakest without a pending item go dormant. A new `statusAtActiveDay` column times grace and dormancy on the owner's active-day clock, so a user who is away loses nothing. One owner's failure is logged and does not stop the others.
- **`list_topics`** (read-only, in the `topics` tool group): every kept topic with status (active, quiet, unconfirmed, closed), last decision, next step and pending item count. It answers "what do you remember" questions (TOPIC-PRIV-02) and gives the assistant topic ids, so a topic that is not in the turn's context can still be completed, split or forgotten.
- **Split** (`disconnect_topic` scope `split`, TOPIC-DISC-02): moves listed items into a new topic the user named. The new topic starts active and embedded; the moved links are removed from the old topic and never come back. Items not linked to the topic are refused before anything is created.
- **Naming a topic** (label or alias as whole words, four characters or more) lifts an episode suppression and makes a dismissed topic eligible again, on the turn and in formation.
- **Tool budget:** the two topic tools add about 1.3 KB to every turn's tool definitions (after trimming); the size budget moved from 94,000 to 95,500 bytes.
- **Not built:** salience events for edits made in the app (`item_edit`), which need hooks in the task, reminder and note services; topic-aware proactive suggestions in the background secretary. Both reach into other features and wait for an owner decision.

### Live verification (21 November 2026)

- PostgreSQL contract: the sweep made a quiet topic dormant, kept a topic with a pending reminder active, and deleted a 40-day-old candidate.
- Through the app (temporary API, topics enabled for a QA account): "Topik apa saja yang kamu ingat?" called `list_topics` and answered with every topic and its status, including unconfirmed and closed ones. "Lupakan topik iuran arisan RT", an unconfirmed topic never in context, was found with `list_topics` and forgotten with `disconnect_topic`. After "bukan itu, ini acara kantor suamiku" the gate itself dropped the family-trip topic (0.20, then 0.12), and naming it again ("balik lagi soal acara keluarga ke Bandung") brought it back at 0.96. Suppression lifting and split are covered by unit tests; the live runs did not need them.
- One recognition gave up at its 6.5 s deadline while the decision provider was slow; the turn continued without a topic. Degraded events now log the time waited.

### Telemetry (TOPIC-OBS-02)

Every turn of a user with topics enabled adds topic fields to the generation trace in Langfuse, next to `toolsOffered`: `topicOutcome` (`attached`, `none`, `gate_failed`, `degraded`, `skipped`, or `no_budget` when the block did not fit), plus `topicId`, `topicChoice`, `topicConfidence`, `topicCandidates`, `topicReason` or `topicElapsedMs` as they apply. IDs, scores and reasons only; no message text or topic state.

### Prompt evaluation (TOPIC-E scenarios)

Ten owner-approved scenarios in `apps/backend/test/prompt-eval/scenarios.ts` (area `topics`) run through the production context builder and tool definitions, with the scenario's topic rendered by the production topic block: duplicate reminder, uses state, disconnect for the episode (Telegram), disconnect one item, forget, complete on request, no recital of unrelated steps, list topics, forget by name, and split. The harness now registers the topic tools in every scenario, as production does. After the decisions above, the topic scenarios passed 59 of 60 runs over two rounds (one unasked reminder rename).
