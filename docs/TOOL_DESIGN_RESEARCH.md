# Tool design: granularity, exposure, and recovery

Research date: 9 November 2026. Sydia revision inspected: `cd27a64`.

This compares how three open-source agents shape and offer their LLM tools, and what Sydia should adopt. [Agent execution reliability research](./AGENT_EXECUTION_RELIABILITY_RESEARCH.md) already covers the same projects' reasoning settings and plan tools, so this document leaves those out.

Reference revisions:

- OpenClaw [`f615e96`](https://github.com/openclaw/openclaw/tree/f615e96b55becb3944b57de4e8af74a801814fab)
- Nakama [`891ee93`](https://github.com/ahmadrosid/nakama/tree/891ee93dfe92af701a06057166a40a74afe22367)
- OpenDots [`d4214af`](https://github.com/CopilotKit/OpenDots/tree/d4214aff10f066911f3253cb3cb870764cd51a9f)

Tool counts below are tallies from reading the source and are approximate. Quoted comments and code were checked at the linked lines.

## Recommendation

In priority order:

1. **Detect repeated failing tool calls.** Block a call after the same tool fails with the same arguments three times in a row, then give the model one turn to recover or explain.
2. **Keep the tool list fixed within a turn.** Offer the note-writing tools from the start, and refuse them in code until `note-capture` is loaded.
3. **Fix common argument mistakes in one shared step**, and return validation errors that name the field and show the received arguments.
4. **Add an `ask_user` tool** for structured questions that end the turn, together with candidate lists for ambiguous references.

Each one can be measured with the existing prompt eval.

Keep one tool per action for tasks, reminders, notes, calendar, and memory. None of the reference projects shows that combining actions into one tool improves reliability. Where Sydia combines actions, as `manage_notes_item` does, it already uses the shape that all three projects converge on.

Owner decision (9 November 2026): web search and web fetch are out of scope for now, even though all three projects have them.

## Granularity: one tool per action or one tool with an `action` field

| Project  | One tool per action                                                                                      | One tool with an `action` field                                                                                     |
| :------- | :------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| OpenDots | All of its own tools                                                                                     | 0                                                                                                                   |
| Nakama   | About 55 core and server tools, plus every plugin action                                                 | 2: `email` and `skill_manage`                                                                                       |
| OpenClaw | About 25 core tools and about 45 plugin tools, including the task board, the LanceDB memory and the wiki | About 20, mostly control areas: `message` (about 50 channel actions), `automations`, `gateway`, `nodes`, `sessions` |

The pattern: user-data domains with frequent, consequential writes get one tool per action. Admin and control areas, or areas where many actions act on the same object, get one tool with an `action` field. None of the projects writes down why a domain got one style or the other.

Examples of keeping actions separate:

- **OpenDots** has one internal dispatcher for its computer actions, but shows the model 12 separate tools, each with its own strict schema ([`computer-types.ts`](https://github.com/CopilotKit/OpenDots/blob/d4214aff10f066911f3253cb3cb870764cd51a9f/src/shared/computer-types.ts#L49), [`computer-tools.ts`](https://github.com/CopilotKit/OpenDots/blob/d4214aff10f066911f3253cb3cb870764cd51a9f/src/server/computer-tools.ts)).
- **Nakama's Google Meet integration** does the same.
- **OpenClaw's task board** splits every action into its own tool (`workboard_*`), as do its LanceDB memory plugin (`memory_recall`, `memory_store`, `memory_forget`) and its wiki plugin.

### The schema shape all three agree on

A tool that combines actions is always one flat object: `required` contains only `action`, and each field's description names the action it belongs to (for example "Required for action=send"). Required fields for each action are checked at run time and come back as a plain error. None of the projects uses `oneOf` or `anyOf` for the actions, because providers reject it:

- Nakama, [`email.ts:65`](https://github.com/ahmadrosid/nakama/blob/891ee93dfe92af701a06057166a40a74afe22367/packages/core/src/tools/email.ts#L65): providers "reject with 400 invalid_function_parameters — blocking all chat when email is enabled. Keep `emailInputSchema` for runtime parsing; expose a flat object schema to LLMs."
- OpenClaw, [`message-tool-schema.ts:527`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/src/agents/tools/message-tool-schema.ts#L527): "Keep one flat object: provider adapters reject per-action anyOf/oneOf schemas."
- OpenClaw, [`cron-tool-schema.ts:365`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/src/agents/tools/cron-tool-schema.ts#L365): "Flattened schema: runtime validates per-action requirements."
- OpenClaw also writes enums as plain `enum` lists rather than unions ([`string-enum.ts`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/src/agents/schema/string-enum.ts)).

OpenClaw also shrinks a combined tool to fit the situation: the `message` actions depend on which channels are connected, and the cron schema shrinks when a run may only manage its own jobs.

### For Sydia

- Keep one tool per action for the main domains. Each write then keeps its own description, read-only flag, approval path, and terminal-response formatter (`terminal-tool-response.ts`).
- `manage_notes_item` already matches the shared shape (flat schema, `required: ['action']`).
- The only candidates to merge are the four category tools and the five contact-group tools. Merging them would save some tokens but fixes no known failure, and it empties the prompt cache once. Low priority.

## Exposure: which tools each turn sees

### OpenClaw: a fixed list, with permissions checked when a tool runs

Within a session, OpenClaw's tool definitions depend only on session and configuration facts. Per-turn permission is enforced when a call executes ([`AGENTS.md:69`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/AGENTS.md#L69), [prompt caching contract](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/docs/reference/prompt-caching.md)):

> Per-turn authority gates calls through `gateAgentToolExecution`, and per-turn facts go in that turn's message.

A test, `agent-tools.prefix-stability.test.ts`, holds the project to this.

Tool profiles (`minimal`, `coding`, `messaging`, `full`) and tool groups are combined with allow and deny lists set globally, per agent, per provider, and per sender ([tool policy](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/docs/gateway/config-tools/tool-policy.md)).

Tool search is on by default ([`tool-search-config.ts`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/src/agents/tool-search-config.ts#L11)):

- The model sees a directory of tool names and descriptions in the cached part of the prompt, plus three tools: `tool_search`, `tool_describe`, and `dispatch_action`.
- Tools found by search are called through `dispatch_action`, so the tool list itself never changes.
- Core coding tools and `message` are always offered directly. For local models on Ollama, memory search is offered directly too ([`tool-surface-plan.ts`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/src/agents/tool-surface-plan.ts)).

### Nakama: tools per profile, with optional lazy loading

Tools are assigned per profile, and the turn type removes some (automation and sub-agent turns get no questions or plans).

[`find_tools`](https://github.com/ahmadrosid/nakama/blob/891ee93dfe92af701a06057166a40a74afe22367/packages/agent/src/tool-loop.ts#L60) holds back any tool with a `discoveryGroup`:

- The model sees a short catalog in the tool description and can load up to five definitions per search, by keyword match.
- Plugins are always loaded this way. For external MCP tools, this lazy loading is off by default "while model accuracy is evaluated" (`docs/mcp.mdx`).
- [`mcp-tool-bridge.llm.test.ts`](https://github.com/ahmadrosid/nakama/blob/891ee93dfe92af701a06057166a40a74afe22367/apps/server/src/services/mcp-tool-bridge.llm.test.ts) compares lazy loading (one tool) with offering all 24 tools on the same scenario.

Nakama found that more tools can hurt small models ([`agent-service.ts:6387`](https://github.com/ahmadrosid/nakama/blob/891ee93dfe92af701a06057166a40a74afe22367/apps/server/src/services/agent-service.ts#L6387)): injecting 16 helper tools "makes small local models print a fake tool call as plain text instead of doing the work."

### OpenDots: tools assembled from permissions

Each turn, OpenDots builds its tool list from permission flags. A `check()` runs every 100 ms and before and after each tool, and aborts the run when settings, permissions, or connections change ([`dot-agent.ts:137`](https://github.com/CopilotKit/OpenDots/blob/d4214aff10f066911f3253cb3cb870764cd51a9f/src/server/dot-agent.ts#L137)). External connection tools are looked up again when called, so a tool the owner just disabled is refused.

### For Sydia

Sydia offers 62 tools, about 24k input tokens. The tool gate gives either the five always-available tools or every tool. `load_skill` then makes the note-writing tools available partway through a turn (`turn-tool-discovery.ts`). This changes the tool list, which empties the OpenRouter prompt cache for the rest of the turn (open item 6 in [assistant tuning](./ASSISTANT_TUNING.md)).

OpenClaw's rule settles the option that item already lists: offer the note-writing tools from the start and refuse them in the tool executor until `note-capture` is loaded. The refusal should name the skill to load, so the model can recover in one step.

A deferred tool directory in the style of OpenClaw is the next step if tool count keeps growing. It is unproven on `deepseek-v4.1-flash`, though: every deferred call costs an extra step through `dispatch_action`, and Nakama keeps its equivalent off for MCP for accuracy reasons. Try it only behind the prompt eval.

## Recovery from bad tool calls

### 1. Repeated failing calls

OpenClaw always blocks a call after three consecutive identical failures (same tool, arguments, and error), then allows one recovery turn ([loop detection](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/docs/tools/loop-detection.md)).

Optional detectors keep a history of 30 calls and warn at 10 or stop at 20 for these patterns ([`tool-loop-detection.ts:56`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/src/agents/tool-loop-detection.ts#L56)):

- the same call repeated
- two calls alternating
- polling without progress
- unknown tools
- repeated errors

Results are compared with volatile IDs removed, so a new message ID does not count as progress.

Nakama and OpenDots have no equivalent. Neither does Sydia. Tuning item 16 recorded the model repeating a refused `query_record_notes` call "until its step budget ran out, leaving an empty reply." That case was fixed for one argument. A guard in `ToolExecutorService` would cover every tool.

### 2. Common argument mistakes

OpenClaw converts primitive values before validating (`"10"` → 10, `"true"` → true) ([`validation.ts:125`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/packages/llm-core/src/validation.ts#L125)). It also accepts known alternative names (`max_results` and `limit` for `maxResults`), and it recovers cron fields that a model put next to the action arguments instead of inside them ([`cron-tool-canonicalize.ts:416`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/src/agents/tools/cron-tool-canonicalize.ts#L416)).

When validation still fails, the model gets every failing field path plus the arguments it sent ([`validation.ts:417`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/packages/llm-core/src/validation.ts#L417)).

Sydia fixes mistakes for each tool separately; the stray top-level `id` dropped from `query_record_notes` is one example. Tool errors are cut to 240 characters (`MAX_TOOL_ERROR_LENGTH`, `tool-executor.service.ts:99`), which can drop the field that failed. Use one shared step before `parseArguments`, and give validation errors a separate, larger limit.

### 3. Ambiguous references

OpenClaw's `memory_forget` deletes only when exactly one memory scores above 0.9. Otherwise it returns `Found N candidates. Specify memoryId:` followed by the list ([`memory-lancedb/index.ts:478`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/extensions/memory-lancedb/index.ts#L478)).

At revision `cd27a64` Sydia was inconsistent here:

- `delete_reminder` refused when several reminders matched, but its error did not list them, so the model needed another call to show options.
- `update_task` and `update_reminder` resolved `query` through `findReference`, which silently took the most recently updated title match. A second matching task was changed without asking. With neither `id` nor `query`, the same lookup ran without a filter and updated the most recently changed item.

**Fixed (9 November 2026)** in `tool-references.ts`. All three tools now share one resolution step:

- **`id` or `query` is required.**
- **Ranking:** an exact title beats a title containing the query, which beats a match only in the description or notes.
- **Several matches left:** the tool changes nothing and returns `ambiguous_reference` with up to five candidates (id, title, owner-local time, a recurring flag for reminders). The candidates are exempt from the 240-character error limit.
- **Repositories:** the `findReference` methods were removed.

This is also the main source of good questions for `ask_user`.

**Prompt eval (9 November 2026, `deepseek-v4.1-flash`).** Four `references` scenarios were added. Their scripted write tools use the production resolution step:

| Scenario                         | What it checks                                                      |
| :------------------------------- | :------------------------------------------------------------------ |
| `task-update-ambiguous-asks`     | An ambiguous "mark it done" makes the model ask instead of guessing |
| `task-update-ambiguous-answered` | The follow-up turn after the user picks one updates only that task  |
| `reminder-update-ambiguous-asks` | An ambiguous reminder update makes the model ask                    |
| `reminder-delete-ambiguous-asks` | An ambiguous reminder delete on WhatsApp makes the model ask        |

- **Result:** all four pass 3/3. The existing task, reminder and scope scenarios are unchanged (36/36 runs in total).
- **The new error never fired.** In every run the model listed first, saw two matches and asked on its own; it never sent an ambiguous query to a write tool.
- **Two probes could not trigger it either:**
  - With the list tool unavailable, the model apologised and stopped (0/6).
  - With a quoted title in the message, it still listed first (0/6).

  Both probes were removed.

The resolution step is therefore a safety net for turns where the model skips the lookup. Its contract is covered by unit tests (`tool-references.spec.ts`), not by the eval.

### 4. Results that say what to do next

The reference projects explain in descriptions and results what a result means and what to call next:

- OpenClaw's automation description says an empty or failed list "does not establish global absence… Never recreate or replace a known automation" ([`cron-tool-description.ts:67`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/src/agents/tools/cron-tool-description.ts#L67)).
- OpenDots errors name the recovery call, for example "This page changed. Reload the latest revision before saving your draft." ([`pages.ts:214`](https://github.com/CopilotKit/OpenDots/blob/d4214aff10f066911f3253cb3cb870764cd51a9f/src/server/pages.ts#L214)).

Sydia does this in places (`create_contact_group` explains that an existing group is returned) but not consistently. Apply it when touching a tool, rather than as a separate project.

### Already in Sydia

- Idempotency keys per input message and tool call (`tool-executor.service.ts:394`). OpenClaw derives the same kind of key for `message`, and its task board asks the model to reuse an `idempotencyKey` on retries.
- An approval flow through `prepare_action` and `respond_to_action`. This is close to OpenDots' stored-arguments approval ([`connection-tools.ts:29`](https://github.com/CopilotKit/OpenDots/blob/d4214aff10f066911f3253cb3cb870764cd51a9f/src/server/connection-tools.ts#L29)).
- Note revisions, which work like OpenDots' `expectedRevision`.
- Descriptions that mark returned content as user data, never instructions.

## `ask_user`: structured questions

### How the reference projects do it

**OpenClaw [`ask_user`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/src/agents/tools/ask-user-tool.ts)** waits inside the tool call for an answer:

- It asks 1–3 questions with 2–4 options each ([`ask-user-tool-normalization.ts`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/src/agents/tools/ask-user-tool-normalization.ts)).
- It waits up to 900 seconds by default, and returns `no_answer` on timeout.
- Supported messaging channels show native controls for a single question with one choice.

Its description ([`tool-description-presets.ts:188`](https://github.com/openclaw/openclaw/blob/f615e96b55becb3944b57de4e8af74a801814fab/src/agents/tool-description-presets.ts#L188)) sets the policy:

> Use only when blocked on a decision genuinely theirs that cannot be resolved from the request, code, or sensible defaults; never ask whether to proceed or confirm a plan. Ask exactly one question per call unless several answers must be submitted together… Put every selectable choice in `options`… Put the recommended option first… Do not include an Other option; free text is added automatically. If the result is no_answer, continue with best judgment.

**Nakama [`ask_user_question`](https://github.com/ahmadrosid/nakama/blob/891ee93dfe92af701a06057166a40a74afe22367/apps/server/src/tools/ask-user-question-tool.ts)** does not wait. It works like this:

1. It saves the questions for the session.
2. It returns "Wait for the next user message before continuing", and the turn ends ([`chat.ts:1246`](https://github.com/ahmadrosid/nakama/blob/891ee93dfe92af701a06057166a40a74afe22367/packages/agent/src/chat.ts#L1246)).
3. On text channels the questions become a numbered list with lettered options and "Or reply with your own answer" ([`agent-questionnaire.ts`](https://github.com/ahmadrosid/nakama/blob/891ee93dfe92af701a06057166a40a74afe22367/packages/core/src/agent-questionnaire.ts)).
4. The recommended choice is marked by a `(Recommended)` suffix on its label, not by a schema field.

Its prompt rules apply only when the tool is offered ([`chat-prompt.ts:221`](https://github.com/ahmadrosid/nakama/blob/891ee93dfe92af701a06057166a40a74afe22367/packages/agent/src/chat-prompt.ts#L221)):

> A broad or vague request is not a reason to ask. Pick the most common reading, do the work, state your assumption in one line, and offer to adjust. Ask the user only for facts you cannot guess or find with your tools (a private link, a name, a date), or before an action that is hard to undo. When you do ask, call ask_user_question. Do not ask questions in plain reply text.

OpenDots has no general question tool. Its human-in-the-loop cards are only for approving actions and reviewing pages.

### Proposed shape for Sydia

Follow Nakama's approach, because WhatsApp and Telegram answers arrive as later messages. Do not follow OpenClaw's blocking wait: a WhatsApp answer can arrive hours later, and a turn should not stay open waiting for it.

- **A terminal tool.** Add `ask_user` to `TERMINAL_TOOL_NAME_LIST` so the turn ends with a rendered question and no second model call.
- **Render per channel:**
  - web: options as buttons
  - Telegram and WhatsApp: a numbered list with "or reply in your own words"
  - Sydia has no channel buttons today, so Telegram inline keyboards are a later improvement.
- **Schema:**
  - one question per call
  - 2–4 options, recommended option first
  - optional `allowFreeText`
  - no "Other" option
  - question and options in the user's language
  - keep it flat
- **The pending question** is stored for each conversation:
  - A reply that is an option number or label is matched to the question, and the next turn's context gets `Q: … / A: …`.
  - Any other reply is an ordinary message, so the user can change the subject.
  - The pending question expires after a set time.
- **Prompt rules** (only when the tool is offered): Nakama's "vague request is not a reason to ask" rule, and OpenClaw's "never to confirm a plan or ask whether to proceed".
- **Plain-text questions stay allowed at first.** Nakama forbids them, but Sydia's conversational replies on WhatsApp already ask closing questions (`whatsapp-message-formatting.md`). Forbid them only if the eval shows a benefit.
- **Boundaries with existing tools:**
  - Offers of saved-data changes stay with `prepare_action` and `respond_to_action`.
  - Note questions stay with `respond_to_note_question`.
  - `ask_user` is for blocking decisions only.

### Where it should apply

- An ambiguous reference with candidates, from "Ambiguous references" above.
- A missing fact that tools cannot find, such as a date or time a reminder needs.
- A local time skipped or repeated by daylight saving (`scheduling/availability-rules.md`).
- A detail that fits no table column, where asking before adding a column is acceptable (tuning item 14).

### How to evaluate

Add prompt-eval scenarios in pairs, and check outcomes, not wording:

- **Asking is right:** two tasks match the reference, or a required time is missing.
- **Asking is wrong:** a vague request with a common reading, a single clear match, or the user stating a fact.

Measure the ask rate on the existing eval before and after, and run the Indonesian language scenarios, because both projects' rules were written in English. Keep held-out scenarios the rules never name ([tuning item 17](./ASSISTANT_TUNING.md)).

## Other tools the projects have in common

- **Search over past conversations.** OpenClaw has `sessions_search` and `sessions_history`. Sydia's `get_work_context` already returns the user's earlier statements from other conversations, so this is low priority.
- **Scheduled agent runs with delivery.** Nakama's `create_automation` takes a `trigger` (one-off, recurring, or cron, with timezone) and a `delivery` channel. Compare it with the [proactive secretary spec](./PROACTIVE_SECRETARY_SPEC.md) before adding anything.
- **Not recommended now:**
  - sending messages to other people on the user's behalf (OpenClaw's `message` and `conversations_send`)
  - sub-agents
  - shell, browser, and computer tools

  They carry high risk or fall outside a secretary's scope.
