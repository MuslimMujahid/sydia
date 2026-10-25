import { BillingAccessService } from '../../billing';
import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ApiException, ErrorCodes } from '../../../shared/errors';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { createUIMessageStream } from 'ai';
import type { InferUIMessageChunk, UIMessage } from 'ai';
import type {
  AssistantRun,
  Conversation,
  Message,
  ToolInvocation,
  User,
} from '../../../database/entities';
import type { SupportedLocale } from '../../../database/entities';
import type { MessageProvider } from '../../../shared/messaging';
import {
  AUDIT_EVENT_REPOSITORY,
  CONVERSATION_REPOSITORY,
  type IAuditEventRepository,
  type IConversationRepository,
} from '../../../database/interfaces';
import {
  LANGUAGE_MODEL,
  ModelGatewayError,
} from '../../../infra/model-gateway';
import type {
  LanguageModelGateway,
  ModelMessage,
} from '../../../infra/model-gateway/model-gateway.types';
import { QueueService } from '../../../infra/queue';
import type { AssistantFile } from './tool-executor.service';
import { MemoryDreamSchedulerService } from '../../memories/memory-dream-scheduler.service';
import {
  ContextBuilderService,
  type ContextTokenUsage,
} from './context-builder.service';
import { ConversationSummarizerService } from './conversation-summarizer.service';
import { buildTerminalToolResponse } from './terminal-tool-response';
import { ToolExecutorService } from './tool-executor.service';
import { ActiveNoteService } from './active-note.service';
import type { AssistantSkillState } from './tool-executor.service';
import {
  ALWAYS_AVAILABLE_TOOLS,
  AssistantActionService,
  BACKGROUND_TOOLS,
} from '../../secretary';

const ASSISTANT_MESSAGES = {
  en: {
    safeFailure:
      'Sydia could not complete this response. Please try again in a moment.',
    queued: 'Waiting for turn…',
    preparing: 'Sydia is preparing a response…',
    workingOn: 'Sydia is',
  },
  id: {
    safeFailure:
      'Sydia belum dapat menyelesaikan respons ini. Coba lagi dalam beberapa saat.',
    queued: 'Menunggu giliran…',
    preparing: 'Sydia sedang menyiapkan jawaban…',
    workingOn: 'Sydia sedang',
  },
} satisfies Record<SupportedLocale, Record<string, string>>;

function assistantMessage(
  locale: string,
  key: keyof (typeof ASSISTANT_MESSAGES)['en'],
): string {
  const supportedLocale: SupportedLocale = locale === 'id' ? 'id' : 'en';

  return ASSISTANT_MESSAGES[supportedLocale][key];
}

const RUN_STALE_AFTER_MS = 60_000;

type TurnUser = Pick<
  User,
  'id' | 'name' | 'timezone' | 'locale' | 'persona' | 'preferredAddress'
>;
type GenerationUsage = {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};
export type AssistantActivityPhase = 'queued' | 'preparing' | 'executing_tool';

export type AssistantStreamMessage = UIMessage<
  never,
  {
    activity: { phase: AssistantActivityPhase; label: string };
    turn: AssistantTurnResult & { userMessage: Message };
    previewFile: { filename: string; mimeType: string; base64: string };
  }
>;

type AssistantExecutionContext = {
  channel?: MessageProvider;
  sendFile?: (file: AssistantFile) => Promise<{ providerMessageId: string }>;
  captureFiles?: boolean;
};

type ExecutionObserver = {
  onTextDelta(delta: string): void;
  onToolCall(label: string): void;
};

const AssistantTurnState = Annotation.Root({
  selectedToolNames: Annotation<readonly string[] | undefined>(),
  user: Annotation<TurnUser>(),
  conversation: Annotation<Conversation>(),
  inputMessage: Annotation<Message>(),
  run: Annotation<AssistantRun>(),
  channel: Annotation<MessageProvider | undefined>(),
  context: Annotation<ModelMessage[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  contextTokenUsage: Annotation<ContextTokenUsage | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  text: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  usage: Annotation<GenerationUsage>({
    reducer: (_current, update) => update,
    default: () => ({}),
  }),
  toolInvocations: Annotation<ToolInvocation[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  assistantMessage: Annotation<Message | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  assistantRun: Annotation<AssistantRun>({
    reducer: (_current, update) => update,
  }),
  errorMessage: Annotation<string | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
});

type AssistantTurnResult = {
  conversation: Conversation;
  userMessage?: Message;
  assistantMessage: Message | null;
  assistantRun: AssistantRun;
  toolInvocations: ToolInvocation[];
};

@Injectable()
export class AssistantOrchestratorService {
  private readonly logger = new Logger(AssistantOrchestratorService.name);

  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(LANGUAGE_MODEL)
    private readonly languageModel: LanguageModelGateway,
    private readonly contextBuilder: ContextBuilderService,
    private readonly summarizer: ConversationSummarizerService,
    private readonly toolExecutor: ToolExecutorService,
    private readonly queues: QueueService,
    private readonly memoryDreamScheduler: MemoryDreamSchedulerService,
    private readonly billing: BillingAccessService,
    @Optional()
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditEvents?: IAuditEventRepository,
    @Optional() private readonly activeNotes?: ActiveNoteService,
    @Optional() private readonly assistantActions?: AssistantActionService,
  ) {}

  async sendQueued(
    user: TurnUser,
    input: {
      conversationId?: string;
      content: string;
      idempotencyKey: string;
      attachmentIds?: string[];
      activeNoteRef?: string;
    },
    context?: AssistantExecutionContext,
  ): Promise<AssistantTurnResult & { userMessage: Message }> {
    const prepared = await this.prepareSend(user, input);

    if (prepared.completedResult) return prepared.completedResult;

    this.scheduleExecution(
      user,
      prepared.conversation,
      prepared.userMessage,
      prepared.run,
      context,
    );

    return {
      conversation: prepared.conversation,
      userMessage: prepared.userMessage,
      assistantMessage: null,
      assistantRun: prepared.run,
      toolInvocations: [],
    };
  }

  stream(
    user: TurnUser,
    input: {
      conversationId?: string;
      content: string;
      idempotencyKey: string;
      attachmentIds?: string[];
      activeNoteRef?: string;
    },
    context?: AssistantExecutionContext,
  ): ReadableStream<InferUIMessageChunk<AssistantStreamMessage>> {
    return createUIMessageStream<AssistantStreamMessage>({
      execute: async ({ writer }) => {
        writer.write({ type: 'start' });
        let capturedBytes = 0;
        const sendFile = context?.captureFiles
          ? (file: AssistantFile) => {
              capturedBytes += file.buffer.byteLength;
              if (capturedBytes > 10 * 1024 * 1024)
                throw new Error(
                  'Preview file capture exceeds the 10 MB turn limit.',
                );
              writer.write({
                type: 'data-previewFile',
                data: {
                  filename: file.filename,
                  mimeType: file.mimeType,
                  base64: file.buffer.toString('base64'),
                },
              });

              return Promise.resolve({
                providerMessageId: `preview-${prepared.run.id}-${capturedBytes}`,
              });
            }
          : context?.sendFile;

        writer.write({
          type: 'data-activity',
          data: {
            phase: 'queued',
            label: assistantMessage(user.locale, 'queued'),
          },
          transient: true,
        });

        const prepared = await this.prepareSend(user, input);
        writer.write({
          type: 'data-turn',
          id: prepared.run.id,
          data: prepared.completedResult ?? {
            conversation: prepared.conversation,
            userMessage: prepared.userMessage,
            assistantMessage: null,
            assistantRun: prepared.run,
            toolInvocations: [],
          },
        });

        if (prepared.completedResult) {
          writer.write({ type: 'finish', finishReason: 'stop' });

          return;
        }

        writer.write({
          type: 'data-activity',
          data: {
            phase: 'preparing',
            label: assistantMessage(user.locale, 'preparing'),
          },
          transient: true,
        });

        const textId = `answer-${prepared.run.id}`;
        let textStarted = false;
        const result = await this.execute(
          user,
          prepared.conversation,
          prepared.userMessage,
          prepared.run,
          {
            onTextDelta: (delta) => {
              if (!textStarted) {
                writer.write({ type: 'text-start', id: textId });
                textStarted = true;
              }

              writer.write({ type: 'text-delta', id: textId, delta });
            },
            onToolCall: (label) => {
              writer.write({
                type: 'data-activity',
                data: {
                  phase: 'executing_tool',
                  label: `${assistantMessage(user.locale, 'workingOn')} ${label.toLocaleLowerCase(user.locale === 'id' ? 'id-ID' : 'en-US')}…`,
                },
                transient: true,
              });
            },
          },
          undefined,
          undefined,
          context?.channel,
          sendFile,
        );

        if (textStarted) writer.write({ type: 'text-end', id: textId });
        writer.write({
          type: 'data-turn',
          id: prepared.run.id,
          data: {
            conversation: prepared.conversation,
            userMessage: prepared.userMessage,
            ...result,
          },
        });

        if (result.assistantRun.status === 'failed') {
          writer.write({
            type: 'error',
            errorText: assistantMessage(user.locale, 'safeFailure'),
          });
        }

        writer.write({
          type: 'finish',
          finishReason:
            result.assistantRun.status === 'failed' ? 'error' : 'stop',
        });
      },
      onError: (error) => {
        this.logger.error(
          'Assistant stream failed',
          error instanceof Error ? error.stack : String(error),
        );

        return assistantMessage(user.locale, 'safeFailure');
      },
    });
  }

  async sendAndWait(
    user: TurnUser,
    input: {
      conversationId?: string;
      content: string;
      idempotencyKey: string;
      attachmentIds?: string[];
      activeNoteRef?: string;
      channel?: MessageProvider;
      abortSignal?: AbortSignal;
      toolsReady?: Promise<void>;
      sendFile?: (
        file: AssistantFile,
      ) => Promise<{ providerMessageId: string }>;
    },
  ): Promise<AssistantTurnResult & { userMessage: Message }> {
    const prepared = await this.prepareSend(user, input);

    if (prepared.completedResult) return prepared.completedResult;

    return {
      conversation: prepared.conversation,
      userMessage: prepared.userMessage,
      ...(await this.execute(
        user,
        prepared.conversation,
        prepared.userMessage,
        prepared.run,
        undefined,
        input.abortSignal,
        input.toolsReady,
        input.channel,
        input.sendFile,
      )),
    };
  }

  /**
   * Persists a sanitized cause for a failed generation so the reason is
   * queryable from the database without reading provider traces, while the
   * user still only sees the localized safe-failure message.
   */
  private async recordGenerationFailure(
    state: { user: TurnUser; conversation: Conversation; run: AssistantRun },
    error: unknown,
  ): Promise<void> {
    const diagnostics =
      error instanceof ModelGatewayError ? error.diagnostics : undefined;

    const errorName =
      diagnostics?.errorName ??
      (error instanceof Error ? error.name : 'UnknownError');

    this.logger.error(
      JSON.stringify({
        event: 'assistant_generation_exhausted',
        conversationId: state.conversation.id,
        runId: state.run.id,
        errorName,
        attempts: diagnostics?.attempts ?? null,
        statusCode: diagnostics?.statusCode ?? null,
        retryable: diagnostics?.retryable ?? null,
        providerErrorType: diagnostics?.providerErrorType ?? null,
      }),
    );

    if (!this.auditEvents) return;

    try {
      await this.auditEvents.record({
        userId: state.user.id,
        eventType: 'assistant.run.failed',
        metadata: {
          conversationId: state.conversation.id,
          runId: state.run.id,
          provider: this.languageModel.provider,
          model: this.languageModel.model,
          errorName,
          attempts: diagnostics?.attempts ?? null,
          statusCode: diagnostics?.statusCode ?? null,
          retryable: diagnostics?.retryable ?? null,
          providerErrorType: diagnostics?.providerErrorType ?? null,
          providerMessage: diagnostics?.providerMessage ?? null,
        },
      });
    } catch (auditError) {
      this.logger.error(
        `Assistant failure audit write failed for run ${state.run.id}`,
        auditError instanceof Error ? auditError.stack : undefined,
      );
    }
  }

  private async prepareSend(
    user: TurnUser,
    input: {
      conversationId?: string;
      content: string;
      idempotencyKey: string;
      attachmentIds?: string[];
      activeNoteRef?: string;
    },
  ): Promise<{
    conversation: Conversation;
    userMessage: Message;
    run: AssistantRun;
    completedResult?: AssistantTurnResult & { userMessage: Message };
  }> {
    await this.billing.assertActive(user.id, user.locale);

    if (input.activeNoteRef) {
      if (!this.activeNotes)
        throw new Error('Active note validation service is unavailable');
      await this.activeNotes.validate(user.id, input.activeNoteRef);
    }

    const write = await this.conversations.writeUserMessage({
      userId: user.id,
      conversationId: input.conversationId,
      content: input.content,
      idempotencyKey: input.idempotencyKey,
      attachmentIds: input.attachmentIds,
      activeNoteRef: input.activeNoteRef,
    });

    if (
      write.replayed &&
      (write.userMessage.activeNoteRef ?? null) !==
        (input.activeNoteRef ?? null)
    ) {
      this.logger.warn(
        `Message retry attempted to change active note message=${write.userMessage.id}`,
      );
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        status: HttpStatus.CONFLICT,
        message:
          'Pesan ini sudah dikirim dengan konteks catatan berbeda. Kirim sebagai pesan baru.',
      });
    }

    const existingRun = await this.conversations.findLatestRunForMessage(
      user.id,
      write.userMessage.id,
    );

    if (existingRun) {
      if (
        existingRun.status === 'completed' ||
        existingRun.status === 'failed'
      ) {
        const detail = await this.conversations.findDetail(
          user.id,
          write.conversation.id,
        );

        const assistantMessage =
          detail?.messages.find(
            (message) => message.id === existingRun.assistantMessageId,
          ) ?? null;

        return {
          conversation: write.conversation,
          userMessage: write.userMessage,
          run: existingRun,
          completedResult: {
            conversation: write.conversation,
            userMessage: write.userMessage,
            assistantMessage,
            assistantRun: existingRun,
            toolInvocations:
              detail?.toolInvocations.filter(
                (invocation) => invocation.assistantRunId === existingRun.id,
              ) ?? [],
          },
        };
      }

      return {
        conversation: write.conversation,
        userMessage: write.userMessage,
        run: existingRun,
      };
    }

    const run = await this.conversations.createRun({
      conversationId: write.conversation.id,
      inputMessageId: write.userMessage.id,
      idempotencyKey: `message:${write.userMessage.id}`,
      provider: this.languageModel.provider,
      model: this.languageModel.model,
    });

    return {
      conversation: write.conversation,
      userMessage: write.userMessage,
      run,
    };
  }

  private scheduleExecution(
    user: TurnUser,
    conversation: Conversation,
    inputMessage: Message,
    run: AssistantRun,
    context?: AssistantExecutionContext,
  ): void {
    void this.execute(
      user,
      conversation,
      inputMessage,
      run,
      undefined,
      undefined,
      undefined,
      context?.channel,
      context?.sendFile,
    ).catch(async (error: unknown) => {
      this.logger.error(
        `Assistant run execution failed for ${run.id}`,
        error instanceof Error ? error.stack : undefined,
      );

      try {
        await this.conversations.updateRun(run.id, {
          status: 'failed',
          errorMessage: assistantMessage(user.locale, 'safeFailure'),
          completedAt: new Date(),
        });
      } catch (failureError) {
        this.logger.error(
          `Assistant run failure persistence failed for ${run.id}`,
          failureError instanceof Error ? failureError.stack : undefined,
        );
      }
    });
  }

  /**
   * Background opportunity evaluated by the same agent, skills, and tools as
   * chat. The trigger is reference context, not a user instruction; only
   * read tools and offer preparation are available, never mutations. Returns
   * the composed message, or null when the agent chose silence.
   */
  async evaluateBackground(input: {
    user: TurnUser;
    conversationId: string;
    evaluationId: string;
    trigger: string;
    now: Date;
    abortSignal?: AbortSignal;
  }): Promise<{
    text: string | null;
    reason: string;
    loadedSkills: Record<string, string>;
    preparedActionIds: string[];
  }> {
    const built = await this.contextBuilder.build(
      input.user,
      input.conversationId,
      undefined,
      undefined,
      input.abortSignal,
      { now: input.now },
    );

    const skills: AssistantSkillState = {
      loaded: new Map(),
      activeTools: new Set(BACKGROUND_TOOLS),
      allowedTools: new Set(BACKGROUND_TOOLS),
      loads: 0,
      evidence: new Set(),
    };

    const tools = this.toolExecutor.aiTools(
      input.user.id,
      input.evaluationId,
      input.evaluationId,
      undefined,
      undefined,
      input.abortSignal,
      {
        conversationId: input.conversationId,
        runId: input.evaluationId,
        trigger: 'background',
        skills,
        now: input.now,
      },
      BACKGROUND_TOOLS,
    );

    const generation = await this.languageModel.generate({
      messages: [
        ...built.messages,
        {
          role: 'system',
          content: `Background evaluation (not a message from the user and not an instruction to act): ${input.trigger}\nDecide whether an unsolicited message would genuinely help now. Retrieve current context first. Only connect the event to work that the evidence explicitly ties to it (the same organization, project, or title); never attach unrelated efforts to a meeting. If no recorded work relates to this event, the relevant work is already done, the event no longer exists, the help was already given or declined, or nothing is useful, reply exactly "NO_ACTION: <short reason>". Otherwise write one concise message to the user in their language, grounded only in verified facts. You cannot save anything; if a saved change would help, prepare it with prepare_action and ask in the message.`,
        },
      ],
      userId: input.user.id,
      conversationId: input.conversationId,
      runId: input.evaluationId,
      traceName: 'assistant.background',
      abortSignal: input.abortSignal,
      tools,
      maxSteps: 6,
      retrySafeTools: this.toolExecutor.retrySafeTools(),
    });

    const text = generation.text.trim();
    const prepared = this.assistantActions
      ? await this.assistantActions.preparedInRun(
          input.user.id,
          input.evaluationId,
        )
      : [];

    const silent = !text || /^NO_ACTION\b/i.test(text);

    this.logger.log(
      JSON.stringify({
        event: 'assistant_skills',
        runId: input.evaluationId,
        trigger: 'background',
        loadedSkills: Object.fromEntries(skills.loaded),
        skillLoads: skills.loads,
        outcome: silent ? 'suppress' : 'candidate',
      }),
    );

    return {
      text: silent ? null : text,
      reason: silent
        ? text.replace(/^NO_ACTION:?\s*/i, '').slice(0, 200) ||
          'no_useful_assistance'
        : 'useful',
      loadedSkills: Object.fromEntries(skills.loaded),
      preparedActionIds: prepared.map((action) => action.id),
    };
  }

  async retry(
    user: TurnUser,
    conversationId: string,
    runId: string,
    context?: AssistantExecutionContext,
  ): Promise<AssistantTurnResult | null> {
    await this.billing.assertActive(user.id, user.locale);
    const failedRun = await this.conversations.findRun(
      user.id,
      conversationId,
      runId,
    );

    if (!failedRun || failedRun.status !== 'failed') return null;

    const detail = await this.conversations.findDetail(user.id, conversationId);
    const inputMessage = detail?.messages.find(
      (message) => message.id === failedRun.inputMessageId,
    );

    if (!detail || !inputMessage) return null;

    return {
      conversation: detail.conversation,
      ...(await this.execute(
        user,
        detail.conversation,
        inputMessage,
        failedRun,
        undefined,
        undefined,
        undefined,
        context?.channel,
        context?.sendFile,
      )),
    };
  }

  private async execute(
    user: TurnUser,
    conversation: Conversation,
    inputMessage: Message,
    run: AssistantRun,
    observer?: ExecutionObserver,
    abortSignal?: AbortSignal,
    toolsReady?: Promise<void>,
    channel?: MessageProvider,
    sendFile?: (file: AssistantFile) => Promise<{ providerMessageId: string }>,
  ): Promise<Omit<AssistantTurnResult, 'conversation' | 'userMessage'>> {
    const staleBefore = new Date(Date.now() - RUN_STALE_AFTER_MS);
    const claimed = await this.conversations.claimRun(run.id, staleBefore);

    if (!claimed) {
      const latest = await this.conversations.findRun(
        user.id,
        conversation.id,
        run.id,
      );

      return {
        assistantMessage: null,
        assistantRun: latest ?? run,
        toolInvocations: [],
      };
    }

    const toolInvocations: ToolInvocation[] = [];
    let aborted = abortSignal?.aborted ?? false;

    const onAbort = () => {
      aborted = true;
    };

    abortSignal?.addEventListener('abort', onAbort, { once: true });

    const graph = new StateGraph(AssistantTurnState)
      .addNode('buildContext', async (state) => {
        try {
          const built = await this.contextBuilder.build(
            state.user,
            state.conversation.id,
            state.inputMessage.id,
            state.channel,
            abortSignal,
          );

          return {
            context: built.messages,
            contextTokenUsage: built.tokenUsage,
            selectedToolNames: built.decision?.toolNames,
          };
        } catch (error) {
          this.logger.error(
            `Assistant context build failed for run ${state.run.id}`,
            error instanceof Error ? error.stack : undefined,
          );

          return {
            errorMessage: assistantMessage(state.user.locale, 'safeFailure'),
          };
        }
      })
      .addNode('generate', async (state) => {
        if (state.errorMessage) return {};

        try {
          // Initial routing is advisory: every registered tool stays
          // reachable, and loading a skill exposes its tools mid-turn.
          const skills: AssistantSkillState = {
            loaded: new Map(),
            activeTools: new Set(ALWAYS_AVAILABLE_TOOLS),
            loads: 0,
            evidence: new Set(),
          };

          const selected = state.selectedToolNames;
          const tools = this.toolExecutor.aiTools(
            state.user.id,
            state.run.id,
            state.inputMessage.id,
            (result) => {
              toolInvocations.push(result.invocation);
            },
            toolsReady,
            abortSignal,
            {
              channel,
              sendFile,
              conversationId: state.conversation.id,
              runId: state.run.id,
              trigger: 'user',
              skills,
            },
          );

          const generation = await this.languageModel.generate({
            messages: state.context,
            userId: state.user.id,
            conversationId: state.conversation.id,
            runId: state.run.id,
            abortSignal,
            tools,
            retrySafeTools: this.toolExecutor.retrySafeTools(),
            ...(selected
              ? {
                  activeTools: () => [...selected, ...skills.activeTools],
                }
              : {}),
            onTextDelta: (delta: string) => observer?.onTextDelta(delta),
            onToolCall: (toolName: string) => {
              const label = this.toolExecutor.activityLabel(
                toolName,
                state.user.locale === 'id' ? 'id' : 'en',
              );

              if (label) observer?.onToolCall(label);
            },
            // Every completed tool step is offered here: when the tools have
            // fully answered the user, their deterministic acknowledgement ends
            // the turn instead of paying for a second model call that would
            // only restate them.
            acknowledgeTerminalStep: (executions, decidedBy) =>
              buildTerminalToolResponse(
                {
                  locale: state.user.locale === 'id' ? 'id' : 'en',
                  timezone: state.user.timezone,
                  channel: state.channel,
                },
                executions,
                decidedBy,
              ),
          });

          this.logger.log(
            JSON.stringify({
              event: 'assistant_skills',
              runId: state.run.id,
              trigger: 'user',
              loadedSkills: Object.fromEntries(skills.loaded),
              skillLoads: skills.loads,
            }),
          );

          this.logger.debug(
            JSON.stringify({
              event: 'assistant_context_usage',
              conversationId: state.conversation.id,
              runId: state.run.id,
              estimatedInitialContextTokens:
                state.contextTokenUsage?.total ?? null,
              context: state.contextTokenUsage,
              provider: generation.usage,
              toolInvocations: toolInvocations.length,
            }),
          );

          return {
            text: generation.text,
            usage: generation.usage,
            toolInvocations,
          };
        } catch (error) {
          this.logger.error(
            `Assistant generation failed for run ${state.run.id}`,
            error instanceof Error ? error.stack : undefined,
          );

          await this.recordGenerationFailure(state, error);

          return {
            errorMessage: assistantMessage(state.user.locale, 'safeFailure'),
          };
        }
      })
      .addNode('persistSuccess', async (state) => {
        if (toolsReady) await toolsReady;

        if (state.errorMessage || !state.text || aborted) {
          return {
            errorMessage:
              state.errorMessage ??
              (aborted
                ? 'Assistant run superseded.'
                : assistantMessage(state.user.locale, 'safeFailure')),
          };
        }

        try {
          const { assistantMessage, assistantRun } =
            await this.conversations.completeRun({
              runId: state.run.id,
              conversationId: state.conversation.id,
              userId: state.user.id,
              content: state.text,
              inputTokens: state.usage.inputTokens,
              outputTokens: state.usage.outputTokens,
              costUsd: state.usage.costUsd,
            });

          try {
            await this.queues.conversationSummaries.add(
              'summarize',
              {
                userId: state.user.id,
                conversationId: state.conversation.id,
              },
              {
                jobId: `summary-${state.conversation.id}-${state.inputMessage.id}`,
              },
            );
          } catch (error) {
            this.logger.error(
              `Conversation summary enqueue failed for ${state.conversation.id}`,
              error instanceof Error ? error.stack : undefined,
            );
          }

          try {
            await this.memoryDreamScheduler.schedule(
              state.user.id,
              state.conversation.id,
              assistantMessage.id,
            );
          } catch (error) {
            this.logger.error(
              `Memory dream enqueue failed for ${state.conversation.id}`,
              error instanceof Error ? error.stack : undefined,
            );
          }

          // An offer becomes visible only once the message showing it persists.
          if (this.assistantActions) {
            try {
              await this.assistantActions.markOffered(
                state.user.id,
                state.run.id,
                assistantMessage.id,
              );
            } catch (error) {
              this.logger.error(
                JSON.stringify({
                  event: 'assistant_action_offer_link_failed',
                  runId: state.run.id,
                  remediation:
                    'Prepared actions remain unshown and cannot be accepted; a later real offer can re-prepare them.',
                }),
                error instanceof Error ? error.stack : undefined,
              );
            }
          }

          return { assistantMessage, assistantRun };
        } catch (error) {
          this.logger.error(
            `Assistant response persistence failed for run ${state.run.id}`,
            error instanceof Error ? error.stack : undefined,
          );

          return {
            errorMessage: assistantMessage(state.user.locale, 'safeFailure'),
          };
        }
      })
      .addNode('persistFailure', async (state) => ({
        assistantMessage: null,
        assistantRun: await this.conversations.updateRun(state.run.id, {
          status: 'failed',
          errorMessage:
            state.errorMessage ??
            assistantMessage(state.user.locale, 'safeFailure'),
          completedAt: new Date(),
        }),
      }))
      .addEdge(START, 'buildContext')
      .addConditionalEdges(
        'buildContext',
        (state) => (state.errorMessage ? 'persistFailure' : 'generate'),
        { generate: 'generate', persistFailure: 'persistFailure' },
      )
      .addConditionalEdges(
        'generate',
        (state) => (state.errorMessage ? 'persistFailure' : 'persistSuccess'),
        { persistSuccess: 'persistSuccess', persistFailure: 'persistFailure' },
      )
      .addConditionalEdges(
        'persistSuccess',
        (state) => (state.errorMessage ? 'persistFailure' : END),
        { persistFailure: 'persistFailure', [END]: END },
      )
      .addEdge('persistFailure', END)
      .compile();

    try {
      const final = await graph.invoke({
        user,
        conversation,
        inputMessage,
        run,
        channel,
        context: [],
        toolInvocations: [],
      });

      return {
        assistantMessage: final.assistantMessage ?? null,
        assistantRun: final.assistantRun ?? run,
        toolInvocations: final.toolInvocations ?? [],
      };
    } finally {
      abortSignal?.removeEventListener('abort', onAbort);
    }
  }
}
