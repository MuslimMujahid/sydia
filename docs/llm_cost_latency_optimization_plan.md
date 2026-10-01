# Sydia — LLM Cost and Latency Optimization Plan

| Field  | Value                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Date   | 1 October 2026                                                                                                                   |
| Status | User accepted all implementations; local cutover and end-to-end verification recorded in runbook                                 |
| Scope  | Automatic memory eligibility, extracted-fact review, recall decisions, tool-group selection, and Hindsight GPT-OSS-20B migration |
| Goal   | Reduce cost per successful operation and chat response latency while preserving memory and tool correctness                      |

This plan introduces TypeSafe Jev for bounded decisions and evaluates GPT-OSS-20B for Hindsight extraction. Jev does not generate assistant replies, extract arbitrary quotations, or execute tools. GPT-OSS-20B migration is a separate experiment from the Jev changes.

**Acceptance update, 1 October 2026:** The user approved independent tool/recall inclusion at 0.6, GPT-OSS-20B extraction despite its slower median, and all remaining implementations, and authorized local end-to-end testing and cutover. This explicit acceptance supersedes the proposed rollout gates as a prerequisite for this deployment. It does not convert provisional labels or small synthetic trials into held-out quality or full-traffic economic evidence. See the runbook for the actual deployed settings and verification; the evaluation requirements below remain useful for ongoing assessment and other deployments.

Related documentation: [memory architecture](./MEMORY_SYSTEM.md), [Hindsight migration](./memory_systems_migration_hindsight.md), [operations runbook](./hindsight_operations.md), and [optimization implementation and trials](./llm_optimization_operations.md).

## 1. Current behavior and expected benefit

| Workstream                         | Current behavior                                                                                                             | Proposed change                                                                                                             | Benefit to measure                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Automatic memory eligibility       | After segment eligibility and deterministic exclusions, each new user-message source goes through generative evidence review | Jev identifies messages that confidently contain no eligible durable facts before evidence review                           | Fewer background policy calls and retain operations                   |
| Grounding, durability, sensitivity | `MemoryPolicyService` reviews extracted facts using structured generative output and validates exact supporting quotations   | Evaluate independent Jev decisions against the existing evidence contract; initially retain the existing admission reviewer | Lower fact-review cost and delivery latency if parity is demonstrated |
| Recall decision                    | Eligible Hindsight turns automatically search memory during context construction                                             | Skip automatic recall only when a contextual decision confidently establishes that memory is unnecessary                    | Less retrieval latency and fewer unnecessary context tokens           |
| Tool-group selection               | `ToolExecutorService.aiTools()` advertises all 37 registered tools                                                           | Advertise relevant groups plus their required dependencies                                                                  | Fewer tool-schema tokens and potentially faster assistant generation  |
| GPT-OSS-20B                        | Local Hindsight LLM is `deepseek/deepseek-v4.1-flash`; the repository example default remains Qwen                           | Benchmark `openai/gpt-oss-20b` for retain before changing consolidation                                                     | Lower extraction cost and faster background retention                 |

Hindsight extraction and Sydia's evidence-admission model are distinct stages. Changing Hindsight's model does not change Sydia's chat model or `MemoryPolicyService` model. The pinned Hindsight `0.10.2` runtime performs ordinary recall without a generative LLM call; its retrieval and reranker remain relevant costs. Sydia currently uses recall rather than reflect. An extractor migration therefore has no direct guaranteed improvement to chat response latency.

Document reranking, embeddings, assistant model replacement, legacy memory dreaming, and frontend changes are outside this implementation scope.

## 2. Shared decision infrastructure

### 2.1 Provider adapter and domain services

Add `apps/backend/src/infra/decision-gateway/` with a Nest module, injection token, typed request/result contracts, TypeSafe adapter, and barrel exports. Keep the existing [language-model gateway](../apps/backend/src/infra/model-gateway/model-gateway.types.ts) focused on generation. Put business decisions in `modules/memories` and `modules/conversations`, following their existing dependency patterns.

Use `@typesafe-ai/sdk` **0.6.0**, verified against the npm registry on this plan's date, and lock the resolved dependency in `bun.lock`. Use OpenRouter model **`typesafe/jev-1.13`** and require the resolved snapshot **`typesafe/jev-1.13-20260917`**. The optional direct TypeSafe route uses **`jev-1.13.0`**. A model-version change requires recalibration. OpenRouter serves Jev through the typed decision endpoint, not ordinary chat completions; the SDK uses `https://openrouter.ai/api/v1/systemone`. [OpenRouter Jev integration](https://openrouter.ai/blog/insights/what-is-jev/). The model API supports batched typed questions over shared state; enforce both documented request token limits rather than relying on a fact-count limit alone. [TypeSafe model reference](https://docs.typesafe.ai/models), [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript).

Use Noul for independent yes/no questions, or Choice when `unknown` is an explicit outcome. A Noul returns `P(yes)` without a separate confidence field. Interpret each task's probabilities using held-out labels and task-specific thresholds. Do not equate a high probability with proven grounding or sensitivity safety. [Noul reference](https://docs.typesafe.ai/primitives/noul), [confidence guidance](https://docs.typesafe.ai/confidence).

The adapter must:

- Validate question IDs, expected answer types, finite probabilities, bounds, and complete response coverage using strict types and runtime narrowing.
- Expose provider/model version, usage, elapsed time, and failure category separately from domain decisions.
- Accept cancellation and a single overall deadline. Avoid SDK retries multiplying existing request retries. Start interactive experiments with a **600 ms overall decision budget**, then tune from measured regional latency. Eligibility/fact-review failures use the original reviewer; enabled turn selection leaves recall and tools unselected when no valid scores are available.
- Bound concurrency across API and worker processes, respect rate limits, and avoid queued background classification starving interactive requests.
- Treat conversation text as reference data. Instructions embedded in user text cannot change policy, tool registration, or authorization.
- Send only the source/turn fields needed for that decision. Exclude credentials, raw secret values, authentication data, unrelated user history, and unnecessary identifiers.

Validate TypeSafe's data-handling terms for the intended deployment before enabling requests with real user content. Start offline experiments with synthetic fixtures. English is Jev's primary training language, so Indonesian and mixed-language parity is an explicit release gate. [Language and data-handling reference](https://docs.typesafe.ai/models).

### 2.2 Feature controls

The following environment settings are implemented in configuration validation and `.env.example`, with defaults off:

| Setting                               | Default / meaning                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `BACKEND_DECISION_API_KEY`            | Empty; OpenRouter reuses `BACKEND_MODEL_API_KEY`; direct TypeSafe requires a decision key   |
| `BACKEND_DECISION_MODEL`              | `typesafe/jev-1.13`                                                                         |
| `BACKEND_DECISION_TIMEOUT_MS`         | `600` for the interactive decision deadline                                                 |
| `BACKEND_DECISION_COHORT`             | Explicit internal user IDs eligible for enabled experiments; empty means no enabled rollout |
| `BACKEND_MEMORY_ELIGIBILITY_MODE`     | `off`, `shadow`, or `enabled`; default `off`                                                |
| `BACKEND_MEMORY_FACT_REVIEW_MODE`     | `off`, `shadow`, `reject-only`, or `enabled`; default `off`                                 |
| `BACKEND_MEMORY_RECALL_DECISION_MODE` | `off`, `shadow`, or `enabled`; default `off`                                                |
| `BACKEND_TOOL_GROUP_SELECTION_MODE`   | `off`, `shadow`, or `enabled`; default `off`                                                |

Use separate worker deadlines and concurrency limits for eligibility/fact review; select their initial values from the baseline and lease duration. Store calibrated threshold sets with task, model, language coverage, and policy version. Version them in code/configuration rather than applying one universal cutoff.

These controls are independent of `BACKEND_MEMORY_ENGINE`. Feature shadow mode records a candidate decision while the current path remains authoritative; it does not select Hindsight's separate shadow bank namespace. Eligibility/fact-review failures fall back to the current reviewer. Enabled recall/tool selection starts empty and includes only independently qualifying scores; missing credentials, malformed results, unavailable provider, empty input, or credential-bearing context leave the enabled selections empty. Off/shadow features and users outside the cohort retain incumbent behavior.

Preserve the current `MEMORY_POLICY_VERSION` and source identity when only changing the decision implementation. A deliberate change to admission semantics requires a separate versioned migration. Do not create duplicate automatic sources by bumping the policy version for a selector rollout.

## 3. Automatic memory eligibility

**Integration:** [HindsightIngestionService](../apps/backend/src/modules/memories/hindsight-ingestion.service.ts), immediately before `MemoryPolicyService.approveEvidence()` for a new automatic user-message source.

### Implementation steps

1. Retain existing engine/cohort, automatic-memory opt-out, segment readiness, suppression, explicit-source ownership, credential, length, and existing-source checks. They run before any paid classifier call. An already registered source continues through the existing delivery/recovery path.
2. Add `MemoryEligibilityService` with `eligible | ineligible | uncertain`. Ask whether this owned user message contains any durable first-person fact, preference, routine, or decision that could satisfy the existing admission policy. Mixed messages remain eligible if any claim could qualify.
3. Evaluate bounded messages independently. If batching a segment, explicitly identify the target message in every question and account for all question tokens. Do not pool statements across messages into newly inferred facts.
4. In shadow mode, call the existing evidence reviewer and compare its result with Jev and reviewed fixture labels. The current reviewer is a comparison signal, not ground truth.
5. In enabled mode, skip evidence review only for calibrated high-confidence `ineligible`. Both `eligible` and `uncertain` still run `approveEvidence()` to generate and validate exact quotations and sensitive permission quotes.
6. Preserve checkpoint semantics: skipped messages create no retained source, while existing and newly queued sources must finish admission or erasure before checkpoint completion. Failed classification falls back rather than silently advancing as a negative decision.
7. Record counts for messages considered, deterministic exclusions, Jev skips, uncertain/fallback results, evidence calls avoided, and eligible facts missed.

Do not apply this gate to explicit remember, correct, forget, import, or account-erasure operations. An explicit remember request can refer to earlier user messages and must retain the current evidence lookup behavior.

**Replay design:** A negative eligibility decision is not a forget/suppression marker. Initially avoid a separate persistent negative cache; checkpoint advancement already prevents routine reprocessing. Provide targeted dry-run replay from original owned messages after a classifier/version change, reapplying suppression and existing-source checks. Reuse current source keys to prevent duplicates. If later adding cached decisions, scope them by owner, message checksum, model/threshold/policy version and deletion state.

**Required cases:** greetings; questions; assistant echoes; temporary plans; hypotheticals; third-party claims; durable Indonesian preferences; a durable fact inside casual text; negation; quoted statements; credentials; sensitive details with and without a specific request to remember; opt-out and explicit remember after opt-out.

## 4. Grounding, durability, and sensitivity of extracted facts

**Integration:** [MemoryPolicyService](../apps/backend/src/modules/memories/memory-policy.service.ts) and [HindsightDeliveryService](../apps/backend/src/modules/memories/hindsight-delivery.service.ts), after extraction and before admission.

The current reviewer already enforces these concepts. This workstream optimizes its implementation without weakening the admission contract.

### 4.1 Separate questions and deterministic evidence

For each candidate fact, independently assess:

| Decision           | Required meaning                                                                                                                             | Uncertainty handling                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Grounded           | Every claim in the candidate is supported by the approved user evidence, with the correct subject and without contradiction or embellishment | Existing semantic reviewer                                            |
| Durable            | The claim is appropriate for long-term memory under the current policy                                                                       | Existing semantic reviewer                                            |
| Sensitive          | The claim falls into the existing policy's sensitive categories                                                                              | Treat uncertainty as potentially sensitive; existing reviewer         |
| Permission applies | An exact owned permission quote specifically permits remembering this sensitive claim                                                        | Existing reviewer unless a valid applicable permission is established |

Expose candidate IDs and approved evidence/permission IDs in bounded structured state. Questions must identify their target in their instructions; opaque question IDs alone carry no semantic meaning. Independently inspect every claim in compound facts. Preserve negation, subject, qualifiers, and surrounding context.

Jev returns decisions rather than generated evidence quotes. An enabled reviewer therefore needs an **evidence-bound adapter**: select supporting IDs from exact approved evidence spans, including multiple spans where necessary, and reconstruct quote strings from the immutable source snapshot. Validate membership, source ownership, exact text, current generation/checksum, and permission applicability in code. If reliable evidence selection cannot satisfy the existing contract, keep the current reviewer for that fact.

Do not fabricate spans by arbitrary substring search or sentence splitting that removes negation or permission context. Deterministic string checks establish quote identity; they do not independently establish semantic support. An allow decision requires both calibrated semantic checks and the existing deterministic contract. Credentials remain excluded even when the user requests storage through memory; secret storage uses its separate tools.

### 4.2 Staged replacement

1. **Shadow:** Keep the existing generative reviewer authoritative. Collect Jev's independent decisions and evidence selections against human-reviewed labels, including sources the current reviewer rejects.
2. **Reject-only:** After validating rejection accuracy, let Jev short-circuit clearly invalid candidates. Positive and uncertain candidates still use the current reviewer. Measure missed valid facts; excessive rejection is a correctness regression even though it avoids unsafe admission.
3. **Evidence-bound allow:** Enable only for classes/languages that meet the stricter safety gates and produce all required support/permission evidence. Keep uncertain and sensitive cases on the existing reviewer initially. Expanding to sensitive allow decisions is a separate gate, not an automatic consequence of good nonsensitive accuracy.
4. **Broader enablement:** Expand by measured class/language coverage. Retain the current reviewer as an operational fallback and run periodic reviewed sampling.

Keep the existing maximum of 200 facts per source and whole-source admission behavior. Batch by actual state/question token budget, starting with the current four-fact batches. Do not assume all 200 facts fit in one request. Renew the delivery lease before each batch and fallback call, honor cancellation, and revalidate owner/generation/suppression/opt-out before final atomic admission. No partial reviewed batch becomes readable.

Record decision implementation/version in content-free telemetry. When implementation mode changes, resume queued work against its immutable source snapshot and the active compatible policy; never bypass a check merely because a job began under an earlier mode.

**Required cases:** unsupported additions; wrong person; negated preference; temporary versus recurring behavior; mixed valid/invalid compound facts; factual-looking tool output; sensitive permission referring to a different fact; blanket permission; credentials; stale generations; forgetting or opt-out during review; lease loss and timeout during fallback.

## 5. Deciding whether a turn needs memory recall

**Integration:** [ContextBuilderService](../apps/backend/src/modules/conversations/services/context-builder.service.ts) and the `buildContext` node in [AssistantOrchestratorService](../apps/backend/src/modules/conversations/services/assistant-orchestrator.service.ts).

### Implementation steps

1. Build an immutable `TurnDecisionInput` containing the latest user input, bounded recent dialogue, rolling-summary excerpts needed for references, channel, locale/timezone, attachment metadata, and pending-action references. Exclude secret values and unrelated history.
2. Check existing engine, automatic-recall setting, nonempty query, and available context budget before classifying recall. A turn already excluded from automatic recall needs no paid recall decision.
3. Add `TurnDecisionService` with an independent recall score. Ask whether long-term user facts or prior personal context would materially help answer the turn. Account for references such as “as before,” “my usual,” and Indonesian equivalents as context, without deterministic overrides. Latest-message-only classification is insufficient for short follow-ups.
4. In shadow mode, retain ordinary recall and evaluate whether skipped candidates would have lost useful admitted evidence. Use reviewed answers and retrieval labels; a nonempty search result alone does not establish necessity.
5. In enabled mode, start with no recall and select it only when otherwise eligible and its score reaches `recallInclude` (default **0.6**). Uncertain, missing, or below-threshold scores leave recall off. Memory keywords, explicit requests, attachments, and failures do not force recall. Advertise `search_memories` only when the memory group independently qualifies; its execution follows the normal authorization/retrieval path.
6. Keep owner, generation, suppression, and admission filtering in `MemoryAccessService.search()`. Preserve recall token limits and existing context allocation for persona, pinned/legacy content, history, summaries, attachments, and documents.

Run the decision alongside unrelated context reads where possible. When tool-group selection is also enabled, reuse one decision request and immutable result for both tasks; do not classify again in `ToolExecutorService`. Include recall questions only when recall is otherwise eligible. A decision introduces a dependency before recall starts, so measure added latency on turns that still recall, not only savings on skipped turns.

Use a bounded shadow sample and managed cancellation/error handling. Shadow evaluation should not extend the interactive critical path or leave unhandled background promises. Do not send raw context to telemetry while comparing results.

**Required cases:** generic factual questions; self-contained task creation; personalization; prior preferences; “do that again”; corrections; questions about memory; follow-ups to attachment/document requests; Indonesian and mixed language; insufficient context; decision timeout; automatic recall disabled; exhausted context budget.

## 6. Tool-group selection

**Integration:** [DomainToolsProvider](../apps/backend/src/modules/conversations/services/domain-tools.provider.ts), [ToolExecutorService](../apps/backend/src/modules/conversations/services/tool-executor.service.ts), and `AssistantOrchestratorService`.

### 6.1 Group registry

Add stable, explicit metadata to the existing tool registry rather than duplicating tool definitions. Validate that every registered tool belongs to a known group and every dependency resolves.

| Group               | Existing tools                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tasks               | `create_task`, `update_task`, `list_tasks`                                                                                                                                 |
| Reminders           | `create_reminder`, `update_reminder`, `list_reminders`                                                                                                                     |
| Memory              | `save_memory`, `update_memory`, `forget_memory`, `search_memories`                                                                                                         |
| Documents/files     | `list_documents`, `read_document`, `save_attached_files`, `send_file`, `search_documents`                                                                                  |
| Daily notes         | `write_daily_note`, `read_daily_note`, `search_daily_notes`                                                                                                                |
| Contacts            | `save_contact`, `resolve_contact`, `list_contacts`, `list_contact_groups`, `create_contact_group`, `update_contact_group`, `delete_contact_group`, `assign_contact_groups` |
| Calendar            | `list_calendar_events`, `create_calendar_event`, `update_calendar_event`, `cancel_calendar_event`                                                                          |
| Secrets             | `store_secret`, `create_secret_reveal_link`                                                                                                                                |
| Categories          | `list_categories`, `create_category`, `update_category`, `delete_category`                                                                                                 |
| Shared time utility | `get_current_datetime`                                                                                                                                                     |

Select groups with independent questions so a turn can require several domains. Do not include an overall unknown gate. Start with no tools; scores below `toolInclude` (default **0.6**) stay excluded. One exclusive choice between groups would fail requests such as “find the document and send it to my contact.”

### 6.2 Selection and execution

1. Produce a selected group set from the shared `TurnDecisionInput`. Independently include each group scoring at least `toolInclude`. Memory keywords, attachments, and pending-workflow metadata inform the questions but never force a group. Multiple groups can qualify.
2. Expand group dependencies in code. Include list/read/resolve tools required before updates or sends; contact resolution where an action requires a person; category lookup for categorized tasks; time utility for relative dates. Do not infer that calendar invitees are always safely resolvable without contact tools.
3. Filter advertised schemas in `aiTools()` using an optional immutable selection. Keep the full registry for dispatch and existing wrapped execution behavior. Preserve owner checks, validations, retry-safe declarations, idempotency, document-search deduplication, terminal acknowledgements, and error contracts.
4. An uncertain, missing, or below-threshold group stays excluded without changing another group's selection. No qualifying groups means no domain tools; provider failure also leaves enabled selection empty. Off/shadow mode preserves the full incumbent tool set. Required dependencies are added only for qualifying groups.
5. Keep group ordering and tool ordering stable to limit prompt-cache disruption. Measure cache hits and actual cached token prices alongside schema-token reduction.
6. Do not restore the full tool set for uncertainty or restart a turn containing completed mutations merely to expand tools. Missing required groups count as selection omissions in assessment.

The assistant still chooses individual tools and arguments. Selection is a cost/latency optimization and grants no new authorization. Target bundles of roughly 5–12 tools where intent permits; this is an experiment target, not a hard cap on multi-domain requests.

**Required cases:** no-tool chat; each group; several domains; category prerequisites; updating an unknown task/reminder; calendar/contact resolution; attached-file persistence and send; explicit memory deletion; secrets without exposing values to the selector; ambiguous follow-ups; missing group; selection timeout; completed mutation followed by further work.

## 7. GPT-OSS-20B migration for Hindsight

### 7.1 Experiment boundary

Hindsight's quickstart recommends **Groq with `gpt-oss-20b`**. That recommendation does not establish that every OpenRouter route will match Groq's latency or extraction quality. Compare the existing DeepSeek route with OpenRouter GPT-OSS-20B using actual supported providers; direct Groq can be a later hosting experiment. [Hindsight quickstart](https://hindsight.vectorize.io/developer/api/quickstart).

Use `openai/gpt-oss-20b` on OpenRouter and start with `low` reasoning effort, which is supported by the model. Current Compose hardcodes global reasoning effort to `none`; changing only the model name is insufficient. The OpenRouter model page currently lists a 32,768-token completion cap, while the pinned Hindsight runtime defaults retain completion allowance to 64,000. Start the candidate at **32,000**, verify the chosen endpoint's cap and structured-output support, and inspect truncation/parse failure rates. [OpenAI model reference](https://developers.openai.com/api/docs/models/gpt-oss-20b), [OpenRouter model and provider reference](https://openrouter.ai/openai/gpt-oss-20b).

### 7.2 Configuration changes to implement

Extend [docker/hindsight.environment.yml](../docker/hindsight.environment.yml) and [.env.example](../.env.example) to forward the pinned runtime's retain-specific settings. The following is a **candidate experiment configuration**, not a request to apply it now:

```dotenv
# Keep the global/consolidation baseline on its current DeepSeek configuration.
HINDSIGHT_API_LLM_MODEL=deepseek/deepseek-v4.1-flash
HINDSIGHT_API_LLM_REASONING_EFFORT=none

# Isolate GPT-OSS-20B to extraction first.
HINDSIGHT_API_RETAIN_LLM_MODEL=openai/gpt-oss-20b
HINDSIGHT_API_RETAIN_LLM_REASONING_EFFORT=low
HINDSIGHT_API_RETAIN_MAX_COMPLETION_TOKENS=32000
```

The retain override inherits the existing OpenAI-compatible provider, OpenRouter base URL, and credential unless explicitly changed. Retain-specific model/reasoning/completion environment names were verified in the currently running `0.10.2` image; Compose must explicitly forward them for host `.env` values to reach the container. Parameterize the existing global reasoning setting while preserving `none` as the default baseline.

Also forward optional `HINDSIGHT_API_RETAIN_LLM_EXTRA_BODY` for validated OpenRouter routing controls and retain provider/base URL/key overrides for an isolated hosting comparison. Validate JSON and parameter support before accepting routing settings. Benchmark a fixed supported endpoint first, then a documented routing policy; record actual provider/failover and billable usage rather than using the cheapest advertised price as the experiment cost.

Keep the image digest, embeddings, reranker, bank settings, admission reviewer, chunk size, and concurrency constant during the model comparison. The pinned runtime's retain chunk size is **3,000 characters**, not tokens. Do not tune it or the current two concurrent LLM calls until model effects are isolated. Keep raw LLM traces, audit content logging, and Hindsight trace capture disabled as described in the runbook.

### 7.3 Migration procedure

1. Extend the existing [synthetic memory evaluation harness](../apps/backend/test/hindsight/memory-evaluation.live.spec.ts) to compare extractor model/provider/reasoning settings using separate disposable banks and operations. Keep Sydia admission review identical across arms.
2. Use identical original timestamps, source evidence, locale/timezone, policy, and queries. Compare proposed facts before admission and accepted facts afterward; otherwise a stricter reviewer can hide a bad extractor by rejecting its output.
3. Measure schema validity, retries, truncation, unsupported/wrong-subject facts, durable-fact coverage, sensitive-fact behavior, consolidation backlog, operation completion latency, and cost per successfully admitted source/fact. Repeated samples are needed for latency; a single fast run is insufficient.
4. Recreate the Hindsight service with the candidate settings only after isolated tests pass. Verify effective configuration without printing credentials; verify readiness, stable worker identity, queue recovery, and retained/admitted source progression.
5. Because retain settings are server-wide in this deployment, a model cohort requires a separately configured Hindsight instance/gateway or isolated test environment. Do not imply that the backend Jev cohort flag can choose Hindsight's extractor per user. For a single-instance cutover, use a monitored deployment window and explicit rollback criteria.
6. Apply the candidate only to new retain operations. Preserve existing banks, facts, references, source generations, and suppressed evidence; no bulk re-extraction or backfill is required.
7. Evaluate consolidation separately after retain passes. Change its explicit model/reasoning overrides only in another experiment with observation quality and backlog gates. Do not switch the global model first and inadvertently change all Hindsight operations.

**Rollback:** Restore prior retain settings, recreate the service, and verify pending operations recover using the stable worker ID. Already accepted candidate facts persist; configuration rollback does not rewrite them. Correct confirmed regressions through source-generation correction/withdrawal, preserving unrelated facts and suppression. Record in-flight operation boundaries because retries can cross a configuration change; label or exclude mixed-model operations from paired measurements.

## 8. Evaluation and observability

### 8.1 Fixtures and experiment matrix

Build reviewed, versioned fixtures under `apps/backend/test`, reusing `test/hindsight` for live retain/recall comparisons. Define expected eligibility, grounded/durable/sensitive verdicts, applicable evidence/permission IDs, recall necessity, expected tool groups/dependencies, and memory query results. Include Indonesian, English, mixed language, channels/attachments, difficult follow-ups, malicious instructions in reference text, and the cases listed above.

Separate threshold-development and held-out sets by conversation/source so paraphrases do not leak across splits. Human-reviewed labels establish semantic correctness; neither Jev nor the incumbent LLM judges its own success. Deterministic tests verify contracts, source identity, authorization, dependency coverage, leases, and failure behavior. Use reviewed labels for model decisions.

Run these configurations independently before combining them:

| Arm         | Changes from baseline                                                 |
| ----------- | --------------------------------------------------------------------- |
| Baseline    | Current deployed models and all new decision features off             |
| Eligibility | Only automatic memory eligibility                                     |
| Fact review | Shadow, then reject-only, then any approved evidence-bound allow path |
| Recall      | Only the automatic recall decision                                    |
| Tools       | Only tool-group selection                                             |
| Extractor   | Only Hindsight retain model/reasoning/completion settings             |
| Combined    | Features that independently passed, with shared turn decisions        |

Keep fresh disposable banks per extractor arm and prevent cross-arm consolidation/retrieval contamination. Repeat latency measurements with representative concurrency and separate cold/warm-cache results. Include queue wait and fallback latency, not only provider inference time.

### 8.2 Proposed release gates

The following numbers are initial acceptance targets, **not observed results or calibrated probability thresholds**. Calibrate thresholds on development data, then assess held-out performance with sample counts and uncertainty. A small synthetic suite is a regression check, not sufficient evidence for broad rollout.

| Area              | Proposed gate                                                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory safety     | No credential admission, unsupported admission, permission bypass, cross-owner access, stale-generation read, or suppression/opt-out regression in critical fixtures; any canary occurrence stops rollout |
| Eligibility       | At least 99% of labeled eligible messages proceed to evidence review; no regression in explicit memory operations                                                                                         |
| Fact review       | No false allow in critical negative fixtures; valid-fact coverage within 1 percentage point of baseline; stricter reviewed validation before allowing sensitive facts                                     |
| Recall            | At least 99% precision for the decision to skip: skipped turns truly need no memory; useful-answer coverage within 1 percentage point of baseline                                                         |
| Tool groups       | At least 99% of turns include every required group/dependency; zero lost prerequisites or duplicated mutations in critical fixtures                                                                       |
| GPT-OSS-20B       | Extraction/admitted-fact coverage within 1 percentage point of baseline, with no material increase in malformed/truncated output, retries, or safety failures                                             |
| Economics         | Aim for at least 20% lower cost per successful affected-stage operation, including decisions and fallback; report total cost per turn/source separately                                                   |
| Interactive speed | No more than 5% p95 regression on the full representative traffic mix; aim for at least 10% p95 improvement in targeted recall/tool turns                                                                 |

For the 99% semantic gates, require the lower bound of a documented 95% confidence interval to meet the target before broad enablement. Report class/language-specific failures rather than averaging them away. If evidence is insufficient, retain shadow/narrow-cohort operation and the existing path. A cheaper feature that does not meet correctness gates remains disabled.

### 8.3 Cost and tracing

Reuse [ObservabilityService](../apps/backend/src/infra/observability/observability.service.ts) and the installed `@langfuse/otel` **5.11.0** / `@langfuse/tracing` **5.11.0**. Keep these versions during the comparison to preserve the instrumentation baseline; any SDK upgrade is a separate change. Langfuse supports offline dataset experiments and comparisons, but this plan begins with local fixtures and does not create hosted datasets or evaluators. [Langfuse evaluation overview](https://langfuse.com/docs/evaluation/overview).

Record stage, feature mode, outcome, actual provider/model, prompt/policy/threshold version, latency, input/output/billable reasoning tokens where exposed, cache use, cost, selected group/tool counts, and fallback reason. Avoid raw user/fact/permission/secret text and unbounded identifiers in metric labels. Use approved opaque trace references where individual runs need investigation.

The current admin cost aggregation uses assistant-run cost and is not a complete measure of policy calls, Hindsight, embeddings, or background processing. Add content-free stage measurements and reconcile external Hindsight usage from available usage counters/provider billing without enabling raw prompt logs. Missing usage/cost is **unknown**, not zero.

Calculate net savings using actual successful operation cost:

```text
candidate stage cost = decision calls + retained baseline calls + fallbacks
                       + retries + resulting downstream operations

net saving = baseline stage cost - candidate stage cost
```

For tools, account for input tokens and prompt-cache behavior across every generation step. For memory, compare cost per accepted fact/source as well as absolute spend so dropping useful facts cannot appear to be an optimization. Separate temporary shadow duplication from projected steady-state cost.

Keep disposable measurements and exported reports outside `docs`, following the existing runbook. Commit fixtures, harnesses, and concise accepted results; do not commit real user content or live trace dumps.

## 9. Delivery sequence and concrete changes

Each phase should be a separately reviewable change. Phases 1 and 2 share no classifier dependency; the extractor experiment can proceed once baseline instrumentation and fixtures exist. Keep independent experiments isolated before combining them.

| Phase | Deliverable                                                           | Main files / checks                                                            | Completion condition                                                              |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 0     | Baseline, labeled fixtures, stage metrics, threshold protocol         | Existing observability service; `test/hindsight`; conversation/memory fixtures | Repeatable cost/latency baseline and reviewed labels                              |
| 1     | GPT-OSS-20B retain configuration and isolated benchmark               | `docker/hindsight.environment.yml`, `.env.example`, Hindsight harness/runbook  | Provider/schema/completion compatibility and extractor gates pass                 |
| 2     | Typed decision gateway, configuration, feature/cohort controls        | New `infra/decision-gateway`; backend module wiring; `.env.example`            | Adapter contract, timeout/cancellation, invalid response, and off-mode tests pass |
| 3     | Tool-group registry and shared turn decision, tools initially shadow  | Conversation provider/executor/orchestrator services and specs                 | Dependency coverage and net token/cost gates pass                                 |
| 4     | Automatic memory eligibility                                          | New memory eligibility service; ingestion service/specs                        | Missed-fact, checkpoint, replay, opt-out, and cost gates pass                     |
| 5     | Recall decision using the same turn snapshot                          | Context builder/orchestrator and specs                                         | Skip precision, context quality, and interactive latency gates pass               |
| 6     | Fact-review shadow and reject-only; evidence-bound allow if justified | Memory policy/delivery services and specs                                      | Evidence contract, leases, semantic coverage, and safety gates pass               |
| 7     | Combined canary and operational documentation                         | Evaluations and memory/operations docs                                         | Full traffic-mix gates and rollback rehearsal pass                                |

Phases are ordered by measurement and implementation dependencies, not by an assumption that every candidate will ship. Full Jev admission replacement and consolidation migration may remain disabled if they fail parity or economics.

### Verification required when implementing

- Backend lint, strict type checking, and relevant Jest suites for changed infrastructure, ingestion, policy, delivery, context builder, tool executor, and orchestrator.
- Provider contract tests with mocked missing/invalid answers, 429/5xx, cancellation, and deadline exhaustion; opt-in live synthetic tests for actual endpoint compatibility.
- Existing ownership, correction/forget, recovery, lease, idempotency, and terminal-tool-response regressions.
- Compose rendering with placeholder credentials and effective candidate configuration checks in an isolated Hindsight instance. Do not print real secrets.
- Paired held-out evaluations for each arm, followed by combined behavior and a rollback rehearsal.

## 10. Rollout, rollback, and completion

For each Jev feature: `off` → synthetic evaluation → bounded `shadow` → explicit internal cohort → wider cohort only after gates pass. Ship adapter and behavior changes with defaults off. A disabled feature must immediately use the original path; it must not require remote configuration availability to recover.

Pause expansion and disable the affected feature on admission safety failures, sustained provider errors, required-tool omissions, poor skip precision, latency regression, or negative net savings. Preserve already committed operations and existing ledger fencing. Disable fact-review replacement to restore the incumbent reviewer; disable recall selection to restore automatic recall; disable tool selection to advertise all tools; disable eligibility to restore evidence review for future sources. Replay eligible missed automatic messages separately if a classifier regression is confirmed.

GPT-OSS-20B rollback follows the retain-specific procedure in section 7. Record which queued/in-flight operations crossed each model change. No rollback revives forgotten data, removes ownership checks, or automatically rewrites accepted memories.

The implementation is complete when independently accepted features have measured results, tested fallbacks, operational controls, and updated current-behavior documentation. Record rejected candidates and their measured reason as well; the goal is a defensible cost and speed improvement, not enabling every proposed model path.

## Implementation checklist

- [x] Capture baseline and synthetic development measurements; preserve unknown billing and draft-label limitations.
- [x] Add content-free Jev cost/latency observations, isolated Hindsight counters and extraction/admission billing comparisons.
- [x] Compare GPT-OSS-20B routes; user accepts CoreWeave's lower extraction cost despite the slower median.
- [x] Add typed Jev adapter, OpenRouter key reuse, snapshot pinning, deadlines and independent feature/cohort controls.
- [x] Add independent tool-group inclusion at 0.6, dependencies and shared recall decisions, and activate the accepted all-user local cohort.
- [x] Implement and enable automatic eligibility with conservative negatives, checkpoint fences and targeted recovery.
- [x] Implement and enable grounding, durability, sensitivity and every-claim evidence checks with incumbent review for uncertainty/sensitivity.
- [x] Run authenticated application/worker/Hindsight end-to-end tests, rehearse extractor rollback and document current behavior.

The user accepted deployment without requiring the proposed held-out quality/economics gates to pass. Reviewed held-out calibration, a representative full-traffic p95 study and a complete cache-aware economics assessment remain follow-up evaluation work. They are not reported as achieved by this cutover. Live selected-evidence allow-path validation remains a narrower follow-up; the conservative enabled path can continue using incumbent review when those allow thresholds are not met.
