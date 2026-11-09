import { AssistantPlanState } from '../../src/modules/conversations/services/assistant-plan';
import {
  AssistantExecutionSettings,
  generateAssistantTurn,
} from '../../src/modules/conversations/services/assistant-execution';
import type {
  ExecutionPlan,
  ExecutionPlanWrite,
} from '../../src/database/entities';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { validateEnvironment } from '../../src/app.module';
import type { RecordNotesService } from '../../src/modules/record-notes';
import { ApiException } from '../../src/shared/errors';
import type {
  AssistancePreference,
  AssistantPersona,
  ChatSource,
  Memory,
  ToolInvocation,
} from '../../src/database/entities';
import type {
  IConversationRepository,
  IDocumentRepository,
  IMemoryRepository,
} from '../../src/database/interfaces';
import { DecisionSettings } from '../../src/infra/decision-gateway';
import { DecisionCapacityService } from '../../src/infra/decision-gateway/decision-capacity.service';
import { TypeSafeDecisionGateway } from '../../src/infra/decision-gateway/typesafe-decision.gateway';
import { OpenRouterLanguageModel } from '../../src/infra/model-gateway';
import { ObservabilityService } from '../../src/infra/observability';
import {
  ContextBuilderService,
  type ContextTokenUsage,
} from '../../src/modules/conversations/services/context-builder.service';
import { DomainToolsProvider } from '../../src/modules/conversations/services/domain-tools.provider';
import { EMPTY_DAY_SCOPE } from '../../src/modules/conversations/services/daily-note-tools';
import { RecordCellReviewService } from '../../src/modules/conversations/services/record-cell-review.service';
import { buildTerminalToolResponse } from '../../src/modules/conversations/services/terminal-tool-response';
import {
  ToolExecutorService,
  type AssistantSkillState,
  type AssistantTool,
} from '../../src/modules/conversations/services/tool-executor.service';
import { TurnDecisionService } from '../../src/modules/conversations/services/turn-decision.service';
import { activeTurnTools } from '../../src/modules/conversations/services/turn-tool-discovery';
import {
  ALWAYS_AVAILABLE_TOOLS,
  AssistancePolicyService,
  SkillCatalogService,
} from '../../src/modules/secretary';
import type { MessageProvider } from '../../src/shared/messaging';

/**
 * A scripted tool result: a JSON value, or a function of the parsed arguments
 * returning one (an Error result makes the tool fail).
 */
export type ToolScript = unknown;

export type Scenario = {
  id: string;
  area: string;
  /** Omitted means web chat. */
  channel?: Extract<MessageProvider, 'telegram' | 'whatsapp'>;
  user?: Partial<EvalUser>;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  summary?: string;
  message: string;
  /** Pinned memory facts available as reference context. */
  memories?: string[];
  /** Sources the user selected for this message (notes use custom:ID refs). */
  sources?: ChatSource[];
  /** Note workspace inventory shown when note skills load. */
  workspace?: Array<{
    id: string;
    title: string;
    kind: 'note' | 'folder';
    /** Record tables must say so; notes default to the existing label. */
    format?: 'rich-text' | 'record';
  }>;
  /** Unsolicited suggestion state; omitted means active. */
  assistance?: 'active' | 'paused';
  tools?: Record<string, ToolScript>;
  /** Scripts with per-run state (for example a table that shows its own
   * writes); created once per run and merged over `tools`. */
  freshTools?: () => Record<string, ToolScript>;
  checks: Check[];
};

export type EvalUser = {
  id: string;
  name: string;
  timezone: string;
  locale: 'id' | 'en';
  persona: AssistantPersona;
  preferredAddress: string | null;
};

export type ToolCall = { name: string; args: Record<string, unknown> };

export type RunRecord = {
  durationMs?: number;
  executionPlan?: ExecutionPlan | null;
  responseMessages?: import('../../src/infra/model-gateway').ModelMessage[];
  text: string;
  calls: ToolCall[];
  /** Row writes the cell review refused before they reached the table. */
  refused?: ToolCall[];
  /** Tools the model called that the scenario did not script. */
  unscripted: string[];
  /** Tool names offered after routing (null when routing was skipped). */
  routedTools: string[] | null;
  terminalAcknowledgement: boolean;
  contextTokens: ContextTokenUsage | null;
  usage: { inputTokens?: number; outputTokens?: number; costUsd?: number };
  error?: string;
};

export type Check = {
  name: string;
  /** true passes; false or a string (the reason) fails. */
  test: (run: RunRecord, scenario: Scenario) => boolean | string;
};

const DEFAULT_USER: EvalUser = {
  id: 'prompt-eval-user',
  name: 'Rina',
  timezone: 'Asia/Jakarta',
  locale: 'id',
  persona: 'friendly',
  preferredAddress: null,
};

export function evalUser(scenario: Scenario): EvalUser {
  return { ...DEFAULT_USER, ...scenario.user };
}

/**
 * Empty results for common reads, so scenarios script only what matters and a
 * routine lookup is not answered with an artificial "unavailable".
 */
function defaultResults(scenario: Scenario): Record<string, ToolScript> {
  return {
    get_current_datetime: () => ({ now: new Date().toISOString() }),
    get_work_context: { items: [], truncated: false },
    search_memories: { results: [] },
    search_notes: { results: [] },
    search_daily_notes: { results: [] },
    read_daily_note: { exists: false, scope: EMPTY_DAY_SCOPE },
    list_calendar_events: { events: [] },
    list_notes_workspace: {
      items: (scenario.workspace ?? []).map(({ id, title, kind, format }) => ({
        id,
        title,
        kind,
        ...(format ? { format } : {}),
        path: title,
      })),
    },
  };
}

function conversationRepository(
  scenario: Scenario,
  now: Date,
): IConversationRepository {
  const turns = [
    ...(scenario.history ?? []),
    { role: 'user' as const, content: scenario.message },
  ];

  const messages = turns.map((turn, index) => ({
    id: index === turns.length - 1 ? 'current' : `history-${index}`,
    conversationId: 'prompt-eval',
    role: turn.role,
    content: turn.content,
    createdAt: new Date(now.getTime() - (turns.length - index) * 60_000),
    ...(index === turns.length - 1 && scenario.sources?.length
      ? {
          sourceSegments: scenario.sources.map((source) => ({
            type: 'source' as const,
            source,
          })),
        }
      : {}),
  }));

  const invocations = new Map<string, ToolInvocation>();
  let plan: ExecutionPlan | null = null;

  return {
    findExecutionPlan: () => Promise.resolve(plan),
    saveExecutionPlan: (input: ExecutionPlanWrite) => {
      if (input.revision !== (plan ? plan.revision : 0))
        throw new Error('Execution plan revision changed.');
      plan = {
        conversationId: input.conversationId,
        runId: input.runId,
        sourceMessageId: input.sourceMessageId,
        revision: input.revision + 1,
        steps: structuredClone(input.steps),
      };

      return Promise.resolve(plan);
    },
    findContext: () =>
      Promise.resolve({
        conversation: {
          id: 'prompt-eval',
          rollingSummary: scenario.summary ?? null,
          summaryThroughMessageId: null,
        },
        messages,
      }),
    findFirstUserMessageId: () => Promise.resolve(null),
    findRecentContexts: () => Promise.resolve([]),
    findSourceScope: () =>
      Promise.resolve(
        scenario.sources?.length
          ? {
              segments: scenario.sources.map((source) => ({
                type: 'source' as const,
                source,
              })),
              documentIds: [],
              noteRefs: scenario.sources
                .filter(({ kind }) => kind === 'note')
                .map(({ id }) => id),
            }
          : null,
      ),
    createToolInvocation: (input: Record<string, unknown>) => {
      const invocation = {
        ...input,
        id: randomUUID(),
        status: 'pending',
        result: null,
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      } as unknown as ToolInvocation;

      invocations.set(invocation.id, invocation);

      return Promise.resolve(invocation);
    },
    claimToolInvocation: (id: string) => {
      const invocation = invocations.get(id);
      if (!invocation) return Promise.resolve(null);
      const claimed = { ...invocation, status: 'running' } as ToolInvocation;
      invocations.set(id, claimed);

      return Promise.resolve(claimed);
    },
    updateToolInvocation: (id: string, patch: Partial<ToolInvocation>) => {
      const updated = { ...invocations.get(id), ...patch } as ToolInvocation;
      invocations.set(id, updated);

      return Promise.resolve(updated);
    },
  } as unknown as IConversationRepository;
}

/** Real tool definitions, descriptions, and schemas; scripted execution. */
type RunCalls = {
  calls: ToolCall[];
  unscripted: string[];
  refused: ToolCall[];
};

/**
 * Applies the production cell review to scripted row writes. Table metadata
 * comes from the scenario's scripted get_record_note_metadata; a refused write
 * is recorded and never reaches the scripted tool.
 */
function reviewedTools(
  review: RecordCellReviewService,
  tools: AssistantTool[],
  scenario: Scenario,
  record: RunCalls,
): AssistantTool[] {
  const metadata = scenario.tools?.get_record_note_metadata;
  // Without scripted table metadata there is nothing to review against.
  if (metadata === undefined) return tools;
  const records = {
    metadata: (_userId: string, id: string) =>
      Promise.resolve(
        typeof metadata === 'function'
          ? (metadata as (a: Record<string, unknown>) => unknown)({ id })
          : metadata,
      ),
  } as unknown as RecordNotesService;

  return review.wrap(tools, records).map((tool) => ({
    ...tool,
    execute: async (input) => {
      try {
        return await tool.execute(input);
      } catch (error) {
        if (
          error instanceof ApiException &&
          JSON.stringify(error.getResponse()).includes('UNSTATED_VALUES')
        )
          record.refused.push({
            name: tool.definition.name,
            args: input.arguments as Record<string, unknown>,
          });
        throw error;
      }
    },
  }));
}

function scriptedTools(
  scenario: Scenario,
  user: EvalUser,
  skills: SkillCatalogService,
  record: RunCalls,
): AssistantTool[] {
  const defaults = defaultResults(scenario);
  const stub = {} as never;
  const notes = {
    list: () =>
      Promise.resolve({
        items: (scenario.workspace ?? []).map((item) => ({
          ...item,
          format: item.format ?? (item.kind === 'note' ? 'rich_text' : null),
          path: item.title,
          revision: 1,
          parentId: null,
          trashedAt: null,
        })),
      }),
  } as never;

  const provider = new DomainToolsProvider(
    stub,
    stub,
    stub,
    stub,
    stub,
    { findById: () => Promise.resolve(user) } as never,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    notes,
    stub,
    stub,
    stub,
    skills,
    stub,
    stub,
    stub,
    stub,
  );

  return provider.tools.map((tool) => {
    const name = tool.definition.name;

    if (name === 'load_skill' || name === 'update_plan')
      return {
        ...tool,
        execute: (input) => {
          record.calls.push({
            name,
            args: input.arguments as Record<string, unknown>,
          });

          return tool.execute(input);
        },
      };

    return {
      ...tool,
      execute: async (input) => {
        const args = input.arguments as Record<string, unknown>;
        record.calls.push({ name, args });
        const script = scenario.tools?.[name] ?? defaults[name];

        if (script === undefined) {
          record.unscripted.push(name);

          return {
            error: 'unavailable',
            message: 'No data is available for this tool right now.',
          };
        }

        const value: unknown =
          typeof script === 'function'
            ? await (script as (a: Record<string, unknown>) => unknown)(args)
            : script;

        if (value instanceof Error) throw value;

        return value as never;
      },
    };
  });
}

/** The gateway wraps provider failures; keep the whole cause chain. */
function describeError(error: unknown): string {
  const parts: string[] = [];

  for (let current = error; current && parts.length < 5;) {
    parts.push(
      current instanceof Error
        ? `${current.name}: ${current.message}`
        : JSON.stringify(current),
    );
    current = current instanceof Error ? current.cause : undefined;
  }

  return parts.join(' ← ');
}

export type Harness = {
  run(scenario: Scenario): Promise<RunRecord>;
  close(): Promise<void>;
};

/**
 * Mirrors the orchestrator's generate node: the real context builder, skill
 * catalog, assistance state, Jev tool routing, tool definitions, terminal
 * acknowledgements, and model. Only data and tool execution are synthetic.
 */
export function createHarness(env: NodeJS.ProcessEnv): Harness {
  // Parse env exactly as the app does, so numbers and flags have their real types.
  const config = new ConfigService(
    validateEnvironment({
      ...env,
      // Scenarios measure the cell review as it would run in production.
      // Importing the app module writes config defaults ('off') into
      // process.env, so the harness has its own switch.
      BACKEND_RECORD_CELL_REVIEW_MODE: env.PROMPT_EVAL_CELL_REVIEW ?? 'enabled',
      BACKEND_TURN_DAY_SCOPE_MODE: env.PROMPT_EVAL_DAY_SCOPE ?? 'off',
    }),
  );

  const observability = new ObservabilityService(config);
  const model = new OpenRouterLanguageModel(config, observability);
  const skills = new SkillCatalogService();
  const executionSettings = new AssistantExecutionSettings(config);
  const routing = env.PROMPT_EVAL_ROUTING !== 'off';
  const capacity = routing ? new DecisionCapacityService(config) : null;
  const gateway = capacity
    ? new TypeSafeDecisionGateway(config, capacity, observability)
    : null;

  const decisionSettings = new DecisionSettings(config);
  const decisions = gateway
    ? new TurnDecisionService(gateway, decisionSettings)
    : undefined;

  /** Routing fails closed until Redis connects; wait so turn one is routed too. */
  async function ready(): Promise<void> {
    const redis = (capacity as unknown as { redis?: { status: string } } | null)
      ?.redis;

    for (
      let waited = 0;
      redis && redis.status !== 'ready' && waited < 5_000;
      waited += 100
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const connected = ready();

  return {
    async run(definition) {
      const scenario: Scenario = definition.freshTools
        ? {
            ...definition,
            tools: { ...definition.tools, ...definition.freshTools() },
          }
        : definition;

      const startedAt = performance.now();
      await connected;
      const user = evalUser(scenario);
      const now = new Date();
      const record: RunCalls = {
        calls: [],
        unscripted: [],
        refused: [],
      };

      const preference = (
        scenario.assistance === 'paused'
          ? { pausedAll: true, pausedUntil: null, pausedBehaviors: [] }
          : null
      ) as AssistancePreference | null;

      const memories: Memory[] = (scenario.memories ?? []).map(
        (content, index) =>
          ({
            id: `memory-${index}`,
            content,
            category: null,
            updatedAt: now,
          }) as unknown as Memory,
      );

      const conversations = conversationRepository(scenario, now);
      const builder = new ContextBuilderService(
        conversations,
        config,
        {
          findMetadataByMessageId: () => Promise.resolve([]),
          listMetadata: () => Promise.resolve([]),
        } as unknown as IDocumentRepository,
        {
          list: () => Promise.resolve(memories),
        } as unknown as IMemoryRepository,
        undefined,
        undefined,
        decisions,
        undefined,
        skills,
        new AssistancePolicyService(
          { getPreference: () => Promise.resolve(preference) } as never,
          {} as never,
          { now: () => now },
        ),
        { describeOpenOffers: () => Promise.resolve(null) } as never,
      );

      let contextTokens: ContextTokenUsage | null = null;
      let routedTools: string[] | null = null;
      let terminalAcknowledgement = false;

      try {
        const built = await builder.build(
          user,
          'prompt-eval',
          'current',
          scenario.channel,
          undefined,
          { now },
        );

        contextTokens = built.tokenUsage;
        routedTools = built.decision?.toolNames
          ? [...built.decision.toolNames]
          : null;

        const scripted = scriptedTools(scenario, user, skills, record);
        const executor = new ToolExecutorService(
          conversations,
          gateway
            ? reviewedTools(
                new RecordCellReviewService(
                  gateway,
                  decisionSettings,
                  conversations,
                ),
                scripted,
                scenario,
                record,
              )
            : scripted,
        );

        const state: AssistantSkillState = {
          loaded: new Map(),
          activeTools: new Set(ALWAYS_AVAILABLE_TOOLS),
          loads: 0,
          evidence: new Set(),
        };

        const plan = executionSettings.planning
          ? new AssistantPlanState(conversations, {
              userId: user.id,
              conversationId: 'prompt-eval',
              runId: 'prompt-eval-run',
              sourceMessageId: 'current',
              claimStartedAt: now,
            })
          : undefined;

        if (plan) await plan.load();
        const tools = executor.aiTools(
          user.id,
          'prompt-eval-run',
          'current',
          undefined,
          undefined,
          undefined,
          {
            channel: scenario.channel,
            conversationId: 'prompt-eval',
            runId: 'prompt-eval-run',
            trigger: 'user',
            executionPlan: plan,
            toolBudget: { remaining: 48 },
            skills: state,
          },
        );

        const result = await generateAssistantTurn(
          model,
          {
            messages: built.messages,
            userId: user.id,
            conversationId: 'prompt-eval',
            runId: `prompt-eval-${scenario.id}`,
            traceName: `prompt-eval.${scenario.id}`,
            tools,
            retrySafeTools: executor.retrySafeTools(),
            activeTools: () =>
              activeTurnTools(routedTools ?? Object.keys(tools), state).filter(
                (name) => executionSettings.planning || name !== 'update_plan',
              ),
            acknowledgeTerminalStep: (executions, decidedBy) => {
              const reply = buildTerminalToolResponse(
                {
                  locale: user.locale,
                  timezone: user.timezone,
                  channel: scenario.channel,
                },
                executions,
                decidedBy,
              );

              if (reply !== null) terminalAcknowledgement = true;

              return reply;
            },
          },
          executionSettings,
          plan,
          user.locale,
        );

        return {
          durationMs: Math.round(performance.now() - startedAt),
          executionPlan: plan?.snapshot(),
          responseMessages: result.responseMessages,
          text: result.text,
          calls: record.calls,
          refused: record.refused,
          unscripted: [...new Set(record.unscripted)],
          routedTools,
          terminalAcknowledgement,
          contextTokens,
          usage: result.usage,
        };
      } catch (error) {
        return {
          durationMs: Math.round(performance.now() - startedAt),
          text: '',
          calls: record.calls,
          refused: record.refused,
          unscripted: [...new Set(record.unscripted)],
          routedTools,
          terminalAcknowledgement,
          contextTokens,
          usage: {},
          error: describeError(error),
        };
      }
    },
    async close() {
      capacity?.onModuleDestroy();
      await observability.onModuleDestroy();
    },
  };
}
