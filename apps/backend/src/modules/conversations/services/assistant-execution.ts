import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GenerateRequest,
  GenerateResult,
  LanguageModelGateway,
  ReasoningEffort,
  ToolStepExecution,
} from '../../../infra/model-gateway';
import { ModelGatewayError } from '../../../infra/model-gateway';
import type { AssistantPlanState } from './assistant-plan';

/** Main conversation settings do not change summarizers or background agents. */
export class AssistantExecutionSettings {
  readonly reasoningEffort: ReasoningEffort;
  readonly maxOutputTokens: number;
  readonly maxSteps: number;
  readonly planning: boolean;
  readonly timeoutMs: number;

  constructor(config: ConfigService) {
    const effort: unknown = config.get(
      'BACKEND_ASSISTANT_REASONING_EFFORT',
      'medium',
    );

    if (!['none', 'minimal', 'low', 'medium', 'high'].includes(String(effort)))
      throw new Error(
        'BACKEND_ASSISTANT_REASONING_EFFORT must be none, minimal, low, medium, or high.',
      );
    this.reasoningEffort = effort as ReasoningEffort;
    this.maxOutputTokens = integer(
      config,
      'BACKEND_ASSISTANT_MAX_OUTPUT_TOKENS',
      4096,
      16384,
    );
    this.maxSteps = integer(config, 'BACKEND_ASSISTANT_MAX_STEPS', 16, 32);
    this.timeoutMs = integer(
      config,
      'BACKEND_ASSISTANT_TIMEOUT_MS',
      180000,
      300000,
    );
    const planning: unknown = config.get(
      'BACKEND_ASSISTANT_PLANNING_ENABLED',
      'true',
    );

    if (![true, false, 'true', 'false'].includes(planning as string | boolean))
      throw new Error(
        'BACKEND_ASSISTANT_PLANNING_ENABLED must be true or false.',
      );
    this.planning = planning === true || planning === 'true';
  }
}

function integer(
  config: ConfigService,
  key: string,
  initial: number,
  max: number,
): number {
  const value = Number(config.get(key, initial));
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw new Error(`${key} must be an integer between 1 and ${max}.`);

  return value;
}

/** Shares the production generation path with the prompt evaluation harness. */
export async function generateAssistantTurn(
  model: LanguageModelGateway,
  request: GenerateRequest,
  settings: AssistantExecutionSettings,
  plan?: AssistantPlanState,
  locale: 'en' | 'id' = 'en',
): Promise<GenerateResult> {
  const signal = AbortSignal.any([
    AbortSignal.timeout(settings.timeoutMs),
    ...(request.abortSignal ? [request.abortSignal] : []),
  ]);

  let messages = plan ? plan.messages(request.messages) : request.messages;
  let remainingSteps = settings.maxSteps;
  const executions = new Map<string, ToolStepExecution>();
  const usage: GenerateResult['usage'] = {};
  let result: GenerateResult;

  // One completion reminder per turn. It resumes the SDK response transcript,
  // retaining tool results, dynamic skill state and the shared tool-call budget.
  for (let round = 0; ; round += 1) {
    signal.throwIfAborted();
    result = await model.generate({
      ...request,
      traceName: request.traceName ?? 'assistant.reply',
      messages,
      abortSignal: signal,
      reasoningEffort: settings.reasoningEffort,
      maxOutputTokens: settings.maxOutputTokens,
      maxSteps: remainingSteps,
      includeCompletionMetadata: true,
      includeResponseMessages: true,
      // Hold a draft final answer until its completion check is resolved.
      onTextDelta: undefined,
      acknowledgeTerminalStep: request.acknowledgeTerminalStep
        ? (current, decidedBy) => {
            for (const execution of current)
              executions.set(execution.toolCallId, execution);
            if (plan?.checksCompletion()) return null;
            const business = plan
              ? plan.businessExecutions([...executions.values()])
              : [...executions.values()];

            const deciding = plan
              ? plan.businessExecutions(decidedBy)
              : decidedBy;

            return request.acknowledgeTerminalStep!(business, deciding);
          }
        : undefined,
    });
    signal.throwIfAborted();

    for (const key of ['inputTokens', 'outputTokens', 'costUsd'] as const) {
      const value = result.usage[key];
      if (value === undefined || (round > 0 && usage[key] === undefined))
        delete usage[key];
      else usage[key] = (usage[key] ?? 0) + value;
    }

    if (result.finishReason === 'length' || result.finishReason === 'error') {
      Logger.warn(
        `Assistant stopped with ${result.finishReason}; unfinished work was retained.`,
        'AssistantExecution',
      );
      throw new ModelGatewayError(
        'Assistant generation ended before completing its output. Check the main-thread output budget and saved plan.',
      );
    }

    if (!plan?.checksCompletion()) break;

    if (
      result.stepCount === undefined ||
      !Number.isInteger(result.stepCount) ||
      result.stepCount < 1 ||
      result.stepCount > remainingSteps ||
      !result.responseMessages?.length
    ) {
      Logger.error(
        'Assistant continuation requires the model response transcript and step count.',
        'AssistantExecution',
      );
      throw new ModelGatewayError(
        'The model gateway did not return continuation metadata.',
      );
    }

    remainingSteps -= result.stepCount;

    if (round >= 1 || remainingSteps <= 0 || result.finishReason !== 'stop') {
      Logger.warn(
        'Assistant completion check exhausted; reporting unfinished plan steps.',
        'AssistantExecution',
      );
      const pending = plan
        .snapshot()!
        .steps.filter((step) =>
          ['pending', 'in_progress'].includes(step.status),
        );

      result = {
        ...result,
        text: `${result.text}\n\n${locale === 'id' ? 'Belum selesai:' : 'Unfinished work:'} ${pending.map((step) => step.description).join('; ')}.`.trim(),
      };
      break;
    }

    Logger.warn(
      'Assistant attempted to finish with an open plan; continuing once from observed tool results.',
      'AssistantExecution',
    );
    messages = [...messages, ...result.responseMessages, plan.reminder()];
  }

  request.onTextDelta?.(result.text);

  return { ...result, usage };
}
