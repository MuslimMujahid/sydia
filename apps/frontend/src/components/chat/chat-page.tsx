import { AlertTriangle, RotateCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  conversationQueryOptions,
  useRetryAssistantRun,
  useSendConversationMessage,
} from "@/lib/services/api/conversations/conversations.queries";
import type {
  AssistantActivity,
  SendMessageVariables,
} from "@/lib/services/api/conversations/conversations.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import { ChatComposer } from "./chat-composer";
import { MessageHistory } from "./message-history";
import { TodayAgenda } from "./today-agenda";

type ChatPageProps = {
  conversationId?: string;
  initialAttachmentId?: string;
  locale: SupportedLocale;
};

function ThreadSkeleton({ locale }: { locale: SupportedLocale }) {
  return (
    <div
      className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6"
      aria-busy="true"
      aria-label={
        locale === "en" ? "Loading conversation" : "Memuat percakapan"
      }
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
  locale,
}: {
  message: string;
  onRetry: () => void;
  locale: SupportedLocale;
}) {
  return (
    <div className="grid min-h-full place-items-center px-6 py-12">
      <div
        className="max-w-lg border-y border-destructive/30 py-8 text-center"
        role="alert"
      >
        <AlertTriangle className="mx-auto size-6 text-destructive" />
        <h2 className="mt-4 font-display text-xl leading-[1.22] font-semibold tracking-[-0.018em]">
          {locale === "en"
            ? "Conversation could not be loaded"
            : "Percakapan tidak dapat dimuat"}
        </h2>
        <p className="mt-2 text-ink-muted">{message}</p>
        <Button
          variant="dark-outline"
          size="sm"
          className="mt-5"
          onClick={onRetry}
        >
          <RotateCcw /> {locale === "en" ? "Try again" : "Coba lagi"}
        </Button>
      </div>
    </div>
  );
}

export function ChatPage({
  conversationId,
  initialAttachmentId,
  locale,
}: ChatPageProps) {
  const navigate = useNavigate();
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const conversationQuery = useQuery(
    conversationQueryOptions(conversationId ?? "")
  );

  const [streamedActivity, setStreamedActivity] = useState<AssistantActivity>();
  const [streamedText, setStreamedText] = useState("");
  const [streamCompleted, setStreamCompleted] = useState(false);
  const [submissionConversationId, setSubmissionConversationId] = useState<
    string | undefined
  >();

  const sendMutation = useSendConversationMessage({
    onActivity: setStreamedActivity,
    onTextDelta: (delta) => setStreamedText((text) => text + delta),
    onTurn: (result) => {
      setSubmissionConversationId(result.conversation.id);

      if (!conversationId) {
        void navigate({
          to: "/",
          search: {
            conversation: result.conversation.id,
            attachment: undefined,
          },
          replace: true,
        });
      }

      if (
        result.assistantRun.status === "completed" ||
        result.assistantRun.status === "failed"
      ) {
        setStreamCompleted(true);
      }
    },
  });

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

  const isSubmissionForCurrentConversation =
    submissionConversationId === conversationId ||
    (!conversationId && sendMutation.variables?.conversationId === undefined);

  const isSending =
    sendMutation.isPending && isSubmissionForCurrentConversation;

  const sendErrorMessage =
    sendMutation.isError && isSubmissionForCurrentConversation
      ? sendMutation.error.message
      : undefined;

  const streamedActivityForCurrentConversation =
    isSubmissionForCurrentConversation ? streamedActivity : undefined;

  const streamedTextForCurrentConversation = isSubmissionForCurrentConversation
    ? streamedText
    : undefined;

  function handleDraftChange() {
    if (isSubmissionForCurrentConversation) sendMutation.reset();
  }

  async function handleSend(values: SendMessageVariables) {
    setSubmissionConversationId(values.conversationId);
    setStreamedText("");
    setStreamCompleted(false);
    setStreamedActivity({
      phase: "queued",
      label: locale === "en" ? "Waiting for its turn…" : "Menunggu giliran…",
    });
    await sendMutation.mutateAsync(values);
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

  const optimisticMessage =
    isSending && !hasActiveRun && !streamCompleted
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

  const composerDisabledReason = hasActiveRun
    ? locale === "en"
      ? "Wait for Sydia to finish this answer."
      : "Tunggu hingga Sydia menyelesaikan jawaban ini."
    : conversationId && conversationQuery.isPending
      ? locale === "en"
        ? "Wait for the conversation to finish loading."
        : "Tunggu hingga percakapan selesai dimuat."
      : conversationId && conversationQuery.isError
        ? locale === "en"
          ? "Reload the conversation before sending a message."
          : "Muat ulang percakapan sebelum mengirim pesan."
        : undefined;

  const isNewConversation = !conversationId;

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-canvas">
      {conversationId ? (
        <header className="flex min-h-16 items-center border-b border-surface-1 px-5 sm:px-8">
          <h1 className="truncate font-display text-base font-semibold">
            {conversationQuery.data?.conversation.title?.trim() ||
              (locale === "en" ? "Conversation" : "Percakapan")}
          </h1>
        </header>
      ) : null}

      <div
        ref={scrollViewportRef}
        className="min-h-0 flex-1 overflow-y-auto scroll-smooth"
      >
        {isNewConversation && !isSending ? (
          <div className="flex min-h-full items-center justify-center px-5 py-10 sm:px-8">
            <div className="w-full max-w-3xl -translate-y-[4vh] text-center">
              <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em] sm:text-[32px]">
                {locale === "en"
                  ? "What would you like to do today?"
                  : "Ingin melakukan apa hari ini?"}
              </h1>
              <div className="mt-7 text-left">
                <ChatComposer
                  key="new-home"
                  initialAttachmentId={initialAttachmentId}
                  isSending={isSending}
                  errorMessage={sendErrorMessage}
                  onDraftChange={handleDraftChange}
                  onSend={handleSend}
                  locale={locale}
                  embedded
                />
              </div>
              <TodayAgenda />
            </div>
          </div>
        ) : null}
        {isNewConversation && isSending ? (
          <MessageHistory
            messages={[]}
            assistantRuns={[]}
            toolInvocations={[]}
            isSending={!streamCompleted}
            streamedActivity={streamedActivityForCurrentConversation}
            streamedText={streamedTextForCurrentConversation}
            onRetry={handleRetry}
            locale={locale}
          />
        ) : null}
        {conversationId && conversationQuery.isPending ? (
          <ThreadSkeleton locale={locale} />
        ) : null}
        {conversationId && conversationQuery.isError ? (
          <ConversationError
            message={conversationQuery.error.message}
            onRetry={() => void conversationQuery.refetch()}
            locale={locale}
          />
        ) : null}
        {conversationId && conversationQuery.isSuccess ? (
          <MessageHistory
            messages={messages}
            assistantRuns={assistantRuns}
            toolInvocations={toolInvocations}
            optimisticMessage={optimisticMessage}
            isSending={isSending && !streamCompleted}
            streamedActivity={streamedActivityForCurrentConversation}
            streamedText={streamedTextForCurrentConversation}
            retryingRunId={retryingRunId}
            retryErrorRunId={retryErrorRunId}
            retryErrorMessage={retryMutation.error?.message}
            onRetry={handleRetry}
            locale={locale}
          />
        ) : null}
      </div>

      {!isNewConversation || isSending ? (
        <ChatComposer
          key={conversationId ?? "new-sending"}
          conversationId={conversationId}
          initialAttachmentId={initialAttachmentId}
          disabled={composerDisabled}
          disabledReason={composerDisabledReason}
          isSending={isSending}
          errorMessage={sendErrorMessage}
          locale={locale}
          onDraftChange={handleDraftChange}
          onSend={handleSend}
        />
      ) : null}
    </section>
  );
}
