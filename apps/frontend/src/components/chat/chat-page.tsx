import { AlertTriangle, RotateCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  conversationQueryOptions,
  useRetryAssistantRun,
  useSendConversationMessage,
} from "@/lib/services/api/conversations/conversations.queries";
import type { SendMessageVariables } from "@/lib/services/api/conversations/conversations.api";
import { ChatComposer } from "./chat-composer";
import { MessageHistory } from "./message-history";
import { TodayAgenda } from "./today-agenda";

function ThreadSkeleton() {
  return (
    <div
      className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6"
      aria-busy="true"
      aria-label="Memuat percakapan"
    >
      <div className="space-y-3">
        <div className="h-4 w-24 animate-pulse rounded-sm bg-hairline motion-reduce:animate-none" />
        <div className="h-4 w-4/5 animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none" />
        <div className="h-4 w-2/3 animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none" />
      </div>
      <div className="ml-auto w-3/5 space-y-3 rounded-xl bg-surface-1 p-4">
        <div className="h-4 w-20 animate-pulse rounded-sm bg-hairline motion-reduce:animate-none" />
        <div className="h-4 w-full animate-pulse rounded-sm bg-hairline motion-reduce:animate-none" />
      </div>
    </div>
  );
}

function ConversationError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="grid min-h-full place-items-center px-6 py-12">
      <div
        className="max-w-lg border-y border-destructive/30 py-8 text-center"
        role="alert"
      >
        <AlertTriangle className="mx-auto size-6 text-destructive" />
        <h2 className="mt-4 font-display text-xl leading-[1.22] font-semibold tracking-[-0.018em]">
          Percakapan tidak dapat dimuat
        </h2>
        <p className="mt-2 text-ink-muted">{message}</p>
        <Button
          variant="dark-outline"
          size="sm"
          className="mt-5"
          onClick={onRetry}
        >
          <RotateCcw /> Coba lagi
        </Button>
      </div>
    </div>
  );
}

export function ChatPage({
  conversationId,
  initialAttachmentId,
}: {
  conversationId?: string;
  initialAttachmentId?: string;
}) {
  const navigate = useNavigate();
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const conversationQuery = useQuery(
    conversationQueryOptions(conversationId ?? "")
  );

  const sendMutation = useSendConversationMessage();
  const retryMutation = useRetryAssistantRun();
  const messages = conversationQuery.data?.messages ?? [];
  const assistantRuns = conversationQuery.data?.assistantRuns ?? [];
  const toolInvocations = conversationQuery.data?.toolInvocations ?? [];
  const newestMessageId = messages.at(-1)?.id;
  const newestRunUpdate = assistantRuns.at(-1)?.updatedAt;

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [newestMessageId, newestRunUpdate, sendMutation.isPending]);

  async function handleSend(values: SendMessageVariables) {
    const result = await sendMutation.mutateAsync(values);

    if (!conversationId) {
      await navigate({
        to: "/",
        search: { conversation: result.conversation.id, attachment: undefined },
        replace: true,
      });
    }
  }

  function handleRetry(runId: string) {
    if (!conversationId) return;
    retryMutation.reset();
    retryMutation.mutate({ conversationId, runId });
  }

  const hasActiveRun = assistantRuns.some(
    (run) => run.status === "queued" || run.status === "running"
  );

  const composerDisabled =
    hasActiveRun ||
    Boolean(
      conversationId &&
      (conversationQuery.isPending || conversationQuery.isError)
    );

  const composerDisabledReason = hasActiveRun
    ? "Tunggu hingga Sydia menyelesaikan jawaban ini."
    : conversationId && conversationQuery.isPending
      ? "Tunggu hingga percakapan selesai dimuat."
      : conversationId && conversationQuery.isError
        ? "Muat ulang percakapan sebelum mengirim pesan."
        : undefined;

  const optimisticMessage = sendMutation.isPending
    ? {
        content: sendMutation.variables.content,
        attachmentCount: sendMutation.variables.attachmentIds?.length ?? 0,
      }
    : undefined;

  const retryingRunId = retryMutation.isPending
    ? retryMutation.variables.runId
    : undefined;

  const retryErrorRunId = retryMutation.isError
    ? retryMutation.variables?.runId
    : undefined;

  const isNewConversation = !conversationId;

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-canvas">
      {conversationId ? (
        <header className="flex min-h-16 items-center border-b border-surface-1 px-5 sm:px-8">
          <h1 className="truncate font-display text-base font-semibold">
            {conversationQuery.data?.conversation.title?.trim() || "Percakapan"}
          </h1>
        </header>
      ) : null}

      <div
        ref={scrollViewportRef}
        className="min-h-0 flex-1 overflow-y-auto scroll-smooth"
      >
        {isNewConversation && !sendMutation.isPending ? (
          <div className="flex min-h-full items-center justify-center px-5 py-10 sm:px-8">
            <div className="w-full max-w-3xl -translate-y-[4vh] text-center">
              <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em] sm:text-[32px]">
                Ingin melakukan apa hari ini?
              </h1>
              <div className="mt-7 text-left">
                <ChatComposer
                  key="new-home"
                  initialAttachmentId={initialAttachmentId}
                  isSending={sendMutation.isPending}
                  errorMessage={sendMutation.error?.message}
                  onDraftChange={() => sendMutation.reset()}
                  onSend={handleSend}
                  embedded
                />
              </div>
              <TodayAgenda />
            </div>
          </div>
        ) : null}
        {isNewConversation && sendMutation.isPending ? (
          <MessageHistory
            messages={[]}
            assistantRuns={[]}
            toolInvocations={[]}
            optimisticMessage={optimisticMessage}
            isSending
            onRetry={handleRetry}
          />
        ) : null}
        {conversationId && conversationQuery.isPending ? (
          <ThreadSkeleton />
        ) : null}
        {conversationId && conversationQuery.isError ? (
          <ConversationError
            message={conversationQuery.error.message}
            onRetry={() => void conversationQuery.refetch()}
          />
        ) : null}
        {conversationId && conversationQuery.isSuccess ? (
          <MessageHistory
            messages={messages}
            assistantRuns={assistantRuns}
            toolInvocations={toolInvocations}
            optimisticMessage={optimisticMessage}
            isSending={sendMutation.isPending}
            retryingRunId={retryingRunId}
            retryErrorRunId={retryErrorRunId}
            retryErrorMessage={retryMutation.error?.message}
            onRetry={handleRetry}
          />
        ) : null}
      </div>

      {!isNewConversation || sendMutation.isPending ? (
        <ChatComposer
          key={conversationId ?? "new-sending"}
          conversationId={conversationId}
          initialAttachmentId={initialAttachmentId}
          disabled={composerDisabled}
          disabledReason={composerDisabledReason}
          isSending={sendMutation.isPending}
          errorMessage={sendMutation.error?.message}
          onDraftChange={() => sendMutation.reset()}
          onSend={handleSend}
        />
      ) : null}
    </section>
  );
}
