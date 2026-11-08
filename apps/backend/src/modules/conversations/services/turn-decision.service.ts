import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  DECISION_GATEWAY,
  DecisionSettings,
  type DecisionGateway,
  type DecisionQuestion,
} from '../../../infra/decision-gateway';
import { containsDecisionCredential } from '../../../shared/decision-privacy';
import { DAY_SCOPES, isDayScope, type DayScope } from './day-scope';
import { TOOL_GROUPS, type ToolGroup } from './tool-groups';

export const TURN_DECISION_HISTORY_LIMIT = 4;
type TurnAttachment = { name: string; mimeType: string };
export type TurnDecisionMessage = {
  role: string;
  content: string;
  attachments?: TurnAttachment[];
};
export type TurnDecisionInput = {
  latest: string;
  recent: TurnDecisionMessage[];
  attachments: TurnAttachment[];
  recallEligible: boolean;
};
export type TurnDecision = {
  recall: boolean;
  toolNames?: readonly string[];
  /** A relative day or period the latest message limits itself to. */
  dayScope?: DayScope;
};

const DAY_SCOPE_QUESTION: DecisionQuestion = {
  type: 'choice',
  instructions:
    'Does the latest message limit what it asks for or records to one day or period, stated relative to the current date? Choose none when it names no day or period, or names a calendar date.',
  criteria: {
    none: 'No relative day or period limits the latest message.',
    today: 'The current day.',
    yesterday: 'The day before the current day.',
    tomorrow: 'The day after the current day.',
    this_week: 'The current calendar week.',
    last_week: 'The previous calendar week.',
    this_month: 'The current calendar month.',
    last_month: 'The previous calendar month.',
  },
};

// The question's choices and the scopes the context understands must agree.
if (
  Object.keys(DAY_SCOPE_QUESTION.criteria).join() !==
  ['none', ...DAY_SCOPES].join()
)
  throw new Error('Day scope choices do not match DAY_SCOPES.');

@Injectable()
export class TurnDecisionService implements OnModuleDestroy {
  private readonly logger = new Logger(TurnDecisionService.name);
  private readonly pending = new Set<Promise<unknown>>();
  private readonly shutdown = new AbortController();
  constructor(
    @Inject(DECISION_GATEWAY) private readonly gateway: DecisionGateway,
    private readonly settings: DecisionSettings,
  ) {}

  async decide(
    userId: string,
    input: TurnDecisionInput,
    abortSignal?: AbortSignal,
  ): Promise<TurnDecision> {
    const baseline: TurnDecision = { recall: input.recallEligible };
    const recallMode = input.recallEligible
      ? this.settings.mode('recall', userId)
      : 'off';

    const toolMode = this.settings.mode('tools', userId);
    const scopeMode = this.settings.mode('scope', userId);
    if (recallMode === 'off' && toolMode === 'off' && scopeMode === 'off')
      return baseline;
    // Without a decision the turn keeps every tool, like a failed selector:
    // an attachment-only or credential-bearing message may still need them.
    const initial: TurnDecision = {
      recall: recallMode === 'enabled' ? false : baseline.recall,
    };

    const state = JSON.stringify({
      messages: [
        ...input.recent
          .slice(-TURN_DECISION_HISTORY_LIMIT)
          .map(({ role, content, attachments }) => ({
            role,
            content,
            ...(attachments?.length ? { attachments } : {}),
          })),
        {
          role: 'user',
          content: input.latest,
          ...(input.attachments.length
            ? { attachments: input.attachments }
            : {}),
        },
      ],
    });

    if (!input.latest.trim() || containsDecisionCredential(state))
      return initial;
    const questions: Record<string, DecisionQuestion> = {};
    if (recallMode !== 'off')
      questions.recall = {
        type: 'noul',
        instructions:
          'Would recalling stored personal facts or preferences help respond to the latest message in this conversation?',
      };

    if (toolMode !== 'off') {
      for (const [group, names] of Object.entries(TOOL_GROUPS)) {
        // Assistance capabilities are discovered through skills during the
        // turn rather than routed up front.
        if (group === 'assistance') continue;
        questions[`group_${group}`] = {
          type: 'noul',
          instructions: `Does responding to the latest message in this conversation require any of these tools: ${names.join(', ')}?`,
        };
      }
    }

    if (scopeMode !== 'off') questions.day_scope = DAY_SCOPE_QUESTION;

    const operation = async (): Promise<TurnDecision> => {
      const result = await this.gateway.decide({
        stage: 'turn',
        version: this.settings.version,
        lane: 'interactive',
        featureModes: { recall: recallMode, tools: toolMode, scope: scopeMode },
        state,
        questions,
        abortSignal: AbortSignal.any([
          this.shutdown.signal,
          ...(abortSignal ? [abortSignal] : []),
        ]),
      });

      if (result.status !== 'ok') {
        this.logger.warn(
          `Turn decision failed: reason=${result.reason} recallMode=${recallMode} toolsMode=${toolMode}`,
        );
        // Routing is advisory (SKILL-01): an unavailable selector offers the
        // full registry for this turn rather than failing the user's request.
        if (toolMode === 'enabled')
          this.logger.warn(
            JSON.stringify({
              event: 'tool_selection_degraded',
              reason: result.reason,
              remediation:
                'All registered tools offered for this turn; check decision gateway capacity/timeouts.',
            }),
          );

        return { recall: initial.recall };
      }

      const scopeAnswer = result.answers.day_scope;
      const dayScope =
        scopeAnswer?.type === 'choice' &&
        isDayScope(scopeAnswer.choice) &&
        scopeAnswer.confidence >= this.settings.thresholds.dayScope
          ? scopeAnswer.choice
          : undefined;

      const probability = (key: string): number | null => {
        const answer = result.answers[key];

        return answer?.type === 'noul' ? answer.noul : null;
      };

      const recallProbability = probability('recall');
      const candidateRecall =
        recallProbability !== null &&
        recallProbability >= this.settings.thresholds.recallInclude;

      const selected = (Object.keys(TOOL_GROUPS) as ToolGroup[]).filter(
        (group) => {
          const p = probability(`group_${group}`);

          // Pruning is a token optimization, not an authorization boundary.
          // A score below the inclusion threshold is not necessarily a confident
          // "no". Keep the uncertainty band so the main model can still perform
          // the requested action; only omit confidently irrelevant groups.
          const include = this.settings.thresholds.toolInclude;

          return p !== null && (p >= include || 1 - p < include);
        },
      );

      // The groups only gate the turn: a turn confidently needing no group
      // gets no domain tools, and any other turn gets every tool. Offering a
      // per-turn subset would change the tool list between turns, and any
      // change to it drops the provider's prompt cache to zero; two fixed
      // lists each keep a warm cache.
      const needsTools = selected.length > 0;

      this.logger.debug(
        `version=${this.settings.version} recallMode=${recallMode} toolsMode=${toolMode} scopeMode=${scopeMode} candidateRecall=${candidateRecall} needsTools=${needsTools} groups=${selected.join(',')} dayScope=${dayScope ?? 'none'}`,
      );

      return {
        recall:
          recallMode === 'enabled'
            ? input.recallEligible && candidateRecall
            : baseline.recall,
        ...(toolMode === 'enabled' && !needsTools ? { toolNames: [] } : {}),
        ...(scopeMode === 'enabled' && dayScope ? { dayScope } : {}),
      };
    };

    if (
      recallMode !== 'enabled' &&
      toolMode !== 'enabled' &&
      scopeMode !== 'enabled'
    ) {
      if (
        createHash('sha256').update(state).digest().readUInt32BE(0) % 100 <
          this.settings.shadowSamplePercent &&
        this.pending.size < 8
      ) {
        const task = operation().catch((error: unknown) => {
          this.logger.warn(
            `Shadow turn decision failed: ${error instanceof Error ? error.message : String(error)}`,
          );

          return baseline;
        });

        this.pending.add(task);
        void task.finally(() => this.pending.delete(task));
      }

      return baseline;
    }

    return operation();
  }

  async onModuleDestroy(): Promise<void> {
    this.shutdown.abort();
    await Promise.allSettled(this.pending);
  }
}
