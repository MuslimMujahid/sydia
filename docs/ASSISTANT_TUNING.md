# Assistant tuning: findings and open work

Status of the prompt, tool, and memory tuning done in November 2026, written so the work can be resumed in a new session. Last updated 8 November 2026 (`main` at `b1d18c0`, plus branch `fix/note-lookup-routing`).

## What was done

| Area                  | Change                                                                                                                                                                                                                                                                                                                                       | Commits                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Prompt audit fixes    | Background prompts aligned with how their output is parsed; current request reserved before history; context budget raised to 12000; `NO_ACTION` replies stay silent; dream extraction retries malformed output; summarizer and note-agent gaps closed; requested note names win over near-match refs                                        | `fc02b47` `5ad4d15` `3997055` `fabcc4b` `6daf0a9` `59d0fc0` `4549778` |
| Memory policy         | "catat" means notes, "ingat" is an explicit memory request; anything worth remembering on any topic is kept (people, weeks-relevant facts, events, sensitive topics); bare transaction or measurement records stay in notes. Single source: `src/modules/memories/memory-retention-policy.ts`                                                | `19b63c1`                                                             |
| Suggestion rule       | The unsolicited-suggestion rule is stated once                                                                                                                                                                                                                                                                                               | `4b17648`                                                             |
| Prompt eval           | Regression evaluation with hard checks and a baseline (`test/prompt-eval`)                                                                                                                                                                                                                                                                   | `27b6d4a` `a1686de`                                                   |
| Main prompt rewrite   | Formatting stated once per channel (new web prompt); policy decompressed; personas ~40% smaller; selected-sources block shortened; memories and excerpts JSON-encoded                                                                                                                                                                        | `960af6b` `9064475` `383f671` `5631605` `3227ffe`                     |
| Tool definitions      | Langfuse traces record offered and called tools and cached tokens; advertised schemas trimmed and capped by a size-budget test; per-turn routing replaced by a two-list tool gate                                                                                                                                                            | `94811c2` `63504d1` `bce044e`                                         |
| Gateways              | Model and decision gateways log error cause chains and retry connection-level failures                                                                                                                                                                                                                                                       | `06af710` `9028ca5`                                                   |
| Named note plus a day | A request naming a note with a day ("…catatan X hari ini") searches for that note instead of reading only the daily note. Tool descriptions state the rule without examples, and an empty `read_daily_note` result says only the daily note was checked (`EMPTY_DAY_SCOPE`). Held-out phrasings no prompt mentions: 6/12 before, 12/12 after | branch `fix/note-lookup-routing`                                      |
| Scheduling            | A clearly identified event is moved directly; ask only when ambiguous                                                                                                                                                                                                                                                                        | `4a791a1`                                                             |
| Memory decisions      | Recalibrated cutoffs against owner-approved examples; imported memories reviewed against the user's own words; evidence quoted across a remember request is kept                                                                                                                                                                             | `549bfee` `9028ca5` `8759450` `229b49c`                               |

## How to verify

All live checks call real models (a few cents each) and need the backend `.env`.

| Check                  | Command (from `apps/backend`)                                                                                                                                                                                                                                                               | Expected                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Prompt eval            | `bun run eval:prompts` (save a new baseline with `PROMPT_EVAL_SAVE_BASELINE=true`)                                                                                                                                                                                                          | No `REGRESSION` rows against `test/prompt-eval/baseline.json` (113/114 at last recording) |
| Memory calibration     | `MEMORY_CALIBRATION_ENABLED=true MEMORY_CALIBRATION_REPORT=/tmp/cal.json node --env-file=.env --experimental-vm-modules node_modules/jest/bin/jest.js --config ./jest.config.mjs --runInBand --testPathPatterns=memory-calibration`                                                         | No missed or lost memories; at most 1 junk fact in 12                                     |
| Evidence selection     | Same pattern with `EVIDENCE_SELECTION_ENABLED=true EVIDENCE_SELECTION_REPORT=/tmp/ev.json` and `--testPathPatterns=evidence-selection`                                                                                                                                                      | Every case passes                                                                         |
| Memory policy contract | `HINDSIGHT_POLICY_CONTRACT_KEY=<model key> HINDSIGHT_POLICY_CONTRACT_BASE_URL=<model base url>` with `src/modules/memories/memory-policy.live.spec.ts`                                                                                                                                      | 15/15 (one known flaky case, see open work)                                               |
| Hindsight end-to-end   | `test/hindsight/memory-evaluation.live.spec.ts` and `memory-chat.live.spec.ts` under `scripts/test-lock.sh`; they need a database named `sydia_hindsight_ledger_contract*` (one exists on the local dev Postgres) and the `HINDSIGHT_*_CONTRACT_*` variables mapped from the backend `.env` | Evaluation 3/3; chat passes about half the time (see open work)                           |

Do not record a prompt-eval baseline from a run with gateway failures. On this development machine (WSL), connections to model providers intermittently time out, mostly on the first call of a process (`AggregateError(ETIMEDOUT)` or `UND_ERR_CONNECT_TIMEOUT` in the logs). Check the logged cause and rerun before treating a failure as a regression.

## Findings

### Prompts

- A long English rule added to the system policy made short Indonesian chats drift into English replies (4 of 10 runs for "Btw aku sekarang udah vegetarian"). Removing it restored 12/12. Run the language scenarios after any system-prompt change.
- The prompt-eval Indonesian check now recognises casual words (`kalau`, `aja`, `buat`, `nggak`…). A reply that mixes English and Indonesian can pass it.

### Tool definitions and caching

- 62 tools cost about 24k input tokens in full (measured on deepseek flash, about 4 bytes per token). Schemas are about half the bytes, descriptions about 43%. Notes tools are a third of the total.
- On OpenRouter (InferenceNet), any change to the tool list or system prompt drops the prompt cache to zero; an identical prefix is about 99.9% cached. Tool order within the list does not help. Cached input costs about 8% of uncached ($0.008 vs $0.103 per million tokens on InferenceNet).
- Hence the tool gate: a turn whose every tool group is confidently irrelevant gets the five always-available tools, any other turn gets every tool (`BACKEND_TOOL_GROUP_SELECTION_MODE=enabled`). The eval passed with every tool offered on every turn.
- The schema size budget test is `src/modules/conversations/services/advertised-tool-schema.spec.ts` (89,000 bytes; 88.3k at last measurement).

### Memory decisions (Jev)

- With one fact cutoff of 0.85, two thirds of approved memories were rejected: the evidence-coverage recheck scores genuine facts 0.66–0.90.
- Current cutoffs: eligibility skip at ≤ 0.5; fact evidence checks (grounding, span support, coverage) ≥ 0.5; durability ≥ 0.75. `factAllow` is retired and ignored.
- Durability 0.8 was too tight: ordinary facts score 0.79–0.83, and one rejected fact rejects every fact from its message (review is all or nothing per batch).
- At 0.75 the bare amount next to an event ("spent 150,000 on fuel" alongside "travelling home to Solo") is usually kept; Jev scores it 0.74–0.81.
- Facts judged against their own stored third-person text score far lower than against the user's words (a mentor's profession: 0.44–0.57 vs 0.91 for a similar first-person fact).
- The pipeline's expensive steps (evidence selection, extraction) run before the fact cutoff, so lowering the cutoff adds little cost. Recall is capped at 800 tokens per turn regardless of memory count.

### Evidence selection

- On the main model (`deepseek-v4.1-flash`), evidence selection itself is good: 19 of 20 approved cases passed on first measurement. The live specs that use `qwen3.8-flash` fail more often and do not reflect production.
- The failing case was our validation: a quote spanning a fact and the following "ingat" message was discarded. It is now split at message boundaries.

## Owner decisions

- "catat" saves to notes; "ingat" is an explicit memory request; neither stops automatic memory when something is worth remembering.
- Remember people in the user's life, facts that matter for weeks, events and experiences, and sensitive topics like any other topic. Bare transaction or measurement records are notes only.
- Prompt eval: hard checks only, no LLM judge, 3 runs per scenario; the preferred address need not appear in every reply; tips next to task lists are fine.
- Meetings: move a clearly identified event directly; confirm only when ambiguous (for example, two meetings tomorrow).
- Calibration, evidence-selection, and eval scenarios were approved by the owner on 7 November 2026.

## Production configuration to apply

```
BACKEND_TOOL_GROUP_SELECTION_MODE=enabled
BACKEND_DECISION_THRESHOLDS_JSON={"eligibilitySkip":0.5,"recallInclude":0.6,"toolInclude":0.6,"factEvidence":0.5,"factDurable":0.75}
BACKEND_DECISION_CALIBRATION_VERSION=owner-approved-20261107
```

## Open work

Roughly in priority order.

1. **Intermittent delivery-stage fact rejections.** `memory-chat.live.spec.ts` passed 2 of 4 runs. One run rejected 2 Hindsight-extracted facts at the delivery stage (not captured which). Another rejected a correction because evidence selection picked only "preferred language", not "English" (that run used `qwen3.8-flash`). Next: capture the rejected candidates and scores, and rerun with the main model.
2. **People-in-life facts in third person.** Jev scores durability of facts such as "Rina, the user's mentor, is a ceramic artist" at 0.44–0.57, below the cutoff, when the evidence is not in the user's words. Backfill now uses the user's words when available; dashboard-created memories have none. Consider adding third-person examples to the calibration set and clarifying the durability question.
3. **Bare amounts next to events are usually kept** at durability 0.75. Accepted trade-off; revisit if users see transaction memories.
4. **Photos without text are described in English.** The media service needs the user's locale (`openrouter-media.service.ts`).
5. **Field descriptions (~27k bytes) are the largest remaining part of the tool definitions.** Trim under the prompt eval.
6. **Note-writing tools appear mid-turn after `load_skill`,** which changes the tool list and misses the cache for the following steps. Once Langfuse has cache-hit data (`input_cached_tokens`, `toolsOffered`), decide whether to offer them from the start and refuse them in code until `note-capture` is loaded.
7. **The `note-capture` skill** was not rewritten; it needs eval scenarios first.
8. **Conversation summary placement** (above history) was not measured.
9. **Pipeline cost per message** (evidence selection, extraction, consolidation) was not measured.
10. **Privacy notice** should be checked to cover sensitive topics now being remembered (owner or legal).
11. **Live suites with failures that predate this work:** 11 in the notes live suite.
12. **`memory-policy.live.spec.ts` "Indonesian remember request"** fails about 2 of 3 runs because `qwen3.8-flash` returns no evidence; it passes on the main model in the evidence-selection check. Consider switching the live specs to the configured main model.
13. **Langfuse metadata from the new tracing has not been seen in a real trace yet.** Confirmed on 8 November 2026: traces carry `toolsOffered`, `toolsOfferedCount` and `toolsCalled`. The public traces endpoint (`GET /api/public/traces`) is removed on 16 November 2026; use `GET /api/public/v2/observations`.
14. **A detail that fits no table column.** Measured with outcome checks (no phrase matching) on the user's order case and a held-out stock case the guidance never names. Stock ("belinya dari Toko Makmur", no supplier column): the model saves the row, leaves the price empty, and asks whether to add a supplier column (3/3). Orders ("ambil sendiri", no delivery column): the pickup goes under Pembayaran or Alamat Kirim (3/3). A general rule in the `note-capture` skill or in the `add_record_rows` description ("put a value only in the matching column; add an optional column for a detail that fits none") changed neither case (0/6 both times), so neither was kept. Rules must not name a test case; `capture-stock-new-column` is held out for that reason. Open question for the owner: is asking before adding a column acceptable, or must it be added automatically?
15. **Placeholder values in tables.** The earlier note that the eval did not reproduce this was wrong: that check matched only known phrases. With an outcome check (the payment cell must stay empty) the order case writes "Belum disebut" in 2 of 3 runs, while the reply tells the user the payment is still empty. The reply contradicts what was saved.
16. **"Today" inside a named table.** For "Buka catatan pemesanan hari ini" the model now finds the order table every time, but in 2 of 3 runs it lists every row, including yesterday's, instead of filtering by date with `query_record_notes`.
17. **Evaluating prompt changes.** A rule that quotes a test message only proves the model can copy it. Write rules without examples taken from scenarios, check outcomes rather than phrases, and measure on held-out scenarios (the `stockLookup` set and `capture-stock-new-column`) before and after.
