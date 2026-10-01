# LLM optimization implementation and trials

Updated 1 October 2026. See the [implementation plan](./llm_cost_latency_optimization_plan.md) for safety and release criteria.

## Current state

On 1 October 2026 the user accepted tool/recall inclusion at **0.6**, GPT-OSS-20B's lower extraction cost despite its slower median, and the remaining implementations, and authorized end-to-end testing and legacy cutover. The local API and worker now use all four Jev modes as `enabled`, an explicit `BACKEND_DECISION_COHORT=*`, and acceptance version `user-accepted-20261001-v1`. Empty cohorts and new-installation defaults still disable the decision features.

Hindsight extraction uses **`openai/gpt-oss-20b` on CoreWeave**, low reasoning and a 32,000 completion limit, with provider fallback disabled. DeepSeek remains the global consolidation/reflect model; assistant generation, embeddings, reranking, source generations and the stable Hindsight worker ID are preserved. The interactive decision budget is **1,500 ms** because the earlier 600 ms trials produced empty tool selections on timeouts. Background decisions retain their 5,000 ms budget.

This is an explicit acceptance of the observed tradeoffs, not a claim that held-out quality, the full traffic-mix economics target or p95 latency gates passed. CoreWeave reduced extraction cost by 42.1% and combined extraction/review cost by 27.2% in the small paired trial; extraction median increased about 20%. The 0.6 tool-schema experiment showed mixed net costs once Jev billing and cache effects were included. Historical trial sections below describe the settings at the time of each trial; their references to disabled flags and pending acceptance are superseded by this cutover record. Remote production was not changed.

## Jev through OpenRouter

The default route reuses `BACKEND_MODEL_API_KEY`. A dedicated `BACKEND_DECISION_API_KEY` is optional. Do not put keys in commands, reports, or chat.

| Setting                                  | Default / meaning                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `BACKEND_DECISION_PROVIDER`              | `openrouter`; optional `typesafe` requires its own decision key                             |
| `BACKEND_DECISION_MODEL`                 | `typesafe/jev-1.13`; direct provider uses `jev-1.13.0`                                      |
| Resolved OpenRouter version              | Require `typesafe/jev-1.13-20260917`; a changed or unversioned response is rejected         |
| `BACKEND_DECISION_TIMEOUT_MS`            | 600 ms for interactive decisions, including capacity reservation                            |
| `BACKEND_DECISION_BACKGROUND_TIMEOUT_MS` | 5,000 ms                                                                                    |
| Interactive/background concurrency       | 6 / 2, enforced across API and worker through Redis                                         |
| Shared rate reservation                  | At most 38 requests and 100,000 conservatively estimated tokens per rolling second          |
| `BACKEND_DECISION_SHADOW_SAMPLE_PERCENT` | 5%; deterministic sampling, with bounded pending turn observations                          |
| `BACKEND_DECISION_COHORT`                | Comma-separated user IDs; empty disables enabled decisions; explicit `*` includes all users |
| `BACKEND_DECISION_CALIBRATION_VERSION`   | Evaluation/explicit acceptance version required for `enabled` or `reject-only`              |
| `BACKEND_DECISION_THRESHOLDS_JSON`       | `{}` uses provisional conservative defaults; overrides require calibration                  |

The four mode settings are `BACKEND_MEMORY_ELIGIBILITY_MODE`, `BACKEND_MEMORY_FACT_REVIEW_MODE`, `BACKEND_MEMORY_RECALL_DECISION_MODE`, and `BACKEND_TOOL_GROUP_SELECTION_MODE`. Each accepts `off`, `shadow`, or `enabled`; fact review also accepts `reject-only`.

Enabled modes are restricted to the explicit cohort. Shadow modes sample across otherwise eligible requests and retain incumbent behavior. Do not enable real-content shadow traffic until the plan's provider data-handling and evaluation requirements are satisfied. A nonempty calibration version is a configuration guard, not proof that an evaluation passed.

Jev uses the typed `/api/v1/systemone` endpoint. Ordinary OpenRouter chat completions are not interchangeable with it. SDK retries are disabled. Eligibility/fact-review failures restore incumbent review. Enabled turn selection starts with no recall or domain tools; timeout, cancellation, malformed answers, unavailable capacity, provider errors, empty input, and credential-bearing context leave the enabled selections empty. Secret-management dialogue remains excluded from classification. Off/shadow modes preserve incumbent behavior. All modes off creates no extra decision Redis connection and makes no decision calls.

Eligibility can only skip automatic evidence review. Explicit memory operations retain their existing policy. Fact review initially belongs in shadow and reject-only; an evidence-bound allow path exists only for nonsensitive facts, with full approved spans and a second semantic coverage check. Sensitive facts always return to the incumbent permission reviewer. Delivery leases and whole-source admission checks remain authoritative.

Recall and group selection share one immutable turn decision. Recall independently requires `recallInclude`, and each group independently requires `toolInclude`; both defaults are **0.6**, with equality qualifying. Below-threshold or missing scores remain excluded. There is no unknown gate, uncertainty-wide fallback, or forced memory/attachment selection. Multiple qualifying groups and their required dependencies are expanded in stable registry order. No qualifying scores means no recall and no domain tools. Off/shadow features retain incumbent behavior. Selection filters schemas while keeping execution wrappers, ownership, idempotency, and terminal acknowledgements. The implementation does not restart a mutated turn to broaden its tools.

Threshold JSON now accepts `recallInclude` and `toolInclude`; obsolete `recallSkip` and `toolExclude` keys are rejected. Replace those keys in any custom configuration before restarting. No local deployment configuration was changed by this revision.

## Synthetic measurements so far

These are draft development fixtures, with no human-reviewed held-out labels. Latencies include asynchronous retain polling and are not p95 estimates.

### Independent selection reassessment, 0.6 inclusion

The user subsequently lowered both inclusion thresholds to **0.6**. The independent rule, questions, dependency closure and production deadline remained the same. A fresh 1,500 ms diagnostic completed all 12 calls, covered all draft-required tools on **12/12** turns (9/9 requiring tools), and matched draft recall on 10/12. It averaged **11.5 domain tools** versus 37 in the full registry, about 69% fewer by count. Actual decision charge was $0.000647976, with 329 ms median and 1,026 ms maximum latency.

The attachment-save group qualified in this diagnostic. Lowering the boundary also admitted extra groups on task, calendar and unsupported-capability requests; required-tool coverage does not measure exclusion accuracy. Recall still differed on explicit deletion and task/contact lookup. The initial 600 ms run timed out on all 12 calls and returned empty selections, with complete billing unknown. This failed live run remains part of the evidence; successful longer-budget diagnostics do not establish production deadline reliability or total cost savings.

The 600 ms repeat completed 8 calls and timed out on 4. It averaged 7.9 tools, covered draft-required tools on 9/12 turns, and matched draft recall on 8/12, with 483 ms median decision latency. Missing tools occurred on timed-out task, reminder and personal-preference requests. Completed attempts reported $0.0004326 in charges; the complete cost remains unknown. The variation in timeout frequency is not attributable to the threshold alone: questions and model are unchanged. The final 0.6 boundary/default configuration passed 36 focused tests; the independent selection integration had already passed the five affected suites. Feature flags and the production deadline were not changed.

A threshold-only replay of the previous diagnostic's identical scores independently showed the expected boundary effect: 7.3 tools/turn and 11/12 draft coverage at 0.75, versus 11.4 tools/turn and 12/12 coverage at 0.6. That replay made no new provider calls; the fresh diagnostic above measures new scores and their variation.

### Billed first assistant step with real schemas

A subsequent comparison measured actual assistant-generation charges rather than inferring savings from tool counts. The two arms used the configured `deepseek/deepseek-v4.1-flash` assistant model and identical synthetic context, with all 37 real schemas versus independent selected schemas at 0.6. Each of 12 cases ran twice; arm order alternated. The selector used a 1,500 ms diagnostic budget, tools only, and no automatic recall. It made one decision per candidate turn, and its actual charge was included in candidate cost.

All 24 decisions and 48 assistant calls completed, with known billed charges and draft required-tool coverage in both arms. Real schema factories and `completeTurn` augmentation were reused, but execution functions were omitted; no repositories, schedulers, files, messages or user data were modified. This is a **first-step study**, with a concise diagnostic system prompt, not a completed-turn or answer-quality evaluation. OpenRouter hosting routes were not pinned; the recorded assistant provider is the OpenRouter adapter and configured model, rather than a verified hosting-provider match.

| Arm, 24 first steps | Assistant charge | Jev charge   | Combined charge | Assistant input tokens | Mean tools | Median serial stage time |
| ------------------- | ---------------- | ------------ | --------------- | ---------------------- | ---------- | ------------------------ |
| Full schemas        | $0.008795472     | $0           | $0.008795472    | 303,736                | 37         | 936 ms                   |
| Selected schemas    | $0.008115360     | $0.001220352 | $0.009335712    | 85,508                 | 11.2       | 1,071 ms                 |

Selection reduced assistant input tokens by **71.8%**, but assistant charges by only **7.7%**. Including Jev made this measured stage **6.1% more expensive** and its median serial time approximately **14.4% slower**. Assistant-only median time improved to 766 ms; classification erased that saving on the serial path. These medians are not full-mix p95 results.

The existing content-free cache logs were checked in the exact call order: 48 cache records, 48 rows, and one completed generation charge per row. The full-schema arm read 288,512 cached tokens, versus 66,560 for selected schemas; its stable large prefix already benefited from caching. The first pair cost $0.006287904 baseline versus $0.007193988 candidate. The repeat cost $0.002507568 versus $0.002141724, about **14.6% cheaper**, still below the 20% target. Repeated cases are timing/cost observations, not additional independent semantic samples.

Run from `apps/backend`:

```bash
OPTIMIZATION_SCHEMA_BILLING_ENABLED=true OPTIMIZATION_REPORT_PATH=/tmp/sydia-schema-billing-060.json node --env-file=.env --experimental-vm-modules node_modules/jest/bin/jest.js --config ./jest.config.mjs --runInBand test/optimization/optimization.schema-billing.live.spec.ts
```

`optimization.tool-schemas.ts` reconstructs the advertised schemas without executable functions, consistent with the SDK's [optional tool execution contract](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling). Two deterministic tests passed for full registry coverage, dependency-selected ordering, terminal schema preservation and absence of execution functions. The opt-in live test, strict type check and lint passed. Unknown attempt charges remain unknown. Later tool-loop steps, retrieval, side effects and final answer quality require the reviewed full-turn evaluation; these results do not authorize deployment or justify changing the requested 0.6 threshold.

### Previous 0.75 inclusion assessment

On 1 October, the requested rule replaced broad uncertainty fallback and forced memory/attachment selection. The revised harness records fixture IDs, missing required tools, recall agreement, actual scores, thresholds and charges. Draft version `synthetic-independent-selection-draft-v2` adds irrelevant/required attachments and task/contact requests; the unsupported-capability draft now expects no recall. Draft task requirements were not rewritten to hide missing groups.

The first pre-threshold-change attempt yielded 12 capacity fallbacks under local verification load and no provider scores; it is not a model-quality measurement. Redis connectivity was then checked successfully. At the requested **0.75** thresholds:

| Trial                          | Provider decisions         | Mean advertised domain tools | Draft tool coverage              | Draft recall agreement |
| ------------------------------ | -------------------------- | ---------------------------- | -------------------------------- | ---------------------- |
| 600 ms deadline                | 6 successful, 6 timed out  | 4.4 / 37                     | 7/12 turns                       | 8/12 turns             |
| 1,500 ms diagnostic            | 12 successful              | 7.3 / 37                     | 11/12 turns; 8/9 requiring tools | 10/12 turns            |
| 600 ms repeat after diagnostic | 10 successful, 2 timed out | 8.1 / 37                     | 11/12 turns; 8/9 requiring tools | 10/12 turns            |

The diagnostic reduced advertised tool count by about 80%; this is schema-count reduction, not measured total cost or answer-quality improvement. Its actual decision charge was $0.000647976 for 12 calls, with 15,428 input tokens, 328 ms median and 997 ms maximum decision latency. The configured production deadline remains 600 ms. Failed/timed-out call charges are unknown, so the first 0.75 run's complete cost remains unknown.

The 600 ms repeat had 315 ms median decision latency. Its missing required tools came from a timed-out task request; the attachment-save group qualified in that run. Completed calls reported $0.000540456 in charges, while the complete cost remains unknown because two attempts timed out. The repeated smaller selections are useful evidence of the new rule, but deadline reliability and score variation still prevent a release-quality claim.

In the diagnostic, the attachment-save request scored documents **0.74**, below the required boundary, and received no domain tools. The earlier 600 ms run scored the same group 0.76 and included it. This variation matters near the cutoff. An unrelated question with an attachment and an unsupported web/email request both selected no groups. Multi-domain requests selected several groups and dependencies; one task/contact request also selected extra reminders/memory and recall. The explicit forget request selected memory tools but did not recall; that differs from the retained draft recall label. These are review items, not grounds to force selection or change the requested threshold.

Run a focused reassessment from `apps/backend`:

```bash
OPTIMIZATION_LIVE_ENABLED=true OPTIMIZATION_TURNS_ONLY=true OPTIMIZATION_REPORT_PATH=/tmp/sydia-independent-turns-075.json node --env-file=.env --experimental-vm-modules node_modules/jest/bin/jest.js --config ./jest.config.mjs --runInBand test/optimization/optimization.live.spec.ts
```

`OPTIMIZATION_DECISION_TIMEOUT_MS=1500` changes only an isolated diagnostic's budget. `OPTIMIZATION_TURN_THRESHOLDS_JSON` can explicitly record an experimental threshold set; the default subsequently changed to `toolInclude=0.6` and `recallInclude=0.6` at the user's request. The selector revision passed five affected backend suites (89 tests), followed by 35 focused tests covering the 0.75 configuration and obsolete-key rejection. Lint, type checking and backend build passed. Production enablement and reviewed held-out calibration remain pending.

### Earlier selection rule and extractor trials

The following turn measurements used the previous broad-fallback rule and are retained as historical comparisons. They do not describe the current independent selector.

| Trial                               | Result                                                                                                                            | Release implication                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Jev, 600 ms budget                  | First run: two cold turn calls timed out; remaining warm turn calls were roughly 300–430 ms                                       | Regional/cold latency needs representative measurement                                |
| Jev, 1,500 ms budget                | Later run: 8 of 9 turn calls timed out                                                                                            | A larger timeout did not establish reliable interactive performance                   |
| Jev provisional thresholds          | All 9 turns retained full tools and baseline recall; all 6 eligibility sources retained evidence review                           | No demonstrated net savings; do not weaken thresholds merely to produce reductions    |
| GPT-OSS, default OpenRouter routing | Valid first source, but slower than its paired baseline; one later incumbent review call failed                                   | Separate provider/reviewer failures from rejected facts                               |
| GPT-OSS, fixed Groq, 3 sources      | Both extractors completed and the incumbent admitted all 3 facts, preserving language preference, negation, and recurring routine | Compatibility established on these examples only                                      |
| Fixed Groq retain timings           | DeepSeek: 3,604 / 2,069 / 1,553 ms; GPT-OSS: 3,112 / 2,066 / 2,077 ms                                                             | Median roughly 2.07 s in both arms; no established speed improvement                  |
| Repeated fixed Groq trial           | DeepSeek median 2,097 ms; GPT-OSS median 2,588 ms, with all 3 facts admitted in both arms                                         | This repeat was slower for GPT-OSS; the small trials do not support a speed migration |
| Repeated Jev trial, 600 ms          | 6 of 9 turn calls completed, 3 timed out; all retained 37 tools                                                                   | Interactive reliability and net savings remain unproven                               |
| Initial extraction cost trials      | Billed cost was unknown before adding the synthetic usage relay                                                                   | Superseded by the billed comparisons below; token counters alone were insufficient    |

Subsequent reports must retain their own versions and timestamps rather than treating these observations as a permanent provider benchmark. Disposable JSON reports stay outside the repository. The fixtures, harness, and confidence-interval checks live under `apps/backend/test/optimization`.

### Billed provider comparisons

The synthetic-only relay reads OpenRouter's reported account charge rather than calculating cost from advertised prices. OpenRouter documents [`usage.cost` as the amount charged](https://openrouter.ai/docs/cookbook/administration/usage-accounting). Requests and responses pass through memory without content logging; saved records contain model, provider, status, latency, tokens/cache/reasoning usage, and cost only. The incumbent admission reviewer is held constant; its actual generation charges are captured separately in later runs. Embedding, reranking and consolidation charges remain outside these totals.

Only three distinct evidence cases were repeated. These repetitions support timing/cost observations, not independent semantic confidence counts.

| Comparison                                             | Billed extraction cost                                                                      | Retain timing / admission                                                                        | Interpretation                                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Together DeepSeek vs Groq GPT-OSS, 15 sources each     | $0.0039327 vs $0.002956575 total; warm-cache means $0.000199371 vs $0.000175488             | Medians 2,573 vs 2,577 ms; 13/15 admitted each, with two reviewer failures each                  | Aggregate saving 24.8% is cache-mix dependent. Warm-cache saving is about 12%, below the 20% goal.                                                                         |
| Groq, repeated 6-source comparison including admission | Extraction + admission: $0.001808916 baseline vs $0.001657266 candidate                     | All six admitted in both arms; medians approximately 2,573 vs 2,576 ms                           | About 8.4% lower combined cost, without an established speed improvement.                                                                                                  |
| Together DeepSeek vs DeepInfra GPT-OSS, 9 sources each | Extraction: $0.0018105 vs $0.0010796                                                        | Medians 2,071 vs 3,097 ms; baseline 8/9 admitted plus one review failure, candidate 9/9 admitted | About 40.4% cheaper extraction but roughly 50% slower median retention. Baseline combined cost is unknown because of the failed review attempt; do not impute zero.        |
| Together DeepSeek vs CoreWeave GPT-OSS, 6 sources each | Extraction: $0.0011958 vs $0.00069251; extraction + admission: $0.001813716 vs $0.001321226 | All six admitted in both arms; medians 2,578 vs 3,084 ms                                         | About 42.1% cheaper extraction and 27.2% cheaper combined cost, but approximately 20% slower median retention. Still requires reviewed quality and full traffic-mix gates. |

These are development observations, not accepted release results. Provider routing, quantization, cache behavior and reasoning output can materially change the outcome. Pin and evaluate a chosen endpoint; do not enable unrestricted cheapest-provider failover.

### Repeat billing measurements

The relay is disposable and restricted to the trial Docker network. Its completion port is not published. Only its content-free administration port is published on host loopback. It does not receive active-instance traffic.

From `apps/backend`, compile the relay without adding dependencies:

```bash
node node_modules/typescript/bin/tsc test/optimization/optimization.usage-relay.ts --outDir /tmp/sydia-extraction-usage --module commonjs --target es2023 --skipLibCheck --esModuleInterop --ignoreConfig --types node --strict
```

From the repository root, create, copy, and start it:

```bash
docker compose --project-name sydia-opt-usage --env-file .env -f docker/optimization-usage-relay.yml create
docker cp /tmp/sydia-extraction-usage/optimization.usage-relay.js sydia-opt-usage-optimization-relay-1:/relay.js
docker compose --project-name sydia-opt-usage --env-file .env -f docker/optimization-usage-relay.yml start
OPTIMIZATION_RELAY_ARM=baseline HINDSIGHT_API_HOST_PORT=8890 docker compose --project-name sydia-opt-baseline --env-file .env -f docker/hindsight.environment.yml -f docker/hindsight.optimization-relay.yml --profile hindsight up -d
OPTIMIZATION_RELAY_ARM=gpt-oss-20b HINDSIGHT_API_HOST_PORT=8891 docker compose --project-name sydia-opt-gptoss --env-file .env -f docker/hindsight.environment.yml -f docker/hindsight.gpt-oss-20b.yml -f docker/hindsight.optimization-relay.yml --profile hindsight up -d
```

The relay uses the existing extraction credential, validates the two expected models and rejects streaming. Startup health-probe charges precede fixture snapshots and are excluded from per-operation results. All trial retain calls, including retries, pass through it; a missing charge remains unknown. Counter/report data requires otherwise idle trial instances.

After both Hindsight instances report ready, run from `apps/backend`:

```bash
OPTIMIZATION_LIVE_ENABLED=true OPTIMIZATION_DECISIONS_ENABLED=false OPTIMIZATION_EXTRACTOR_ENABLED=true OPTIMIZATION_EXTRACTOR_REPEATS=5 OPTIMIZATION_RELAY_ADMIN_URL=http://127.0.0.1:8901 OPTIMIZATION_BASELINE_URL=http://127.0.0.1:8890 OPTIMIZATION_CANDIDATE_URL=http://127.0.0.1:8891 OPTIMIZATION_REPORT_PATH=/tmp/sydia-optimization-billed-paired.json node --env-file=.env --experimental-vm-modules node_modules/jest/bin/jest.js --config ./jest.config.mjs --runInBand test/optimization/optimization.live.spec.ts
```

The harness alternates baseline/candidate pairs and uses fresh banks per pair. `OPTIMIZATION_EXTRACTOR_REPEATS` accepts 1–30; `OPTIMIZATION_DECISIONS_ENABLED=false` isolates the extractor comparison. A provider comparison uses `OPTIMIZATION_GPT_OSS_PROVIDER=deepinfra` (or another verified supported endpoint) on the candidate Compose command, followed by a new report. Groq remains the overlay default; no provider has been accepted for production. Verify supported parameters and actual billed provider on every trial.

After results are saved, remove the two trial Hindsight projects using the commands below, then remove the relay:

```bash
docker compose --project-name sydia-opt-usage --env-file .env -f docker/optimization-usage-relay.yml down
```

Do not use these measurement overlays with the active Hindsight project.

## Run an isolated comparison

From the repository root, create two dedicated instances. Neither command changes the application's Hindsight URL or active project. The root `.env` must contain the existing Hindsight, model, embedding, and reranker credentials. Baseline retain overrides must be blank so it inherits the current DeepSeek configuration.

```bash
HINDSIGHT_API_HOST_PORT=8890 docker compose --project-name sydia-opt-baseline --env-file .env -f docker/hindsight.environment.yml --profile hindsight up -d
HINDSIGHT_API_HOST_PORT=8891 docker compose --project-name sydia-opt-gptoss --env-file .env -f docker/hindsight.environment.yml -f docker/hindsight.gpt-oss-20b.yml --profile hindsight up -d
```

The candidate uses `openai/gpt-oss-20b`, `low` reasoning, a 32,000 completion-token cap, and a Groq-only OpenRouter route with parameter support required and failover disabled. Global/consolidation configuration, image `0.10.2`, embeddings, reranker, concurrency, chunk size and mission are held constant. Review routing availability before a future run; [OpenRouter endpoint data](https://openrouter.ai/api/v1/models/openai/gpt-oss-20b/endpoints) identifies supported parameters.

Wait for `/health` on each loopback endpoint to report ready. From `apps/backend`, run:

```bash
OPTIMIZATION_LIVE_ENABLED=true OPTIMIZATION_EXTRACTOR_ENABLED=true OPTIMIZATION_BASELINE_URL=http://127.0.0.1:8890 OPTIMIZATION_CANDIDATE_URL=http://127.0.0.1:8891 OPTIMIZATION_REPORT_PATH=/tmp/sydia-optimization-paired.json node --env-file=.env --experimental-vm-modules node_modules/jest/bin/jest.js --config ./jest.config.mjs --runInBand test/optimization/optimization.live.spec.ts
```

The harness creates unique synthetic banks, uses the same original timestamps, evidence and admission reviewer, and deletes those banks in `finally`. It records completion and review failures separately, proposed synthetic fact text for inspection, and retain-specific token-counter deltas. Counter attribution requires otherwise idle dedicated instances. The Hindsight `provider` metric labels its adapter, not OpenRouter's actual hosting provider. Missing billing remains `null`.

To audit instrumentation separately, from `apps/backend` run:

```bash
OPTIMIZATION_TRACE_ENABLED=true node --env-file=.env --experimental-vm-modules node_modules/jest/bin/jest.js --config ./jest.config.mjs --runInBand test/optimization/optimization.trace.live.spec.ts
```

This sends one synthetic generation and flushes before exit. Use Langfuse's observations API to verify `decision.contract-audit`: generation type, resolved snapshot, input/output usage, supplied cost, latency, stage/version, question revision, and redacted content. No hosted datasets or evaluators are created. The installed Langfuse 5.11.0 versions are preserved.

Remove only the disposable projects after collecting results, from the repository root:

```bash
docker compose --project-name sydia-opt-baseline --env-file .env -f docker/hindsight.environment.yml --profile hindsight down --volumes
docker compose --project-name sydia-opt-gptoss --env-file .env -f docker/hindsight.environment.yml -f docker/hindsight.gpt-oss-20b.yml --profile hindsight down --volumes
```

## Calibration and deployment gates

### Completion audit and required input

The 1 October audit found no reviewed evaluation dataset in the current fixture artifacts. The configured Langfuse project's dataset inventory returned HTTP 200 with `totalItems=0`; no hosted dataset was created. The earlier billing work is implementation/economic evidence, not held-out semantic evidence. All four production decision modes were confirmed `off`, and the active Hindsight service was healthy. The requested independent selector and both 0.6 inclusion defaults remain implemented.

| Workstream               | Available evidence                                                                         | Required before acceptance                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic eligibility    | Typed adapter, deterministic ingestion/checkpoint/replay tests, synthetic calls            | Reviewed eligible-message labels, separate development/held-out sources, language/class coverage and net source cost                               |
| Fact checks              | Evidence-bound implementation, leases/fallback tests, 14-source billed comparison          | Reviewed every-claim support/durability/sensitivity/permission labels, live selected-evidence validation and valid-fact parity                     |
| Recall                   | Independent 0.6 inclusion, contextual shared decisions and synthetic outcomes              | Reviewed recall necessity/useful-answer labels, held-out skip precision and representative full-turn latency                                       |
| Tool selection           | Independent 0.6 inclusion, dependency closure, affected tests, actual first-step billing   | Reviewed required groups and answer/task outcomes, full tool-loop costs and traffic-mix latency; first-step measurements did not establish savings |
| GPT-OSS retain migration | Isolated provider comparisons, actual extraction/admission charges, rollback configuration | Reviewed extraction/admission/recall parity, representative pipeline economics and monitored canary/rollback results                               |

The next input is the location and version of human-reviewed development and held-out labels covering these scopes, with their conversation/source split and supported languages. Existing draft fixture paths are `apps/backend/test/optimization/optimization.fixtures.ts` and `optimization.fact-fixtures.ts`. Review of those drafts alone does not supply the independent held-out sample required by the plan. Production rollout, combined acceptance and completion remain unproven until these gates pass; the latest user-selected score threshold is not itself a quality acceptance result.

### Synthetic fact-review comparison

Run the opt-in comparison from `apps/backend`:

```bash
OPTIMIZATION_FACTS_ENABLED=true OPTIMIZATION_REPORT_PATH=/tmp/sydia-fact-review-live.json node --env-file=.env --experimental-vm-modules node_modules/jest/bin/jest.js --config ./jest.config.mjs --runInBand test/optimization/optimization.facts.live.spec.ts
```

The harness runs 14 synthetic sources through the incumbent and Jev shadow, reject-only, and enabled implementations. It rotates mode order, uses the same immutable evidence and candidates, captures actual Jev and fallback-review costs, and records failures separately. No Hindsight instance, application source, or active feature setting is changed. An unused provider call has zero cost; a failed or unpriced provider attempt remains unknown. These draft development labels are never sent to either reviewer.

Cases cover Indonesian preferences, negation, multiple evidence spans, unsupported compound claims, wrong subjects, temporary versus recurring behavior, quoted tool output, sensitive permission and permission mismatch, credentials, reference-text injection, and whole-batch rejection. Contract checks verify that shadow remains advisory, reject-only cannot allow, credentials make no provider calls, and sensitive candidates cannot take the Jev allow path. Passing these checks is distinct from meeting the reviewed semantic gates.

The 1 October run completed 56 source/mode evaluations. All 39 Jev calls succeeded, with no reviewer errors. Each mode admitted the same four sources and rejected the other ten. Those outcomes agree with the draft labels, not a reviewed accuracy claim. Credentials invoked neither provider; sensitive cases remained on the incumbent reviewer. Reject-only and enabled each short-circuited the negation and mixed valid/invalid batch cases; neither directly allowed a fact. The second selected-evidence request was therefore not exercised live at the default thresholds; its behavior remains covered by deterministic tests, with live semantic validation pending.

| Mode            | Actual classifier + admission charge, 14 sources | Median source review time | Effect                                                       |
| --------------- | ------------------------------------------------ | ------------------------- | ------------------------------------------------------------ |
| Off / incumbent | $0.001378752                                     | 2,438 ms                  | Baseline                                                     |
| Shadow          | $0.001518522                                     | 2,889 ms                  | About 10.1% more expensive; advisory calls avoid no review   |
| Reject-only     | $0.001366306                                     | 2,463 ms                  | About 0.9% cheaper, two reviews avoided                      |
| Enabled         | $0.001290786                                     | 2,867 ms                  | About 6.4% cheaper, two reviews avoided and no direct allows |

Each active mode spent $0.000298998 on Jev. Median classifier latency ranged from 296 to 366 ms. Reviewer cache and output variation explain part of the differences between modes, including between reject-only and enabled despite the same decisions. This small single run does not establish economics or p95 latency; no mode reached the 20% cost goal. Do not relax thresholds based on these unreviewed cases to manufacture an improvement.

Implementation verification on 1 October: 63 backend suites passed (547 tests), with opt-in live suites skipped in that run. Separate synthetic Jev/extractor, distributed Redis capacity, and trace runs passed. Backend lint, strict type checking, build, and placeholder Compose rendering passed. The targeted replay CLI bootstrapped and returned an excluded synthetic owner/message in dry-run; no real sources were replayed.

After adding billed usage capture, three targeted suites passed (15 tests), including relay authentication/content redaction, unknown-cost handling, and strict threshold-key validation. The disposable Hindsight instances, their database volumes, and the usage relay/network were removed after measurements. The active Hindsight service remained healthy with its existing configuration.

The final [synthetic Langfuse audit](https://jp.cloud.langfuse.com/project/cmtu03nwx002had0fsqc36ws3/traces/4bfaffe2faee1ef62e2b853e997c429b) was fetched and checked for generation type, test environment, resolved model, 278 input / 22 output tokens, provider-supplied $0.000011676 cost, latency, version/question revision, and redacted input. Earlier flush attempts encountered transient transport failures; the successful audit does not establish an availability SLO. Shutdown diagnostics now report transport class/status without logging request headers or content.

Review fixture labels before changing thresholds. Separate development and held-out sources by conversation; include English, Indonesian, mixed language, attachments, follow-ups, compound facts, sensitive claims, unsupported capabilities, and malicious reference text. Tune each feature independently, then measure combined operation. Model probabilities are not empirical accuracy.

`optimization.release-gates.ts` implements a two-sided 95% Wilson score interval for eligibility recall, recall-skip precision, and required-tool coverage. Evaluate every supported language and applicable class separately. Its lower bound must meet 99%; even nine flawless examples fail. Human review, held-out labels, and zero critical failures are independent requirements. This helper covers semantic counts; the plan's quality coverage, economics, traffic-mix p95, and rollback requirements must also pass. It is not an automatic deployment switch.

Include classifier calls, fallback calls, downstream operations, retries, cache pricing, and external extraction/embedding/reranking cost. Unknown cost must stay unknown. Aim for at least 20% affected-stage cost reduction, with no more than 5% full-mix interactive p95 regression. The current observations do not meet these gates.

The user has explicitly accepted all four modes. The local cutover uses an explicit all-user cohort and restarts API and worker processes. Capture the evaluated model, question revision, thresholds, labels and deployment version. For GPT-OSS, retain settings are server-wide: use a separate instance for a cohort, or a monitored cutover window. The active switch is authorized by that acceptance; compatibility alone does not authorize other deployments.

## Targeted recovery and rollback

Set the affected Jev mode back to `off` and restart API/worker to restore baseline behavior. Turning eligibility off affects future sources; earlier classifier negatives require targeted replay.

Build the backend, then run from `apps/backend` with an explicit owner and 1–24 original message IDs:

```bash
bun run build
node --env-file=.env dist/src/operations/memory-eligibility-replay.js USER_ID MESSAGE_ID
```

Dry-run is the default. It bypasses the eligibility classifier, applies the incumbent evidence reviewer, and reports statuses without source/checkpoint writes or delivery jobs. Add `--apply` only for the reviewed IDs to enqueue eligible missing sources. The command starts a limited Nest context without application schedulers, workers, or channel runtimes. It rechecks opt-in, ownership, suppression and explicit-source exclusions; it preserves original source keys and timestamps and never rewinds checkpoints or clears forgotten evidence. Existing sources are not replayed or overwritten.

A GPT-OSS rollback restores the prior retain model/reasoning/body/completion settings and recreates the active service with its stable worker ID. Record operations crossing the change and verify readiness and pending delivery recovery. Configuration rollback preserves accepted facts; confirmed bad facts require scoped correction/withdrawal through existing generation fences. Do not rewrite banks, backfill all sources, or revive suppressed data.

## Accepted local cutover settings and verification

The activation is in the untracked root and backend `.env` files, so normal Compose and backend startup preserve it. `docker/hindsight.gpt-oss-20b.yml` now defaults to the accepted CoreWeave route; applying it is optional when the root retain overrides are already set. New-installation templates intentionally remain opt-in.

```dotenv
BACKEND_MEMORY_ELIGIBILITY_MODE=enabled
BACKEND_MEMORY_FACT_REVIEW_MODE=enabled
BACKEND_MEMORY_RECALL_DECISION_MODE=enabled
BACKEND_TOOL_GROUP_SELECTION_MODE=enabled
BACKEND_DECISION_COHORT=*
BACKEND_DECISION_CALIBRATION_VERSION=user-accepted-20261001-v1
BACKEND_DECISION_TIMEOUT_MS=1500
BACKEND_DECISION_BACKGROUND_TIMEOUT_MS=5000
BACKEND_DECISION_THRESHOLDS_JSON={"eligibilitySkip":0.01,"recallInclude":0.6,"toolInclude":0.6,"factReject":0.01,"factAllow":0.99,"sensitiveNo":0.01}
HINDSIGHT_API_RETAIN_LLM_MODEL=openai/gpt-oss-20b
HINDSIGHT_API_RETAIN_LLM_REASONING_EFFORT=low
HINDSIGHT_API_RETAIN_LLM_EXTRA_BODY={"provider":{"only":["coreweave"],"allow_fallbacks":false,"require_parameters":true}}
HINDSIGHT_API_RETAIN_MAX_COMPLETION_TOKENS=32000
```

The opt-in [deployment E2E test](../apps/backend/test/optimization/cutover.e2e-spec.ts) uses authenticated local HTTP, real model decisions, the application's database, BullMQ worker and active Hindsight service. It creates a unique synthetic account, exercises no-tool answers and task creation, explicit and automatic admission, recall across conversations, forgetting, memory opt-out, and account/bank erasure. It never resets existing banks or queues. Run from `apps/backend` with its environment loaded and `OPTIMIZATION_CUTOVER_E2E=true node --env-file=.env --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.config.mjs --runInBand --testTimeout=60000`. The private content-free result is `/tmp/sydia-optimization-cutover-e2e.json`.

Before the switch, the two original accounts were present and all 18 remote operations were complete. Prior `.env` files were copied to a private 0700 directory with 0600 files; `/tmp/sydia-optimization-rollback-path` identifies it without publishing credentials. To roll back, restore those two files, recreate only Hindsight using the original Compose file, and restart API/worker. Configuration rollback preserves accepted facts and suppression fences. Existing legacy classes remain available for rollback but do not write for the active Hindsight engine. No database reset or bulk re-extraction is part of cutover.

### Verification record

The full backend suite passed **66 suites / 575 tests** (43 opt-in tests skipped); backend lint, strict type checking and build passed. The accepted activation's first successful deployment run passed both E2E suites in 89.5 seconds, with eight completed chat turns and 19 content-free checks. No assistant retry was needed in that successful run. Earlier runs exposed transient OpenRouter connection timeouts and fixture errors (canonical tool naming, minimum automatic segment size, and an erasure assertion that incorrectly included a factless source); those attempts were retained in local logs rather than counted as passes. The fixture now follows normal two-user-message ingestion rules and checks physical erasure of the generations supporting the forgotten facts. Account deletion additionally verifies full-bank erasure.

A live extractor rollback rehearsal restored the prior inherited DeepSeek configuration, verified readiness and the stable `sydia-hindsight` worker ID, then restored the accepted GPT-OSS/CoreWeave settings exactly and verified readiness again. API health remained HTTP 200 during the rehearsal. Its private content-free result is `/tmp/sydia-optimization-rollback-rehearsal.json`. No remote operations were pending at that boundary.

The Langfuse CLI returned 35 observations carrying the accepted version across `decision.turn`, `decision.memory-eligibility` and `decision.memory-facts`, confirming that API and worker used the enabled decision paths. This is wiring/observability evidence, not held-out semantic calibration or proof that every provider attempt succeeded. The deployment E2E is repeated after rollback restoration. A repeat of the broad “forget all facts” phrasing completed without a mutation, leaving facts available until synthetic account cleanup. This remains an observed workflow limitation, not an erasure success. The existing `forget_memory` tool accepts an ID or query and deletes the first match plus its supporting sources; it has no bulk-delete argument. Final verification therefore names both facts explicitly, tests their scoped erasure, and separately exercises full-bank erasure through account deletion. No recall or memory-tool selection is forced to make the fixture pass.

Final post-restoration verification passed **both E2E suites / two tests in 92.1 seconds**. The live scenario completed eight turns and 19 checks, including task persistence, explicit and automatic admission, cross-conversation recall, scoped forgetting, physical source-generation erasure, consumed opt-out jobs, an inactive legacy writer, and full-bank erasure/session rejection after account deletion. Final lint and type checking passed. The two original accounts remain; no synthetic accounts remain. API and Hindsight readiness are healthy, with the accepted retain settings restored. The earlier broad-forget limitation remains recorded above.
