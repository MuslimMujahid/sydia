# Agent execution reliability: thinking and task plans

Research date: 9 November 2026. Sydia revision inspected: `1d9f7d44e51ab577a186369c741b03fcab5d87a2`.

The researched design is now implemented. See [implementation and validation](./AGENT_EXECUTION_RELIABILITY.md) for configuration, safeguards, and measured results. The research below records the rationale and reference implementations.

## Recommendation

Implement both changes within Sydia's existing model gateway and conversation orchestrator:

1. Enable reasoning for the main conversation generation with a request-specific setting and a larger output budget.
2. Add a persistent internal `update_plan` tool for substantial multi-step requests, restore unfinished plans into context, and check the plan before finalizing a turn.

The most useful combination is Nakama's persisted checklist and prompt restoration with OpenClaw's bounded completion check. Neither requires replacing Sydia's AI SDK tool loop or LangGraph orchestration. OpenDots provides useful execution safeguards, but its inspected application source does not implement a dedicated internal todo tool.

These changes address missed steps and premature stopping. They cannot guarantee correct interpretation, correct tool results, or exactly-once external effects. Sydia's existing date-scope, evidence, permission, and idempotency mechanisms still matter.

## What the reference projects actually implement

### OpenClaw

Revision: [`1bc50e0`](https://github.com/openclaw/openclaw/tree/1bc50e0517adf5c4cb8bd025802d55208e9c6318).

**Thinking:** settings resolve from the current message, session, agent/model defaults, and global/provider defaults. Supported levels and their transport mapping depend on the provider and model. Thinking effort and reasoning visibility are separate controls. See [thinking documentation](https://github.com/openclaw/openclaw/blob/1bc50e0517adf5c4cb8bd025802d55208e9c6318/docs/tools/thinking.md) and [OpenRouter thinking policy](https://github.com/openclaw/openclaw/blob/1bc50e0517adf5c4cb8bd025802d55208e9c6318/extensions/openrouter/thinking-policy.ts).

**Planning:** the current tool is `progress_card`; `update_plan` is retained as a policy alias. It replaces a durable session card through `progressCard.put`. The card can contain an ordered checklist, Markdown status, or both. Checklist statuses are `pending`, `in_progress`, and `completed`, with at most one active item. The tool asks for substantial work with at least two meaningful sequential steps and discourages invented steps for trivial requests. See [tool implementation](https://github.com/openclaw/openclaw/blob/1bc50e0517adf5c4cb8bd025802d55208e9c6318/src/agents/tools/progress-card-tool.ts) and [configuration](https://github.com/openclaw/openclaw/blob/1bc50e0517adf5c4cb8bd025802d55208e9c6318/docs/gateway/config-tools/built-in-tools.md#toolsupdateplan).

**Completion check:** a successfully saved unfinished checklist updates run state. Before ordinary finalization, the runtime can inject one hidden follow-up asking the model to continue feasible authorized work or explain the blocker. It keeps the existing transcript and completed effects. The check is consumed across retries and does not override aborts, timeouts, refusals, queued messages, or other continuation owners. This is bounded guidance, not a guarantee that every step will finish. See [stream preparation](https://github.com/openclaw/openclaw/blob/1bc50e0517adf5c4cb8bd025802d55208e9c6318/src/agents/embedded-agent-runner/run/attempt-stream-prepare.ts) and [completion tests](https://github.com/openclaw/openclaw/blob/1bc50e0517adf5c4cb8bd025802d55208e9c6318/src/agents/embedded-agent-runner/run/attempt-plan-completion.test.ts).

**Apply to Sydia:** separate effort from display; make plan state part of completion decisions; continue from observed effects instead of restarting the user request.

### Nakama

Revision: [`7de5561`](https://github.com/ahmadrosid/nakama/tree/7de55613555b68d0090c233d4228d98700c1faaa).

**Thinking:** workspace settings resolve into provider options. Providers normalize effort and map it to their supported request format. The implementation includes provider/model compatibility handling rather than assuming that every endpoint accepts the same field. See [agent service](https://github.com/ahmadrosid/nakama/blob/7de55613555b68d0090c233d4228d98700c1faaa/apps/server/src/services/agent-service.ts), [effort capabilities](https://github.com/ahmadrosid/nakama/blob/7de55613555b68d0090c233d4228d98700c1faaa/packages/core/src/thinking-effort.ts), and [compatible-provider request builder](https://github.com/ahmadrosid/nakama/blob/7de55613555b68d0090c233d4228d98700c1faaa/apps/server/src/providers/openai-compatible/index.ts).

**Planning:** `todo_write({ merge, todos })` creates/replaces a plan or merges updates by stable item ID. Each item has `id`, `content`, and `status`: `pending`, `in_progress`, `completed`, or `cancelled`. It is intended for requests with three or more distinct steps. See [tool implementation](https://github.com/ahmadrosid/nakama/blob/7de55613555b68d0090c233d4228d98700c1faaa/apps/server/src/tools/todo-tools.ts).

The [state service](https://github.com/ahmadrosid/nakama/blob/7de55613555b68d0090c233d4228d98700c1faaa/apps/server/src/services/agent-todo-state.ts) limits a session to 20 todos, caches and persists them, and normalizes multiple active items back to one. An entirely completed/cancelled plan is cleared. The [database adapter](https://github.com/ahmadrosid/nakama/blob/7de55613555b68d0090c233d4228d98700c1faaa/packages/db/src/adapters/sqlite.ts) stores JSON in `sessions.agent_todos`.

The agent service adds an `Active Task Plan` section to later context. [Prompt guidance](https://github.com/ahmadrosid/nakama/blob/7de55613555b68d0090c233d4228d98700c1faaa/packages/agent/src/chat-prompt.ts) asks the model to keep one task active and continue unfinished work unless redirected. [Turn events](https://github.com/ahmadrosid/nakama/blob/7de55613555b68d0090c233d4228d98700c1faaa/apps/server/src/services/turn-runner.ts) publish `todos_updated` after tool execution.

**Completion check:** when the model returns without tool calls, the [chat loop](https://github.com/ahmadrosid/nakama/blob/7de55613555b68d0090c233d4228d98700c1faaa/packages/agent/src/chat.ts) consults `openTodosReminder`. It permits up to two continuation nudges, within the existing iteration/output limits. The reminder asks the model to continue or reconcile remaining todos before its final reply.

**Apply to Sydia:** stable IDs, persistence, context restoration, incremental updates, and bounded continuation. Prefer explicit validation errors over silently changing a malformed plan, and retain completed plan history for diagnosis instead of immediately deleting it.

### OpenDots

Revision: [`d4214af`](https://github.com/CopilotKit/OpenDots/tree/d4214aff10f066911f3253cb3cb870764cd51a9f).

The [main Dot agent](https://github.com/CopilotKit/OpenDots/blob/d4214aff10f066911f3253cb3cb870764cd51a9f/src/server/dot-agent.ts) uses CopilotKit's `BuiltInAgent` with a TanStack AI factory. Its explicit model options set `max_completion_tokens: 2200`; it does not explicitly configure reasoning effort there. Its tool loop allows five or ten iterations depending on app tools/learned skills, with a turn timeout and checks for permission/configuration changes.

The inspected application source has no dedicated `todo_write`, `write_todos`, or `update_plan` internal planning tool. Its queued background tasks are a different mechanism: the [runner](https://github.com/CopilotKit/OpenDots/blob/d4214aff10f066911f3253cb3cb870764cd51a9f/src/server/runner.ts) claims work with a lease, checks ownership, aborts revoked/timed-out work, and persists outcomes. A UI “thinking” indicator does not establish that model reasoning is enabled.

**Apply to Sydia:** preserve bounded execution, cancellation, and ownership checks. Do not treat background jobs or checklist editor content as an internal agent plan. These findings concern OpenDots' application code; they do not establish every capability of its upstream dependencies.

## Sydia today

### Reasoning is already wired, but defaults to none

[`OpenRouterLanguageModel`](../apps/backend/src/infra/model-gateway/openrouter-language-model.ts) reads `BACKEND_MODEL_REASONING_EFFORT`, accepting `none`, `minimal`, `low`, `medium`, and `high`. It sends OpenRouter `reasoning: { enabled: true, exclude: true, effort }`, or top-level `reasoning_effort` for a custom compatible endpoint. Both the code default and [example configuration](../.env.example) select `none`.

Consequently, changing the environment effort enables the existing control, but it affects every caller of this gateway. [`GenerateRequest`](../apps/backend/src/infra/model-gateway/model-gateway.types.ts) has no request-specific reasoning field. Summarization, note processing, and other gateway consumers would also inherit a global change. This research inspected defaults and example configuration, not deployed settings.

The default output cap is 1,200 tokens per model generation and the tool-loop cap is eight steps. [OpenRouter documents](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) that reasoning usually shares the output budget; a thinking-only length stop can return empty visible text, especially with reasoning excluded. The cap should be revisited alongside effort.

The public OpenRouter model catalog checked during this research identifies `qwen/qwen3.8-flash`, Sydia's code/example default, as reasoning-capable, with optional reasoning and token-budget support. It does not publish a `supported_efforts` list for that entry. This establishes model capability, not that a particular route honors a chosen effort or budget; confirm the actual request and usage in a bounded live check during implementation.

### The execution path needs a plan-aware stopping rule

[`AssistantOrchestratorService.execute`](../apps/backend/src/modules/conversations/services/assistant-orchestrator.service.ts) builds context, runs the AI SDK tool loop through the gateway, and persists success/failure through LangGraph nodes. The generation uses dynamic tool discovery and `acknowledgeTerminalStep`.

[`buildTerminalToolResponse`](../apps/backend/src/modules/conversations/services/terminal-tool-response.ts) can finish after recognized tool effects without another model call. A call's `completeTurn: false` requests further work, but this is model-supplied metadata, not independent evidence that every user requirement is complete. An internal plan must participate in this decision.

There is also a concrete integration detail: terminal response formatting currently requires recognized terminal tools across the accumulated executions. Adding a plan tool will make that path return `null` unless internal bookkeeping calls are handled deliberately. Planning-only calls must never produce a user-task success receipt; completed business effects must remain available for any final receipt.

The main generation does not request completion metadata. A non-empty partial answer can therefore reach the existing success path without the orchestrator checking a length stop. Planning should introduce an explicit completion assessment rather than equating available text with finished work.

Sydia's [`create_task`](../apps/backend/src/modules/conversations/services/domain-tools.ts) creates the user's personal tasks. Execution plans need separate storage and semantics so they do not populate the user's task manager, calendar, or reminders.

### Plans address only some existing failures

[Assistant tuning notes](./ASSISTANT_TUNING.md) already considered Nakama-style planning for date-scoped note lookup and correctly identified the limitation: if the model misses a requested day, it may also omit that day from its plan. Keep the existing date-scope/evidence mechanisms, and evaluate against user-request outcomes rather than the model's self-authored checklist.

## Proposed implementation

### 1. Main-conversation reasoning

Add a typed request-level reasoning option to `GenerateRequest`. Resolve and send that option per generation rather than fixing all reasoning settings in the constructor's model instance. Add main-conversation configuration, for example `BACKEND_ASSISTANT_REASONING_EFFORT`, while preserving existing behavior for callers that do not opt in.

Start evaluation at `medium` with a proposed 4,096-token main-call output cap; compare `low` as well. These are starting candidates, not measured optimal settings. Validate supported settings, count reasoning in the budget, and preserve hidden reasoning output. Keep configuration/provider errors observable instead of silently disabling reasoning.

Main-thread reasoning is enabled independently of whether a request needs a checklist. One-step requests should not need an extra planning call.

### 2. A persistent internal execution plan

Add an `update_plan` tool with stable step IDs, short descriptions, statuses, and explicit replacement/incremental-update semantics. Use it for substantial requests with multiple independently checkable outcomes; skip greetings, simple lookups, and single-action requests. Start with `pending`, `in_progress`, `completed`, `blocked`, and `cancelled`. Require a reason for blocked/cancelled work and reject duplicate IDs or multiple active steps. Bound step count and description length.

Persist a plan linked to its owner, conversation, originating message, and run. Give it a revision for concurrency control and retain completed versions/history. Restore the relevant active plan through `ContextBuilderService`, outside the rolling summary and after the stable prompt prefix. Treat model-authored step text as reference data under fixed planning policy. The latest user direction can suspend, replace, or cancel the plan; an old plan must not override a new request.

Use database contracts and adapters consistent with the repository's dependency rules. Persist the update successfully before changing shared cached state or publishing progress. Reject writes from stale/superseded run claims. Plans should survive retries and restarts, but persistence alone should not schedule work or automatically resume external writes after a restart.

Register the tool in the provider and group registry, and keep it reachable through `ALWAYS_AVAILABLE_TOOLS` and dynamic discovery. Keep its scope limited to the main conversation initially. Do not add it to every background agent or classify it as read-only merely to permit retries; use explicit plan-update idempotency and reconcile it with the existing tool invocation keys.

### 3. Check completion before delivering the final answer

Suppress deterministic terminal acknowledgements while actionable plan steps remain. Handle plan bookkeeping separately from business-result receipts. Preserve the existing fast path for simple requests without an active plan.

A `stopWhen` condition alone is insufficient: an AI SDK loop can also end when a model produces a tool-free answer. The gateway needs a bounded continuation mechanism for that path. Sydia's existing `reviewFinalText` hook only replaces final text; it does not resume tool execution.

Before emitting a proposed final answer, assess remaining steps. If feasible work remains and budgets allow, inject one continuation reminder and continue from the full assistant/tool transcript, retaining completed effects and loaded skill state. Do not restart generation from the original context. Define and test transcript capture across the SDK loop boundary, cumulative usage, remaining step/call budgets, and final-text buffering. If a process restarted, reconcile persisted tool results before resuming any uncertain effect.

One reminder is an initial policy; measure before adding more. Bound the entire turn's elapsed time, model steps, tool calls, output, and continuation count. Honour cancellation, supersession, user redirection, unavailable information, and blocked work. If work cannot finish, preserve the outstanding plan and report the concrete limitation. A blocked step is not completed, and a timeout must not be recorded as successful task completion.

Where practical, attach successful tool invocation IDs to steps as completion evidence. A model setting `completed` is an assertion, not proof; model-generated plans can omit requirements, and some synthesis steps will require outcome checks rather than a direct tool-result mapping.

### 4. Progress delivery

Reuse existing activity events initially. A later web-chat checklist can receive a compact plan snapshot/revision through the existing stream. Telegram and WhatsApp can receive concise meaningful progress and final outcomes without every bookkeeping update. All channels should use the same backend plan and completion rules. No new user-facing task-management feature is necessary for the first release.

## Validation and rollout

Use the existing [prompt-evaluation harness](../apps/backend/test/prompt-eval/README.md) with the production reasoning, plan tool, and completion behavior. Evaluate four configurations on the same cases: current behavior, reasoning only, plans only, and both. Repeat cases because model outputs vary. Keep scenario expectations and baseline changes under the existing product-owner review policy.

Include held-out cases for:

- A simple lookup and a single mutation, with no unnecessary plan.
- A three-part request where one tool success must not finish the turn.
- A named note plus a relative day, checked against actual returned dates.
- Multiple mutations followed by a summary, with no duplicate effects.
- A recoverable tool failure, missing user information, and cancellation/redirection.
- A length stop, timeout, superseded claim, restart, and uncertain external effect.
- All three channels with consistent completion outcomes.

Judge whether all user-requested outcomes were achieved, whether claims match effects, and whether unresolved work is reported. Also record duplicate mutations, premature finalization, unnecessary plan calls, continuation count, total steps, reasoning/output tokens, cost, and latency. Plan completion rate alone is not the acceptance criterion. Inspect regressions individually as well as aggregate scores, following [Langfuse's experiment comparison guidance](https://langfuse.com/docs/evaluation/experiments/compare-experiments).

Add focused gateway, plan-repository/tool, and orchestrator tests for the new behavior. Run database/server integration checks through the repository test lock, and hold the documented lease for browser checks. The research stage did not run model evaluations or application tests; implementation-stage results are recorded in the linked validation document.

Deliver in two independently configurable changes: main-conversation reasoning first, then planning plus completion checks together. Keep completed plan history and completion diagnostics so a rollout can distinguish better task execution from merely more model/tool calls.
