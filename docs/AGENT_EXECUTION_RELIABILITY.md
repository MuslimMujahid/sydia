# Main-thread reasoning and execution plans

Implemented on 9 November 2026, following the [reference-project research](./AGENT_EXECUTION_RELIABILITY_RESEARCH.md).

Main conversations request reasoning independently of the gateway defaults. The internal `update_plan` tool tracks requests with at least three distinct outcomes. It does not create personal tasks in the user's task manager. All chat channels share the same execution path; existing activity events announce plan updates.

## Configuration

| Setting                               | Default  | Allowed values                                              |
| ------------------------------------- | -------- | ----------------------------------------------------------- |
| `BACKEND_ASSISTANT_REASONING_EFFORT`  | `medium` | `none`, `minimal`, `low`, `medium`, `high`                  |
| `BACKEND_ASSISTANT_MAX_OUTPUT_TOKENS` | `4096`   | 1–16384, per model step, including reasoning                |
| `BACKEND_ASSISTANT_MAX_STEPS`         | `16`     | 1–32, shared across the initial generation and continuation |
| `BACKEND_ASSISTANT_TIMEOUT_MS`        | `180000` | 1–300000, whole main turn                                   |
| `BACKEND_ASSISTANT_PLANNING_ENABLED`  | `true`   | `true`, `false`                                             |

Invalid settings fail during orchestrator construction. Existing `BACKEND_MODEL_*` settings still govern summarizers and other gateway callers. OpenRouter receives hidden reasoning options; compatible custom endpoints receive `reasoning_effort`. The endpoint/model must support the requested option. No reasoning text is exposed to the user.

The local database migration has been applied. Other environments need the new Prisma client and migration before enabling this backend version: from `apps/backend`, run `bun run db:generate` and `bun run db:migrate:deploy` using the environment's normal deployment workflow.

To disable the two features independently, set the reasoning effort to `none` and/or planning to `false`. This retains the main-thread budgets and explicit incomplete-output checks. To restore the previous main budget, set output tokens to `1200` and steps to `8` as well.

## Plan and completion behavior

The immutable `assistant_plan_revision` table retains full plan snapshots per conversation. Updates require the expected revision, an active run claim, the current source message and an idempotency key. Row locks serialize concurrent first writes. Ownership checks isolate reads and writes. A reclaimed worker or a run superseded by a later user message cannot save a plan.

Plans contain at most 20 steps with stable IDs and bounded descriptions. Status is `pending`, `in_progress`, `completed`, `blocked` or `cancelled`. Only one step may be active. Blocking or cancellation requires a reason; unfinished steps cannot silently disappear. State changes in memory only after a successful database write. Completed revisions remain available for diagnosis.

Saved plan context is inserted before the latest user direction, outside rolling summaries. It is reference data under fixed planning instructions. New instructions take precedence; cancellation must be reconciled explicitly. An earlier turn's unfinished plan cannot trigger the completion reminder until the current turn adopts it through an update. Retrying the original source message also retains completed step descriptions, so known outcomes remain visible instead of being planned again. Greetings and acknowledgements do not restart historical work. Background agents do not receive the tool. Persistence does not schedule automatic execution after a restart.

While actionable steps remain, deterministic terminal receipts cannot finalize the turn. If the model stops normally, the runtime permits one reminder using the full accumulated assistant/tool transcript, existing loaded skills and remaining budget. It never restarts from the original request. The entire turn has a deadline, at most 16 model steps by default and 48 tool calls. Total model output is bounded by the per-step allowance multiplied by that step limit.

Final text is buffered until the completion check resolves; tool activity still streams. Length/error finishes fail visibly. A pending plan that exhausts its reminder or step budget is retained and the answer lists unfinished steps. Blocked steps do not trigger automatic continuation. Cancellation is checked before and after generation. Token usage and reported provider costs accumulate across model steps and continuation rounds; unavailable billing remains unknown.

Plans remain model-authored assertions. They can omit a requirement or mark it complete incorrectly. Existing permission, evidence, idempotency and date-scope mechanisms remain necessary. Continuation retains observed effects, but this feature does not establish exactly-once external writes or reconcile uncertain writes automatically after a process crash.

## Failure diagnostics

Completion checks retain `finishReason` in the `assistant.run.failed` audit
metadata and the `assistant_generation_exhausted` backend log. `failureReason`
distinguishes `incomplete_output` (`length` or `error`) from
`invalid_continuation_metadata`. The same record includes `maxOutputTokens`,
`maxSteps` (the remaining allowance for that generation), `stepCount`, and
`reasoningEffort`. Gateway attempt counts stay unknown for completion failures;
they are not inferred from the turn's step count. User-facing failure messages
remain localized and generic.

Tool argument-validation and execution failures save a sanitized message in
`tool_invocation.errorMessage`. Its existing `result` JSON field retains
`error`, `message`, and, for domain `ApiException` failures, `code`, `statusCode`,
and an optional `reason`. Messages are capped at 240 characters and reasons at
80 characters; Prisma source frames and control characters are removed from
messages. Other exception details and raw payloads are not copied. Sensitive
tools retain only a redacted message, code, and status. Backend warning events
identify the run/tool and error code/status without copying error messages or
tool arguments into logs.

These fields require no migration and apply to new failures after deployment.
Older records cannot recover discarded finish reasons or tool messages. A
successful retry can change the run to `completed`; its earlier audit events
still identify the failed attempt. A provider call recorded as `ok` can be
followed by an application completion-check failure.

Targeted regression checks from `apps/backend`:

```bash
bun run test -- --runInBand --testPathPatterns='assistant-execution.spec|assistant-orchestrator.service.spec|tool-executor.service.spec|tool-loop-guard.spec|tool-references.spec|openrouter-language-model.spec'
```

## Verification

From `apps/backend`:

```bash
bun run test -- --maxWorkers=2
bun run check-types
bun run lint
bun run test:e2e -- --runInBand --testPathPatterns=execution-plan
bun run eval:prompts
RELIABILITY_EVAL_ENABLED=true node --env-file=.env --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.mjs --runInBand --testPathPatterns=execution-reliability.live
```

The database suite runs through the shared test lock. It covers restoration/history, idempotency, revision conflicts, ownership, reclaimed claims, superseded messages and concurrent writes. Gateway regression tests initially failed when only the last SDK step's messages were returned; they pass with the accumulated response transcript in both streaming and non-streaming paths. Removing the current-turn completion guard also made the stale-plan regression test fail; restoring it passes.

The additional live checks require two distinct task creations, a reminder at the requested time and a summary across web, Telegram and WhatsApp. They reject duplicate writes and require a reconciled plan. Separate simple-turn cases reject unnecessary plan calls. The owner-approved baseline scenarios and baseline JSON remain unchanged.

## Evaluation results

The unchanged stored baseline contains 49 scenarios with three repetitions each (145/147 passing). A fresh pre-change run passed 141/147 and failed its per-scenario gate because `availability-conflict` passed only once. The first implementation candidate passed 142/147 with no per-scenario drop of two or more relative to the stored baseline. This is preliminary evidence, not a demonstrated reliability improvement.

The local endpoint was `cmc/deepseek/deepseek-v4.1-flash`, with Jev routing enabled. Before the change, local configuration already requested `high` reasoning with 1,200 output tokens and eight steps. The candidate uses request-specific `medium` reasoning, 4,096 output tokens, 16 steps and planning. Thus this comparison does not isolate reasoning or planning individually. The endpoint reports no billing cost; the generated report's `$0.0000` is unavailable cost, not evidence of free inference. Routing timeouts and provider connection failures occurred; the first candidate needed three evaluation-level gateway retries.

The full backend unit run passed 1,730 tests (144 suites), with 574 live/optional tests skipped. The eight database integration checks passed. Workspace type checks passed. Full backend lint completed with zero errors and two existing warnings in untouched messaging/Telegram test files. The first single-process unit attempt exhausted Node memory; the verified run uses two recycling Jest workers.

All 18 additional live checks passed: three repetitions each of the multi-outcome request on web, Telegram and WhatsApp, plus greetings, a lookup and a single reminder. The nine multi-outcome runs performed exactly 27 domain writes (two tasks and one reminder per run), used the plan, returned summaries and closed every step. The nine simple runs made no plan calls. Median end-to-end duration was 11.2 seconds across these 18 checks; this includes routing and cannot isolate planning overhead. Domain data and writes were synthetic; no messages were sent through external channels.

The first feature experiment exposed ambiguous optional planning guidance and a reminder fixture returning the wrong time. The fixture now reflects the requested schedule. Explicit guidance requires a plan for at least three outcomes and reconciliation before replying. A later run passed all nine multi-outcome cases but made one unnecessary context lookup for a plain thanks (17/18 overall). The latest-message rule now explicitly excludes tools for greetings/thanks with no new request; the subsequent full 18-case experiment passed. The original failing artifacts remain available locally; expectations were not weakened.

The final unchanged baseline run passed **145/147**, with **no regression-gate failures**, matching the stored aggregate and improving by four runs over the fresh pre-change measurement. There were no evaluation-level gateway retries. The final run took 451 seconds; median per-run duration including routing was 9.7 seconds and the 95th percentile was 24.3 seconds. The pre-change run lacks per-run duration, and provider/caching conditions varied, so this is not a controlled latency comparison.

| Scenario                            | Fresh before |       Final | Stored baseline |
| ----------------------------------- | -----------: | ----------: | --------------: |
| Availability conflict               |          1/3 |         3/3 |             3/3 |
| Playful persona length              |          2/3 |         3/3 |             3/3 |
| Plain thanks, no tools              |          2/3 |         3/3 |             3/3 |
| Named note, “lihat” wording         |          2/3 |         3/3 |             3/3 |
| Named note, “buka” wording          |          2/3 |         2/3 |             1/3 |
| Capture missing field/pickup detail |          3/3 |         2/3 |             3/3 |
| All other scenarios                 |     3/3 each |    3/3 each |        3/3 each |
| **Total**                           |  **141/147** | **145/147** |     **145/147** |

The remaining failures were an answer including older stock rows when asked for today, and a pickup detail neither stored in an accepted field nor handled as the approved check requires. The capture case lost one repetition relative to both baselines; the repository reports this as possible noise, not a gated regression. These failures are retained. No scenario expectations, baseline JSON, or regression thresholds were changed.

None of the 49 baseline scenarios invoked a plan. The additional multi-outcome experiment is therefore the direct evidence that the planning tool, reconciliation and shared channel execution work; the baseline establishes compatibility with existing behavior. Three repetitions per case and the combined reasoning/budget/planning change cannot establish a statistically reliable broad improvement or identify the contribution of either feature alone. Follow-up evaluation can compare reasoning-only and planning-only configurations on a larger held-out multi-outcome dataset.

Local raw reports (git-ignored, retained for inspection):

- [Pre-change baseline](../apps/backend/test/prompt-eval/results/reliability-2026-11-09/before.md)
- [Final baseline and individual failures](../apps/backend/test/prompt-eval/results/reliability-2026-11-09/final.md)
- [Final feature runs, tool effects and plan snapshots](../apps/backend/test/prompt-eval/results/reliability-2026-11-09/feature-final.json)
- [Earlier 17/18 feature experiment](../apps/backend/test/prompt-eval/results/reliability-2026-11-09/feature-17of18.json)

The local artifacts also include before/final baseline JSON and the first implementation/feature experiments. Regenerate them with the verification commands above; `baseline.json` remains the owner-approved reference.

## Three-suite consistency comparison (original strict scores)

A subsequent experiment ran each implementation three times, alternating pre-change and final. Each full suite retained the 49 approved scenarios and three repetitions: 147 samples per suite, 441 per implementation, 882 total. These results exclude all earlier experiments above. Source snapshots were frozen before execution; scenario, check and stored-baseline hashes matched. No implementation, expectation or gate changes were made during the experiment.

| Implementation | Suite 1 | Suite 2 | Suite 3 | Total passing |   Rate | Regression gates passed |
| -------------- | ------: | ------: | ------: | ------------: | -----: | ----------------------: |
| Pre-change     | 140/147 | 134/147 | 138/147 |       412/441 | 93.42% |                     0/3 |
| Final          | 146/147 | 146/147 | 143/147 |       435/441 | 98.64% |                     2/3 |

The final version passed 23 more samples, an increase of 5.22 percentage points. Its suite scores varied by three passes, versus six before the change; the sample standard deviation of the three pass counts was 1.73 versus 3.06. It passed all nine samples in 45/49 scenarios, versus 39/49 before the change. Only one final scenario failed in at least two suites, versus five pre-change scenarios. This supports better observed consistency on this suite, while three suite runs do not establish statistical significance or isolate the contribution of reasoning, budgets, prompts or planning.

The availability-conflict check improved from 0/9 to 9/9, availability calculation from 6/9 to 9/9, and plain thanks without tools from 6/9 to 9/9. Today-only stock retrieval remained inconsistent across wording variants: the “lihat” case passed 8/9 and “buka” passed 7/9 in the final version, versus 7/9 and 3/9 before. Pickup-detail capture passed 8/9 versus 7/9.

The final version still failed the regression gate in suite 3: `named-table-yesterday-held-out` passed 1/3 in that suite, losing two passes against the stored reference. Raw-output inspection exposed limitations in those two checks. The language heuristic flagged a reply that is actually Indonesian: its short keyword lists matched neither language, and a tie fails. Another reply correctly totaled yesterday's rows and explicitly excluded today's `Plastik` row, but the strict forbidden-word check rejects that name anywhere. Across all three suites this scenario scored 7/9, versus 9/9 pre-change. These two check failures remain in the approved scores; they are not evidence of an English reply or an incorrect total. The other four final failed samples comprise three replies including older stock rows despite a today-only request and one pickup-detail capture failure. No checks were weakened and no suite was rerun for a green result.

There were no evaluation-level gateway retries or final sample errors in either implementation. Routing still degraded: 28 fallback decisions before the change and 17 in the final version, out of 432 routing decisions each. Mean suite wall duration was 387.9 seconds pre-change and 405.3 seconds final; provider load, caching, routing, startup and ordering remain confounders. Billing remained unavailable. Neither implementation invoked `update_plan` in these baseline scenarios; the separate multi-outcome feature checks above remain the direct planning evidence.

The [original strict comparison](../apps/backend/test/prompt-eval/results/reliability-repeat-2026-11-09/strict-word-ban-v1/comparison.md) retains these historical scores. Source manifests, source archives and experiment settings are retained in the same local, git-ignored directory. Private environment files were excluded from the archives and temporary worktrees were removed after source verification.

### Subsequent acceptance clarification

The owner subsequently accepted additional historical rows when the requested
day's rows remain correctly identified. Under the [clarified rubric](./PROMPT_EVAL_DATE_SCOPE_RUBRIC.md),
all nine affected pre-change replies and four final replies pass. Manual review
of the same saved outputs gives pre-change scores of 142, 139 and 140 out of 147
(421/441, 95.46%) and final scores of 147, 147 and 145 (439/441, 99.55%). No model
calls or implementation changes produced this difference; it is a revised
acceptance rule. The original automatic scorecard remains available above.

The final version's remaining failures are one pickup-detail omission and one
language-heuristic false positive. The earlier interpretation of the three final
stock replies as product defects is superseded. Stricter date retrieval is not
needed to fix those examples. The [reviewed scorecard](../apps/backend/test/prompt-eval/results/reliability-repeat-2026-11-09/date-scope-reviewed-v2.md)
records all 13 adjudications. A subsequent automatic evaluator now reproduces
those reviewed scores, as described below.

### Current automatic scores

`date-attribution-v2` replaces the date word bans in all six dated table scenarios.
Its regression cases accept clearly separated historical context and reject
missing rows, wrong requested-day attribution, undated mixed lists and incorrect
requested-day totals. The replay tool rechecks every dated answer, retains
unrelated failures and archives the original reports and their hashes. Tests
also cover replay date boundaries, input preservation and idempotence. The
historical-context test fails when the old word ban is temporarily restored.

| Implementation | Suite 1 | Suite 2 | Suite 3 | Passing samples |   Rate | Recomputed gates passed |
| -------------- | ------: | ------: | ------: | --------------: | -----: | ----------------------: |
| Pre-change     | 142/147 | 139/147 | 140/147 |         421/441 | 95.46% |                     0/3 |
| Final          | 147/147 | 147/147 | 145/147 |         439/441 | 99.55% |                     3/3 |

The automatically rescored stored baseline is 147/147. These are re-evaluations
of the original outputs, not fresh model runs. Original Jest exit codes remain
in their execution logs. The language check and pickup-detail requirement are
unchanged; those account for the remaining two final failures. The current
[automatic comparison](../apps/backend/test/prompt-eval/results/reliability-repeat-2026-11-09/comparison.md)
and individual reports use v2; strict originals remain under `strict-word-ban-v1`.
No baseline case invoked a plan, so the comparison measures the combined
implementation and cannot establish planning's independent contribution.
