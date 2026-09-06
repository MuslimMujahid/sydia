import { MessageSquareText, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConversationSummary } from "@/lib/services/api/conversations/conversations.api";
import { cn } from "@/lib/utils/cn";

function formatConversationTime(value: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();

  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function ConversationListSkeleton() {
  return (
    <div className="space-y-1 px-3" aria-hidden="true">
      {["first", "second", "third", "fourth"].map((item) => (
        <div key={item} className="space-y-3 rounded-md px-3 py-4">
          <div className="h-4 w-2/3 animate-pulse rounded-sm bg-hairline motion-reduce:animate-none" />
          <div className="h-3 w-full animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

export function ConversationList({
  conversations,
  selectedConversationId,
  isLoading,
  errorMessage,
  disabled,
  onSelect,
  onNew,
  onRetry,
  onClose,
}: {
  conversations: ConversationSummary[];
  selectedConversationId: string | null | undefined;
  isLoading: boolean;
  errorMessage?: string;
  disabled?: boolean;
  onSelect: (conversationId: string) => void;
  onNew: () => void;
  onRetry: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="border-b border-surface-1 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">Percakapan</h2>
          {!isLoading && !errorMessage ? (
            <span className="ml-auto font-mono text-xs text-ink-muted">
              {conversations.length}
            </span>
          ) : null}
          {onClose ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Tutup daftar percakapan"
              onClick={onClose}
            >
              <X />
            </Button>
          ) : null}
        </div>
        <Button
          className="w-full"
          size="sm"
          disabled={disabled}
          onClick={onNew}
        >
          <Plus />
          Percakapan baru
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {isLoading ? <ConversationListSkeleton /> : null}

        {errorMessage ? (
          <div
            className="mx-4 border-y border-destructive/30 py-5"
            role="alert"
          >
            <p className="text-sm text-ink-soft">{errorMessage}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={onRetry}
            >
              <RotateCcw />
              Coba lagi
            </Button>
          </div>
        ) : null}

        {!isLoading && !errorMessage && conversations.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <MessageSquareText className="mx-auto size-6 text-brand-deep" />
            <p className="mt-4 font-display text-lg font-bold">
              Mulai dari pesan pertama
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              Percakapan yang tersimpan akan muncul di sini.
            </p>
          </div>
        ) : null}

        {!isLoading && !errorMessage ? (
          <ul className="space-y-1 px-3">
            {conversations.map((conversation) => {
              const selected = conversation.id === selectedConversationId;
              const time = formatConversationTime(
                conversation.lastMessageAt ?? conversation.updatedAt
              );

              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-current={selected ? "page" : undefined}
                    onClick={() => onSelect(conversation.id)}
                    className={cn(
                      "w-full rounded-md px-3 py-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50",
                      selected ? "bg-surface-2 text-ink" : "hover:bg-surface-1"
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-display text-sm font-bold">
                        {conversation.title?.trim() || "Percakapan baru"}
                      </span>
                      {time ? (
                        <time
                          dateTime={
                            conversation.lastMessageAt ?? conversation.updatedAt
                          }
                          className="shrink-0 font-mono text-xs text-ink-muted"
                        >
                          {time}
                        </time>
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate text-sm text-ink-muted">
                      {conversation.lastMessagePreview?.trim() ||
                        "Belum ada pesan"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
