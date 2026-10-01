# Hindsight operations

Status: infrastructure, chat integration, direct ingestion, automatic recall, backfill, and verified rollback reconciliation are implemented behind rollout settings. Performance and accuracy were accepted by the project owner on 1 October 2026. Local application end-to-end validation and legacy-engine cutover are complete; remote production deployment has not been changed. Follow the [migration plan](./memory_systems_migration_hindsight.md) before switching the active engine.

## Local cutover — 1 October 2026

The [memory-system validation summary](./MEMORY_SYSTEM.md#11-validation) records the running frontend → authenticated API → real providers → BullMQ worker → persistent Hindsight path. The two original local accounts had zero active legacy facts, so no content backfill was required. Both API and worker use the following explicit settings from the private local `.env`:

```dotenv
BACKEND_MEMORY_ENGINE=hindsight
BACKEND_HINDSIGHT_NAMESPACE=sydia-development
BACKEND_HINDSIGHT_COHORT=
BACKEND_HINDSIGHT_URL=http://127.0.0.1:8889
HINDSIGHT_API_HOST_PORT=8889
BACKEND_HINDSIGHT_INGESTION_ENABLED=true
BACKEND_MEMORY_AUTO_RECALL_ENABLED=true
BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS=5000
```

The first fresh recall exceeded the 1,500ms default cutoff; direct recall completed in 2.625 seconds. With the explicit five-second local deadline, fresh chat used automatic reference context to recall the saved and corrected fact. Save/correction retain pending delivery receipts internally and continue with conversational replies; forgetting suppresses immediately and erases remotely, account export downloads valid JSON, and synthetic account deletion completes durable bank erasure. No test provider relays were used for this application check. The test-only relays are stopped and their containers removed; the persistent application services stay running.

The pre-migration and final paired snapshots, private environment copies, and `cutover-boundary.json` are in `/home/bravo15/private-backups/sydia/hindsight-cutover-20261001T010759Z`, with directory mode 700 and file mode 600. At the final boundary all synthetic banks/deliveries were erased, replay text was null, both original accounts remained, and there were no active legacy facts. The coordination checksum stayed unchanged across both database dumps, and both dump catalogs validated. Preserve the latest deletion boundary for future recovery; these snapshots do not cover later intents.

Keep legacy code/tables available during rollback support. Hindsight mode owns active inference; the old automatic writer skips these users and legacy debug REST is fenced. Use verified reconciliation before a reader rollback; changing the engine flag alone can lose Hindsight-only facts. Removing legacy storage is a later maintenance migration, not part of activating Hindsight. The remote production deployment has not been changed.

## Runtime and configuration

The opt-in `hindsight` Compose profile runs a private API with its internal worker and a separate PostgreSQL database/volume. The server is pinned to `ghcr.io/vectorize-io/hindsight-api:0.10.2-slim` and digest `sha256:3c7b54a7e7dc92c3ad6a6b874aa9b3e96603b2c6fc4b215d9890a93578d2de99`. Its REST contract is implemented directly by the typed backend gateway; there is no independently versioned client SDK.

Use separate credentials for the application database, Hindsight database, Hindsight API, and model providers. Configure `BACKEND_HINDSIGHT_API_KEY`, `HINDSIGHT_DB_PASSWORD`, and the extraction/embedding provider fields in `.env.example`. Provider model identifiers are configured explicitly; provider aliases still require evaluation when their underlying behavior changes. No provider or Hindsight credentials belong in `VITE_*` fields.

On 1 October 2026 the project owner selected **RRF alone** and explicitly waived further benchmarking. The local runtime and shared Compose defaults use `HINDSIGHT_API_ENABLE_RERANKING=false` and `HINDSIGHT_API_RERANKER_PROVIDER=rrf`. Recall combines the retrieval rankings without a model reranker or paid reranker fallback; embeddings and database retrieval still run. Existing observation consolidation retains its explicit interleave fusion. This configuration decision is not a claim of benchmarked relevance parity. The earlier [reranking investigation](./reranking_cost_investigation.md) is retained as historical evidence.

The OpenRouter reranker key/model fields remain optional rollback configuration and are unused in RRF mode. To restore model reranking deliberately, set `HINDSIGHT_API_ENABLE_RERANKING=true`, `HINDSIGHT_API_RERANKER_PROVIDER=openrouter`, and valid OpenRouter reranker credentials/model, then recreate the Hindsight service. Updating `.env` alone does not change a running container.

The built-in `ApiKeyTenantExtension` enforces the private API key. Sydia must additionally select each user's environment-specific bank server-side. A shared deployment key is not per-user authorization. Only the API is exposed, on host loopback port `${HINDSIGHT_API_HOST_PORT:-8888}`; the database is reachable within the Compose network.

The Compose profile pins `HINDSIGHT_API_LLM_TRACE_ENABLED=false`, `HINDSIGHT_API_AUDIT_LOG_ENABLED=false`, and `HINDSIGHT_API_OTEL_TRACES_ENABLED=false`. The backend capability check rejects enabled or unverifiable raw-content capture. The pinned release otherwise enables LLM request tracing by default, and its trace rows survived synthetic bank deletion. Keep these settings disabled for account/source erasure guarantees; Sydia's masked policy telemetry is separate. See the [configuration reference](https://hindsight.vectorize.io/developer/configuration).

For an already running Hindsight database, disabling capture does not purge existing `llm_requests` or `audit_log` content; the disabled trace sweeper also cannot be assumed to remove it later. Before admitting real user data, inspect and remove pre-existing content logs under the database owner's retention/deletion policy, then verify there are no new content rows during a synthetic retain/erase drill. A private debug page is not justification for retaining forgotten source content. Never claim API bank deletion alone proved log erasure.

For a backend running on the development host, use `BACKEND_HINDSIGHT_URL=http://127.0.0.1:8888`. Set `HINDSIGHT_API_HOST_PORT` and the backend URL to the same host port when running a separate local test service; the local application uses port 8889. The former test service used port 8888 and has been removed. For backend/worker containers in the production Compose network, set it to `http://hindsight:8888`. Use a unique `BACKEND_HINDSIGHT_NAMESPACE` for each environment. Do not point development at production banks.

From the repository root, with the local port 8889 configured (adjust the readiness URL for other ports):

```bash
docker compose --env-file .env -f docker/docker-compose.dev.yml --profile hindsight up -d hindsight-postgres hindsight
docker compose --env-file .env -f docker/docker-compose.dev.yml --profile hindsight ps hindsight-postgres hindsight
curl --fail http://127.0.0.1:8889/health/ready
```

Use the production Compose file for a container deployment. Hindsight runs its own schema migrations; Prisma migrations apply only to Sydia's database. Deploy all additive migrations with the backend's normal `db:migrate:deploy` command before running the new backend/worker build: `20261001000000_hindsight_coordination`, `20261001010000_hindsight_mutation_replay`, `20261001020000_hindsight_import_guard`, `20261001030000_hindsight_checkpoints`, and `20261001040000_hindsight_rollback`.

For a new deployment, keep `BACKEND_MEMORY_ENGINE=legacy`, `BACKEND_HINDSIGHT_INGESTION_ENABLED=false`, and `BACKEND_MEMORY_AUTO_RECALL_ENABLED=false` until service readiness, migrations, ownership/lifecycle checks, backfill, and the recovery boundary are verified. The local cutover explicitly enables Hindsight and both flags after the owner accepted the measured performance/accuracy. An empty cohort setting means all users receive the configured mode; use explicit internal user IDs for the initial cohort.

The embedded worker uses stable ID `sydia-hindsight`, four slots, and extraction concurrency two. The current service is a single instance. A scaled deployment needs distinct stable worker IDs and a reviewed connection/model concurrency budget; do not clone the same worker ID across replicas. Health readiness confirms service availability, not completion or consolidation of a retained source.

## Durable delivery and recovery

The `memory-deliveries` BullMQ worker runs recovery every 30 seconds, with configured concurrency and four source snapshots per leased flush. PostgreSQL is the delivery authority: losing a queue publication does not lose a saved source. Recovery selects pending work in active and shadow namespaces and claims a bank lease. Persisted UUID operation IDs are reused after lost acknowledgements. Automatic classification recovery runs on the separate `memory-ingestions` queue every minute, so it cannot occupy the delivery worker while reviewing conversations.

When moving to a fresh namespace after rollback, put the previous environment namespace in `BACKEND_HINDSIGHT_RETIRED_NAMESPACES` (comma-separated). Its shadow namespace is included automatically. Recovery selects only erasing/erased banks there; it cannot configure a retired bank or send new retention. Ownership-checked old references remain usable for forgetting retired sources. Keep the old API credentials/service available for erasure; this setting does not move banks between different Hindsight deployments.

`hindsight_source` records logical identity, current generation, event time, and message evidence. `hindsight_delivery` holds generation-specific document/operation IDs and original source input for replay. `hindsight_reference` holds remote IDs without duplicating extracted fact text. `hindsight_suppression` prevents forgotten source-message evidence from being re-admitted; the migration carries forward existing deletion markers.

Acceptance remains `submitted`; verified operation completion becomes `retained`; validated evidence and a final ownership/generation/opt-out/suppression check become `admitted`. Only admitted current generations are eligible for retrieval. Corrections withdraw older generations before sending a replacement. Forgetting suppresses results locally, clears replay content, and queues remote source erasure.

Erasure waits for known running retention to drain, deletes the document, and verifies that its raw facts are absent. Retired generations are periodically rechecked to catch uncertain late writes. Account deletion transactionally retires banks and queues erasure alongside local user deletion. Bank records deliberately have no cascading user foreign key. Completed bank erasure is rechecked hourly; background erasure must continue even after a reader rollback.

Inspect `hindsight_bank.state`, `attempts`, `lastErrorCode`, and `nextAttemptAt`, plus delivery states, for backlog diagnosis. Errors are coarse codes rather than source/provider bodies. A lost/expired lease prevents an old worker from changing delivery state. After a transient outage, leave the ledger intact and restart the worker; recovery polls the same operation instead of inventing a new identity. Contract/authentication errors require fixing configuration or the integration before retry can succeed.

Source generations and suppression must never be manually reset to make a queue look healthy. Do not delete the source ledger while remote erasure is pending. The chat adapter retains queued status in tool receipts while the assistant replies conversationally without storage-progress messages; an accepted request alone does not prove a saved/corrected/forgotten fact is complete remotely.

The policy reviewer uses the application's configured model gateway and provider-enforced JSON shapes. It selects exact eligible user quotations before extraction and verifies the extracted world facts afterward. Credentials are excluded before any provider call. Sensitive evidence requires a specific user request to remember it. The retained source contains evidence, requested facts, preserved admitted facts, and necessary permission quotations; timezone/category/source identifiers remain diagnostics in the local replay envelope. A malformed or incomplete verdict never admits facts. Provider failures leave durable work for retry, while a rejected extraction is withdrawn and erased.

Post-extraction review is bounded to 200 facts per source and four facts per call, with a 30-second deadline and an 8,192-token output ceiling per fact-review call. The worker renews its bank lease before each batch and again before admitting the complete source; a failed batch or lost lease cannot partially admit a source. Worst-case sources can require 50 calls, so include reviewer time/cost in deployment capacity and freshness measurements.

When Langfuse credentials are configured, policy generations use `memory-policy.evidence.sydia-admission-v1` and `memory-policy.facts.sydia-admission-v1`. Memory evidence and model verdicts are excluded from trace input/output; model, owner, attempts, duration, input/output token counts, and provider-reported total cost remain available. Failed requests carry only coarse error type/status/retryability. Synthetic traces were sent and fetched to verify these fields and privacy behavior. Set `LANGFUSE_TRACING_ENVIRONMENT=development` for verification runs. Full evidence inspection belongs in an authorized source lookup or synthetic test, not automatic tracing.

Forgetting follows connected message evidence across generations, active/shadow banks, and legacy copies. The transaction suppresses that evidence, clears remote replay content, physically removes the affected legacy memory rows, and queues remote document erasure. Unrelated facts remain. These local guarantees are needed for account export and eventual reader rollback as well as chat.

## Backfill and ingestion

Run the built backfill entrypoint from `apps/backend`, using the normal backend environment and worker deployment configuration:

```bash
node dist/src/scripts/memory-backfill.js --user-id INTERNAL_USER_ID --limit 50
node dist/src/scripts/memory-backfill.js --user-id INTERNAL_USER_ID --limit 50 --execute
node dist/src/scripts/memory-backfill.js --user-id INTERNAL_USER_ID --limit 50 --after-id LAST_LEGACY_ID --execute
```

Dry run is the default and performs structural eligibility checks without model calls or writes. `--execute` reviews saved facts and writes durable import intents; it does not wait for remote admission. JSON output contains source identities, generations, outcomes, outcome counts, `interrupted`, and `nextCursor`, never fact text or credentials. Already matching sources are skipped before repeated review. Monitor delivery/admission separately, because a `written` outcome is not a confirmed memory.

An interrupted batch exits with code 2, preserves completed outcomes, and places `nextCursor` before the failed row. Provider/database exceptions report `deferred`; stale revisions or unavailable banks also stop cursor advancement. Retry with `--after-id` set to that cursor; when it is null, omit `--after-id`. A lost enqueue acknowledgement is safe to retry because the committed source revision is detected before another model call. For a successful batch (`interrupted=false`), a null cursor means the scan is finished; otherwise continue from the returned cursor. Argument/startup failures exit with code 1.

Backfill imports saved active facts rather than mining conversations, notes, or files. It honors suppression and checks the live legacy row revision at enqueue, dispatch, admission, and retrieval. Corrections switch the source to explicit ownership, preventing a later backfill from overwriting it. The source retains its logical `legacy:` identity so forgetting can also erase the old local copy, including message-free debug imports.

Direct ingestion uses bounded immutable user-message documents, independent active/shadow checkpoints, the existing debounce and eligibility thresholds, and a versioned admission policy. Assistant content never becomes evidence. A checkpoint advances after every required source is admitted or fully withdrawn/erased, not after queue acceptance. In Hindsight mode the old dreaming writer skips the cohort. In shadow mode the old writer remains authoritative and Hindsight uses a separate bank/checkpoint. Disabling ingestion fences pending automatic work; existing admitted facts and explicit remember requests remain available.

## Account portability and rollback

Account export includes `hindsightMemory`: current admitted world facts with source identity, message evidence and event time, plus active review-approved replay intents. Forgotten sources expose metadata without text. Remote pagination, metadata, admitted references, owner, generation, and suppression are verified before facts are returned. Provider failure or a racing correction/deletion fails the export rather than returning a silently partial memory archive. This portable fact archive does not replace a full database backup of observations, indexes, and operation history.

A reader flag change alone is not a safe rollback: it cannot recover Hindsight-only saves/corrections. The built reconciliation entrypoint exports the current admitted world facts, generates legacy embeddings, and atomically writes the recovered corpus while retiring the bank. It preserves unrelated legacy facts, replaces original imported copies with their current remote facts, and keeps source lineage for later forgetting. This is an operator maintenance action per owner; it is not an automatic outage fallback.

Use the following sequence for a cohort rollback:

1. Pause chat/memory mutations and both ingestion writers for the affected owners. Set `BACKEND_HINDSIGHT_INGESTION_ENABLED=false` while keeping the owners in Hindsight mode for reconciliation. Wait for in-flight chat tools and classification jobs to stop. A write racing reconciliation causes verification to fail; it must not be ignored.
2. Drain durable delivery. Every current generation must be admitted or erased; older generations must be erased. Keep the delivery worker running until that is true, then pause its claims briefly for the command. A live bank lease prevents reconciliation. Save the paired databases at this maintenance boundary.
3. Run the default dry run, then execute with the same environment and owner. Repeat for every owner being rolled back. Resolve any unavailable/stale result before switching that owner's reads.
4. After each owner reports `written` or an already committed `unchanged`, switch that owner's engine to legacy and resume chat/the legacy writer. Restart delivery recovery with the Hindsight connection and namespace configuration intact so remote erasure continues.

From `apps/backend`, after building:

```bash
node dist/src/scripts/memory-rollback.js --user-id INTERNAL_USER_ID
node dist/src/scripts/memory-rollback.js --user-id INTERNAL_USER_ID --execute
```

The dry run calls verified remote export but performs no embedding calls or database writes. JSON output contains only status, dry-run flag, bank/namespace, source/fact counts, and a boundary checksum. `--execute` requires complete finite 1,536-dimensional embeddings; failed export, missing facts, incomplete embeddings, changed source generations/references, changed mapped legacy revisions, new conversation messages, owner deletion, or a competing lease aborts without partial reconciliation. Failures exit with code 1 and a coarse operator message.

The atomic transaction uses deterministic recovered IDs, records a content-free audit in `hindsight_rollback`, advances each legacy conversation watermark to the paused message boundary, withdraws source replay text, and queues remote erasure. Suppression and existing deletion markers remain authoritative. Recovered facts and later legacy corrections retain lineage to the retired source; forgetting through either an old Hindsight reference or a recovered legacy ID removes connected copies. Repeating an already committed command returns historical counts/checksum without exporting or embedding again, so it cannot overwrite later corrections or resurrect forgotten facts. Retain the audit and lineage during the rollback window.

The live synthetic drill verifies save → correction → export → reconciliation → legacy retrieval → later legacy correction → forgetting, including remote bank deletion and replay. The compiled CLI separately passed default dry-run, execute, and idempotent replay against isolated PostgreSQL/Redis, using an empty synthetic bank to verify bootstrap and operator output. The ledger contracts verify vector indexing, unrelated-fact preservation, message-free imports, watermark fencing, and rejection of raced state. These checks do not establish production capacity or retrieval-quality equivalence: the live legacy fallback missed the vague query `preferred language` while concrete English-preference/city queries succeeded. Keep that failure in the comparative evaluation.

A reconciled bank cannot be reused for retention. To return an owner to Hindsight later, choose a fresh environment namespace, configure the previous namespace for erasure-only recovery, and backfill the current legacy corpus through the verified admission path. Do not reset suppression, old generations, or rollback audits.

## Backup and restore

Back up the Hindsight database and Sydia's coordination database together at a recorded recovery boundary, with the image digest and provider configuration. The Hindsight database includes raw sources, extracted facts, observations, indexes, and operation state. The Sydia database includes generations and forgetting/erasure intent. Restoring only Hindsight can reintroduce facts suppressed after the snapshot; restore/replay the coordination state before allowing reads or ingestion.

Store backups outside the repository with restrictive permissions. For example:

```bash
umask 077
mkdir -p ../private-backups/hindsight
docker compose --env-file .env -f docker/docker-compose.prod.yml --profile hindsight exec -T hindsight-postgres pg_dump -U hindsight -d hindsight -Fc > ../private-backups/hindsight/hindsight.dump
```

For a restore drill, create a fresh logical database on an isolated PostgreSQL instance using the same supported vector extension, then restore with `pg_restore --no-owner --no-privileges`. Do not restore over a running API database. Start a separate API against the restored database with the pinned image and private test credentials. Check readiness, schema version, synthetic bank/document/fact content, evidence recall, and source/bank erasure before switching traffic. Resume ledger reconciliation and suppression before ingesting new segments.

The local recovery drill passed restoration of non-empty synthetic Hindsight and coordination snapshots through a separate API. Exact fact identities, admitted evidence recall, ownership, checkpoints, newer post-snapshot suppression, rejection of re-extraction, physical erasure, unrelated-source preservation, and deleted-owner bank erasure all passed. This verifies synthetic logical restore and reconciliation. The actual deployment still needs a tested recovery boundary and retention/replay procedure for deletion intents created after the snapshot.

The opt-in [paired recovery contract](../apps/backend/test/hindsight/memory-restore.live.spec.ts) requires recreating the dedicated local synthetic containers: `sydia-hindsight-contract-hindsight-1`, `sydia-hindsight-contract-hindsight-postgres-1`, and `sydia-hindsight-ledger-contract`. It requires the API at `http://127.0.0.1:8888` and ledger database `sydia_hindsight_ledger_contract` on loopback. It creates disposable logical databases and a separate loopback API container using the pinned image; it never restores over either source database. Dumps and copied credentials use private temporary files and are removed with the clones after the run.

With the same contract credentials and real policy reviewer configured, run from `apps/backend`:

```bash
HINDSIGHT_RESTORE_CONTRACT_ENABLED=true \
HINDSIGHT_RESTORE_REPORT_PATH=/absolute/path/to/restore-report.json \
bun run test --runInBand test/hindsight/memory-restore.live.spec.ts
```

The contract exercises a paired snapshot first, then combines its older Hindsight snapshot with a newer coordination dump containing a post-snapshot forget intent. Required checks include exact restored fact identities, admitted evidence recall, restored checkpoint state, cross-owner denial, immediate suppression, rejection of re-extracting forgotten evidence, eventual physical erasure, preservation of an unrelated source, and bank erasure after account deletion. A report contains identifiers, timestamps, capability/version information, and check descriptions only.

This drill supplies the newer coordination dump explicitly. Production recovery needs a retained coordination backup/WAL or other reviewed durable replay mechanism that reaches the latest known deletion boundary. Keep application reads and ingestion paused until that boundary is restored and pending erasure is reconciled. A matched pair of old snapshots cannot reconstruct deletion intents created afterward. If the latest deletion boundary is unavailable, do not reopen reads from an older snapshot. Define and verify that recovery procedure for the actual deployment before cutover.

## Contract tests

Ordinary backend tests skip network/database contracts. Synthetic contracts require explicitly exported `HINDSIGHT_CONTRACT_URL` and `HINDSIGHT_CONTRACT_KEY`; ledger/delivery contracts also require `HINDSIGHT_LEDGER_CONTRACT_URL` pointing to a dedicated database whose name starts with `sydia_hindsight_ledger_contract`. Apply all backend migrations to that dedicated database before running. Never use an application database or live user data.

From `apps/backend`, with those test-only variables supplied securely:

```bash
bun run test --runInBand src/infra/hindsight/hindsight.live.spec.ts
bun run test --runInBand --testTimeout=30000 src/database/repositories/prisma-hindsight.live.spec.ts src/modules/memories/hindsight-delivery.live.spec.ts
bun run test --runInBand src/modules/memories/memory-policy.live.spec.ts src/modules/memories/memory-access.live.spec.ts src/modules/memories/hindsight-ingestion.live.spec.ts
```

The model-policy and integrated chat/ingestion contracts also require `HINDSIGHT_POLICY_CONTRACT_KEY` for synthetic review calls. The chat rollback contract additionally uses that key for real legacy embeddings. `HINDSIGHT_POLICY_CONTRACT_BASE_URL` and `HINDSIGHT_EMBEDDING_CONTRACT_BASE_URL` optionally override test model/embedding endpoints; they are not production settings. Use the same reviewed extraction model/provider as the pinned service when comparing admission behavior.

The gateway contract covers synthetic retain idempotency, multilingual recall, real observation evidence, correction, document/derived erasure, and bank isolation. The ledger contract exercises concurrent replay/corrections, ownership, suppression, opt-out, lease fencing, independent checkpoints, backfill guards, legacy-copy erasure, and account deletion. The combined delivery contract proves replay, replacement-generation erasure, forgetting, and remote cleanup after the user row is deleted. Integrated contracts use the real policy reviewer and verify targeted compound correction, source export, suppression, user-only ingestion, late opt-out, and account erasure. Tests clean up only the synthetic identities they create.

The opt-in [comparison harness](../apps/backend/test/hindsight/memory-evaluation.live.spec.ts) separately measures saved-fact retrieval and controlled answers. It requires `HINDSIGHT_EVALUATION_ENABLED=true` and can write an explicit absolute `HINDSIGHT_EVALUATION_REPORT_PATH`; ordinary contracts do not enable it automatically. Its historical draft targets are not approved release gates; the owner accepted the measured quality/performance. Hard lifecycle checks and deployment validation remain separate.

`BACKEND_HINDSIGHT_RECALL_MIN_SIMILARITY` optionally overrides the semantic candidate cutoff with a validated number from 0 to 1. Leave it blank to preserve the engine default. This affects the semantic retrieval arm only: keyword, graph, and temporal candidates remain eligible. It is not an answer-confidence or universal relevance filter. See [Hindsight recall score floors](https://hindsight.vectorize.io/developer/api/recall#min_scores). The cutover leaves this override blank. Further candidate calibration is deferred following the owner’s performance/accuracy acceptance.

For a synthetic same-bank comparison, set `HINDSIGHT_EVALUATION_MIN_SIMILARITY=0.2` and `HINDSIGHT_EVALUATION_PROBES=true` alongside the evaluation variables. The runner compares legacy and the candidate adapter, then separately measures the default Hindsight adapter on the same admitted sources. Sample order reverses which Hindsight adapter runs first. Twelve added draft probes broaden Indonesian and negative questions; their expectations still require review. Operational-deadline measurements now cover every selected query before correction/forgetting, so changing facts cannot invalidate their original expectations. Generated reports are disposable; use an explicit report path outside `docs`.
