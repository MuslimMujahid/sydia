import { Inject, Injectable, Logger } from '@nestjs/common';
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
  CONVERSATION_REPOSITORY,
  type IConversationRepository,
} from '../../../database/interfaces';
import { LANGUAGE_MODEL } from '../../../infra/model-gateway';
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
import { ToolExecutorService } from './tool-executor.service';

const ASSISTANT_MESSAGES = {
  en: {
    safeFailure:
      'Sydia could not complete this response. Please try again in a moment.',
    queued: 'Waiting for turn…',
    preparing: 'Sydia is preparing a response…',
    workingOn: 'Sydia is',
    approvalRequired: 'Your approval is required to continue',
  },
  id: {
    safeFailure:
      'Sydia belum dapat menyelesaikan respons ini. Coba lagi dalam beberapa saat.',
    queued: 'Menunggu giliran…',
    preparing: 'Sydia sedang menyiapkan jawaban…',
    workingOn: 'Sydia sedang',
    approvalRequired: 'Butuh persetujuan Anda untuk melanjutkan',
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
export type AssistantActivityPhase =
  'queued' | 'preparing' | 'executing_tool' | 'awaiting_confirmation';

export type AssistantStreamMessage = UIMessage<
  never,
  {
    activity: { phase: AssistantActivityPhase; label: string };
    turn: AssistantTurnResult & { userMessage: Message };
  }
>;

type ExecutionObserver = {
  onTextDelta(delta: string): void;
  onToolCall(label: string): void;
  onToolResult(invocation: ToolInvocation): void;
};

const AssistantTurnState = Annotation.Root({
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
  ) {}

  async sendQueued(
    user: TurnUser,
    input: {
      conversationId?: string;
      content: string;
      idempotencyKey: string;
      attachmentIds?: string[];
    },
  ): Promise<AssistantTurnResult & { userMessage: Message }> {
    const prepared = await this.prepareSend(user, input);

    if (prepared.completedResult) return prepared.completedResult;

    this.scheduleExecution(
      user,
      prepared.conversation,
      prepared.userMessage,
      prepared.run,
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
    },
  ): ReadableStream<InferUIMessageChunk<AssistantStreamMessage>> {
    return createUIMessageStream<AssistantStreamMessage>({
      execute: async ({ writer }) => {
        writer.write({ type: 'start' });
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
            onToolResult: (invocation) => {
              if (invocation.status !== 'awaiting_confirmation') return;
              writer.write({
                type: 'data-activity',
                data: {
                  phase: 'awaiting_confirmation',
                  label: assistantMessage(user.locale, 'approvalRequired'),
                },
                transient: true,
              });
            },
          },
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
      onError: () => assistantMessage(user.locale, 'safeFailure'),
    });
  }

  async sendAndWait(
    user: TurnUser,
    input: {
      conversationId?: string;
      content: string;
      idempotencyKey: string;
      attachmentIds?: string[];
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

  private async prepareSend(
    user: TurnUser,
    input: {
      conversationId?: string;
      content: string;
      idempotencyKey: string;
      attachmentIds?: string[];
    },
  ): Promise<{
    conversation: Conversation;
    userMessage: Message;
    run: AssistantRun;
    completedResult?: AssistantTurnResult & { userMessage: Message };
  }> {
    const write = await this.conversations.writeUserMessage({
      userId: user.id,
      conversationId: input.conversationId,
      content: input.content,
      idempotencyKey: input.idempotencyKey,
      attachmentIds: input.attachmentIds,
    });

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
  ): void {
    void this.execute(user, conversation, inputMessage, run).catch(
      async (error: unknown) => {
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
      },
    );
  }

  async retry(
    user: TurnUser,
    conversationId: string,
    runId: string,
  ): Promise<AssistantTurnResult | null> {
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
          );

          return {
            context: built.messages,
            contextTokenUsage: built.tokenUsage,
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
          const tools = this.toolExecutor.aiTools(
            state.user.id,
            state.run.id,
            state.inputMessage.id,
            (result) => {
              toolInvocations.push(result.invocation);
              observer?.onToolResult(result.invocation);
            },
            toolsReady,
            abortSignal,
            { channel, sendFile },
          );

          const generation = await this.languageModel.generate({
            messages: state.context,
            userId: state.user.id,
            conversationId: state.conversation.id,
            runId: state.run.id,
            abortSignal,
            tools,
            prepareStep: this.toolExecutor.prepareStep(tools),
            onTextDelta: (delta: string) => observer?.onTextDelta(delta),
            onToolCall: (toolName: string) => {
              const label = this.toolExecutor.activityLabel(
                toolName,
                state.user.locale === 'id' ? 'id' : 'en',
              );

              if (label) observer?.onToolCall(label);
            },
          });

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
