import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { User } from '../../database/entities';
import {
  CONVERSATION_REPOSITORY,
  USER_REPOSITORY,
  type ClaimedChannelTurns,
  type IConversationRepository,
  type IUserRepository,
} from '../../database/interfaces';
import type {
  MessageProvider,
  NormalizedInboundMessage,
} from '../../shared/messaging';
import {
  AssistantOrchestratorService,
  ToolExecutorService,
} from '../conversations/services';

export type InboundMessageInput = {
  message: NormalizedInboundMessage;
  user: User;
  externalIdentityId: string;
};

export type ChannelTurnAdapter = {
  prepare: (
    userId: string,
    message: NormalizedInboundMessage,
  ) => Promise<{ content: string; attachmentIds?: string[] }>;
  send: (
    user: User,
    externalIdentityId: string,
    message: NormalizedInboundMessage,
    content: string,
  ) => Promise<void>;
};

@Injectable()
export class MessagingHandlerService implements OnModuleDestroy {
  private readonly logger = new Logger(MessagingHandlerService.name);
  private readonly adapters = new Map<MessageProvider, ChannelTurnAdapter>();
  private readonly drains = new Map<string, Promise<void>>();
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly burstWindowMs = 2_000;
  private readonly leaseMs = 5 * 60_000;

  constructor(
    private readonly assistant: AssistantOrchestratorService,
    private readonly toolExecutor: ToolExecutorService,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
  ) {}

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const controller of this.abortControllers.values()) controller.abort();
  }

  async registerAdapter(
    provider: MessageProvider,
    adapter: ChannelTurnAdapter,
  ): Promise<void> {
    this.adapters.set(provider, adapter);
    const channelIds =
      await this.conversations.findRecoverableChannelConversationIds(provider);

    channelIds.forEach((channelId) => this.scheduleDrain(channelId, 0));
  }

  async handle(input: InboundMessageInput): Promise<boolean> {
    const command = input.message.text.trim().toLocaleLowerCase('id-ID');
    const now = new Date();
    const channel = await this.conversations.resolveChannelConversation({
      provider: input.message.provider,
      externalIdentityId: input.externalIdentityId,
      chatExternalId: input.message.chatExternalId,
      userId: input.user.id,
      title: input.message.text,
      activeAfter: new Date(now.getTime() - 24 * 60 * 60_000),
      receivedAt: now,
    });

    if (command === '/stop' || command === '/cancel') {
      const activeIds = await this.conversations.cancelChannelTurns(
        channel.channelConversationId,
        now,
      );

      activeIds.forEach((id) => this.abortControllers.get(id)?.abort());
      await this.conversations.rejectPendingToolInvocations(
        input.user.id,
        channel.conversation.id,
        now,
      );
      await this.sendFor(
        input.user,
        input.externalIdentityId,
        input.message,
        'Proses aktif dan pesan yang menunggu telah dibatalkan.',
      );

      return true;
    }

    if (command === '/new' || command === '/reset') {
      const activeIds = await this.conversations.cancelChannelTurns(
        channel.channelConversationId,
        now,
      );

      activeIds.forEach((id) => this.abortControllers.get(id)?.abort());
      await this.conversations.rejectPendingToolInvocations(
        input.user.id,
        channel.conversation.id,
        now,
      );
      await this.conversations.resetChannelConversation(
        input.message.provider,
        input.externalIdentityId,
        input.message.chatExternalId,
      );
      await this.sendFor(
        input.user,
        input.externalIdentityId,
        input.message,
        'Percakapan baru dimulai.',
      );

      return true;
    }

    if (command !== 'ya' && command !== 'tidak')
      await this.conversations.rejectPendingToolInvocations(
        input.user.id,
        channel.conversation.id,
        now,
      );
    const queuedMessage = JSON.parse(
      JSON.stringify({ message: input.message }),
    ) as Record<string, unknown>;

    const enqueued = await this.conversations.enqueueChannelTurn(
      channel.channelConversationId,
      input.message.providerMessageId,
      queuedMessage as never,
      now,
      this.burstWindowMs,
    );

    if (enqueued.supersededTurnId)
      this.abortControllers.get(enqueued.supersededTurnId)?.abort();
    this.scheduleDrain(channel.channelConversationId, 0);

    return true;
  }

  private scheduleDrain(channelId: string, delayMs: number): void {
    const current = this.timers.get(channelId);
    if (current) clearTimeout(current);
    const timer = setTimeout(() => {
      this.timers.delete(channelId);
      void this.drain(channelId);
    }, delayMs);

    this.timers.set(channelId, timer);
  }

  private async drain(channelId: string): Promise<void> {
    if (this.drains.has(channelId)) return;
    const operation = this.drainLoop(channelId).finally(() => {
      this.drains.delete(channelId);
    });

    this.drains.set(channelId, operation);
    await operation;
  }

  private async drainLoop(channelId: string): Promise<void> {
    while (true) {
      const now = new Date();
      const batch = await this.conversations.claimChannelTurns(
        channelId,
        now,
        new Date(now.getTime() - this.leaseMs),
        new Date(now.getTime() + this.leaseMs),
      );

      if (!batch) {
        const availableAt =
          await this.conversations.nextChannelTurnAvailableAt(channelId);

        if (availableAt)
          this.scheduleDrain(
            channelId,
            Math.max(0, availableAt.getTime() - Date.now()),
          );

        return;
      }

      await this.processBatch(batch);
    }
  }

  private async processBatch(batch: ClaimedChannelTurns): Promise<void> {
    const adapter = this.adapters.get(batch.provider);
    const user = await this.users.findById(batch.userId);
    const turnIds = batch.turns.map(({ id }) => id);

    if (!adapter || !user) {
      await this.conversations.failChannelTurns(
        turnIds,
        'Provider atau pengguna tidak tersedia.',
        new Date(),
      );

      return;
    }

    const controller = new AbortController();
    batch.turns.forEach(({ id }) => this.abortControllers.set(id, controller));
    const windowEndsAt = Date.now() + this.burstWindowMs;
    const toolsReady = new Promise<void>((resolve) =>
      setTimeout(resolve, this.burstWindowMs),
    ).then(async () => {
      const sealed = await this.conversations.sealChannelTurns(
        batch.channelConversationId,
        turnIds,
      );

      if (!sealed) controller.abort();
    });

    let checking = false;
    const monitor = setInterval(() => {
      if (checking) return;
      checking = true;
      void Promise.all([
        this.conversations.renewChannelTurnLeases(
          turnIds,
          new Date(Date.now() + this.leaseMs),
        ),
        ...turnIds.map((id) =>
          this.conversations.channelTurnCancellationRequested(id),
        ),
      ])
        .then(([, ...requested]) => {
          if (requested.some(Boolean)) controller.abort();
        })
        .finally(() => {
          checking = false;
        });
    }, 1_000);

    try {
      const prepared = await Promise.all(
        batch.turns.map(({ message }) =>
          adapter.prepare(batch.userId, message.message),
        ),
      );

      const messages = batch.turns.map(({ message }, index) => ({
        message: message.message,
        content: prepared[index]?.content ?? '',
        attachmentIds: prepared[index]?.attachmentIds,
      }));

      const last = messages.at(-1)!;
      const content = messages.map(({ content }) => content).join('\n');
      const attachmentIds = messages.flatMap(
        ({ attachmentIds }) => attachmentIds ?? [],
      );

      const command = content.trim().toLocaleLowerCase('id-ID');
      const pending =
        command === 'ya' || command === 'tidak'
          ? await this.conversations.findLatestPendingToolInvocation(
              user.id,
              batch.conversationId,
            )
          : null;

      if (pending) {
        const result = await this.toolExecutor.resolveConfirmation(
          user.id,
          pending.id,
          command === 'ya',
        );

        const response = !result
          ? 'Konfirmasi ini sudah tidak berlaku.'
          : result.invocation.status === 'completed'
            ? 'Tindakan berhasil dijalankan.'
            : result.invocation.status === 'rejected'
              ? 'Tindakan dibatalkan.'
              : 'Tindakan gagal dijalankan.';

        await adapter.send(
          user,
          batch.externalIdentityId,
          last.message,
          response,
        );
      } else {
        const result = await this.assistant.sendAndWait(user, {
          conversationId: batch.conversationId,
          content,
          idempotencyKey: `${batch.provider}:${batch.turns.map(({ providerMessageId }) => providerMessageId).join('+')}`,
          attachmentIds,
          abortSignal: controller.signal,
          toolsReady,
        });

        const remaining = windowEndsAt - Date.now();
        if (remaining > 0)
          await new Promise<void>((resolve) => setTimeout(resolve, remaining));
        if (controller.signal.aborted) throw controller.signal.reason;

        if (result.assistantMessage) {
          const confirmation = result.toolInvocations.find(
            ({ status }) => status === 'awaiting_confirmation',
          );

          const response = confirmation
            ? `${result.assistantMessage.content}\n\n${confirmation.label}. Balas tepat “Ya” untuk menyetujui atau “Tidak” untuk membatalkan.`
            : result.assistantMessage.content;

          await adapter.send(
            user,
            batch.externalIdentityId,
            last.message,
            response,
          );
        }
      }

      await this.conversations.completeChannelTurns(turnIds, new Date());
    } catch (error) {
      if (controller.signal.aborted)
        await this.conversations.completeChannelTurns(turnIds, new Date());
      else {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Channel turn failed: ${message}`);
        await this.conversations.failChannelTurns(turnIds, message, new Date());
      }
    } finally {
      clearInterval(monitor);
      turnIds.forEach((id) => this.abortControllers.delete(id));
    }
  }

  private async sendFor(
    user: User,
    externalIdentityId: string,
    message: NormalizedInboundMessage,
    content: string,
  ): Promise<void> {
    const adapter = this.adapters.get(message.provider);
    if (!adapter)
      throw new Error(`${message.provider} adapter is unavailable.`);
    await adapter.send(user, externalIdentityId, message, content);
  }
}
