import { Inject, Injectable, Logger } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type {
  AssistantRun,
  Conversation,
  Message,
  ToolInvocation,
  User,
} from '../../../database/entities';
import {
  CONVERSATION_REPOSITORY,
  type IConversationRepository,
} from '../../../database/interfaces';
import {
  LANGUAGE_MODEL,
  type LanguageModelGateway,
  type ModelMessage,
} from '../../../infra/model-gateway';
import { ContextBuilderService } from './context-builder.service';
import { ConversationSummarizerService } from './conversation-summarizer.service';
import { ToolExecutorService } from './tool-executor.service';

const SAFE_FAILURE_MESSAGE =
  'Sydia belum dapat menyelesaikan respons ini. Coba lagi dalam beberapa saat.';

const RUN_STALE_AFTER_MS = 60_000;

type TurnUser = Pick<User, 'id' | 'name' | 'timezone' | 'locale'>;
type GenerationUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

const AssistantTurnState = Annotation.Root({
  user: Annotation<TurnUser>(),
  conversation: Annotation<Conversation>(),
  inputMessage: Annotation<Message>(),
  run: Annotation<AssistantRun>(),
  context: Annotation<ModelMessage[]>({
    reducer: (_current, update) => update,
    default: () => [],
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
  ) {}

  async send(
    user: TurnUser,
    input: { conversationId?: string; content: string; idempotencyKey: string },
  ): Promise<AssistantTurnResult & { userMessage: Message }> {
    const write = await this.conversations.writeUserMessage({
      userId: user.id,
      conversationId: input.conversationId,
      content: input.content,
      idempotencyKey: input.idempotencyKey,
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
          assistantMessage,
          assistantRun: existingRun,
          toolInvocations:
            detail?.toolInvocations.filter(
              (invocation) => invocation.assistantRunId === existingRun.id,
            ) ?? [],
        };
      }

      return {
        conversation: write.conversation,
        userMessage: write.userMessage,
        ...(await this.execute(
          user,
          write.conversation,
          write.userMessage,
          existingRun,
        )),
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
      ...(await this.execute(user, write.conversation, write.userMessage, run)),
    };
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

    const graph = new StateGraph(AssistantTurnState)
      .addNode('buildContext', async (state) => {
        try {
          return {
            context: await this.contextBuilder.build(
              state.user,
              state.conversation.id,
            ),
          };
        } catch {
          return { errorMessage: SAFE_FAILURE_MESSAGE };
        }
      })
      .addNode('generate', async (state) => {
        if (state.errorMessage) return {};

        try {
          const generation = await this.languageModel.generate({
            messages: state.context,
            tools: this.toolExecutor.aiTools(
              state.user.id,
              state.run.id,
              state.inputMessage.id,
              (result) => toolInvocations.push(result.invocation),
            ),
          });

          return {
            text: generation.text,
            usage: generation.usage,
            toolInvocations,
          };
        } catch {
          return { errorMessage: SAFE_FAILURE_MESSAGE };
        }
      })
      .addNode('persistSuccess', async (state) => {
        if (state.errorMessage || !state.text) {
          return { errorMessage: state.errorMessage ?? SAFE_FAILURE_MESSAGE };
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
            });

          try {
            await this.summarizer.summarizeIfNeeded(
              state.user.id,
              state.conversation.id,
            );
          } catch (error) {
            this.logger.error(
              `Conversation summary failed for ${state.conversation.id}`,
              error instanceof Error ? error.stack : undefined,
            );
          }

          return { assistantMessage, assistantRun };
        } catch {
          return { errorMessage: SAFE_FAILURE_MESSAGE };
        }
      })
      .addNode('persistFailure', async (state) => ({
        assistantMessage: null,
        assistantRun: await this.conversations.updateRun(state.run.id, {
          status: 'failed',
          errorMessage: SAFE_FAILURE_MESSAGE,
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
      const result = await graph.invoke({
        user,
        conversation,
        inputMessage,
        run,
        toolInvocations,
      });

      return {
        assistantMessage: result.assistantMessage,
        assistantRun: result.assistantRun,
        toolInvocations,
      };
    } catch {
      const assistantRun = await this.conversations.updateRun(run.id, {
        status: 'failed',
        errorMessage: SAFE_FAILURE_MESSAGE,
        completedAt: new Date(),
      });

      return { assistantMessage: null, assistantRun, toolInvocations };
    }
  }
}
