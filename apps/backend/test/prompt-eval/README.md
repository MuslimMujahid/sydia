# Prompt evaluation

A fixed set of chat turns run against the real model, used to check that
prompt and tool-description changes do not regress assistant behaviour.

## What runs

Each scenario goes through the same path as a production chat turn
(`AssistantOrchestratorService`'s generate node):

- the real `ContextBuilderService` (system policy, persona, channel rules,
  skill catalog, assistance state, profile, history, summary, memories);
- real Jev tool routing (`TurnDecisionService`), unless `PROMPT_EVAL_ROUTING=off`;
- the real tool definitions, descriptions, and schemas from `DomainToolsProvider`,
  with `load_skill` executed for real;
- main-thread reasoning, output/step/deadline budgets, and completion checks
  (`generateAssistantTurn`), shared with production;
- internal execution plans (`update_plan`), persisted in memory for each case;
- terminal tool acknowledgements (`buildTerminalToolResponse`);
- the configured model (`BACKEND_MODEL_NAME`).

Only data is synthetic: domain tools return the result the scenario
scripts for it. Nothing touches the database or a messaging channel, so the
shared test lock is not needed. A tool the model calls without a script
returns "no data available" and is listed as `unscripted` in the report.

## Running

From `apps/backend`, with a dev `.env` (model key, decision key, Redis):

```bash
bun run eval:prompts                                   # all scenarios, 3 runs each
PROMPT_EVAL_ONLY=memory bun run eval:prompts           # one area or scenario ids (comma-separated)
PROMPT_EVAL_RUNS=1 PROMPT_EVAL_ROUTING=off bun run eval:prompts
PROMPT_EVAL_SAVE_BASELINE=true bun run eval:prompts    # record the baseline
PROMPT_EVAL_CELL_REVIEW=off bun run eval:prompts       # without the table value review
PROMPT_EVAL_DAY_SCOPE=enabled bun run eval:prompts     # with the day-scope turn question
BACKEND_ASSISTANT_PLANNING_ENABLED=false bun run eval:prompts # disable internal plans
BACKEND_ASSISTANT_REASONING_EFFORT=none bun run eval:prompts  # disable main reasoning
```

Row writes go through the production table value review
(`RecordCellReviewService`) against the real decision model, using the
scenario's scripted `get_record_note_metadata`. A refused write is listed under
`refused` in the results and never reaches the scripted tool.

Output goes to `test/prompt-eval/results/latest.json` and `latest.md`
(git-ignored). Runs are traced to Langfuse under `prompt-eval.<scenario>`
when Langfuse keys are configured.

Reports also record execution settings and per-run duration. A provider that
does not return billing leaves cost unavailable. Additional multi-outcome and
simple-turn checks run separately without changing the approved baseline:

```bash
RELIABILITY_EVAL_ENABLED=true node --env-file=.env --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.mjs --runInBand --testPathPatterns=execution-reliability.live
```

## Pass and regression rules

Checks are deterministic (tools called and their arguments, text that must or
must not appear, channel formatting, reply language, length). A run passes when
all its checks pass. Each scenario runs 3 times and reports passed runs.

A run that fails with a model gateway error (a provider hiccup, not prompt
behaviour) is retried up to twice; the report shows the retry count, and a run
that still fails counts as failed.

Against `baseline.json`, a scenario that loses 2 or more passing runs is a
**regression** and fails the eval; losing 1 run is reported as possible noise.

## Changing scenarios

Expected outcomes in `scenarios.ts` are reviewed and approved by the product
owner. After changing a scenario or approving a behaviour change, re-record
the baseline with `PROMPT_EVAL_SAVE_BASELINE=true`.

The owner subsequently clarified that correctly attributed historical rows are
acceptable additional context in a date-scoped answer. The automatic
`date-attribution-v2` check replaces the former date word bans. It recognises ISO
dates, English/Indonesian month names, relative dates and historical headings;
it checks requested rows and explicitly claimed IDR totals/row counts. Unknown
attribution fails visibly for review. This bounded text check is not a general
semantic judge. See the [acceptance rule](../../../../docs/PROMPT_EVAL_DATE_SCOPE_RUBRIC.md).

Check-only corrections can replay saved outputs without new inference. From
`apps/backend`, list the baseline first, then the reports to update:

```bash
bun run test/prompt-eval/rescore-cli.ts test/prompt-eval/results/strict-word-ban-v1 test/prompt-eval/baseline.json test/prompt-eval/results/latest.json
bun run test -- --runInBand --testPathPatterns='date-attribution.spec.ts|rescore.spec.ts'
```

The replay validates inputs, preserves original JSON/Markdown in the backup
directory, records source hashes and scoring versions, and checks every dated
answer. Tool calls, model text, usage, timing and other failed checks remain intact.
New live reports record the fixture date for future replay. The stored baseline
and six archived comparison suites have been automatically rescored under v2.
