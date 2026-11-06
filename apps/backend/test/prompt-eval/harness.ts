import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { validateEnvironment } from '../../src/app.module';
import type {
  AssistancePreference,
  AssistantPersona,
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
  /** Note workspace inventory shown when note skills load. */
  workspace?: Array<{ id: string; title: string; kind: 'note' | 'folder' }>;
  /** Unsolicited suggestion state; omitted means active. */
  assistance?: 'active' | 'paused';
  tools?: Record<string, ToolScript>;
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
  text: string;
  calls: ToolCall[];
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
    read_daily_note: { exists: false },
    list_calendar_events: { events: [] },
    list_notes_workspace: {
      items: (scenario.workspace ?? []).map(({ id, title, kind }) => ({
        id,
        title,
        kind,
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
  }));

  const invocations = new Map<string, ToolInvocation>();

  return {
    findContext: () =>
      Promise.resolve({
        conversation: {
          id: 'prompt-eval',
          rollingSummary: scenario.summary ?? null,
          summaryThroughMessageId: null,
        },
        messages,
      }),
    findRecentContexts: () => Promise.resolve([]),
    findSourceScope: () => Promise.resolve(null),
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
function scriptedTools(
  scenario: Scenario,
  user: EvalUser,
  skills: SkillCatalogService,
  record: { calls: ToolCall[]; unscripted: string[] },
): AssistantTool[] {
  const defaults = defaultResults(scenario);
  const stub = {} as never;
  const notes = {
    list: () =>
      Promise.resolve({
        items: (scenario.workspace ?? []).map((item) => ({
          ...item,
          format: item.kind === 'note' ? 'rich_text' : null,
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

    if (name === 'load_skill')
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
  const config = new ConfigService(validateEnvironment({ ...env }));
  const observability = new ObservabilityService(config);
  const model = new OpenRouterLanguageModel(config, observability);
  const skills = new SkillCatalogService();
  const routing = env.PROMPT_EVAL_ROUTING !== 'off';
  const capacity = routing ? new DecisionCapacityService(config) : null;
  const decisions = capacity
    ? new TurnDecisionService(
        new TypeSafeDecisionGateway(config, capacity, observability),
        new DecisionSettings(config),
      )
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
    async run(scenario) {
      await connected;
      const user = evalUser(scenario);
      const now = new Date();
      const record: { calls: ToolCall[]; unscripted: string[] } = {
        calls: [],
        unscripted: [],
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

        const executor = new ToolExecutorService(
          conversations,
          scriptedTools(scenario, user, skills, record),
        );

        const state: AssistantSkillState = {
          loaded: new Map(),
          activeTools: new Set(ALWAYS_AVAILABLE_TOOLS),
          loads: 0,
          evidence: new Set(),
        };

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
            skills: state,
          },
        );

        const result = await model.generate({
          messages: built.messages,
          userId: user.id,
          conversationId: 'prompt-eval',
          runId: `prompt-eval-${scenario.id}`,
          traceName: `prompt-eval.${scenario.id}`,
          tools,
          retrySafeTools: executor.retrySafeTools(),
          activeTools: () =>
            activeTurnTools(routedTools ?? Object.keys(tools), state),
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
        });

        return {
          text: result.text,
          calls: record.calls,
          unscripted: [...new Set(record.unscripted)],
          routedTools,
          terminalAcknowledgement,
          contextTokens,
          usage: result.usage,
        };
      } catch (error) {
        return {
          text: '',
          calls: record.calls,
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
