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
- terminal tool acknowledgements (`buildTerminalToolResponse`);
- the configured model (`BACKEND_MODEL_NAME`).

Only data is synthetic: every other tool returns the result the scenario
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
```

Output goes to `test/prompt-eval/results/latest.json` and `latest.md`
(git-ignored). Runs are traced to Langfuse under `prompt-eval.<scenario>`
when Langfuse keys are configured.

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
