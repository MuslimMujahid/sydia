# Sydia — Memory Systems

| Field  | Value                                                                               |
| ------ | ----------------------------------------------------------------------------------- |
| Date   | 1 October 2026                                                                      |
| Scope  | Backend memory, conversation context, notes/documents, and debug UI                 |
| Status | Hindsight is the only memory engine; legacy implementation removed 13 November 2026 |

Hindsight owns long-term fact extraction, consolidation, embeddings, observations, and recall. Sydia owns authenticated user-bank selection, evidence admission, delivery coordination, corrections, forgetting, and assistant integration. Conversation history, rolling summaries, daily notes, and document retrieval remain separate systems.

The [migration plan](./memory_systems_migration_hindsight.md) records implementation phases. The [operations runbook](./hindsight_operations.md) covers deployment, delivery recovery, backfill, export, rollback, and backup/restore.

The user accepted the [LLM cost and latency optimizations](./llm_cost_latency_optimization_plan.md) on 1 October 2026. The local deployment enables automatic memory eligibility, grounding/durability checks, recall decisions and the tool gate for all users. The memory cutoffs were recalibrated on 7 November 2026 against owner-approved examples (`test/optimization/memory-calibration.live.spec.ts`): a message is skipped when its eligibility score is at most **0.5**, and a fact is kept when every evidence check (grounding, span support, coverage) reaches **0.5** and its durability reaches **0.75**. The previous single fact cutoff of 0.85 rejected two thirds of approved memories. Extraction uses **GPT-OSS-20B on CoreWeave**; global consolidation and reflection remain DeepSeek. The [optimization runbook](./llm_optimization_operations.md) records accepted tradeoffs, the 1.5-second interactive decision budget, activation settings, end-to-end verification and rollback. New-installation decision defaults remain off.

## 1. Deployment and engine selection

Hindsight is the only memory engine. It is enabled when `BACKEND_HINDSIGHT_URL`, `BACKEND_HINDSIGHT_API_KEY`, and `BACKEND_HINDSIGHT_NAMESPACE` are all set; setting only some of them fails validation. With all three blank the deployment runs without memory: search returns nothing, explicit saves/corrections/forgets fail with HTTP 503, and ingestion and recall stay off. The local API and worker run Hindsight with automatic recall and ingestion enabled for all users. The private Hindsight API runs on loopback port 8889 with its own persistent PostgreSQL database. The application database remains on port 55432.

The former `BACKEND_MEMORY_ENGINE` modes (`legacy`, `shadow`) and `BACKEND_HINDSIGHT_COHORT` were removed on 13 November 2026. Validation rejects `BACKEND_MEMORY_ENGINE=legacy|shadow` and any non-empty cohort so a deployment expecting legacy memory fails at startup instead of silently changing behavior; `BACKEND_MEMORY_ENGINE=hindsight` is still accepted and can be deleted.

Banks are derived from the environment namespace and a hash of the authenticated user ID. Banks left in the removed `<namespace>-shadow` namespace are treated as retired: delivery recovery only erases them. A shared private API key authenticates Sydia to Hindsight; it does not replace owner authorization in Sydia.

There is no memory-management page or `/memories` REST API; chat memory tools are the only integration.

## 2. Stores and boundaries

| System                         | Storage / authority                                    | Purpose                                                                                  |
| ------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Durable facts and observations | Hindsight PostgreSQL                                   | Long-term preferences, facts, decisions, routines, and evidence-backed derived recall    |
| Memory coordination            | Application `hindsight_*` tables                       | Ownership, source generations, retries, admission, suppression, checkpoints, and erasure |
| Conversation archive           | Application conversations/messages                     | Original history and user evidence                                                       |
| Rolling summaries              | `conversation.rollingSummary`, `conversation_summary`  | Continuity within the context budget                                                     |
| Daily notes                    | `daily_note`, `daily_note_chunk`                       | Owner-local dated journal and independent retrieval index                                |
| Documents                      | `file_asset`, `document`, `document_chunk`             | Uploaded content and file RAG                                                            |
| Legacy memory (data only)      | `memory`, `memory_dream_run`, `memory_deletion_marker` | No new facts; read to validate imported facts; forget deletes rows and adds markers      |

```mermaid
flowchart TD
    CHAT[Chat memory tools] --> ACCESS[MemoryAccessService]
    HISTORY[(Conversation archive)] --> INGEST[HindsightIngestionService]
    ACCESS --> LEDGER[(Application coordination ledger)]
    INGEST --> LEDGER
    LEDGER --> DELIVERY[HindsightDeliveryService]
    DELIVERY --> HS[Private Hindsight API and worker]
    HS --> FACTS[(Facts, observations, indexes)]
    ACCESS --> HS
    ACCESS --> VALIDATE[Owner, generation, admission and evidence checks]
    VALIDATE --> CONTEXT[Bounded assistant context]
    HISTORY --> SUMMARY[Rolling summary]
    SUMMARY --> CONTEXT
    NOTES[(Daily notes and chunks)] --> TOOLS[Notes and document tools]
    DOCS[(Documents and chunks)] --> TOOLS
    TOOLS --> ASSISTANT[Assistant]
    CONTEXT --> ASSISTANT
```

The local ledger is not a duplicate extracted-fact cache:

| Table                   | Responsibility                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `hindsight_bank`        | Owner/namespace, active or erasing/erased state, leases, retry metadata, durable account-erasure intent                             |
| `hindsight_source`      | Logical source identity, kind, generation, original event time, user-message evidence, and legacy import mapping                    |
| `hindsight_delivery`    | Generation-specific document/operation IDs, reviewed replay input, request identity, checksum, and delivery/admission/erasure state |
| `hindsight_reference`   | Mapping from admitted remote fact IDs to a delivery; no duplicate fact text                                                         |
| `hindsight_suppression` | Forgotten message evidence excluded from re-extraction and retrieval                                                                |
| `hindsight_checkpoint`  | Independent namespace/policy/conversation progress and pending source completion                                                    |
| `hindsight_rollback`    | Audit rows from the removed legacy rollback tool; no longer written                                                                 |

Bank records deliberately survive local account deletion until remote erasure completes. Delivery replay content is cleared when its source is withdrawn. Original explicit input may be retained while active because retries and corrections need it.

## 3. Remember, correct, and forget

`DomainToolsProvider` routes `save_memory`, `update_memory`, `forget_memory`, and `search_memories` through `MemoryAccessService`.

A save validates owned user evidence from up to eight user messages in the same conversation through the requesting turn (8,000 characters total), so follow-up requests can refer to an earlier fact. Assistant text, credentials, later turns, and forgotten evidence are excluded; only quoted fact/permission messages and the requesting turn become source attribution. A save excludes credentials, reviews claims through `MemoryPolicyService`, and commits a source/delivery intent before publishing a BullMQ job. A successful tool call can mean **queued**, not remotely retained or admitted. Memory mutations continue through the model for a conversational reply; queue and storage progress stay internal. Ordinary personal statements rely on automatic extraction rather than an explicit save tool. Explicit remember/correct/forget requests are acknowledged naturally, without claiming pending retention or permanent erasure is complete.

Delivery follows these stages:

1. `pending`: source intent committed locally.
2. `submitted`: retention accepted with a durable operation ID.
3. `retained`: operation completion verified and extracted facts available.
4. `admitted`: fact evidence reviewed and owner, generation, suppression, opt-out, and lease checks revalidated.

Only admitted current generations are retrievable. Invalid extraction is withdrawn and erased; transient failures preserve durable work for retry. Fact review is bounded to 200 facts per source and four facts per model call, with lease renewal between batches and before final admission. Partial batches never become independently readable.

Chat receives opaque `hm:` fact/evidence references or `hs:` source-generation references. Observations resolve to supporting admitted facts; they are not separately editable facts. A targeted correction preserves unrelated admitted facts, withdraws the old generation, and sends a replacement. Stale references cannot silently overwrite a newer generation.

Forgetting immediately suppresses connected source-message evidence across generations and banks, and deletes associated rows in the retained legacy tables. It clears replay input and queues document erasure. The worker waits for known retention to finish, deletes the document, verifies absence of raw facts, and periodically rechecks erased generations for uncertain late writes. Unrelated sources remain available.

Account deletion transactionally retires banks and schedules durable erasure alongside local user deletion. Recovery continues after the user row disappears; stale jobs cannot recreate an erased bank. Completed bank erasure is rechecked hourly.

## 4. Automatic ingestion and recovery

The ingestion recovery sweep is the conversation trigger. Every minute it selects up to 20 conversations, oldest first, that have been idle for `BACKEND_MEMORY_DREAM_IDLE_MS` and have messages past their checkpoint, and runs ingestion for each. A segment whose new messages are all assistant turns (for example proactive messages) advances the checkpoint without review instead of being deferred. On startup the worker removes the retired `memory-dreams` queue and its daily scheduler from Redis.

`HindsightIngestionService` uses bounded immutable user-message sources, up to 24 messages per segment, with original message IDs and event times. Assistant messages and tool output never become user evidence. Credentials, suppressed messages, and evidence already owned by explicit sources are excluded before dispatch. The versioned admission policy selects exact user quotations.

**What is remembered.** The criteria live in `memory-retention-policy.ts` and are shared by the eligibility screen, evidence selection, the Hindsight retain mission, and fact review. Sydia remembers anything the user states that is likely to be useful in a future conversation, for weeks or longer, about themselves or about the people, pets, places, work, and things in their life, on any topic, including experiences and events with when they happened (so "what cafe did I visit last week?" can be answered). Sensitive topics (health, finances, beliefs) are treated like any other topic. Greetings, questions, turn-only requests, bare transaction or measurement records (these belong in notes; a record that also names a place, person, or purpose is remembered as an event), hypotheticals, unendorsed third-party claims, assistant/tool statements, general knowledge, and credentials are excluded. An explicit "ingat"/"remember" request admits a grounded fact even when its future use is uncertain; "catat"/"note this" is a notes request, so its content is judged on its own merits.

Default eligibility remains four user messages or 800 estimated tokens after 15 minutes of idle time. Short-segment recovery permits a single user message after the configured six-hour age, so one-message chats are reviewed too. A new checkpoint starts from the conversation's last legacy watermark so history the legacy writer already processed is not re-ingested. Checkpoints advance only after every required source is admitted or fully withdrawn/erased.

`User.automaticMemoryEnabled` is checked at selection, ingestion, dispatch, and admission of late automatic results. Opt-out leaves existing facts readable and permits explicit remember requests. Disabling deployment ingestion fences pending automatic work without removing explicit memory operations.

| Queue                    | Role                                                                   | Recovery schedule             |
| ------------------------ | ---------------------------------------------------------------------- | ----------------------------- |
| `memory-deliveries`      | Retention, operation polling, fact admission, and source/bank erasure  | Every 30 seconds              |
| `memory-ingestions`      | Pending checkpoints and idle conversations; the only ingestion trigger | Every minute                  |
| `conversation-summaries` | Rolling summary refresh                                                | Enqueued after assistant runs |
| `daily-note-indexes`     | Chunk/embed notes and recover pending indexing                         | Every six hours               |
| `documents`              | Uploaded-file processing and indexing                                  | Normal queue retry            |

Redis publishes work; PostgreSQL holds the durable memory authority. Lost publication is recovered from the ledger. Stable operation IDs, request fingerprints, source-generation checks, owner locks, and leased delivery claims fence retries and concurrent changes. Default queue options allow five attempts with exponential backoff and retain the last 1,000 completed/failed jobs.

## 5. Recall and context assembly

`MemoryAccessService.search` calls Hindsight with the current request timestamp and bounded query/token limits. It validates returned world facts against admitted remote references, matching source metadata, current owner/generation, and suppression. An observation is returned only when all required supporting facts resolve to valid evidence. Mutation lookup uses world facts rather than treating observations as editable records.

Automatic recall uses the current owned user message when enabled. The default request budget is 800 tokens; final insertion also obeys the application token estimator and remaining context budget.

`ContextBuilderService` builds context in this order:

1. System policy, optional channel prompt, persona, and user profile.
2. Recent conversation history, retaining newer messages within budget.
3. Volatile reference blocks: rolling summary, recalled memory, attachment manifest, and known-document manifest.
4. Current time/timezone context.
5. The current user request, retained exactly once as the last message.

The stable system/history prefix stays ahead of volatile recall. All reference blocks are untrusted data; they cannot grant permissions or override assistant policy. Current user statements take precedence over older memory. Context token accounting includes each block and the current request.

An automatic-recall outage lets chat continue with conversation context. Explicit memory search reports HTTP 503 when results cannot be verified. Unknown or forgotten facts must not be invented. The local recall deadline is explicitly five seconds, allowing the accepted provider latency; the new-install default remains 1.5 seconds.

## 6. Conversation history and summaries

Conversation history remains in the application database. `ConversationSummarizerService` compacts unsummarized history when its estimated tokens exceed `BACKEND_SUMMARY_TRIGGER_TOKENS` (4,500), retaining the newest `BACKEND_SUMMARY_RETAIN_MESSAGES` (eight).

The structured rolling summary carries objectives, established facts, decisions, constraints, actions, unresolved questions, and entities. `replaceSummary` updates the conversation and appends a `ConversationSummary` revision atomically, with a compare-and-swap on the previous summary boundary. Summaries provide continuity; they do not become independently admitted Hindsight facts.

## 7. Daily notes

Daily notes remain an owner-local journal, with one `DailyNote` per `[userId, date]`. Rich-text content is authoritative; derived plain text and `DailyNoteChunk` vectors support search. Dates use the owner's timezone.

Saving changed retrievable text queues indexing. Empty content clears the note. Text fingerprints coalesce work and skip unchanged chunks; failed embeddings leave `indexPending` set for recovery. Search fuses owner-scoped keyword and vector results through reciprocal rank fusion, supports date windows, and collapses hits to one per day. Embedding outages degrade search to keywords.

The REST API remains under `/daily-notes`. Assistant tools remain `write_daily_note`, `read_daily_note`, and `search_daily_notes`. Hindsight does not index this domain as part of the migration.

## 8. Document knowledge and shared embeddings

Uploaded files retain their independent parsing/chunking pipeline. `FileAsset` owns stored bytes; `Document` holds extracted text/transcripts/descriptions; `DocumentChunk` holds page-aware content and vectors. `MessageAttachment` ties files to conversation messages.

`DocumentService` handles text/JSON, PDF, image description, and audio transcription. Retries reuse persisted transcripts and unchanged chunks, embedding only missing vectors. Unsupported or empty files fail without repeated retry. Search fuses keyword/vector hits and limits each document to two chunks; attachment-scoped retrieval remains owned by the current message's documents.

The application's `EmbeddingsService` supplies notes and documents with 1,536-dimensional vectors and embedding model/version metadata. Hindsight configures its own embeddings and retrieval fusion. Following the owner's 1 October 2026 decision, local durable-memory recall uses Hindsight's RRF fusion with model reranking disabled (`HINDSIGHT_API_ENABLE_RERANKING=false`, `HINDSIGHT_API_RERANKER_PROVIDER=rrf`), eliminating reranking API charges. This remains a separate pipeline from the application's document RRF retrieval.

## 9. Export and restore

`GET /users/me/export` downloads valid JSON through `StreamableFile`. `MemoryArchiveService` includes current admitted world facts and active reviewed replay intents in `hindsightMemory`, with source identity, evidence IDs, and event time. Forgotten sources expose metadata with null input and no facts. Failed pagination, remote availability, evidence verification, or raced corrections/deletions cause export to fail rather than silently omit facts.

The legacy writer, `MemoryService`, the dreamer and its queue, the shadow mode, debug CRUD, the `memory-backfill` import, and the `memory-rollback` tool were removed on 13 November 2026. There is no path back to legacy memory. The legacy tables remain as data: sources imported by the earlier backfill stay valid only while their legacy row is unchanged, and forgetting still deletes connected legacy rows and writes deletion markers that suppress evidence. Dropping those tables needs a migration and removal of those reads in `prisma-hindsight.repository.ts` and `prisma-memory-coordination.ts`.

Back up both databases and the latest coordination/deletion boundary. An old matched snapshot pair cannot recover later forget intents. After restore, keep reads and ingestion paused until the latest intent boundary and pending erasure have been reconciled. See the [maintenance and recovery procedures](./hindsight_operations.md).

## 10. Configuration and migrations

API and worker share validation through `AppModule` and `validateHindsightEnvironment`.

| Setting                                                              | New-install default                   | Local cutover / purpose                                                           |
| -------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| `BACKEND_HINDSIGHT_URL` / `BACKEND_HINDSIGHT_API_KEY`                | Blank (memory off)                    | `http://127.0.0.1:8889`; containers use `http://hindsight:8888`                   |
| `BACKEND_HINDSIGHT_NAMESPACE`                                        | Blank (memory off)                    | `sydia-development`; unique per environment                                       |
| `BACKEND_HINDSIGHT_INGESTION_ENABLED`                                | `false`                               | `true`                                                                            |
| `BACKEND_MEMORY_AUTO_RECALL_ENABLED`                                 | `false`                               | `true`                                                                            |
| `BACKEND_HINDSIGHT_TIMEOUT_MS`                                       | `10000`                               | General gateway deadline                                                          |
| `BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS`                                | `1500`                                | `5000` locally                                                                    |
| `BACKEND_HINDSIGHT_RECALL_TOKENS`                                    | `800`                                 | Recall/context upper bound                                                        |
| `BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY`                            | Blank                                 | Keep engine default; optional semantic candidate cutoff, not universal confidence |
| `BACKEND_HINDSIGHT_CONCURRENCY`                                      | `4`                                   | Gateway and delivery concurrency                                                  |
| `BACKEND_HINDSIGHT_RETIRED_NAMESPACES`                               | Empty                                 | Erasure-only recovery for old namespaces                                          |
| `HINDSIGHT_API_HOST_PORT`                                            | `8888` in Compose                     | `8889` locally                                                                    |
| `BACKEND_MEMORY_DREAM_IDLE_MS`                                       | `900000`                              | Idle time before ingestion reviews a conversation                                 |
| `BACKEND_MEMORY_DREAM_MIN_USER_MESSAGES`                             | `4`                                   | Segment eligibility                                                               |
| `BACKEND_MEMORY_DREAM_MIN_TOKENS`                                    | `800`                                 | Alternative eligibility threshold                                                 |
| `BACKEND_MEMORY_DREAM_SHORT_SEGMENT_AGE_MS`                          | `21600000`                            | Short-segment recovery                                                            |
| `BACKEND_ASSISTANT_CONTEXT_TOKENS`                                   | `12000`                               | Total context budget                                                              |
| `BACKEND_SUMMARY_TRIGGER_TOKENS` / `BACKEND_SUMMARY_RETAIN_MESSAGES` | `4500` / `8`                          | Conversation compaction                                                           |
| `BACKEND_EMBEDDING_MODEL` / `BACKEND_EMBEDDING_CONCURRENCY`          | `openai/text-embedding-3-small` / `8` | Notes/documents indexing                                                          |

Hindsight is pinned to API `0.10.2-slim` and an image digest in `docker/hindsight.environment.yml`. Its database migrations are separate from Sydia's Prisma migrations. Set private API/database/provider credentials outside the repository. Raw Hindsight LLM request tracing, audit capture, and OTEL capture are disabled in Compose; the gateway rejects enabled or unverifiable LLM/audit capture. Policy telemetry records timing, tokens, model, and available cost without evidence/verdict bodies. Disabling capture does not purge old content logs.

Apply the five additive Prisma migrations before starting the new backend/worker: `20261001000000_hindsight_coordination`, `20261001010000_hindsight_mutation_replay`, `20261001020000_hindsight_import_guard`, `20261001030000_hindsight_checkpoints`, and `20261001040000_hindsight_rollback`. Existing notes/document vector indexes and the unused legacy memory indexes remain in place.

## 11. Validation

Performance and accuracy were accepted on 1 October 2026. The final ordinary backend run passed 495 tests across 57 suites; opt-in live contracts were skipped in that run and executed separately. Backend type checking, build, scoped lint, and whitespace checks passed.

The live assistant contract completed 18 turns through the actual context builder, full tool provider, orchestrator, and real models. It covered automatic recall off/on, English/Indonesian questions, ambiguous people, temporal facts, unknown facts, current-statement precedence, save, correction, and forgetting. No literal tool markup appeared. A vague language question with recall off remained imperfect; acceptance does not imply perfect answer accuracy.

The running local frontend/API/BullMQ check verified sign-in, chat save acknowledgement, worker admission, fresh automatic recall without a search-tool call, correction, old-generation physical erasure, forgetting/export suppression, source/derived erasure, valid JSON export, and durable account-bank deletion. The synthetic account was removed; both original accounts remained. At the final snapshot boundary there were zero pending deliveries and zero raw Hindsight LLM/audit rows.

Dedicated synthetic containers and test provider relays were removed/stopped after verification. Current services are `sydia-postgres-1`, `sydia-hindsight-1`, and `sydia-hindsight-postgres-1`. Generated evaluation/debug reports are disposable outputs and are not kept in `docs`; test harnesses remain under `apps/backend/test/hindsight` and the focused live specs. Recreate isolated services before running opt-in contracts; never target the application database.

## 12. Implementation index

| Area                                 | Source                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine selection and chat operations | `apps/backend/src/modules/memories/memory-engine.service.ts`, `memory-access.service.ts`                                                                                          |
| Admission, ingestion, delivery       | `apps/backend/src/modules/memories/memory-policy.service.ts`, `hindsight-ingestion.service.ts`, `hindsight-delivery.service.ts`                                                   |
| Export                               | `apps/backend/src/modules/memories/memory-archive.service.ts`                                                                                                                     |
| Typed gateway and settings           | `apps/backend/src/infra/hindsight/`                                                                                                                                               |
| Coordination persistence             | `apps/backend/src/database/entities/hindsight.entity.ts`, `interfaces/hindsight.repository.interface.ts`, `repositories/prisma-hindsight.repository.ts`; Prisma schema/migrations |
| Context and tool execution           | `apps/backend/src/modules/conversations/services/context-builder.service.ts`, `domain-tools.provider.ts`, `assistant-orchestrator.service.ts`                                     |
| Queues and worker                    | `apps/backend/src/infra/queue/queue.service.ts`, `apps/backend/src/worker.ts`                                                                                                     |
| Account lifecycle                    | `apps/backend/src/modules/users/services/user-privacy.service.ts`, `users.controller.ts`, `database/repositories/prisma-user-privacy.repository.ts`                               |
| Notes/documents and summaries        | `apps/backend/src/modules/daily-notes/`, `modules/documents/`, `modules/conversations/services/conversation-summarizer.service.ts`                                                |
| Deployment                           | `docker/hindsight.environment.yml`, development/production Compose files, `.env.example`                                                                                          |
