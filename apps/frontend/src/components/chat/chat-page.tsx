import {
  AlertTriangle,
  Menu,
  MessageSquareText,
  RotateCcw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { SydiaLogo } from "@/components/ui/sydia-logo";
import {
  conversationQueryOptions,
  conversationsQueryOptions,
  useDeleteConversation,
  useRetryAssistantRun,
  useSendConversationMessage,
} from "@/lib/services/api/conversations/conversations.queries";
import type {
  ConversationSummary,
  SendMessageVariables,
} from "@/lib/services/api/conversations/conversations.api";
import { ChatComposer } from "./chat-composer";
import { ConversationList } from "./conversation-list";
import { MessageHistory } from "./message-history";

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

function NewConversationState() {
  return (
    <div className="grid min-h-full place-items-center px-6 py-12 text-center">
      <div className="max-w-lg">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-canvas ring-1 ring-surface-1">
          <SydiaLogo className="h-6" />
        </span>
        <h2 className="mt-5 font-display text-xl leading-[1.22] font-semibold tracking-[-0.018em]">
          Apa yang perlu Anda catat atau kerjakan?
        </h2>
        <p className="mt-3 text-ink-muted">
          Kirim pesan untuk memulai percakapan. Sydia akan menyimpan riwayatnya
          agar dapat Anda lanjutkan nanti.
        </p>
      </div>
    </div>
  );
}

function EmptyConversationState() {
  return (
    <div className="grid min-h-full place-items-center px-6 py-12 text-center">
      <div className="max-w-md">
        <MessageSquareText className="mx-auto size-7 text-brand-deep" />
        <h2 className="mt-4 font-display text-xl leading-[1.22] font-semibold tracking-[-0.018em]">
          Percakapan ini belum berisi pesan
        </h2>
        <p className="mt-2 text-ink-muted">
          Tulis pesan di bawah untuk melanjutkan.
        </p>
      </div>
    </div>
  );
}

export function ChatPage({
  initialAttachmentId,
}: {
  initialAttachmentId?: string;
}) {
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null | undefined
  >(undefined);

  const [mobileListOpen, setMobileListOpen] = useState(false);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const conversationListTriggerRef = useRef<HTMLButtonElement>(null);
  const conversationsQuery = useQuery(conversationsQueryOptions());
  const activeConversationId =
    selectedConversationId === undefined && conversationsQuery.data
      ? (conversationsQuery.data[0]?.id ?? null)
      : selectedConversationId;

  const conversationQuery = useQuery(
    conversationQueryOptions(activeConversationId ?? "")
  );

  const sendMutation = useSendConversationMessage();
  const retryMutation = useRetryAssistantRun();
  const deleteMutation = useDeleteConversation();
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(
    null
  );

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
    setSelectedConversationId(result.conversation.id);
  }

  function setConversationListOpen(open: boolean) {
    setMobileListOpen(open);

    if (!open) {
      window.requestAnimationFrame(() =>
        conversationListTriggerRef.current?.focus()
      );
    }
  }

  function handleRetry(runId: string) {
    if (!activeConversationId) return;

    retryMutation.reset();
    retryMutation.mutate({ conversationId: activeConversationId, runId });
  }

  function selectConversation(conversationId: string) {
    sendMutation.reset();
    retryMutation.reset();
    setSelectedConversationId(conversationId);
    if (mobileListOpen) setConversationListOpen(false);
  }

  async function handleDeleteConversation() {
    if (!deleteTarget) return;

    await deleteMutation.mutateAsync(deleteTarget.id);

    if (activeConversationId === deleteTarget.id) {
      setSelectedConversationId(null);
    }

    setDeleteTarget(null);
  }

  function startNewConversation() {
    sendMutation.reset();
    retryMutation.reset();
    setSelectedConversationId(null);
    if (mobileListOpen) setConversationListOpen(false);
  }

  const conversationList = (
    <ConversationList
      conversations={conversationsQuery.data ?? []}
      selectedConversationId={activeConversationId}
      isLoading={conversationsQuery.isPending}
      errorMessage={conversationsQuery.error?.message}
      disabled={sendMutation.isPending}
      onSelect={selectConversation}
      onNew={startNewConversation}
      onRetry={() => void conversationsQuery.refetch()}
      onRequestDelete={setDeleteTarget}
    />
  );

  const title =
    activeConversationId === undefined
      ? "Chat"
      : activeConversationId
        ? conversationQuery.data?.conversation.title?.trim() || "Percakapan"
        : "Percakapan baru";

  const hasActiveRun = assistantRuns.some(
    (run) => run.status === "queued" || run.status === "running"
  );

  const composerDisabled =
    hasActiveRun ||
    (activeConversationId !== null &&
      (conversationQuery.isPending || conversationQuery.isError));

  const composerDisabledReason = hasActiveRun
    ? "Tunggu hingga Sydia menyelesaikan jawaban ini."
    : activeConversationId !== null && conversationQuery.isPending
      ? "Tunggu hingga percakapan selesai dimuat."
      : activeConversationId !== null && conversationQuery.isError
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

  return (
    <section className="grid h-full min-h-0 bg-canvas lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 border-r border-surface-1 lg:block">
        {conversationList}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex min-h-18 items-center gap-3 border-b border-surface-1 px-4 sm:px-6">
          <Button
            ref={conversationListTriggerRef}
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Buka daftar percakapan"
            aria-controls="conversation-drawer"
            aria-expanded={mobileListOpen}
            onClick={() => setConversationListOpen(true)}
          >
            <Menu />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl leading-[1.22] font-semibold tracking-[-0.018em]">
              {title}
            </h1>
            <p className="mt-0.5 text-xs text-ink-muted sm:text-sm">
              {activeConversationId === undefined
                ? "Memuat percakapan…"
                : activeConversationId
                  ? "Riwayat tersimpan"
                  : "Kirim pesan pertama Anda"}
            </p>
          </div>
        </header>

        <div
          ref={scrollViewportRef}
          className="min-h-0 flex-1 overflow-y-auto scroll-smooth"
        >
          {selectedConversationId === undefined &&
          conversationsQuery.isPending ? (
            <ThreadSkeleton />
          ) : null}
          {selectedConversationId === undefined &&
          conversationsQuery.isError ? (
            <div className="grid min-h-full place-items-center px-6 py-12">
              <div
                className="max-w-lg border-y border-destructive/30 py-8 text-center"
                role="alert"
              >
                <AlertTriangle className="mx-auto size-6 text-destructive" />
                <h2 className="mt-4 font-display text-xl leading-[1.22] font-semibold tracking-[-0.018em]">
                  Percakapan tidak dapat dimuat
                </h2>
                <p className="mt-2 text-ink-muted">
                  {conversationsQuery.error.message}
                </p>
                <Button
                  variant="dark-outline"
                  size="sm"
                  className="mt-5"
                  onClick={() => void conversationsQuery.refetch()}
                >
                  <RotateCcw />
                  Coba lagi
                </Button>
              </div>
            </div>
          ) : null}
          {activeConversationId === null && !sendMutation.isPending ? (
            <NewConversationState />
          ) : null}
          {activeConversationId === null && sendMutation.isPending ? (
            <MessageHistory
              messages={[]}
              assistantRuns={[]}
              toolInvocations={[]}
              optimisticMessage={optimisticMessage}
              isSending
              onRetry={handleRetry}
            />
          ) : null}
          {activeConversationId && conversationQuery.isPending ? (
            <ThreadSkeleton />
          ) : null}
          {activeConversationId && conversationQuery.isError ? (
            <div className="grid min-h-full place-items-center px-6 py-12">
              <div
                className="max-w-lg border-y border-destructive/30 py-8 text-center"
                role="alert"
              >
                <AlertTriangle className="mx-auto size-6 text-destructive" />
                <h2 className="mt-4 font-display text-xl leading-[1.22] font-semibold tracking-[-0.018em]">
                  Percakapan tidak dapat dimuat
                </h2>
                <p className="mt-2 text-ink-muted">
                  {conversationQuery.error.message}
                </p>
                <Button
                  variant="dark-outline"
                  size="sm"
                  className="mt-5"
                  onClick={() => void conversationQuery.refetch()}
                >
                  <RotateCcw />
                  Coba lagi
                </Button>
              </div>
            </div>
          ) : null}
          {activeConversationId && conversationQuery.isSuccess ? (
            messages.length === 0 && assistantRuns.length === 0 ? (
              <EmptyConversationState />
            ) : (
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
            )
          ) : null}
        </div>

        <ChatComposer
          key={activeConversationId ?? "new"}
          conversationId={activeConversationId ?? undefined}
          initialAttachmentId={initialAttachmentId}
          disabled={composerDisabled}
          disabledReason={composerDisabledReason}
          isSending={sendMutation.isPending}
          errorMessage={sendMutation.error?.message}
          onDraftChange={() => sendMutation.reset()}
          onSend={handleSend}
        />
      </div>

      <Dialog open={mobileListOpen} onOpenChange={setConversationListOpen}>
        <DialogContent
          showClose={false}
          id="conversation-drawer"
          aria-label="Daftar percakapan"
          className="inset-y-0 top-0 left-0 h-dvh max-h-none w-[min(22rem,88vw)] max-w-none translate-x-0 translate-y-0 rounded-none p-0 lg:hidden"
        >
          <DialogTitle className="sr-only">Daftar percakapan</DialogTitle>
          <DialogDescription className="sr-only">
            Pilih percakapan tersimpan atau mulai percakapan baru.
          </DialogDescription>
          <ConversationList
            conversations={conversationsQuery.data ?? []}
            selectedConversationId={activeConversationId}
            isLoading={conversationsQuery.isPending}
            errorMessage={conversationsQuery.error?.message}
            disabled={sendMutation.isPending}
            onSelect={selectConversation}
            onNew={startNewConversation}
            onRetry={() => void conversationsQuery.refetch()}
            onRequestDelete={setDeleteTarget}
            onClose={() => setConversationListOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            deleteMutation.reset();
          }
        }}
      >
        <DialogContent>
          <DialogTitle>Hapus percakapan ini?</DialogTitle>
          <DialogDescription className="mt-3">
            &ldquo;
            {deleteTarget?.title?.trim() || "Percakapan baru"}
            &rdquo; beserta seluruh pesan dan riwayatnya akan dihapus permanen.
            Tindakan ini tidak dapat dibatalkan.
          </DialogDescription>
          {deleteMutation.error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {deleteMutation.error.message}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => void handleDeleteConversation()}
            >
              {deleteMutation.isPending ? "Menghapus…" : "Hapus permanen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
