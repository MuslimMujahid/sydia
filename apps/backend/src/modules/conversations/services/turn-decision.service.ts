import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  DECISION_GATEWAY,
  DecisionSettings,
  type DecisionGateway,
  type DecisionQuestion,
} from '../../../infra/decision-gateway';
import { containsDecisionCredential } from '../../../shared/decision-privacy';
import { TOOL_GROUPS, toolNamesForGroups, type ToolGroup } from './tool-groups';

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
export type TurnDecision = { recall: boolean; toolNames?: readonly string[] };

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
    if (recallMode === 'off' && toolMode === 'off') return baseline;
    const initial: TurnDecision = {
      recall: recallMode === 'enabled' ? false : baseline.recall,
      ...(toolMode === 'enabled' ? { toolNames: [] } : {}),
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

    const operation = async (): Promise<TurnDecision> => {
      const result = await this.gateway.decide({
        stage: 'turn',
        version: this.settings.version,
        lane: 'interactive',
        featureModes: { recall: recallMode, tools: toolMode },
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

      const toolNames = toolNamesForGroups(selected);

      this.logger.debug(
        `version=${this.settings.version} recallMode=${recallMode} toolsMode=${toolMode} candidateRecall=${candidateRecall} selectedTools=${toolNames.length}`,
      );

      return {
        recall:
          recallMode === 'enabled'
            ? input.recallEligible && candidateRecall
            : baseline.recall,
        ...(toolMode === 'enabled' ? { toolNames } : {}),
      };
    };

    if (recallMode !== 'enabled' && toolMode !== 'enabled') {
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
